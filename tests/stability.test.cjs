const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const repo=path.resolve(__dirname,'..');
function loader(){
 const requested=[],scripts=[];
 const window={location:{href:'https://loader.test/'},matchMedia:()=>({matches:true}),addEventListener(){}};
 const document={body:{dataset:{}},querySelector:()=>({inert:true}),currentScript:null};
 document.createElement=()=>({dataset:{},remove(){this.removed=true;}});
 document.head={appendChild(script){requested.push(script.src);scripts.push(script);}};
 const code=fs.readFileSync(path.join(repo,'static/js/page-modules.js'),'utf8').replace('  var scanTimer = 0;','  window.testLoad = (key, root = document) => loadScript(modules.find(mod => mod.key === key), root); window.testLoaded = loaded; return;');
 vm.runInNewContext(code,{window,document,URL,console});
 return {window,requested,scripts};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('inert or failed tags do not masquerade as initialized modules; retries work',async()=>{
 const f=loader();const first=f.window.testLoad('random-number');await settle();
 assert.equal(f.scripts.length,1,'An inert script tag cannot suppress loading');
 const rejected=assert.rejects(first,/Module failed/);f.scripts[0].onerror();await rejected;
 assert.equal(f.window.testLoaded['random-number'],undefined);
 const retry=f.window.testLoad('random-number');await settle();let calls=0;
 f.window.SonglineInitRandomNumber=()=>calls++;f.scripts[1].onload();await retry;
 await f.window.testLoad('random-number');assert.equal(f.scripts.length,2);assert.equal(calls,2,'Cached code initializes each new page');
});
test('dependent tools wait for exported APIs even when network finishes out of order',async()=>{
 const f=loader();let calls=0;
 const task=f.window.testLoad('2048');await settle();
 assert.equal(f.scripts.length,4);assert(!f.requested.some(src=>src.includes('/game-2048.js')));
 const api=['Songline2048Engine','SonglineCreate2048Renderer','SonglineCreate2048Leaderboard','SonglineCreate2048Audio'];
 for(const index of [3,1,2,0]){f.window[api[index]]=()=>{};f.scripts[index].onload();await settle();}
 assert.equal(f.scripts.length,5,'Main controller loads only after all dependencies execute');
 f.window.SonglineInit2048=()=>{for(const name of api)assert(f.window[name]);calls++;};
 f.scripts[4].onload();await task;assert.equal(calls,1);
});
test('API-less successful responses are rejected rather than exposing inert UI',async()=>{
 const f=loader();const task=f.window.testLoad('gacha');await settle();
 const rejected=assert.rejects(task,/Module API missing: gacha/);f.scripts[0].onload();await rejected;
 assert.equal(f.window.testLoaded.gacha,undefined);
});
test('late module responses cannot initialize a detached page but remain reusable',async()=>{
 const f=loader(),oldRoot={isConnected:true},newRoot={isConnected:true};let calls=0;
 const task=f.window.testLoad('random-number',oldRoot);await settle();
 oldRoot.isConnected=false;f.window.SonglineInitRandomNumber=()=>calls++;
 f.scripts[0].onload();await task;assert.equal(calls,0);
 await f.window.testLoad('random-number',newRoot);assert.equal(calls,1);
 assert.equal(f.scripts.length,1,'Late code is reusable without re-fetching');
});
test('legacy tools use one managed entry and expose repeat-safe initializers',()=>{
 const registry=fs.readFileSync(path.join(repo,'static/js/page-modules.js'),'utf8');
 for(const name of ['random-number','gacha','focus-timer','markdown-previewer']){
  const template=fs.readFileSync(path.join(repo,'layouts/tools',name+'.html'),'utf8');
  assert(!template.includes('/js/tools/'+name+'.js'),'No duplicated or re-executed main script: '+name);
  assert(registry.includes("key:'"+name+"'"));
 }
 assert(!fs.existsSync(path.join(repo,'static/js/tools/index.js')),'Retired competing search owner is removed');
});
test('focus timer owns exactly one frame chain and releases global listeners on departure',()=>{
 const frames=new Map(),events=new Map();let next=0,click;
 const button={textContent:'',addEventListener(type,fn){click=fn;}};
 const root={dataset:{},isConnected:true,classList:{toggle(){}},querySelector:selector=>selector==='[data-focus-toggle]'?button:null,querySelectorAll:()=>[]};
 const window={requestAnimationFrame(fn){frames.set(++next,fn);return next;},cancelAnimationFrame(id){frames.delete(id);},
  addEventListener(type,fn){events.set(type,fn);},removeEventListener(type,fn){if(events.get(type)===fn)events.delete(type);}};
 const document={querySelector:()=>root,addEventListener:window.addEventListener,removeEventListener:window.removeEventListener};
 vm.runInNewContext(fs.readFileSync(path.join(repo,'static/js/tools/focus-timer.js'),'utf8'),{
  window,document,localStorage:{getItem:()=>null,setItem(){}},console,
  requestAnimationFrame:window.requestAnimationFrame,cancelAnimationFrame:window.cancelAnimationFrame
 });
 window.SonglineInitFocusTimer(document);click({preventDefault(){},stopPropagation(){}});assert.equal(frames.size,1);
 for(let i=0;i<5;i++){events.get('visibilitychange')();assert.equal(frames.size,1);}
 events.get('songline:page-transition-start')();assert.equal(frames.size,0);assert.equal(events.size,0);
});
test('2048 audio engine is disposable and cannot reopen a departed game context',()=>{
 let closes=0;
 class AudioContext{constructor(){this.state='running';}close(){this.state='closed';closes++;return Promise.resolve();}}
 const window={AudioContext};
 vm.runInNewContext(fs.readFileSync(path.join(repo,'static/js/tools/game-2048-audio.js'),'utf8'),{window});
 const audio=window.SonglineCreate2048Audio({isEnabled:()=>true});assert(audio.ensureAudio());
 audio.destroy();audio.destroy();assert.equal(closes,1);assert.equal(audio.ensureAudio(),null);
});
