const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const repo=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(repo,'static/js/page-modules.js'),'utf8');
function fixture(mode='idle'){
 const events=new Map(),tasks=new Map(),elements=new Map(),features=new Set(),queries=new Map(),inits=new Map();let serial=0;
 const schedule=fn=>{const id=++serial;tasks.set(id,fn);return id;},cancel=id=>tasks.delete(id);
 function querySelector(selector){queries.set(selector,(queries.get(selector)||0)+1);return selector.split(',').some(part=>features.has(part.trim()))?{}:null;}
 const document={body:{dataset:{}},readyState:'loading',querySelector,currentScript:null,addEventListener(){},getElementById:id=>elements.get(id),createElement:()=>({dataset:{},remove(){}}),head:{appendChild(node){elements.set(node.id,node);}}};
 const window={location:{href:'https://modules.test/',pathname:'/other/'},matchMedia:()=>({matches:true}),addEventListener:(type,fn)=>events.set(type,fn),setTimeout:schedule,clearTimeout:cancel,initCounts:inits};
 if(mode==='idle'){window.requestIdleCallback=schedule;window.cancelIdleCallback=cancel;}
 if(mode==='raf'){window.requestAnimationFrame=schedule;window.cancelAnimationFrame=cancel;}
 if(mode==='runtime')window.SonglineRuntime={idle(key,fn){return schedule(fn);},cancelIdle(){tasks.clear();}};
 const instrumented=source.replace('  var scanTimer = 0;',`  modules.forEach(function(mod){
   window[exports[mod.key]] = function(){};
   var initialize = mod.init;
   mod.init = function(root){ window.initCounts.set(mod.key,(window.initCounts.get(mod.key)||0)+1); initialize(root); };
  });
  var scanTimer = 0;`);
 vm.runInNewContext(instrumented,{window,document,URL,console});
 return {window,document,events,tasks,features,queries,inits,root:{isConnected:true,querySelector},api:window.SonglinePageModules,flush:async()=>{for(const [id,fn] of [...tasks]){tasks.delete(id);fn();}await new Promise(resolve=>setImmediate(resolve));}};
}
test('one selection pass shares repeated DOM tests and dependency initializers',async()=>{
 const f=fixture();f.features.add('[data-game-2048]');
 await f.api.ready(f.document);
 const selector='[data-game-2048], .tool-2048-page, .game-2048-board';
 assert.equal(f.queries.get(selector),1,'Five modules use one feature query');
 for(const key of ['2048-engine','2048-renderer','2048-leaderboard','2048-audio','2048'])assert.equal(f.inits.get(key),1,key+' initializes once per scan');
 await f.api.ready(f.document);
 assert.equal(f.queries.get(selector),2,'New scans never reuse stale DOM answers');
 for(const key of ['2048-engine','2048-renderer','2048-leaderboard','2048-audio','2048'])assert.equal(f.inits.get(key),2,'Reentered content still initializes');
});
test('injected content can activate a previously absent module',async()=>{
 const f=fixture();await f.api.ready(f.document);assert(!f.inits.has('random-number'));
 f.features.add('[data-random-tool]');await f.api.ready(f.document);
 assert.equal(f.inits.get('random-number'),1);
});
for(const mode of ['runtime','idle','raf','timer'])test(mode+' scan bursts own one cancelable task and stale callbacks cannot run after departure',async()=>{
 const f=fixture(mode);
 for(let i=0;i<30;i++)f.api.scan(f.root);
 assert.equal(f.tasks.size,1);
 const stale=[...f.tasks.values()][0];
 f.events.get('songline:page-transition-start')();assert.equal(f.tasks.size,0);
 stale();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(f.queries.size,0,'A late canceled task cannot rescan the new page');
 f.api.scan(f.root);await f.flush();assert(f.queries.size>0,'The scheduler remains usable after return');
});
test('immediate readiness drains scheduled work; distinct pending roots merge safely',async()=>{
 const f=fixture();const initialized=[];f.features.add('[data-random-tool]');
 f.window.SonglineInitRandomNumber=root=>initialized.push(root);
 f.api.scan(f.root);f.api.scan({isConnected:true,querySelector:()=>null});
 await f.api.ready(f.root);assert.equal(f.tasks.size,0);
 assert.deepEqual(initialized,[f.document],'Different injected areas are both covered by the document scan');
 f.api.scan(f.root);await f.api.ready(f.root);assert.equal(f.tasks.size,0);
 assert.equal(initialized.at(-1),f.root,'A single scoped scan retains its root');
});
test('a root detached before the microtask performs no feature scan',async()=>{
 const f=fixture();const task=f.api.ready(f.root);f.root.isConnected=false;await task;
 assert.equal(f.queries.size,0);assert.equal(f.inits.size,0);
});
test('audio requests only shared help, not retired glass layout or tool search styles',async()=>{
 const f=fixture();f.window.location.pathname='/tools/audio-visualizer/';
 f.features.add('[data-audio-visualizer]');f.features.add('[data-tool-actionbar]');
 await f.api.ready(f.document);
 assert(!f.document.getElementById('songline-tool-detail-layout-style'));
 assert(!f.document.getElementById('songline-tool-detail-shell-style'));
 assert(!f.document.getElementById('songline-tool-shared-style'));
 assert(!f.document.getElementById('songline-search-overrides-style'));
 assert(f.document.getElementById('songline-tool-dialog-style'));
 const layout=fs.readFileSync(path.join(repo,'static/css/tools/detail-layout.css'),'utf8');
 assert(!layout.includes('.audio-visualizer-page'),'The shared glass layout no longer patches the independent studio');
 assert(!layout.includes('.tool-help-dialog'),'Shared help has a single narrower owner');
});
