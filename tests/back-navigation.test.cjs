const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../static/js/page-transition-system.js'),'utf8');
const policy=source.slice(source.indexOf('  function previousPageDelta()'),source.indexOf('  function handleClick(event)'));
function delta(urls,index,canGoBack=false){
 const entries=urls&&urls.map((url,i)=>({url,key:String(i)}));
 const window={location:new URL('https://example.test/posts/note/#chapter'),navigation:entries?{entries:()=>entries,currentEntry:entries[index]}:undefined};
 const history={state:{songlineCanGoBack:canGoBack}};
 return vm.runInNewContext(policy+';previousPageDelta()',{window,history,URL});
}
test('back traverses the previous page, skipping same-article hashes',()=>{
 assert.equal(delta(['https://example.test/tools/?q=music','https://example.test/posts/note/','https://example.test/posts/note/#chapter'],2),-2);
 assert.equal(delta(['https://example.test/posts/note/?mode=source','https://example.test/posts/note/#chapter'],1),-1);
});
test('direct and external arrivals use the fallback rather than guessing from history.length',()=>{
 assert.equal(delta(['https://example.test/posts/note/'],0,true),0);
 assert.equal(delta(['https://outside.test/','https://example.test/posts/note/'],1,true),0);
 assert.equal(delta(undefined,0),0);
});
test('older browsers can traverse only app-owned history entries',()=>{
 assert.equal(delta(undefined,0,true),-1);
 assert.equal(delta(undefined,0,false),0);
 assert.match(source,/replaceState\(Object\.assign\(\{\}, current/,'saving scroll must preserve the back marker');
});
test('desktop and mobile directory jumps preserve history metadata',()=>{
 for(const file of ['article-reading.js','mobile-toc.js']){
  const js=fs.readFileSync(path.join(__dirname,'../static/js',file),'utf8');
  assert(js.includes('history.replaceState(history.state,'));
  assert(!js.includes('history.pushState(null'));
 }
});
test('full-document legacy back trusts only a fresh same-origin arrival in an existing tab',()=>{
 const seed=source.slice(source.indexOf('  function seedHistoryState()'),source.indexOf('  function syncPageStyles(doc)'));
 function arrival(referrer,length,type='navigate',state=null){
  const history={length,state,replaceState(next){this.state=next;}};
  vm.runInNewContext(seed+';seedHistoryState()',{history,document:{referrer},performance:{getEntriesByType:()=>[{type}]},window:{location:new URL('https://example.test/posts/note/'),scrollY:0},activePath:'/posts/note/',priority:{getPagePriority:()=>3},URL});
  return history.state.songlineCanGoBack;
 }
 assert.equal(arrival('https://example.test/tools/',2),true);
 assert.equal(arrival('https://example.test/tools/',1),false);
 assert.equal(arrival('https://outside.test/',4),false);
 assert.equal(arrival('',4),false);
 assert.equal(arrival('https://example.test/tools/',2,'reload'),false);
 assert.equal(arrival('https://example.test/tools/',2,'navigate',{songlineTransition:true,songlineCanGoBack:false}),false);
});
