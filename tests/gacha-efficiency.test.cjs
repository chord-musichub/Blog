const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../static/js/tools/gacha.js'),'utf8');
function fixture(){
 class Node{
  constructor(){this.dataset={};this.children=[];this.style={};this.className='';this.textContent='';this.listeners=new Map();this.html='';this.writes=0;this.created=0;this.parentNode=null;this.classList={toggle(){}};}
  get innerHTML(){return this.children.length ? '<generated-cards>' : this.html;}
  set innerHTML(value){this.html=value;this.writes++;this.replaceChildren();}
  replaceChildren(){this.children.forEach(n=>n.parentNode=null);this.children=[];}
  appendChild(n){return this.insertBefore(n,null);}
  insertBefore(n,before){n.remove();const i=before?this.children.indexOf(before):this.children.length;this.children.splice(i,0,n);n.parentNode=this;return n;}
  remove(){if(this.parentNode){this.parentNode.children.splice(this.parentNode.children.indexOf(this),1);this.parentNode=null;}}
  addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,[]);this.listeners.get(type).push(fn);}
  emit(type){for(const fn of this.listeners.get(type)||[])fn();}
 }
 const tool=new Node(),nodes={};
 const hooks=['mode','banner','banner-note','total','pity','hard-pity','pity-bar','guarantee','guarantee-note','spark','spark-target','spark-bar','results','summary','rules','pull-one','pull-ten','reset'];
 hooks.forEach(h=>nodes[h]=new Node());nodes.mode.value='starRailLike';nodes.banner.value='featured';nodes.results.html='<div class="gacha-empty">点击单抽或十连</div>';
 tool.querySelector=s=>nodes[s.slice('[data-gacha-'.length,-1)];const document={querySelector:()=>tool,createElement:()=>new Node()},window={};
 // No top rarity and no UP by default; keep deterministic product output.
 const math=Object.create(Math);math.random=()=>.99;
 vm.runInNewContext(source,{window,document,Math:math});window.SonglineInitGacha(document);
 return {tool,nodes,window,document,math};
}
test('gacha preserves old card nodes, caps history at 80, and only rebuilds help when configuration changes',()=>{
 const f=fixture(),n=f.nodes;const helpWrites=n.rules.writes;f.window.SonglineInitGacha(f.document);assert.equal(n['pull-one'].listeners.get('click').length,1);
 n['pull-ten'].emit('click');const original=[...n.results.children];assert.equal(original.length,10);assert.equal(n.total.textContent,'10');
 n['pull-one'].emit('click');assert(original.every((card,i)=>n.results.children[i+1]===card));assert.equal(n.rules.writes,helpWrites);
 assert.equal(n.results.children[0].children[1].textContent,'#11 · 普通');assert.equal(n.summary.textContent,'本次 1 抽：最高稀有 0 个，UP 0 个。');
 for(let i=0;i<8;i++)n['pull-ten'].emit('click');assert.equal(n.results.children.length,80);assert.equal(n.total.textContent,'91');assert.equal(n.rules.writes,helpWrites);assert.equal(original[0].parentNode,null,'Trimmed history is released');
 n.mode.value='blueArchiveLike';n.mode.emit('change');assert.equal(n.total.textContent,'0');assert.equal(n.results.children.length,0);assert.equal(n.results.innerHTML,'<div class="gacha-empty">点击单抽或十连</div>');assert.equal(n.rules.writes,helpWrites+1);
 n.banner.value='standard';n.banner.emit('change');assert.equal(n.rules.writes,helpWrites+2);assert(n.rules.innerHTML.includes('不会显示 UP 标签'));n['pull-one'].emit('click');assert.equal(n.rules.writes,helpWrites+2);assert.equal(n.guarantee.textContent,'常驻池');
 n.reset.emit('click');n['pull-one'].emit('click');assert.equal(n.results.children.length,1);assert.equal(n.results.children[0].children[1].textContent,'#1 · 普通');
});
test('gacha native card structure matches rarity / optional UP / note without old unused mode names',()=>{
 const f=fixture();f.nodes['pull-ten'].emit('click');const mid=f.nodes.results.children[9];assert.equal(mid.className,'gacha-card mid');assert.equal(mid.children[0].className,'gacha-rarity');assert.equal(mid.children[0].textContent,'四星');assert.equal(mid.children[1].textContent,'#10 · 中稀有');
 f.math.random=()=>0;f.nodes['pull-one'].emit('click');const top=f.nodes.results.children[0];assert.equal(top.className,'gacha-card top');assert.equal(top.children[1].className,'gacha-up');assert.equal(top.children[1].textContent,'UP');assert.equal(top.children[2].textContent,'#11 · 小保底命中 UP');
 assert(!/name:\s*'/.test(source));assert(!source.includes('els.results.innerHTML = state.history.map'));
});
