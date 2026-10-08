const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const code=fs.readFileSync(require('node:path').join(__dirname,'../static/js/reader-floating-controls.js'),'utf8');
function setup(reader){
 let reads=0,writes=0;const callbacks=[],events={};
 function button(){return {dataset:{},isConnected:true,shown:false,style:{removeProperty(){writes++;}},classList:{add(){},toggle(name,value){this.shown=value;}},addEventListener(){},remove(){this.isConnected=false;}};}
 const top=button(),bottom=button();
 const window={location:{href:'http://example.test/posts/'},scrollY:500,innerHeight:800,addEventListener:(name,fn)=>events[name]=fn,requestAnimationFrame:fn=>{callbacks.push(fn);return callbacks.length;},setTimeout:()=>0,clearTimeout(){}};
 const document={currentScript:null,getElementById:()=>({}),body:{appendChild(node){node.parentNode=this;},get scrollHeight(){reads++;return 1800;}},documentElement:{classList:{add(){},remove(){},toggle(){}},get scrollHeight(){reads++;return 1800;},get offsetHeight(){reads++;return 1800;}},querySelector:()=>reader?{}:null,querySelectorAll:selector=>!reader?[]:selector==='.back-to-top-button'?[top]:selector==='.scroll-to-bottom-button'?[bottom]:[]};
 vm.runInNewContext(code,{window,document,URL});
 window.SonglineNormalizeFloatReadingButtons();reads=0;writes=0;
 return {events,callbacks,top,bottom,get reads(){return reads;},get writes(){return writes;}};
}
test('reader scroll burst measures once per frame without rewriting positioning',()=>{
 const s=setup(true);for(let i=0;i<240;i++)s.events.scroll();
 assert.equal(s.callbacks.length,1);s.callbacks.shift()();
 assert.equal(s.reads,3);assert.equal(s.writes,0);assert.equal(s.top.classList.shown,true);assert.equal(s.bottom.classList.shown,true);
});
test('after leaving a reader, scroll never reads document heights',()=>{
 const s=setup(false);for(let i=0;i<240;i++)s.events.scroll();assert.equal(s.callbacks.length,0);
 assert.equal(s.reads,0);assert.equal(s.writes,0);
});
