const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
function runtime(idleThrows=false){
 const frames=new Map(),timers=new Map(),idle=new Map();let next=0,now=0;
 const animations=Array.from({length:20},()=>({playState:'running',playbackRate:1,effect:{target:{isConnected:true}},
  updatePlaybackRate(rate){this.playbackRate=rate;},pause(){this.playState='paused';},play(){this.playState='running';}}));
 const window={innerWidth:1440,innerHeight:900,matchMedia:()=>({matches:false}),addEventListener(){},dispatchEvent(){},
  setTimeout(fn){timers.set(++next,fn);return next;},clearTimeout(id){timers.delete(id);},
  requestAnimationFrame(fn){frames.set(++next,fn);return next;},cancelAnimationFrame(id){frames.delete(id);},
  requestIdleCallback(fn){if(idleThrows)throw Error('unavailable');idle.set(++next,fn);return next;},cancelIdleCallback(id){idle.delete(id);}};
 const document={readyState:'loading',hidden:false,documentElement:{classList:{toggle(){},add(){},remove(){}},setAttribute(){},removeAttribute(){}},
  getAnimations:()=>animations,addEventListener(){}};
 vm.runInNewContext(read('static/js/performance-guard.js'),{window,document,navigator:{},performance:{now:()=>now},CustomEvent:class{},setTimeout:window.setTimeout});
 return {window,animations,frames,timers,idle,tick(time){now=time;const batch=[...frames.values()];frames.clear();batch.forEach(fn=>fn(now));}};
}
test('animation rate recovery uses one frame chain and rapid hides retain the original rate',()=>{
 const f=runtime(),guard=f.window.SonglinePerformanceGuard;
 for(let cycle=0;cycle<5;cycle++){
  guard.pauseWaapiAnimations();assert(f.animations.every(a=>a.playbackRate===1));
  guard.resumeWaapiAnimations();assert.equal(f.frames.size,1,'Twenty animations share one callback');
  assert(f.animations.every(a=>a.playbackRate===.18));
 }
 f.tick(600);assert.equal(f.frames.size,0);assert(f.animations.every(a=>a.playbackRate===1));
});
test('detached/paused animation ramps stop without retaining a frame loop',()=>{
 const f=runtime(),guard=f.window.SonglinePerformanceGuard;
 guard.pauseWaapiAnimations();guard.resumeWaapiAnimations();
 f.animations.forEach((a,i)=>{if(i%2)a.effect.target.isConnected=false;else a.pause();});
 f.tick(100);assert.equal(f.frames.size,0);assert(f.animations.every(a=>a.playbackRate===1));
});
test('keyed idle/RAF tasks can be replaced and cancelled, including idle fallback',()=>{
 for(const fallback of [false,true]){
  const f=runtime(fallback),r=f.window.SonglineRuntime;let calls=0;
  r.idle('test',()=>calls++);r.idle('test',()=>calls++);
  assert.equal((fallback?f.timers:f.idle).size,1);r.cancelIdle('test');
  assert.equal(f.timers.size+f.idle.size,0);
  r.raf('test',()=>calls++);r.raf('test',()=>calls++);assert.equal(f.frames.size,1);
  r.cancelRaf('test');f.tick(100);assert.equal(calls,0);
 }
});
test('optional tool storage tolerates blocked access and quota errors without stale reads',()=>{
 const f=runtime(),storage=f.window.SonglineRuntime.storage;
 Object.defineProperty(f.window,'localStorage',{configurable:true,get(){throw Error('SecurityError');}});
 assert.equal(storage.getItem('best'),null);storage.setItem('best',128);assert.equal(storage.getItem('best'),'128');
 storage.removeItem('best');assert.equal(storage.getItem('best'),null);
 const saved=new Map([['best','64']]);let full=true;
 Object.defineProperty(f.window,'localStorage',{value:{getItem:key=>saved.get(key)||null,setItem(key,value){if(full)throw Error('QuotaExceededError');saved.set(key,value);},removeItem:key=>saved.delete(key)}});
 storage.setItem('best',256);assert.equal(storage.getItem('best'),'256','Failed persistence must not restore the older best');
 full=false;storage.setItem('best',512);assert.equal(saved.get('best'),'512');
 saved.delete('best');assert.equal(storage.getItem('best'),null,'External clearing does not resurrect old fallback data');
});
test('galaxy has one managed initializer and ignores duplicate identities',()=>{
 const window={};
 const source=read('static/js/pages/friends/galaxy.js').replace('  window.SonglineInitFriendGalaxy = init;','  window.normalizeForTest = normalize; window.SonglineInitFriendGalaxy = init;');
 vm.runInNewContext(source,{window});
 const friends=window.normalizeForTest([{id:'songline',username:'songline'},{id:'a'},{id:' A '},{id:'root'}],{});
 assert.equal(friends.length,2);assert.equal(friends[1].id,'a');
 assert.equal(friends[0].href,'/friends/songline/');assert.equal(friends[1].href,'');
 assert(!source.includes('DOMContentLoaded'));assert(!source.includes("addEventListener('songline:page-swap'"));
 assert(source.includes('delete shell.dataset.friendGalaxyReady'));
 assert(!source.includes("lines.innerHTML = ''"),'Edges are not discarded on layout');
 assert(source.includes('if(friend.configuredLinks) hasConfiguredGraphLinks = true'));
});
test('memory room uses one managed initializer and releases the connected DOM marker',()=>{
 const source=read('static/js/pages/friends/memories.js');
 assert(!source.includes('DOMContentLoaded'));assert(!source.includes("addEventListener('songline:page-swap'"));
 assert(source.includes('delete room.dataset.memoryReady'));assert(source.includes('if(disposed || resizeFrame) return'));
 assert(source.includes("removeEventListener('pagehide', onPageHide)"));
});
