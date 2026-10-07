const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('only non-Markdown tool details opt into the compact shared frame',()=>{
  for(const name of ['random-number','2048','snake','reaction-test','flappy-bird','typing-practice','gacha','focus-timer','audio-visualizer']){
    const template=read('layouts/tools/'+name+'.html');
    assert.equal((template.match(/tool-detail-surface/g)||[]).length,1,name+' has one primary frame');
    assert(template.includes('class="tool-detail-title"'));
  }
  assert(!read('layouts/tools/markdown-previewer.html').includes('tool-detail-surface'));
  assert(!read('layouts/tools/tools.html').includes('tool-detail-surface'));
  assert(read('layouts/partials/assets/page-styles.html').includes('(not (hasPrefix .RelPermalink "/tools/markdown-previewer/"))'));
  const modules=read('static/js/page-modules.js');
  assert(modules.includes("query(root, '.tool-detail-surface')"));
  assert(modules.includes("ensureStylesheet('songline-tool-detail-layout-style', '/css/tools/detail-layout.css')"));
});
test('all five rankings use native default-closed disclosures',()=>{
  for(const name of ['2048','snake','reaction-test','flappy-bird','typing-practice']){
    const template=read('layouts/tools/'+name+'.html');
    const tag=template.match(/<details[^>]*tool-detail-ranking[^>]*>/)[0];
    assert(!/\sopen(?:\s|=|>)/.test(tag),name+' starts closed');
    assert(!template.includes('<small>服务器记录</small>'));
    assert(!template.includes('<small>越低越好</small>'));
    assert(!template.includes('<small>越快越好</small>'));
  }
  assert(read('static/css/tools/detail-layout.css').includes('grid-template-columns:1fr!important'));
});
test('all tools expose useful explanations in the shared native modal',()=>{
  const help=read('layouts/partials/tools/help-content.html');
  for(const name of ['random-number','2048','snake','reaction-test','flappy-bird','typing-practice','gacha','focus-timer','audio-visualizer']){
    const template=read('layouts/tools/'+name+'.html');
    assert(template.includes('partial "tool-actionbar.html" "'+name+'"'));
    assert(template.includes('partial "tool-help-dialog.html" "'+name+'"'));
    assert(!template.includes('sync-best'));
    assert(help.includes('eq . "'+name+'"'));
  }
  for(const key of ['Space','Shift','WASD','黑豆清墙','data-gacha-banner-note','data-gacha-guarantee-note'])assert(help.includes(key));
  assert(read('layouts/partials/tool-help-dialog.html').includes('<dialog'));
  assert(!read('layouts/tools/2048.html').includes('data-2048-move'));
  const css=read('static/css/tools/detail-layout.css');
  assert(css.includes('.av-cover [hidden]{display:none!important}'),'Absent album covers use the fallback rather than a broken image');
  assert(css.includes('.av-stage:fullscreen'),'Compact stage cannot override fullscreen height');
});
test('icon sound controls retain native toggle semantics in all six tools',()=>{
  const actionbar=read('layouts/partials/tool-actionbar.html');
  assert(actionbar.includes('partial "tool-sound-toggle.html"'));
  for(const hook of ['data-2048-sound-toggle','data-snake-sound','data-reaction-sound-toggle','data-flappy-sound-toggle','data-typing-sound-toggle','data-focus-sound'])assert(actionbar.includes(hook));
  const partial=read('layouts/partials/tool-sound-toggle.html');
  for(const hook of ['type="checkbox"','type="button"','aria-label','aria-pressed','volume-off'])assert(partial.includes(hook));
  assert(read('layouts/partials/icons.html').includes('eq $name "volume-off"'));
  assert(read('static/js/icon-system.js').includes("'volume-off': svg("));
});
test('rank rail and timer controls have dedicated responsive owners',()=>{
  const css=read('static/css/tools/detail-layout.css');assert(css.includes('grid-template-columns:var(--ranking-rail-width) minmax(0,1fr) var(--ranking-rail-width)'));
  assert(css.includes('> .tool-detail-surface{grid-column:2;grid-row:1}'),'Tool occupies the middle track independently of its ranking');
  assert(css.includes('position:absolute;top:0;right:0;width:220px'));
  const timer=read('static/css/tools/focus-timer.css');
  for(const hook of ['focus-duration-panel','focus-minute-field','focus-switch:checked','::-webkit-slider-thumb','focus-stats-grid'])assert(timer.includes(hook));
  assert(!timer.includes('focus-satellite'),'Unused satellites and layered overrides are removed');
});
