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
function setup(fetch,storage,consent=true){
 const events={};let nodes=[];
 const window={location:{pathname:'/article/'},SonglinePrivacy:{allows:()=>consent},addEventListener:(name,fn)=>events[name]=fn};
 if(consent==='missing')delete window.SonglinePrivacy;
 const memory=new Map();
 vm.runInNewContext(source,{window,document:{querySelectorAll:()=>nodes},fetch,AbortController,setTimeout,clearTimeout,sessionStorage:storage||{getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v)}});
 const init=value=>{nodes=value;window.SonglineInitViews({querySelectorAll:()=>nodes});};
 init.consent=value=>{consent=value;events['songline:privacy-change']();};
 init.memory=memory;
 return init;
}
test('no consent only reads; granting updates current article; withdrawal prevents new increments',async()=>{
 const calls=[];const init=setup(async(url,opts)=>{calls.push(opts.method);return {ok:true,json:async()=>({views:4})};},null,false);
 init([counter('/p/','post')]);await settle();assert.deepEqual(calls,['GET']);assert.equal(init.memory.size,0);
 init.consent(true);await settle();assert.deepEqual(calls,['GET','POST']);
 init.consent(false);await settle();init([counter('/q/','post')]);await settle();assert.deepEqual(calls,['GET','POST','GET','GET']);
});
test('withdrawal before fetch prevents the queued increment',async()=>{
 const calls=[];const init=setup(async(url,opts)=>{calls.push(opts.method);return {ok:true,json:async()=>({views:4})};});
 init([counter('/p/','post')]);init.consent(false);await settle();assert.deepEqual(calls,['GET']);assert.equal(init.memory.size,0);
});
test('a missing privacy script fails closed without breaking displayed counts',async()=>{
 const calls=[];const init=setup(async(url,opts)=>{calls.push(opts.method);return {ok:true,json:async()=>({views:4})};},null,'missing');
 const node=counter('/p/','post');init([node]);await settle();assert.deepEqual(calls,['GET']);assert.equal(node.value.textContent,4);assert.equal(init.memory.size,0);
});
test('withdrawing while a POST is in flight does not recreate session markers',async()=>{
 let resolve;const init=setup(()=>new Promise(done=>{resolve=done;}));
 init([counter('/p/','post')]);await settle();init.consent(false);
 resolve({ok:true,json:async()=>({views:4})});await settle();assert.equal(init.memory.size,0);
});
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
test('closed archive counters do no work; opening reads once and privacy changes do not refresh GET-only counts',async()=>{
 const calls=[];const init=setup(async(url,opts)=>{calls.push(opts.method);return {ok:true,json:async()=>({views:12})};},null,false);
 let open=false,hidden=false;
 const record={get hidden(){return hidden;},classList:{contains:()=>open}};
 const node=counter('/archive/');node.attrs['data-view-deferred']='archive';node.closest=()=>record;
 init([node]);await settle();assert.equal(calls.length,0);assert.equal(node.value.textContent,'0');
 init.consent(true);await settle();assert.equal(calls.length,0);
 open=true;init([node]);await settle();assert.deepEqual(calls,['GET']);assert.equal(node.value.textContent,12);
 init.consent(false);await settle();assert.deepEqual(calls,['GET']);
 open=false;init([node]);open=true;init([node]);await settle();assert.deepEqual(calls,['GET']);
 const filtered=counter('/filtered/');filtered.attrs['data-view-deferred']='archive';filtered.closest=()=>record;hidden=true;
 init([filtered]);await settle();assert.deepEqual(calls,['GET']);
});
