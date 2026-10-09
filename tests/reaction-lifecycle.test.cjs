const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../static/js/tools/reaction-test.js'),'utf8');
const settle=async()=>{for(let i=0;i<4;i++)await new Promise(resolve=>setImmediate(resolve));};
function fixture({abort=true,best='180'}={}){
 function element(){
  const listeners=new Map(),classes=new Set();let html='',writes=0;
  return {dataset:{},isConnected:true,hidden:false,textContent:'',classList:{add(...n){n.forEach(v=>classes.add(v));},remove(...n){n.forEach(v=>classes.delete(v));},toggle(n,on){if(on)classes.add(n);else classes.delete(n);}},
   setAttribute(){},blur(){},addEventListener(t,fn){if(!listeners.has(t))listeners.set(t,new Set());listeners.get(t).add(fn);},removeEventListener(t,fn){listeners.get(t)?.delete(fn);},emit(t,event={}){for(const fn of [...(listeners.get(t)||[])])fn({type:t,...event});},count(){return [...listeners.values()].reduce((n,v)=>n+v.size,0);},
   get innerHTML(){return html;},set innerHTML(value){html=value;writes++;},get writes(){return writes;}};
 }
 const root=element(),window=element(),nodes={};
 for(const name of ['stage','start','current','best','top-scores','title','text','kicker','sound-toggle'])nodes[name]=element();
 root.querySelector=s=>nodes[s.slice('[data-reaction-'.length,-1)];
 const document={querySelectorAll:()=>[root]},memory=new Map([['songline-reaction-best-v1',best],['songline-reaction-sound-enabled-v1','0']]),writes=[];
 window.SonglineRuntime={storage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>{memory.set(k,v);writes.push([k,v]);}}};
 const timers=new Map(),requests=[];let serial=0;
 window.setTimeout=(fn,delay)=>{timers.set(++serial,{fn,delay});return serial;};window.clearTimeout=id=>timers.delete(id);
 const fetch=(url,options)=>new Promise((resolve,reject)=>requests.push({url,options,resolve,reject}));
 vm.runInNewContext(source,{window,document,fetch,AbortController:abort?AbortController:undefined,setTimeout:window.setTimeout,clearTimeout:window.clearTimeout,performance:{now:()=>2000},console});
 window.SonglineInitReactionTest(document);
 return {root,window,document,nodes,memory,writes,timers,requests,count:()=>[root,window,...Object.values(nodes)].reduce((n,e)=>n+e.count(),0),sync:()=>root.emit('songline:tool-sync-best'),run(delay){for(const [id,t] of [...timers])if(t.delay===delay){timers.delete(id);t.fn();}}};
}
const ok=(request,scores=[{score:180}])=>request.resolve({ok:true,json:async()=>({scores})});
const missing=(request,status=404)=>request.resolve({ok:false,status});
test('reaction departure aborts requests, clears timers/listeners and rejects late writes or fallback',async()=>{
 const f=fixture();assert(f.count()>0);f.nodes.stage.emit('click');assert(f.timers.size>0);
 f.window.emit('songline:page-transition-start');assert(f.requests[0].options.signal.aborted);assert.equal(f.count(),0);assert.equal(f.timers.size,0);assert.equal(f.root.dataset.reactionBooted,undefined);
 ok(f.requests[0]);await settle();assert.equal(f.requests.length,1);assert.equal(f.writes.length,0);assert.equal(f.window.SonglineReactionScoresDebug,undefined);assert.equal(f.timers.size,0);
 f.window.SonglineInitReactionTest(f.document);assert.equal(f.requests.length,2);assert.equal(f.nodes.stage.count(),1,'Only a fresh stage handler remains');
 f.window.emit('pagehide',{persisted:false});f.requests[1].reject(new Error('offline'));await settle();assert.equal(f.requests.length,2);assert.equal(f.count(),0);
 const body=fixture();let resolveJSON;body.requests[0].resolve({ok:true,json:()=>new Promise(resolve=>resolveJSON=resolve)});await settle();body.window.emit('songline:page-transition-start');resolveJSON({scores:[{score:90}]});await settle();assert.equal(body.writes.length,0);assert.equal(body.requests.length,1);assert.equal(body.timers.size,0,'A late response body cannot schedule a departed sync');
});
test('reaction departure cancels delayed best sync and same ranking does not rebuild DOM',async()=>{
 const f=fixture();f.memory.set('songline-reaction-server-top3-cache',JSON.stringify([{score:180}]));
 // Initial empty-cache render happened before seeding, so reinitialize once.
 f.window.emit('songline:page-transition-start');ok(f.requests[0]);await settle();f.window.SonglineInitReactionTest(f.document);
 const writes=f.nodes['top-scores'].writes;ok(f.requests[1]);await settle();assert.equal(f.nodes['top-scores'].writes,writes);assert.equal(f.timers.size,1);
 f.window.emit('pagehide',{persisted:false});assert.equal(f.timers.size,0);f.run(320);assert.equal(f.requests.length,2);
});
test('best sync shares pending submission, does not retry ambiguous POST across routes, and retries on later reconnect',async()=>{
 const f=fixture();missing(f.requests[0]);await settle();ok(f.requests[1]);await settle();f.run(320);await settle();
 assert.equal(f.requests[2].url,f.requests[1].url,'Remember the working read endpoint');
 for(let i=0;i<20;i++)f.sync();assert.equal(f.requests.length,3);assert.equal(f.requests[2].options.method,'POST');
 const player=JSON.parse(f.requests[2].options.body).player_id;f.requests[2].reject(new Error('connection lost after possible acceptance'));await settle();assert.equal(f.requests.length,3);
 f.sync();assert.equal(f.requests.length,4);assert.equal(JSON.parse(f.requests[3].options.body).player_id,player);ok(f.requests[3]);await settle();
 for(let i=0;i<20;i++)f.sync();assert.equal(f.requests.length,4,'Acknowledged best does not submit again');
 f.memory.set('songline-reaction-best-v1','170');f.sync();assert.equal(f.requests.length,5);assert.equal(JSON.parse(f.requests[4].options.body).score,170);ok(f.requests[4],[{score:170}]);await settle();
});
test('explicitly missing POST route may fall back, but HTTP 500 and invalid success body may not',async()=>{
 const f=fixture();ok(f.requests[0]);await settle();f.run(320);missing(f.requests[1],405);await settle();assert.equal(f.requests.length,3);ok(f.requests[2]);await settle();assert(f.nodes['top-scores'].innerHTML.includes('180 ms'));
 for(const failure of ['status','json']){
  const x=fixture();ok(x.requests[0]);await settle();x.run(320);
  if(failure==='status')missing(x.requests[1],500);else x.requests[1].resolve({ok:true,json:async()=>({notScores:[]})});
  await settle();assert.equal(x.requests.length,2,'Uncertain write must not fan out: '+failure);x.window.emit('songline:page-transition-start');
 }
});
test('older GET cannot overwrite newer submitted ranking, cache or debug after disposal',async()=>{
 const f=fixture();f.sync();assert.equal(f.requests.length,2);ok(f.requests[1],[{score:150}]);await settle();const ranking=f.nodes['top-scores'].innerHTML,cache=f.memory.get('songline-reaction-server-top3-cache');
 ok(f.requests[0],[{score:400}]);await settle();assert.equal(f.nodes['top-scores'].innerHTML,ranking);assert.equal(f.memory.get('songline-reaction-server-top3-cache'),cache);
 f.memory.set('songline-reaction-best-v1','140');f.sync();const pending=f.requests.at(-1),debug=f.window.SonglineReactionScoresDebug;f.window.emit('songline:page-transition-start');ok(pending,[{score:140}]);await settle();assert.equal(f.window.SonglineReactionScoresDebug,debug);assert.equal(f.nodes['top-scores'].innerHTML,ranking);assert.equal(f.memory.get('songline-reaction-server-top3-cache'),cache);
});
test('persisted pagehide keeps controls usable; permanently leaving destroys them',async()=>{
 const f=fixture({best:'0'});ok(f.requests[0]);await settle();f.run(320);const bindings=f.count();
 for(let i=0;i<3;i++){f.window.emit('pagehide',{persisted:true});f.window.emit('pageshow',{persisted:true});assert.equal(f.count(),bindings);}
 f.nodes.stage.emit('click');assert(f.timers.size>0);f.root.emit('songline:tool-help-change',{detail:{open:true}});assert.equal(f.timers.size,0);assert.equal(f.nodes.title.textContent,'点击开始');
 f.window.emit('pagehide',{persisted:false});assert.equal(f.count(),0);
});
test('without AbortController late completion still cannot mutate a departed page',async()=>{
 const f=fixture({abort:false});f.window.emit('songline:page-transition-start');ok(f.requests[0]);await settle();assert.equal(f.writes.length,0);assert.equal(f.requests.length,1);assert.equal(f.timers.size,0);
});
