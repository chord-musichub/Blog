const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../static/js/markdown-code-tools.js'),'utf8');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(count=1,secure=true){
 const listeners=new Map(),timers=new Map(),requests=[];let serial=0,localListeners=0,fallbacks=0;
 function node(tag='div'){
  const classes=new Set();
  const el={tagName:tag.toUpperCase(),children:[],dataset:{},isConnected:true,style:{},textContent:'',innerText:'',get className(){return [...classes].join(' ');},set className(value){classes.clear();String(value).split(/\s+/).filter(Boolean).forEach(c=>classes.add(c));},classList:{add(...v){v.forEach(c=>classes.add(c));},remove(...v){v.forEach(c=>classes.delete(c));},toggle(c,on){if(on)classes.add(c);else classes.delete(c);},contains:c=>classes.has(c)},getAttribute(){return null;},setAttribute(){},addEventListener(){localListeners++;},appendChild(child){if(child.parentNode){child.parentNode.children=child.parentNode.children.filter(n=>n!==child);}this.children.push(child);child.parentNode=this;},insertBefore(child,before){this.children.splice(this.children.indexOf(before),0,child);child.parentNode=this;},remove(){this.isConnected=false;if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(n=>n!==this);},select(){document.activeElement=this;},focus(){document.activeElement=this;},closest(selector){for(let parent=this;parent;parent=parent.parentNode)if(selector.split(',').some(s=>parent.classList.contains(s.trim().slice(1))))return parent;return null;},querySelector(selector){const tag=selector.toUpperCase();for(const child of this.children){if(child.tagName===tag)return child;const found=child.querySelector(selector);if(found)return found;}return null;}};
  return el;
 }
 const root=node();root.className='markdown-body';const blocks=[];
 for(let i=0;i<count;i++){const pre=node('pre'),code=node('code');code.className='language-js';code.innerText='const n = '+i+';';pre.appendChild(code);root.appendChild(pre);blocks.push(pre);}
 root.querySelectorAll=()=>blocks;
 const document={body:node('body'),activeElement:null,createElement:node,execCommand(){fallbacks++;return document.copyAllowed!==false;},addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn);}};
 const window={isSecureContext:secure,addEventListener(type,fn){listeners.set('window:'+type,[fn]);},setTimeout(fn){timers.set(++serial,fn);return serial;},clearTimeout:id=>timers.delete(id)};
 const navigator={clipboard:{writeText(text){return new Promise((resolve,reject)=>requests.push({text,resolve,reject}));}}};
 const context={window,document,navigator};vm.runInNewContext(source,context);window.SonglineEnhanceMarkdown(root);
 const buttons=root.children.map(wrapper=>wrapper.children[0].children[1]);
 return {window,document,root,blocks,buttons,listeners,timers,requests,context,localListeners:()=>localListeners,fallbacks:()=>fallbacks,click(index=0){for(const fn of listeners.get('click'))fn({target:buttons[index]});},depart(){listeners.get('window:songline:page-transition-start')[0]();},reset(){listeners.get('window:pagehide')[0]();}};
}
test('200 code blocks share one delegated click listener and enhancement stays repeat-safe',()=>{
 const f=fixture(200);f.window.SonglineEnhanceMarkdown(f.root);vm.runInNewContext(source,f.context);
 assert.equal(f.localListeners(),0);assert.equal(f.listeners.get('click').length,1);assert.equal(f.root.children.length,200);
 assert.equal(f.buttons[199].textContent,'复制');f.click(199);assert.equal(f.requests[0].text,'const n = 199;');
});
test('pending copies deduplicate; success feedback owns one disposable timer',async()=>{
 const f=fixture();f.click();f.click();assert.equal(f.requests.length,1);
 f.requests[0].resolve();await settle();assert.equal(f.buttons[0].textContent,'已复制');assert.equal(f.timers.size,1);
 f.depart();assert.equal(f.timers.size,0);assert.equal(f.buttons[0].textContent,'复制');assert(!f.buttons[0].classList.contains('copied'));
});
test('late clipboard success after departure cannot update old buttons or create timers',async()=>{
 const f=fixture();f.click();f.depart();f.requests[0].resolve();await settle();
 assert.equal(f.buttons[0].textContent,'复制');assert.equal(f.timers.size,0);
});
test('late clipboard rejection cannot initiate a fallback write on a departed page',async()=>{
 const f=fixture();f.click();f.depart();f.requests[0].reject(new Error('denied'));await settle();
 assert.equal(f.fallbacks(),0);assert.equal(f.timers.size,0);
});
test('fallback reports actual failure and restores focus instead of claiming a copy succeeded',async()=>{
 const f=fixture(1,false);f.document.copyAllowed=false;f.document.activeElement=f.buttons[0];f.click();await settle();
 assert.equal(f.buttons[0].textContent,'复制失败');assert(!f.buttons[0].classList.contains('copied'));assert.equal(f.document.body.children.length,0);assert.equal(f.document.activeElement,f.buttons[0]);
 f.reset();assert.equal(f.timers.size,0);f.document.copyAllowed=true;f.click();await settle();assert.equal(f.buttons[0].textContent,'已复制');
});
test('a cached-page new copy survives a late previous operation and secure denial can fall back',async()=>{
 const f=fixture();f.click();f.reset();f.click();assert.equal(f.requests.length,2);
 f.requests[0].resolve();await settle();assert.equal(f.buttons[0].textContent,'复制');
 f.requests[1].reject(new Error('denied'));await settle();assert.equal(f.fallbacks(),1);assert.equal(f.buttons[0].textContent,'已复制');
});
