const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync(require('node:path').join(__dirname,'../static/js/views.js'),'utf8');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function counter(path,mode='get'){
 const attrs={'data-view-path':path,'data-view-mode':mode};
 const value={textContent:'0'};
 return {attrs,value,dataset:{},getAttribute:name=>attrs[name],querySelector:()=>value,classList:{contains:()=>false}};
}
function setup(fetch,storage){
 const window={location:{pathname:'/article/'}};
 const memory=new Map();
 vm.runInNewContext(source,{window,document:{},fetch,AbortController,setTimeout,clearTimeout,sessionStorage:storage||{getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v)}});
 return nodes=>window.SonglineInitViews({querySelectorAll:()=>nodes});
}
test('repeated initialization and duplicate counters share one increment',async()=>{
 const calls=[];const init=setup(async(url,opts)=>{calls.push(opts.method);return {ok:true,json:async()=>({views:42})};});
 const nodes=[counter('/p/'),counter('/p/','post'),counter('/p/','post')];
 init(nodes);init(nodes);await settle();init(nodes);await settle();
 assert.deepEqual(calls,['POST']);
 assert.ok(nodes.every(n=>n.value.textContent===42 && n.dataset.viewLoading==='0'));
 init([counter('/p/','post')]);await settle();assert.deepEqual(calls,['POST','GET']);
});
test('blocked storage does not break counts or repeat successful POSTs',async()=>{
 const calls=[];const init=setup(async(url,opts)=>{calls.push(opts.method);return {ok:true,json:async()=>({views:9})};},{getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}});
 init([counter('/p/','post')]);await settle();init([counter('/p/','post')]);await settle();assert.deepEqual(calls,['POST','GET']);
});
test('failed requests retry; a stale response cannot overwrite a reused element',async()=>{
 let count=0;const init=setup(async()=>({ok:++count>1,json:async()=>({views:8})}));
 const node=counter('/retry/');init([node]);await settle();init([node]);await settle();assert.equal(count,2);assert.equal(node.value.textContent,8);
 const resolvers=[];const reuse=setup(()=>new Promise(resolve=>resolvers.push(resolve)));
 const reused=counter('/old/');reuse([reused]);await settle();reused.attrs['data-view-path']='/new/';reuse([reused]);await settle();
 resolvers[1]({ok:true,json:async()=>({views:20})});await settle();resolvers[0]({ok:true,json:async()=>({views:10})});await settle();assert.equal(reused.value.textContent,20);
});
