const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('shared reader builds a six-level escaped directory with unique anchors',()=>{
 const listeners=[],window={dispatchEvent(){}};
 const document={addEventListener:(type,fn)=>listeners.push(fn)};
 const context={window,document,Event};const code=read('static/js/article-reading.js');
 vm.runInNewContext(code,context);vm.runInNewContext(code,context);assert.equal(listeners.length,1,'One directory delegate after repeated loading');
 const headings=[
  {tagName:'H1',id:'same',textContent:'第一章'},
  {tagName:'H2',id:'same',textContent:'重复'},
  {tagName:'H4',id:'',textContent:'<script> & " 标题'},
  {tagName:'H5',id:'',textContent:'constructor'},
  {tagName:'H6',id:'',textContent:'__proto__'},
  {tagName:'H2',id:'',textContent:'重复'}
 ];
 const toc={innerHTML:''};window.SonglineReading.buildToc({querySelectorAll:()=>headings},toc);
 assert.equal(new Set(headings.map(x=>x.id)).size,6);assert(toc.innerHTML.includes('data-toc-level="6"'));
 assert(toc.innerHTML.includes('&lt;script&gt; &amp; &quot; 标题'));assert(!toc.innerHTML.includes('<script>'));
 assert(toc.innerHTML.includes('<ul><li'),'Nested tree is shared with article CSS');
 window.SonglineReading.buildToc({querySelectorAll:()=>[]},toc);assert(!toc.innerHTML.includes('href='),'Empty content clears old links');
});
test('native refresh skips the home intro, but a first visit still uses it',()=>{
 function boot(type,reduced=false){
  const result={intro:0,entry:0};
  const window={matchMedia:()=>({matches:reduced}),SonglineHomeBoot:{run(){result.intro++;}},SonglineResources:{enter(){result.entry++;}}};
  vm.runInNewContext(read('static/js/page-transition.js'),{window,document:{readyState:'complete',body:{dataset:{pageKind:'home'}},documentElement:{classList:{remove(){}}}},sessionStorage:{getItem:()=>null},performance:{getEntriesByType:()=>[{type}]},clearTimeout(){}});
  return result;
 }
 assert.deepEqual(boot('reload'),{intro:0,entry:1});assert.deepEqual(boot('navigate'),{intro:1,entry:0});assert.deepEqual(boot('navigate',true),{intro:0,entry:1});
});
test('preview uses the actual reader structure and has no old layout stylesheet',()=>{
 const template=read('layouts/tools/markdown-previewer.html');
 for(const token of ['article-reader markdown-body','article-toc-rail','data-md-choose','type="button"','aria-live="polite"'])assert(template.includes(token));
 assert(!fs.existsSync(path.join(__dirname,'../static/css/tools/markdown-previewer-base.css')));
 assert(!read('static/css/tools/markdown-previewer.css').includes('grid-template-columns'),'Preview cannot compete with the article layout');
 const controller=read('static/js/tools/markdown-previewer.js');assert(controller.includes('SonglineReading.buildToc'));
 assert(!controller.includes('function slugify'),'Preview has no divergent heading implementation');
 assert(read('static/js/article-render-sync.js').includes('SonglineReading.buildToc'));
});
