const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
 function element(){
  const listeners=new Map(),classes=new Set();
  return {dataset:{},isConnected:true,attributes:{},classList:{add(...names){names.forEach(n=>classes.add(n));},remove(...names){names.forEach(n=>classes.delete(n));},toggle(name,on){if(on)classes.add(name);else classes.delete(name);},contains:name=>classes.has(name)},addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},removeEventListener(type,fn){listeners.get(type)?.delete(fn);},emit(type,event={}){for(const fn of [...(listeners.get(type)||[])])fn(event);},listenerCount(){return [...listeners.values()].reduce((sum,set)=>sum+set.size,0);},setAttribute(name,value){this.attributes[name]=value;},removeAttribute(name){delete this.attributes[name];},querySelector(){return null;}};
 }
 const frames=new Map(),timers=new Map();let serial=0,fallbacks=0;
 const panel=element(),copy=element(),tip=element(),indicators=[element(),element()],cards=[element(),element()];
 indicators.forEach((item,i)=>item.dataset.homeRecommendIndex=String(i));copy.dataset.homeCopyEmail='mail@example.test';
 const homePanel={dataset:{homePanelState:'system'}};
 panel.closest=()=>homePanel;panel.contains=()=>false;panel.matches=()=>false;
 panel.querySelectorAll=selector=>selector==='[data-home-recommend-indicator]'?indicators:cards;
 const window=element(),document=element();document.visibilityState='visible';
 document.querySelector=selector=>selector==='[data-home-recommendations]'?panel:selector==='[data-home-copy-email]'?copy:selector==='[data-home-copy-tip]'?tip:null;
 document.createElement=()=>{fallbacks++;return {setAttribute(){},style:{},select(){},remove(){}};};document.body={appendChild(){}};document.execCommand=()=>true;
 window.matchMedia=()=>({matches:false});window.isSecureContext=true;
 window.setTimeout=fn=>{timers.set(++serial,fn);return serial;};window.clearTimeout=id=>timers.delete(id);
 window.requestAnimationFrame=fn=>{frames.set(++serial,fn);return serial;};window.cancelAnimationFrame=id=>frames.delete(id);
 let copyResolve,copyReject;const clipboard={writeText:()=>new Promise((resolve,reject)=>{copyResolve=resolve;copyReject=reject;})};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../static/js/pages/home/recommendations.js'),'utf8'),{window,document,navigator:{clipboard},console});
 window.SonglineInitHomeRecommendations(document);
 return {window,document,panel,copy,tip,cards,indicators,frames,timers,all:[window,document,panel,copy,...indicators],fallbacks:()=>fallbacks,resolveCopy:()=>copyResolve(),rejectCopy:()=>copyReject(new Error('permission')),flushFrames(){for(const [id,fn] of [...frames]){frames.delete(id);fn();}}};
}
test('recommendation departure removes local/global listeners and every scheduled task',async()=>{
 const f=fixture();f.panel.emit('focusout');f.indicators[1].emit('click');await settle();
 assert(f.frames.size>0);assert(f.timers.size>0);
 f.window.emit('songline:page-transition-start',{detail:{from:'/'}});
 assert.equal(f.frames.size,0);assert.equal(f.timers.size,0);assert.equal(f.all.reduce((sum,e)=>sum+e.listenerCount(),0),0);
 assert.equal(f.panel.dataset.recommendationsReady,undefined);
 f.panel.emit('mouseleave');assert.equal(f.timers.size,0);
 f.window.SonglineInitHomeRecommendations(f.document);assert.equal(f.panel.dataset.recommendationsReady,'1');
 assert.equal(f.indicators[1].listenerCount(),1,'Reinitialization does not leave a second handler');
});
test('late image and clipboard responses cannot mutate or schedule a departed recommendation panel',async()=>{
 const f=fixture();let resolveImage;f.cards[1].querySelector=()=>({});
 f.window.SonglineResources={image:()=>new Promise(resolve=>resolveImage=resolve)};
 f.indicators[1].emit('click');f.copy.emit('click');
 f.window.__songlineHomeRecommendationsCleanup();resolveImage({failed:false});f.rejectCopy();await settle();
 assert(f.cards[0].classList.contains('is-active'));assert(!f.cards[1].classList.contains('is-active'));
 assert.equal(f.fallbacks(),0,'A late rejection cannot start a fallback clipboard write');assert.equal(f.tip.textContent,undefined);
 assert.equal(f.timers.size,0);assert.equal(f.frames.size,0);
});
test('BFCache suspends work without unbinding controls and restores a single carousel timer',async()=>{
 const f=fixture();f.flushFrames();const listeners=f.all.reduce((sum,e)=>sum+e.listenerCount(),0);
 for(let i=0;i<3;i++){
  f.window.emit('pagehide',{persisted:true});assert.equal(f.frames.size,0);assert.equal(f.timers.size,0);
  assert.equal(f.all.reduce((sum,e)=>sum+e.listenerCount(),0),listeners);
  f.window.emit('pageshow',{persisted:true});assert.equal(f.timers.size,1);
 }
 f.indicators[1].emit('click');await settle();assert(f.cards[1].classList.contains('is-active'));
 f.window.emit('pagehide',{persisted:false});assert.equal(f.all.reduce((sum,e)=>sum+e.listenerCount(),0),0);assert.equal(f.timers.size,0);
});
