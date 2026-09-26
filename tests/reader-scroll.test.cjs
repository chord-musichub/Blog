const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const code=fs.readFileSync(require('node:path').join(__dirname,'../static/js/reader-floating-controls.js'),'utf8');
function setup(reader){
 let reads=0,writes=0;const callbacks=[],events={};
 function button(){return {shown:false,style:{removeProperty(){writes++;}},classList:{toggle(name,value){this.shown=value;}}};}
 const top=button(),bottom=button();
 const window={location:{href:'http://example.test/posts/'},scrollY:500,innerHeight:800,addEventListener:(name,fn)=>events[name]=fn,requestAnimationFrame:fn=>{callbacks.push(fn);return callbacks.length;}};
 const document={currentScript:null,body:{get scrollHeight(){reads++;return 1800;}},documentElement:{get scrollHeight(){reads++;return 1800;},get offsetHeight(){reads++;return 1800;}},querySelector:s=>reader?(s.includes('back-to-top')?top:bottom):null};
 vm.runInNewContext(code,{window,document,URL});
 return {events,callbacks,top,bottom,get reads(){return reads;},get writes(){return writes;}};
}
test('reader scroll burst measures once per frame without rewriting positioning',()=>{
 const s=setup(true);for(let i=0;i<240;i++)s.events.scroll();
 assert.equal(s.callbacks.length,1);s.callbacks.shift()();
 assert.equal(s.reads,3);assert.equal(s.writes,0);assert.equal(s.top.classList.shown,true);assert.equal(s.bottom.classList.shown,true);
});
test('after leaving a reader, scroll never reads document heights',()=>{
 const s=setup(false);for(let i=0;i<240;i++)s.events.scroll();s.callbacks.shift()();
 assert.equal(s.reads,0);assert.equal(s.writes,0);
});
