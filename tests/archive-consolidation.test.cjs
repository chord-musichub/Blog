const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const walk=d=>fs.readdirSync(path.join(root,d),{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
test('archive is the only article index and tag layouts/effects are retired',()=>{
  for(const file of ['layouts/posts/list.html','layouts/tags/terms.html','layouts/tags/taxonomy.html','layouts/tags/tag-detail-generated.html','static/js/pages/tags/flow.js','static/css/pages/tags/index.css','static/js/pages/posts/list.js','static/css/pages/posts/list.css'])assert(!fs.existsSync(path.join(root,file)),file);
  const archive=read('layouts/_default/list.html');assert(archive.includes('data-content-archive'));assert(!archive.includes('postSearch'));assert(!archive.includes('post-card.html'));
  for(const file of ['layouts/partials/assets/page-styles.html','layouts/partials/page-specific-scripts.html','layouts/partials/resource-hints.html','static/js/page-modules.js']){
    const source=read(file);assert(!source.includes('pages/tags/'));assert(!source.includes('tag-flow'));assert(!source.includes('data-tag-search-panel'));assert(!source.includes('pages/posts/list.'));
  }
  assert(read('static/js/page-modules.js').includes("'content-archive':'SonglineInitContentArchive'"));
  assert(!read('layouts/partials/page-navigation-data.html').includes('"key" "tags"'));
  const css=walk('static/css').filter(f=>f.endsWith('.css')).map(read).join('\n');
  for(const selector of ['.tag-river','.tag-search-item','.tag-search-panel','.tag-detail-hero','.posts-list','.post-search-item','.related-card','.related-grid'])assert(!css.includes(selector),'No retired CSS '+selector);
});
test('old tag paths preserve exact raw names and exclude live notices',()=>{
  const target=read('layouts/partials/archive/legacy-target.html');
  assert(target.includes('.Params.tag_raw | default .Title'));assert(target.includes('urlquery'));assert(target.includes('"/tags/site-notice/"'));assert(target.includes('"site-notice"'));
  const redirect=read('layouts/partials/archive/legacy-redirect.html');
  for(const marker of ['songline-archive-target','noindex,follow','rel="canonical"','http-equiv="refresh"','location.replace'])assert(redirect.includes(marker));
  assert(!redirect.includes('/css/'));assert(!redirect.includes('/js/'));assert(read('layouts/_default/baseof.html').indexOf('legacy-target')<read('layouts/_default/baseof.html').indexOf('asset-version'));
  const transition=read('static/js/page-transition-system.js');assert(transition.includes("doc.head.querySelector('meta[name=\"songline-archive-target\"]')"));assert(transition.includes("target.origin !== window.location.origin || target.pathname !== '/posts/'"));
});
test('tag filtering is visible, editable and keeps navigation history metadata',()=>{
  const script=read('static/js/pages/archive/index.js');
  for(const code of ["query = archiveParams.get('q') || tagFilter",'input.value = query',"tagFilter = ''",'history.replaceState(history.state,',"url.searchParams.delete('tag')","setQuery('')"])assert(script.includes(code));
  assert(!script.includes('DOMContentLoaded'));assert(!script.includes('songline:page-swap'));
  const shared=read('static/js/search.js');for(const name of ['initPostSearch','initTagSearch','postSearch','tagSearch'])assert(!shared.includes(name));
});
test('retired tag controls do not silently erase legacy settings',()=>{
  const form=read('web/templates/site_settings.html'),handler=read('cmd/server/site_settings_handlers.go');
  for(const key of ['tags_hero_title','tags_hero_image','tag_default_cover']){assert(!form.includes('name="'+key+'"'));assert(!handler.includes('r.FormValue("'+key+'")'));}
  assert(read('cmd/server/publisher.go').includes('os.Remove(filepath.Join(targetDir, "tag_urls.json"))'));
  assert(read('layouts/friends/friend-profile.html').includes('post-card.html'),'Friend cards remain live');
  assert(read('layouts/_default/single.html').includes('article-reader'),'Single-article reading remains live');
});
