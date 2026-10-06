const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const code=fs.readFileSync(require('node:path').join(__dirname,'../static/js/article-render-sync.js'),'utf8');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function setup(fetch){
 const timers=new Map();let id=0;
 const reader={dataset:{},isConnected:true,innerHTML:'server rendering',querySelectorAll:()=>[],replaceChildren(content){this.innerHTML=content.html;}};
 const source={dataset:{sourceUrl:'/md-source/example.md'},textContent:JSON.stringify('# Embedded fallback'),isConnected:true};
 const events=[];
 const window={SonglineReading:{buildToc(){}},SonglineMarkdown:{render:text=>text},addEventListener(){},dispatchEvent:e=>events.push(e.type),location:{hash:''},
  setTimeout:fn=>{timers.set(++id,fn);return id;},clearTimeout:n=>timers.delete(n)};
 const document={querySelector:s=>s.startsWith('[data-article-renderer')?reader:null,getElementById:()=>source,addEventListener(){},createElement(){const content={querySelectorAll:()=>[]};return {content,set innerHTML(value){content.html=value;}};}};
 vm.runInNewContext(code,{window,document,fetch,AbortController,Event});
 return {reader,events,timers,timeout(){for(const fn of [...timers.values()])fn();}};
}
test('fast remote Markdown wins and clears deadline',async()=>{
 let options;const fixture=setup(async(url,opts)=>{options=opts;return {ok:true,text:async()=>'# Remote source'};});
 await settle();assert.equal(fixture.reader.innerHTML,'# Remote source');assert.equal(fixture.timers.size,0);assert.equal(options.cache,'no-cache');
 assert.deepEqual(fixture.events,['songline:article-toc-ready']);
});
test('hung headers and hung bodies fall back; late content cannot replace text',async()=>{
 for(const body of [false,true]){
  let finish,signal;const stalled=new Promise(resolve=>finish=resolve);
  const f=setup(async(url,opts)=>{signal=opts.signal;return body?{ok:true,text:()=>stalled}:stalled;});
  await settle();f.timeout();await settle();assert.equal(signal.aborted,true);assert.equal(f.reader.innerHTML,'# Embedded fallback');
  finish(body?'# Too late':{ok:true,text:async()=>'# Too late'});await settle();assert.equal(f.reader.innerHTML,'# Embedded fallback');assert.equal(f.timers.size,0);
 }
});
test('HTML fallback, errors and detached readers are safe',async()=>{
 for(const fetch of [async()=>({ok:true,text:async()=>'<html>wrong fallback</html>'}),async()=>({ok:false}),async()=>{throw Error('offline');}]){
  const f=setup(fetch);await settle();assert.equal(f.reader.innerHTML,'# Embedded fallback');assert.equal(f.timers.size,0);
 }
 const f=setup(async()=>({ok:true,text:async()=>'# New article'}));f.reader.isConnected=false;await settle();assert.equal(f.reader.innerHTML,'server rendering');assert.deepEqual(f.events,[]);
});
