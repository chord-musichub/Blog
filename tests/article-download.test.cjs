const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const code=fs.readFileSync(path.join(__dirname,'../static/js/article-download.js'),'utf8');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(fetch,withLabel=false){
 let click,downloads=0,next=0;const timers=new Map();
 const button={dataset:{},textContent:'下载 .md',isConnected:true,addEventListener(type,fn){click=fn;}};
 const label={textContent:'下载 .md'};if(withLabel)button.querySelector=()=>label;
 const source={dataset:{sourceUrl:'/source.md'},textContent:JSON.stringify('# Embedded'),isConnected:true};
 const reader={dataset:{articleTitle:'测试'}};
 const window={setTimeout(fn){timers.set(++next,fn);return next;},clearTimeout(id){timers.delete(id);}};
 const document={querySelector:selector=>selector==='[data-md-download]'?button:reader,getElementById:()=>source,
  body:{appendChild(){}},createElement:()=>({click(){downloads++;},remove(){}})};
 vm.runInNewContext(code,{window,document,fetch,AbortController,Blob,URL:{createObjectURL:()=>'/blob',revokeObjectURL(){}}});
 return {button,label,source,timers,click:()=>click(),downloads:()=>downloads,timeout(){for(const fn of [...timers.values()])fn();}};
}
test('stalled Markdown downloads fall back on both headers and body deadlines',async()=>{
 for(const body of [false,true]){
  let signal,resolve;const pending=new Promise(done=>resolve=done);
  const f=fixture(async(url,options)=>{signal=options.signal;return body?{ok:true,text:()=>pending}:pending;});
  const task=f.click();await settle();assert.equal(f.button.disabled,true);
  f.timeout();await task;assert.equal(signal.aborted,true);assert.equal(f.downloads(),1);assert.equal(f.button.disabled,false);
  resolve(body?'Late source':{ok:true,text:async()=>'Late source'});await settle();assert.equal(f.downloads(),1);
 }
});
test('departing the article cancels the visible download result',async()=>{
 let resolve;const pending=new Promise(done=>resolve=done);
 const f=fixture(()=>pending);const task=f.click();f.button.isConnected=false;f.source.isConnected=false;
 resolve({ok:true,text:async()=>'Source'});await task;assert.equal(f.downloads(),0);assert.equal(f.button.disabled,false);
});

test('download status updates only the label and retains its icon container',async()=>{
 const f=fixture(async()=>({ok:true,text:async()=> '# Downloaded'}),true);
 const task=f.click();assert.equal(f.label.textContent,'准备中...');assert.equal(f.button.textContent,'下载 .md');
 await task;assert.equal(f.label.textContent,'下载 .md');assert.equal(f.button.textContent,'下载 .md');assert.equal(f.downloads(),1);
});
