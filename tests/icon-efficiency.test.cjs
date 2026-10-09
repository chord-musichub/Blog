const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../static/js/icon-system.js'),'utf8');
function fixture(){
 const events=new Map(),timers=new Map();let serial=0,templates=0,writes=0;
 function node(name='play'){let markup='';return {name,isConnected:true,classList:{add(){}},get innerHTML(){return markup;},set innerHTML(value){writes++;markup=String(value).replace(/<(path|circle|rect)([^>]*)\/>/g,'<$1$2></$1>');},getAttribute(){return this.name;},matches:()=>true,querySelectorAll:()=>[]};}
 const nodes=[node(),node(),node('moon')];
 const document={readyState:'complete',querySelectorAll:()=>nodes,createElement(){templates++;return {set innerHTML(value){this.markup=String(value).replace(/<(path|circle|rect)([^>]*)\/>/g,'<$1$2></$1>');},get innerHTML(){return this.markup;}};}};
 const window={addEventListener:(type,fn)=>events.set(type,fn),setTimeout(fn){timers.set(++serial,fn);return serial;},clearTimeout:id=>timers.delete(id)};
 vm.runInNewContext(source,{window,document});return {window,document,nodes,events,timers,counts:()=>({templates,writes})};
}
test('canonical SVG serialization avoids all unchanged icon rewrites',()=>{
 const f=fixture();assert.deepEqual(f.counts(),{templates:2,writes:3});
 for(let i=0;i<20;i++)f.window.SonglineIcons.replace(f.document);
 assert.deepEqual(f.counts(),{templates:2,writes:3});
 f.nodes[0].name='pause';f.window.SonglineIcons.replace(f.nodes[0]);assert.deepEqual(f.counts(),{templates:3,writes:4});
 f.nodes[1].innerHTML='<svg></svg>';f.window.SonglineIcons.replace(f.document);assert.equal(f.counts().writes,6,'Changed markup is restored, not hidden by a stale element cache');
});
test('register still updates existing custom icons; detached roots do not render',()=>{
 const f=fixture();f.window.SonglineIcons.register('play','<svg><circle cx="8"/></svg>');f.window.SonglineIcons.replace(f.document);
 assert(f.nodes[0].innerHTML.includes('cx="8"'));const before=f.counts();f.nodes[0].isConnected=false;f.window.SonglineIcons.replace(f.nodes[0]);assert.deepEqual(f.counts(),before);
});
test('swap bursts keep two settling tasks and departure cancels both',()=>{
 const f=fixture();for(let i=0;i<30;i++)f.events.get('songline:page-swap')({detail:{root:f.document}});
 assert.equal(f.timers.size,2);f.events.get('songline:page-transition-start')();assert.equal(f.timers.size,0);
 f.events.get('songline:page-swap')({detail:{}});f.events.get('pagehide')();assert.equal(f.timers.size,0);
});
