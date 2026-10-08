const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function fixture(){
 const events=new Map(),frames=new Map(),timers=new Map();let id=0,queries=0,reads=0,reader=false;
 const classes=()=>({add(){},remove(){},toggle(){}});
 const button=()=>({dataset:{},isConnected:true,style:{removeProperty(){}},classList:classes(),addEventListener(){},remove(){this.isConnected=false;}});
 let top=button(),bottom=button();
 const document={currentScript:null,head:{appendChild(){}},getElementById:()=>({}),documentElement:{classList:classes(),scrollTop:0,get scrollHeight(){reads++;return 2000;},get offsetHeight(){reads++;return 2000;}},body:{appendChild(node){node.parentNode=this;},get scrollHeight(){reads++;return 2000;}},querySelector(){queries++;return reader?{}:null;},querySelectorAll(selector){queries++;return selector==='.back-to-top-button'?[top]:selector==='.scroll-to-bottom-button'?[bottom]:[top,bottom].filter(b=>b.isConnected);}};
 const window={location:{href:'https://reading.test/'},scrollY:500,innerHeight:800,matchMedia:()=>({matches:false}),addEventListener:(type,fn)=>events.set(type,fn),requestAnimationFrame(fn){frames.set(++id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id),setTimeout(fn){timers.set(++id,fn);return id;},clearTimeout:id=>timers.delete(id)};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../static/js/reader-floating-controls.js'),'utf8'),{window,document,URL});
 return {events,frames,timers,window,setReader(value){reader=value;},newButtons(){top=button();bottom=button();},reset(){queries=0;reads=0;},counts:()=>({queries,reads}),flush(){for(const [id,fn] of frames){frames.delete(id);fn();}}};
}
test('non-reader scrolling schedules no frames and performs no DOM queries',()=>{
 const f=fixture();f.window.SonglineNormalizeFloatReadingButtons();f.reset();
 for(let i=0;i<100;i++)f.events.get('scroll')();
 assert.equal(f.frames.size,0);assert.deepEqual(f.counts(),{queries:0,reads:0});
});
test('reader scroll bursts share one frame and reuse portaled controls; departure cancels work',()=>{
 const f=fixture();f.setReader(true);f.window.SonglineNormalizeFloatReadingButtons();f.reset();
 for(let i=0;i<100;i++)f.events.get('scroll')();assert.equal(f.frames.size,1);f.flush();
 assert.deepEqual(f.counts(),{queries:0,reads:3});
 f.events.get('scroll')();assert.equal(f.frames.size,1);assert.equal(f.timers.size,2);
 f.events.get('songline:page-transition-start')();assert.equal(f.frames.size,0);assert.equal(f.timers.size,0);
 f.reset();f.events.get('scroll')();assert.deepEqual(f.counts(),{queries:0,reads:0});assert.equal(f.frames.size,0);
 f.newButtons();f.events.get('songline:page-swap')();f.events.get('scroll')();assert.equal(f.frames.size,1,'New article controls remain usable');
 f.events.get('pagehide')();assert.equal(f.frames.size,0);
});
