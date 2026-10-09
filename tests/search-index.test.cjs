const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
function classes(){const values=new Set();return {toggle(name,on){if(on)values.add(name);else values.delete(name);},remove(name){values.delete(name);},contains:name=>values.has(name)};}
function style(){const values=new Map(),priorities=new Map();return {writes:0,getPropertyValue:key=>values.get(key)||'',getPropertyPriority:key=>priorities.get(key)||'',setProperty(key,value,priority){this.writes++;values.set(key,value);priorities.set(key,priority||'');},removeProperty(key){this.writes++;values.delete(key);priorities.delete(key);}};}
function fixture(query=''){
 const stats={reads:0,normalize:0,terms:0,strataQueries:0};
 const input={dataset:{},value:'',classList:classes(),handlers:{},addEventListener(type,fn){this.handlers[type]=fn;}};
 const count={textContent:''};
 const items=[['MD 预览器','Markdown 文件'],['2048','数字 游戏'],['贪吃蛇','游戏 蛇']].map(([name,keywords])=>({dataset:{toolKeywords:keywords},get textContent(){stats.reads++;return name;},classList:classes(),style:style()}));
 const layers=items.map(item=>({querySelectorAll(){stats.strataQueries++;return [item];}}));
 let empty;
 const list={querySelectorAll:selector=>selector==='.tools-strata'?layers:items,appendChild(node){empty=node;}};
 const document={querySelector:selector=>({'[data-tools-search]':input,'.modern-tools-grid':list,'[data-tools-search-count]':count})[selector]||null,querySelectorAll:()=>[],createElement:()=>({style:style()})};
 const window={location:{search:query}};
 const context={window,document,URLSearchParams};
 vm.runInNewContext(read('static/js/search-utils.js'),context);
 const utils=window.SonglineSearchUtils;
 const normalize=utils.normalize,termsOf=utils.termsOf;
 utils.normalize=value=>{stats.normalize++;return normalize(value);};
 utils.termsOf=value=>{stats.terms++;return termsOf(value);};
 utils.installClearButtons=()=>{};utils.showSearchRefresh=()=>{};utils.flashEmpty=()=>{};
 vm.runInNewContext(read('static/js/search.js'),context);
 window.SonglineInitSearch(document);
 return {window,document,input,items,layers,count,stats,get empty(){return empty;},search(value){input.value=value;input.handlers.input();}};
}
test('tool search builds text once and parses a query once per input, preserving matching and strata',()=>{
 const f=fixture();assert.equal(f.stats.reads,3);assert.equal(f.stats.normalize,3);
 const termCalls=f.stats.terms;
 for(const query of ['  游戏  ','数字，游戏','mD','不存在',''])f.search(query);
 assert.equal(f.stats.reads,3,'Typing does not reread each card');
 assert.equal(f.stats.normalize,3,'The immutable card index is normalized once');
 assert.equal(f.stats.terms-termCalls,5,'One query parse per input, regardless of card count');
 assert.equal(f.count.textContent,'共 3 个工具');assert(f.items.every(item=>!item.hidden));
 f.search('数字，游戏');assert.deepEqual(f.items.map(item=>item.hidden),[true,false,true]);
 assert.deepEqual(f.layers.map(layer=>layer.hidden),[true,false,true]);
 assert.equal(f.count.textContent,'找到 1 / 3 个工具');
 f.search('不存在');assert.equal(f.empty.hidden,false);
 f.search('');assert.equal(f.empty.hidden,true);assert(f.layers.every(layer=>!layer.hidden));
});
test('URL query, native clearing, Enter and repeated initialization retain existing behavior',()=>{
 const f=fixture('?q=markdown');assert.deepEqual(f.items.map(item=>item.hidden),[false,true,true]);
 f.window.SonglineInitSearch(f.document);assert.equal(f.stats.reads,3,'Repeated scans do not rebuild an already bound index');
 f.search('游戏');let prevented=0;
 f.input.handlers.keydown({key:'Escape',preventDefault(){prevented++;},stopPropagation(){}});
 assert.equal(prevented,1);assert.equal(f.input.value,'');assert(f.items.every(item=>!item.hidden));
 f.input.value='蛇';f.input.handlers.keydown({key:'Enter',preventDefault(){},stopPropagation(){}});
 assert.deepEqual(f.items.map(item=>item.hidden),[true,true,false]);
 f.input.value='';f.input.handlers.search();assert(f.items.every(item=>!item.hidden));
 const fresh=fixture('?q=2048');assert.deepEqual(fresh.items.map(item=>item.hidden),[true,false,true],'Reentering builds an index for the new page');
});
test('unchanged search results keep text and style state while external edits are repaired',()=>{
 const f=fixture();f.search('游戏');
 const writes=f.items.map(item=>item.style.writes),queries=f.stats.strataQueries;
 let label=f.count.textContent,labels=0;
 Object.defineProperty(f.count,'textContent',{get:()=>label,set(value){labels++;label=value;}});
 for(let i=0;i<20;i++)f.search(i%2?'GAME':'游戏');
 // Different matches above must still work; repeat one semantic query next.
 f.search('游戏');const stable=f.items.map(item=>item.style.writes);labels=0;
 for(let i=0;i<20;i++)f.search(' 游戏 ');
 assert.deepEqual(f.items.map(item=>item.style.writes),stable);
 assert.equal(labels,0);assert.equal(f.stats.strataQueries,queries,'Layer membership is immutable until page reentry');
 f.items[0].hidden=false;f.items[0].style.setProperty('display','block');
 f.search('游戏');assert(f.items[0].hidden);assert.equal(f.items[0].style.getPropertyValue('display'),'none');assert.equal(f.items[0].style.getPropertyPriority('display'),'important');
 f.search('MD');assert.equal(f.items[0].hidden,false);assert.equal(f.items[0].style.getPropertyValue('display'),'');
 assert(writes.some(value=>value>0));
});
test('retired snapshot and helpers do not return to the delivery tree',()=>{
 assert(!fs.existsSync(path.join(root,'static/friends-data.json')));
 assert(read('static/js/pages/friends/galaxy.js').includes("document.getElementById('friend-galaxy-data')"));
 assert(!read('static/js/pages/home/music-player.js').includes('function chooseDirectory'));
 assert(read('static/js/pages/home/music-player.js').includes('async function restoreDirectory'),'Keep old directory grants readable');
});
