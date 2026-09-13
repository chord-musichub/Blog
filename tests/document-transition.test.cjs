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
    sessionStorage:{getItem:()=>mark && JSON.stringify(mark),removeItem(){}},setTimeout,clearTimeout});
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
