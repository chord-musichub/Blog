const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'static/js/pages/archive/index.js'),'utf8');
const helpers=source.slice(source.indexOf('  function pageNumber('),source.indexOf('  function init('));
const context=vm.createContext({});vm.runInContext(helpers,context);
test('archive page inputs reject malformed, unsafe and non-positive values',()=>{
 for(const value of [undefined,null,'','0','-1','1.5','Infinity','NaN','2abc','1e2','9007199254740992'])assert.equal(context.pageNumber(value),1,String(value));
 for(const value of [1,2,'003','123'])assert.equal(context.pageNumber(value),Number(value));
});
test('compact page window includes current and endpoints, without duplicates or huge DOM',()=>{
 for(const total of [1,2,5,6,20,1000000])for(const current of [...new Set([1,Math.ceil(total/2),total])]){
  const items=Array.from(context.pageNumbers(current,total)),numbers=items.filter(x=>x!==null);
  assert(numbers.includes(current));assert.equal(numbers[0],1);assert.equal(numbers.at(-1),total);
  assert.equal(new Set(numbers).size,numbers.length);assert(numbers.length<=5);assert(items.length<=7);
  assert(numbers.every((value,index)=>value>=1&&value<=total&&(!index||value>numbers[index-1])));
 }
 assert.deepEqual(Array.from(context.pageNumbers(1,6)),[1,2,3,4,null,6]);
 assert.deepEqual(Array.from(context.pageNumbers(10,20)),[1,null,9,10,11,null,20]);
});
test('both archive modes have paging; notices retain their existing full-list behavior',()=>{
 const read=p=>fs.readFileSync(path.join(root,p),'utf8');
 const template=read('layouts/_default/list.html');
 for(const mode of ['articles','projects'])assert(template.includes('partial "archive/pagination.html" "'+mode+'"'));
 assert(template.includes('data-archive-page-size="10"'));
 assert(!read('layouts/partials/notices/archive.html').includes('archive/pagination.html'));
 assert(source.includes('pagers[mode] ? matched.slice(start, start + pageSize) : matched'));
 assert(source.includes('history.replaceState(history.state,'));assert(!source.includes('history.pushState'));
 assert(!source.includes('addEventListener(\'popstate\''),'Global transition owns browser history');
 const css=read('static/css/pages/archive/index.css');assert(css.includes('.content-archive__pagination[hidden]{display:none}'));
});
