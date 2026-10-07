const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
function modulesFor(dataset,reduced=false){
 const window={location:{href:'https://example.test/'},matchMedia:()=>({matches:reduced})};
 const document={body:{dataset}};
 const source=read('static/js/page-modules.js').replace('  var scanTimer = 0;','  window.testModules = modules; return;');
 vm.runInNewContext(source,{window,document,URL});
 return window.testModules;
}
test('planetary trails remain lazy-loaded in visible scenes and respect reduced motion',()=>{
 for(const dataset of [{pageKind:'home'},{pageSection:'posts'},{pageLayout:'tools'},{pageSection:'tags',pageLayout:'site-notice'}]){
  assert.equal(modulesFor(dataset).find(m=>m.key==='space-ribbons').test(),false);
 }
 for(const dataset of [{pageLayout:'friends-list'},{pageLayout:'memories'},{pageLayout:'random-number'}]){
  assert.equal(modulesFor(dataset).find(m=>m.key==='space-ribbons').test(),true);
  assert.equal(modulesFor(dataset,true).find(m=>m.key==='space-ribbons').test(),false);
 }
 assert(fs.existsSync(path.join(root,'static/js/space-ribbons.js')));
 assert(read('static/js/page-modules.js').includes('SonglineInitSpaceRibbons'));
 assert(!read('layouts/partials/assets/core-scripts.html').includes('space-ribbons.js'));
 assert(read('static/css/site-effects.css').includes('.songline-starstream-layer'));
});
test('only retired tag drifting resources are removed, not planetary trails',()=>{
 for(const file of ['static/js/pages/tags/flow.js','static/css/pages/tags/index.css'])assert(!fs.existsSync(path.join(root,file)));
 assert(!modulesFor({}).some(m=>m.key==='tag-flow'));
 const walk=dir=>fs.readdirSync(path.join(root,dir),{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(path.join(dir,entry.name)):[path.join(dir,entry.name)]);
 const css=walk('static/css').filter(file=>file.endsWith('.css')).map(read).concat(read('web/static/style.css')).join('\n');
 assert(!/tagRiverSeamlessMove|\.tag-river/.test(css));
 assert(read('static/js/tools/audio-visualizer.js').includes('songline:animation-before-resume'),'Keep the active audio phase synchronization');
 assert(read('static/css/site-effects.css').includes('has-fixed-mobile-nav'),'Keep the live mobile navigation rules');
});
test('retired home carousel and permanently hidden hero have no loading entry',()=>{
 assert(!modulesFor({}).some(m=>m.key==='home-friend-carousel'));
 assert(!fs.existsSync(path.join(root,'static/js/pages/home/friend-carousel.js')));
 assert(!read('static/css/site-search-overrides.css').includes('.home-friend-carousel'));
 assert(!read('layouts/partials/home/main-content.html').includes('<img'));
 assert(!read('static/css/pages/home/scene.css').includes('.songline-home-scene-frame'));
});
test('galaxy stylesheet is scoped to the actual constellation layout',()=>{
 assert.match(read('layouts/partials/assets/page-styles.html'),/{{ if eq \.Layout "friends-list" }}\s*<link id="songline-friends-galaxy-style"/);
});
test('retired contact copier is no longer shipped or requested',()=>{
 assert(!fs.existsSync(path.join(root,'static/js/contact-copy.js')));
 assert(!read('layouts/partials/footer.html').includes('contact-copy'));
 assert(read('static/js/pages/home/recommendations.js').includes('clipboard'),'The active home copy action remains');
});
test('archive search does not load the unrelated manual-search modules',()=>{
 const modules=modulesFor({});
 function surface(selectors){return {querySelector:query=>query.split(',').some(part=>selectors.includes(part.trim()))?{}:null};}
 for(const key of ['search-utils','search']){
  const module=modules.find(m=>m.key===key);
  assert.equal(module.test(surface(['input[type="search"]','[data-content-archive]'])),false);
  assert.equal(module.test(surface(['[data-tag-search-panel]'])),false);
  for(const selector of ['[data-search-submit]','[data-tools-search]'])assert.equal(module.test(surface([selector])),true);
 }
 const archive=modules.find(m=>m.key==='content-archive');
 assert.equal(archive.test(surface(['#postList'])),false);
 assert.equal(archive.test(surface(['[data-content-archive]'])),true);
 assert(!read('static/js/pages/archive/index.js').includes('SonglineInitPostsListLayout'));
 assert(!read('static/css/pages/archive/index.css').includes('.posts-list'));
});
