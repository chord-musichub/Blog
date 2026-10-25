const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {offlineSite} = require('./helpers/offline-site.cjs');

test('offline browser fixtures serve public, admin and shared files from their own roots', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-offline-site-'));
  t.after(() => fs.rmSync(root, {recursive:true, force:true}));
  for (const [name, body] of Object.entries({
    'public/index.html':'home', 'public/posts/index.html':'posts', 'public/js/site.js':'script',
    'frontend/admin/static/creator-center.css':'admin', 'frontend/shared/js/i18n.js':'shared', 'private.txt':'private'
  })) {
    fs.mkdirSync(path.dirname(path.join(root,name)), {recursive:true});
    fs.writeFileSync(path.join(root,name),body);
  }
  const serve = offlineSite({base:'http://fixture.test', build:path.join(root,'public'), source:root});
  const request = url => {let result; serve({request:() => ({url:() => url}), fulfill:value => {result=value;}}); return result;};
  for (const [url, body, type] of [
    ['/','home','text/html'], ['/posts/?tag=x','posts','text/html'], ['/js/site.js?v=1','script','application/javascript'],
    ['/static/creator-center.css','admin','text/css'], ['/static/i18n.js','shared','application/javascript']
  ]) {
    const result = request('http://fixture.test'+url);
    assert.equal(result.body.toString(),body);
    assert.equal(result.contentType,type);
  }
  for (const url of ['/missing.css','/posts','/%2e%2e%2fprivate.txt','/static/%2e%2e%2fprivate.txt']) assert.equal(request('http://fixture.test'+url).status,404,url);
  assert.equal(request('http://fixture.test/%GG').status,400);
  for (const prefix of ['/api/','/api/tools/','/write/api/tools/','/static/api/']) assert.deepEqual(request('http://fixture.test'+prefix+'scores').json,{views:83,items:[],messages:[],scores:[]});
  for (const url of ['https://third-party.test/script.js','http://fixture.test/uploads/admin/image.png']) assert.equal(request(url).contentType,'image/svg+xml');
  let custom;
  offlineSite({base:'http://fixture.test',build:root,api:{authenticated:false}})({request:()=>({url:()=> 'http://fixture.test/api/user'}),fulfill:value=>custom=value});
  assert.deepEqual(custom.json,{authenticated:false});
});
