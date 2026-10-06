const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
test('zero-height HUD keeps minimum clearance without changing normal header spacing',()=>{
 for(const [height,offsetHeight,expected] of [[0,0,'56px'],[1,1,'56px'],[72,72,'72px'],[undefined,80,'80px'],[undefined,undefined,'72px']]){
  let frame,value;
  const window={requestAnimationFrame:fn=>{frame=fn;return 1;},setTimeout:()=>1,clearTimeout(){},addEventListener(){},matchMedia:()=>({matches:true}),getComputedStyle:()=>({})};
  const header={closest:()=>false,getBoundingClientRect:()=>({width:800,height}),offsetHeight,setAttribute(){}};
  const document={readyState:'complete',querySelectorAll:()=>[header],documentElement:{classList:{add(){}},style:{setProperty:(_,v)=>{value=v;}}}};
  vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../static/js/desktop-fixed-nav.js'),'utf8'),{window,document});
  frame();
  assert.equal(value,expected);
 }
});
test('resize bursts keep only one frame and two settling checks',()=>{
 const frames=new Map(),timers=new Map();let id=0,reads=0;
 const window={requestAnimationFrame:fn=>{frames.set(++id,fn);return id;},setTimeout:fn=>{timers.set(++id,fn);return id;},clearTimeout:id=>timers.delete(id),addEventListener(){},matchMedia:()=>({matches:true}),getComputedStyle:()=>({})};
 const header={closest:()=>false,getBoundingClientRect:()=>{reads++;return {width:800,height:72};},setAttribute(){}};
 const document={readyState:'complete',querySelectorAll:()=>[header],documentElement:{classList:{add(){}},style:{setProperty(){}}}};
 vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../static/js/desktop-fixed-nav.js'),'utf8'),{window,document});
 for(let n=0;n<100;n++)window.SonglineDesktopFixedNav.refresh();
 assert.equal(frames.size,1);
 for(const [id,fn] of frames){frames.delete(id);fn();}
 assert.equal(timers.size,2);assert.equal(reads,2);
 for(let n=0;n<100;n++)window.SonglineDesktopFixedNav.refresh();
 assert.equal(timers.size,0);assert.equal(frames.size,1);
 for(const [id,fn] of frames){frames.delete(id);fn();}
 for(const fn of timers.values())fn();
 assert.equal(reads,8); // Four measurements, not 603 for 201 schedule calls.
});
