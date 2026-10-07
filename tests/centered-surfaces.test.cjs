const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('reader reserves symmetric external rails without shifting its main panel',()=>{
  const css=read('static/css/pages/content/article-reader.css');
  assert(css.includes('2 * (var(--reader-rail-width) + var(--reader-rail-gap) + var(--reader-edge))'));
  assert(!css.includes('margin-left:max(40px'));
  assert(css.includes('--reader-rail-width:160px'),'Narrow desktops preserve useful text width');
});
test('all tools share a margin-containing full-height scene, including Markdown',()=>{
  const shell=read('static/css/tools/detail-shell.css');
  assert(shell.includes('display:flow-root'));
  assert(shell.includes('min-height:100dvh'));
  assert(shell.includes('html[data-theme="dark"]:has(body:is('));
  assert(!read('static/css/tools-underground-scene.css').includes('background-image:'),'Tool index no longer owns a duplicate scene');
  assert(read('layouts/partials/assets/viewport-base.html').includes('[data-page-scene="tools"]'));
  const base=read('layouts/_default/baseof.html');assert(base.slice(0,base.indexOf('<head>')).includes('data-page-scene="tools"'));
});
test('reader vertical chevrons are registered for server and AJAX rendering',()=>{
  for(const name of ['chevron-up','chevron-down']){
    assert(read('layouts/partials/icons.html').includes('eq $name "'+name+'"'));
    assert(read('static/js/icon-system.js').includes("'"+name+"': svg("));
    for(const file of ['layouts/_default/single.html','layouts/tools/markdown-previewer.html'])assert(read(file).includes('"'+name+'"'));
  }
});
