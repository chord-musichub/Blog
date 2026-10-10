const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const code=fs.readFileSync('static/js/article-heading.js','utf8');
function fixture({text='中文👨‍👩‍👧‍👦é简介',reduced=false,transition=false,visible=true,scene=false,hidden=false}={}){
 const listeners=new Map(),frames=new Map();let sequence=0;
 const classes=new Set(),rootClasses=new Set(transition?['songline-page-transitioning']:[]),observers=[],source={textContent:text};
 if(scene)rootClasses.add('is-scene-preparing');
 const rect={top:visible?100:1000,bottom:visible?160:1060,width:400,height:60};
 const summary={getBoundingClientRect:()=>rect,dataset:{},isConnected:true,children:[],classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)},querySelector:()=>source,appendChild(n){this.children.push(n);n.parent=this;}};
 function add(k,fn){if(!listeners.has(k))listeners.set(k,new Set());listeners.get(k).add(fn);}
 function remove(k,fn){listeners.get(k)?.delete(fn);}
 const motion={matches:reduced,addEventListener:add,removeEventListener:remove};
 const document={hidden:hidden,querySelector:selector=>selector==='#songline-scene-entry-loader'?null:summary,documentElement:{classList:{contains:name=>rootClasses.has(name)}},addEventListener:add,removeEventListener:remove,createTextNode:nodeValue=>({nodeValue}),createElement:()=>({children:[],setAttribute(k,v){this[k]=v;},append(...nodes){this.children.push(...nodes);},remove(){summary.children=summary.children.filter(n=>n!==this);}})};
 class Observer{constructor(callback){this.callback=callback;this.disconnected=false;observers.push(this);}observe(){}disconnect(){this.disconnected=true;}}
 const window={Intl,innerHeight:900,IntersectionObserver:Observer,MutationObserver:Observer,matchMedia:()=>motion,addEventListener:add,removeEventListener:remove,requestAnimationFrame(fn){frames.set(++sequence,fn);return sequence;},cancelAnimationFrame:k=>frames.delete(k)};
 vm.runInNewContext(code,{window,document,Intl});
 return {window,document,summary,source,motion,frames,listeners,rect,rootClasses,observers,notify(){observers.filter(o=>!o.disconnected).forEach(o=>o.callback());},tick(now){const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn(now));},dispatch(k){[...(listeners.get(k)||[])].forEach(fn=>fn());}};
}
test('summary types whole graphemes without editing original content or duplicating jobs',()=>{
 const f=fixture();assert.equal(f.summary.dataset.summaryState,'typing');assert.equal(f.frames.size,1);
 f.window.SonglineInitArticleHeading(f.document);assert.equal(f.frames.size,1);assert.equal(f.summary.children.length,1);
 const original=f.source.textContent,segments=[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(original)].map(x=>x.segment);
 f.tick(0);f.tick(2460);const typed=f.summary.children[0].children[0].nodeValue;
 assert.equal(typed,segments.slice(0,Math.floor(segments.length/2)).join(''));assert.equal(f.source.textContent,original);
 f.tick(4510);assert.equal(f.summary.dataset.summaryState,'complete');assert.equal(f.summary.children.length,0);assert.equal(f.frames.size,0);
 assert([...f.listeners.values()].every(set=>set.size===0),'Completion releases every listener');
 f.window.SonglineInitArticleHeading(f.document);assert.equal(f.frames.size,0,'Completed DOM does not replay');
});
test('reduced motion skips typing; live preference changes finish and release resources',()=>{
 const reduced=fixture({reduced:true});assert.equal(reduced.frames.size,0);assert.equal(reduced.summary.children.length,0);
 const f=fixture();f.motion.matches=true;f.dispatch('change');assert.equal(f.frames.size,0);assert.equal(f.summary.dataset.summaryState,'complete');assert([...f.listeners.values()].every(set=>set.size===0));
});
test('AJAX waits for the curtain; departure, detachment and hiding cancel pending work',()=>{
 const f=fixture({transition:true});assert.equal(f.summary.dataset.summaryState,'waiting');assert.equal(f.frames.size,0);
 f.rootClasses.delete('songline-page-transitioning');f.dispatch('songline:page-transition-end');assert.equal(f.frames.size,1);f.dispatch('songline:page-transition-start');assert.equal(f.frames.size,0);assert.equal(f.summary.children.length,0);
 for(const event of ['pagehide','songline:page-swap','visibilitychange']){
  const p=fixture();if(event==='songline:page-swap')p.summary.isConnected=false;if(event==='visibilitychange')p.document.hidden=true;
  p.dispatch(event);assert.equal(p.frames.size,0);assert.equal(p.summary.dataset.summaryState,'complete');assert([...p.listeners.values()].every(set=>set.size===0),event);
 }
});

