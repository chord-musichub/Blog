const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const script=fs.readFileSync(path.join(__dirname,'../static/js/pages/home/scene-parallax.js'),'utf8');

function fixture(source=script){
 const frames=new Map(),events=new Map(),windowEvents=new Map();let serial=0;
 function layer(kind){
  const values=new Map(),writes=[];
  const style={setProperty:(k,v)=>{values.set(k,v);writes.push([k,v]);},removeProperty:k=>{values.delete(k);if(k==='transform')delete style.transform;if(k==='will-change')delete style.willChange;}};
  return {dataset:kind?{homeParallax:kind}:{},writes,values,style};
 }
 const background=layer(),system=layer('system'),front=layer('front');
 const compact={matches:false,addEventListener:(_,fn)=>windowEvents.set('compact',fn)};
 const window={innerWidth:1440,innerHeight:900,matchMedia:q=>q==='(max-width:980px)'?compact:{matches:false},requestAnimationFrame:fn=>{frames.set(++serial,fn);return serial;},cancelAnimationFrame:id=>frames.delete(id),addEventListener:(k,fn)=>windowEvents.set(k,fn)};
 const document={body:{dataset:{pageKind:'home'}},documentElement:{classList:{contains:()=>false}},querySelector:()=>background,querySelectorAll:q=>background.dataset.homeParallax&&!q.includes(':not(')?[background,system,front]:[system,front],addEventListener:(k,fn)=>events.set(k,fn)};
 vm.runInNewContext(source,{window,document});
 return {window,document,background,system,front,compact,frames,events,windowEvents,step(){const item=frames.entries().next().value;assert(item);frames.delete(item[0]);item[1]();}};
}

test('restored home background is processed once and keeps its compositing contract',()=>{
 const f=fixture();
 // Also tolerate a retained data attribute from an earlier cached document.
 f.background.dataset.homeParallax='background';
 for(let i=0;i<3;i++){
  f.window.SonglineInitHomeParallax();f.background.writes.length=0;
  f.events.get('pointermove')({pointerType:'mouse',clientX:1440,clientY:900});f.step();
  assert.equal(f.background.writes.length,2,'Exactly one x/y write per frame');
  assert.equal(f.background.style.willChange,'transform','Keep the hardware-tested background compositing');
  assert.equal(f.system.style.willChange,'transform');
  assert.equal(f.background.values.get('--home-parallax-x'),'0.10px');
  assert.equal(f.background.values.get('--home-parallax-y'),'0.10px');
  assert.equal(f.system.style.transform,'translate3d(0.46px,0.46px,0)');
 }
});

test('parallax keeps its original easing/depth, cancels departure work and resumes once',()=>{
 const f=fixture();f.window.SonglineInitHomeParallax();
 f.events.get('pointermove')({pointerType:'touch',clientX:1440,clientY:900});assert.equal(f.frames.size,0);
 f.events.get('pointermove')({pointerType:'mouse',clientX:1440,clientY:900});f.step();
 assert.equal(f.frames.size,1);
 f.windowEvents.get('songline:page-transition-start')();assert.equal(f.frames.size,0);
 assert.equal(f.background.values.size,0);
 assert.equal(f.background.style.willChange,undefined);
 assert.equal(f.system.style.transform,undefined);
 f.windowEvents.get('pageshow')({persisted:true});
 f.events.get('pointermove')({pointerType:'mouse',clientX:1440,clientY:900});f.step();
 assert.equal(f.background.values.get('--home-parallax-x'),'0.10px');
 f.compact.matches=true;f.windowEvents.get('compact')();assert.equal(f.frames.size,0);
 f.events.get('pointermove')({pointerType:'mouse',clientX:1440,clientY:900});assert.equal(f.frames.size,0);
});
