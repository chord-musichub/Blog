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
test('hidden starstream scenes and reduced motion do not load the effect',()=>{
 for(const dataset of [{pageKind:'home'},{pageSection:'posts'},{pageLayout:'tools'},{pageSection:'tags',pageLayout:'site-notice'}]){
  assert.equal(modulesFor(dataset).find(m=>m.key==='space-ribbons').test(),false);
 }
 for(const dataset of [{pageLayout:'friends-list'},{pageLayout:'memories'},{pageSection:'tags'},{pageLayout:'random-number'}]){
  assert.equal(modulesFor(dataset).find(m=>m.key==='space-ribbons').test(),true);
  assert.equal(modulesFor(dataset,true).find(m=>m.key==='space-ribbons').test(),false);
 }
 assert(!read('layouts/partials/assets/core-scripts.html').includes('space-ribbons.js'));
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