test('typing waits until the summary is on screen and the entry curtain is gone',()=>{
 const f=fixture({visible:false,scene:true});assert.equal(f.summary.dataset.summaryState,'waiting');assert.equal(f.frames.size,0);
 f.rootClasses.delete('is-scene-preparing');f.notify();assert.equal(f.frames.size,0,'Uncovered text below the fold still waits');
 f.rect.top=200;f.rect.bottom=260;f.notify();assert.equal(f.summary.dataset.summaryState,'typing');assert.equal(f.frames.size,1);
 assert(f.observers.every(o=>o.disconnected),'Observers release as soon as typing begins');
 f.tick(0);f.tick(1000);assert(f.summary.children[0].children[0].nodeValue.length>0);
 f.dispatch('songline:page-transition-start');assert.equal(f.frames.size,0);
 const covered=fixture({scene:true});covered.notify();assert.equal(covered.frames.size,0,'Visible text behind entry curtain cannot start');
 covered.rootClasses.delete('is-scene-preparing');covered.notify();assert.equal(covered.frames.size,1);
});
test('departure while below the fold releases every waiting observer and listener',()=>{
 const f=fixture({visible:false});f.dispatch('pagehide');assert(f.observers.every(o=>o.disconnected));
 assert([...f.listeners.values()].every(set=>set.size===0));assert.equal(f.frames.size,0);
 f.rect.top=100;f.notify();assert.equal(f.frames.size,0);
});

test('short summaries remain visibly partial beyond the old 600ms duration',()=>{
 const f=fixture({text:'四字简介'});f.tick(0);f.tick(300);assert.equal(f.summary.children[0].children[0].nodeValue,'','Cursor has a brief lead-in');
 f.tick(3500);assert.equal(f.summary.dataset.summaryState,'typing');const partial=f.summary.children[0].children[0].nodeValue;assert(partial.length>0 && partial.length<4);
 f.tick(4510);assert.equal(f.summary.dataset.summaryState,'complete');
});
test('background entry waits for visibility and a tiny glimpse at the viewport edge does not start typing',()=>{
 const f=fixture({hidden:true});assert.equal(f.summary.dataset.summaryState,'waiting');assert.equal(f.frames.size,0);
 f.document.hidden=false;f.dispatch('visibilitychange');assert.equal(f.frames.size,1);f.dispatch('pagehide');
 const edge=fixture({visible:false});edge.rect.top=890;edge.rect.bottom=950;edge.notify();assert.equal(edge.frames.size,0);
 edge.rect.top=820;edge.rect.bottom=880;edge.notify();assert.equal(edge.frames.size,1);
});

test('slow typing reveals the first character promptly then advances over several seconds',()=>{
 const f=fixture({text:'四字简介'});f.tick(0);f.tick(410);assert.equal(f.summary.children[0].children[0].nodeValue,'四');
 f.tick(2050);assert.equal(f.summary.children[0].children[0].nodeValue,'四');
 f.tick(3690);assert.equal(f.summary.children[0].children[0].nodeValue,'四字简');
 f.tick(4510);assert.equal(f.summary.dataset.summaryState,'complete');
 const single=fixture({text:'字'});single.tick(0);single.tick(1000);assert.equal(single.summary.dataset.summaryState,'typing');
 single.tick(4510);assert.equal(single.summary.dataset.summaryState,'complete');
});

test('reader-only module scans preserve waiting and active heading animations',()=>{
 const reader={isConnected:true,querySelector:()=>null};
 for(const transition of [false,true]){
  const f=fixture({transition});const state=f.summary.dataset.summaryState;
  f.window.SonglineInitArticleHeading(reader);assert.equal(f.summary.dataset.summaryState,state);
  assert.equal(f.summary.children.length,1,'Reader scan cannot remove the heading visual');
  assert.equal(f.frames.size,transition?0:1);
  if(transition){f.rootClasses.delete('songline-page-transitioning');f.dispatch('songline:page-transition-end');}
  f.tick(0);f.tick(1000);assert(f.summary.children[0].children[0].nodeValue.length>0);
  f.window.SonglineInitArticleHeading(reader);assert.equal(f.summary.dataset.summaryState,'typing');assert.equal(f.frames.size,1);
  f.dispatch('pagehide');assert([...f.listeners.values()].every(set=>set.size===0));
 }
});
test('unrelated detached scans cannot cancel a live heading, but detached active headings are released',()=>{
 const f=fixture();f.window.SonglineInitArticleHeading({isConnected:false,querySelector:()=>null});assert.equal(f.frames.size,1);
 f.summary.isConnected=false;f.window.SonglineInitArticleHeading({isConnected:true,querySelector:()=>null});
 assert.equal(f.frames.size,0);assert.equal(f.summary.children.length,0);assert([...f.listeners.values()].every(set=>set.size===0));
});
