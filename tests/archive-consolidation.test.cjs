const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const walk=d=>fs.readdirSync(path.join(root,d),{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
test('archive is the only article index and tag layouts/effects are retired',()=>{
  for(const file of ['frontend/site/layouts/posts/list.html','frontend/site/layouts/tags/terms.html','frontend/site/layouts/tags/taxonomy.html','frontend/site/layouts/tags/tag-detail-generated.html','frontend/site/static/js/pages/tags/flow.js','frontend/site/static/css/pages/tags/index.css','frontend/site/static/js/pages/posts/list.js','frontend/site/static/css/pages/posts/list.css'])assert(!fs.existsSync(path.join(root,file)),file);
  const archive=read('frontend/site/layouts/_default/list.html');assert(archive.includes('data-content-archive'));assert(!archive.includes('postSearch'));assert(!archive.includes('post-card.html'));
  for(const file of ['frontend/site/layouts/partials/assets/page-styles.html','frontend/site/layouts/partials/page-specific-scripts.html','frontend/site/layouts/partials/resource-hints.html','frontend/site/static/js/page-modules.js']){
    const source=read(file);assert(!source.includes('pages/tags/'));assert(!source.includes('tag-flow'));assert(!source.includes('data-tag-search-panel'));assert(!source.includes('pages/posts/list.'));
  }
  assert(read('frontend/site/static/js/page-modules.js').includes("'content-archive':'SonglineInitContentArchive'"));
  assert(!read('frontend/site/layouts/partials/page-navigation-data.html').includes('"key" "tags"'));
  const css=walk('frontend/site/static/css').filter(f=>f.endsWith('.css')).map(read).join('\n');
  for(const selector of ['.tag-river','.tag-search-item','.tag-search-panel','.tag-detail-hero','.posts-list','.post-search-item','.related-card','.related-grid'])assert(!css.includes(selector),'No retired CSS '+selector);
});
test('old tag paths preserve exact raw names and exclude live notices',()=>{
  const target=read('frontend/site/layouts/partials/archive/legacy-target.html');
  assert(target.includes('.Params.tag_raw | default .Title'));assert(target.includes('urlquery'));assert(target.includes('"/tags/site-notice/"'));assert(target.includes('"site-notice"'));
  const redirect=read('frontend/site/layouts/partials/archive/legacy-redirect.html');
  for(const marker of ['songline-archive-target','noindex,follow','rel="canonical"','http-equiv="refresh"','location.replace'])assert(redirect.includes(marker));
  assert(!redirect.includes('/css/'));assert(!redirect.includes('/js/'));assert(read('frontend/site/layouts/_default/baseof.html').indexOf('legacy-target')<read('frontend/site/layouts/_default/baseof.html').indexOf('asset-version'));
  const transition=read('frontend/site/static/js/page-transition-system.js');assert(transition.includes("doc.head.querySelector('meta[name=\"songline-archive-target\"]')"));assert(transition.includes("target.origin !== window.location.origin || target.pathname !== '/posts/'"));
});
test('tag filtering is visible, editable and keeps navigation history metadata',()=>{
  const script=read('frontend/site/static/js/pages/archive/index.js');
  for(const code of ["query = archiveParams.get('q') || tagFilter",'input.value = query',"tagFilter = ''",'history.replaceState(history.state,',"url.searchParams.delete('tag')","setQuery('')"])assert(script.includes(code));
  assert(!script.includes('DOMContentLoaded'));assert(!script.includes('songline:page-swap'));
  const shared=read('frontend/site/static/js/search.js');for(const name of ['initPostSearch','initTagSearch','postSearch','tagSearch'])assert(!shared.includes(name));
});
test('retired tag controls do not silently erase legacy settings',()=>{
  const form=read('frontend/admin/templates/site_settings.html'),handler=read('internal/server/site_settings_handlers.go');
  for(const key of ['tags_hero_title','tags_hero_image','tag_default_cover']){assert(!form.includes('name="'+key+'"'));assert(!handler.includes('r.FormValue("'+key+'")'));}
  assert(read('internal/server/publisher.go').includes('os.Remove(filepath.Join(targetDir, "tag_urls.json"))'));
  assert(read('frontend/site/layouts/friends/friend-profile.html').includes('post-card.html'),'Friend cards remain live');
  assert(read('frontend/site/layouts/_default/single.html').includes('article-reader'),'Single-article reading remains live');
});
