const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const vm = require('node:vm');

const source = readFileSync(join(__dirname, '../web/static/document-transition.js'), 'utf8');
function setup(backend, path, base='/write/', mark=null) {
  const window = {matchMedia:()=>({matches:false}), addEventListener(){}, SonglinePageConfig:[{key:'write',route:base}]};
  const document = {
    currentScript:{hasAttribute:()=>backend,dataset:{backendBase:base}},
    documentElement:{classList:{add(){},remove(){}}},
    createElement:()=>({}), head:{appendChild(){}}, readyState:'loading', addEventListener(){}
  };
  vm.runInNewContext(source, {window,document,URL,location:new URL('https://example.test'+path),
    sessionStorage:{getItem:()=>mark && JSON.stringify(mark),removeItem(){}},setTimeout:()=>1,clearTimeout(){}});
  return window;
}
function link(path, attributes=[]) {
  return {href:new URL(path,'https://example.test').href,target:'',closest:()=>null,hasAttribute:name=>attributes.includes(name)};
}
test('backend internal navigation never uses the curtain',()=>{
  const app = setup(true,'/write/');
  for(const path of ['/write/account','/write/admin/media','/write/articles/new','/write/login','/write/password/request','/write/logout','/write']) {
    assert.equal(app.SonglineDocumentTransition.handles(link(path)),false,path);
  }
  assert.equal(app.SonglineDocumentTransition.handles(link('/write/account',['data-document-transition'])),false);
  assert.equal(app.SonglineDocumentTransition.handles(link('/')),true);
  assert.equal(app.SonglineDocumentTransition.handles(link('/friends/')),true);
});
test('public navigation hands off only backend links; floor animation stays separate',()=>{
  const app=setup(false,'/friends/');
  assert.equal(app.SonglineDocumentTransition.handles(link('/write/')),true);
  assert.equal(app.SonglineDocumentTransition.handles(link('/write/login')),true);
  assert.equal(app.SonglineDocumentTransition.handles(link('/posts/')),false);
  assert.equal(app.SonglineDocumentTransition.handles(link('/write-notes/')),false);
  assert.equal(app.SonglineDocumentTransition.handles(link('/write/',['download'])),false);
});
test('custom backend prefix and old internal handoffs are handled safely',()=>{
  const app=setup(true,'/studio/account','/studio/',{at:Date.now(),target:'https://example.test/studio/account',backend:false});
  assert.equal(app.__songlineDocumentArrival,false);
  assert.equal(app.SonglineDocumentTransition.handles(link('/studio/admin/media')),false);
  assert.equal(app.SonglineDocumentTransition.handles(link('/')),true);
  const incoming=setup(true,'/studio/login','/studio/',{at:Date.now(),target:'https://example.test/studio/',backend:true});
  assert.equal(incoming.__songlineDocumentArrival,true);
});

function arrival(resources){
  const classes=new Set(),listeners={},timers=new Map();let next=0,finished=0;
  const window={matchMedia:()=>({matches:false}),addEventListener:(name,fn)=>listeners[name]=fn,SonglineResources:resources,SonglineFinishSceneEntry:()=>finished++};
  const document={currentScript:{hasAttribute:()=>false,dataset:{}},documentElement:{classList:{add:(...names)=>names.forEach(n=>classes.add(n)),remove:(...names)=>names.forEach(n=>classes.delete(n))}},createElement:()=>({}),head:{appendChild(){}},readyState:'loading',addEventListener:(name,fn)=>listeners[name]=fn};
  vm.runInNewContext(source,{window,document,URL,location:new URL('https://example.test/'),sessionStorage:{getItem:()=>JSON.stringify({at:Date.now(),target:'https://example.test/',backend:false}),removeItem(){}},setTimeout:(fn,delay)=>{timers.set(++next,{fn,delay});return next;},clearTimeout:id=>timers.delete(id),requestAnimationFrame:fn=>fn()});
  return {classes,listeners,timers,finished:()=>finished,run(delay){for(const [id,timer] of [...timers])if(timer.delay===delay){timers.delete(id);timer.fn();}}};
}
test('failed arrival readiness reveals the page and cleans both covers',async()=>{
  for(const enter of [()=>Promise.reject(Error('failed')),()=>{throw Error('initialization failed');}]){
    const f=arrival({enter});f.listeners.DOMContentLoaded();await new Promise(setImmediate);
    assert(f.classes.has('is-document-revealing'),'A failure must still reveal');
    f.run(550);assert.equal(f.classes.size,0);assert.equal(f.timers.size,0);assert(f.finished()>0);
  }
});
test('a hanging arrival and a missing DOMContentLoaded have bounded cover lifetimes',async()=>{
  for(const initialize of [true,false]){
    const f=arrival({enter:()=>new Promise(()=>{})});
    if(initialize)f.listeners.DOMContentLoaded();
    f.run(18000);await new Promise(setImmediate);f.run(550);
    assert.equal(f.classes.size,0);assert.equal(f.timers.size,0);assert(f.finished()>0);
  }
});
test('successful arrival waits for readiness and persisted returns clear the cover',async()=>{
  let release;const f=arrival({enter:()=>new Promise(resolve=>release=resolve)});f.listeners.DOMContentLoaded();
  assert(f.classes.has('document-arriving'));assert(!f.classes.has('is-document-revealing'));
  release();await new Promise(setImmediate);assert(f.classes.has('is-document-revealing'));
  f.listeners.pageshow({persisted:true});assert.equal(f.classes.size,0);f.run(550);assert.equal(f.timers.size,0);
});
