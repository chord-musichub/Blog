const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const code=fs.readFileSync(require('node:path').join(__dirname,'../static/js/page-transition-system.js'),'utf8');
const fn=code.slice(code.indexOf('  function syncPageStyles(doc){'),code.indexOf('  async function syncDocumentShell('));
function link(id,href){return {id,media:'',dataset:{},sheet:{},getAttribute:name=>name==='href'?href:null,cloneNode:()=>link(id,href),remove(){this.parentNode?.remove(this);},get nextSibling(){return this.parentNode?.nodes[this.parentNode.nodes.indexOf(this)+1]||null;}};}
function head(nodes){
 const h={nodes:[],moves:0,querySelectorAll(){return this.nodes.filter(n=>n.getAttribute);},remove(node){this.nodes.splice(this.nodes.indexOf(node),1);node.parentNode=null;},insertBefore(node,before){
  if(node===before)return;
  if(node.getAttribute)this.moves++;
  node.parentNode?.remove(node);
  const index=before?this.nodes.indexOf(before):this.nodes.length;
  assert(index>=0);this.nodes.splice(index,0,node);node.parentNode=this;
 }};
 nodes.forEach(n=>h.insertBefore(n,null));h.moves=0;return h;
}
function run(current,next){
 const document={head:head(current),createComment(){return {remove(){this.parentNode.remove(this);},get nextSibling(){return this.parentNode.nodes[this.parentNode.nodes.indexOf(this)+1]||null;}};}};
 const context={document,window:{location:new URL('http://blog.test/friends/'),setTimeout},URL,clearTimeout};
 vm.runInNewContext(fn+'\nthis.sync=syncPageStyles;',context);
 return {document,done:context.sync({head:head(next)})};
}
const shared=()=>link('','/css/foundation.css?v=1');
const touch=()=>link('songline-touch-layout-style','/css/touch-layout.css?v=1');
test('page styles keep direct-load order and shared links stay attached',async()=>{
 const first=shared(),last=touch(),old=link('songline-friends-style','/css/friends.css?v=1');
 const next=[shared(),link('songline-home-style','/css/home.css?v=1'),touch()];
 const {document,done}=run([first,old,last],next);await done;
 assert.deepEqual(document.head.nodes.map(n=>n.getAttribute('href')),next.map(n=>n.getAttribute('href')));
 assert.equal(document.head.nodes[0],first);assert.equal(document.head.nodes[2],last);
 assert.equal(document.head.moves,1,'only the new page stylesheet is inserted');assert.equal(old.parentNode,null);
});
test('unchanged styles do not move; versioned styles replace their old bytes',async()=>{
 const a=shared(),b=touch();const same=run([a,b],[shared(),touch()]);await same.done;assert.equal(same.document.head.moves,0);
 const updated=run([shared(),touch()],[link('','/css/foundation.css?v=2'),link('songline-touch-layout-style','/css/touch-layout.css?v=2')]);await updated.done;
 assert.ok(updated.document.head.nodes.every(n=>n.getAttribute('href').endsWith('v=2')));
});
