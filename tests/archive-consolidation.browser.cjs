// Offline regression: old bookmarks must land in the current archive, not old UI.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const repo=path.resolve(__dirname,'..');
const build=path.resolve(process.env.BLOG_UI_BUILD||'local-only/archive-consolidation/after/public');
const base='http://archive-consolidation.test',out=path.join(repo,'local-only/archive-consolidation');
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100"><rect width="160" height="100" fill="#607d8b"/></svg>';
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
const aliases=walk(path.join(build,'tags')).filter(f=>f.endsWith('/index.html')).flatMap(file=>{
  const html=fs.readFileSync(file,'utf8');
  const match=html.match(/<meta name=(?:"songline-archive-target"|songline-archive-target) content="([^"]+)"/);
  if(!match)return [];
  assert(!html.includes('/css/')&&!html.includes('/js/'),'Alias ships no page assets');
  assert(!html.includes('tag-river')&&!html.includes('post-card'),'Alias has no retired UI');
  assert(html.includes('noindex,follow')&&html.includes('rel=canonical'));
  return [{route:'/'+path.relative(build,file).replace(/index\.html$/,''),target:match[1].replaceAll('&amp;','&')}];
});
assert(aliases.length>0,'Provide a build with legacy tag aliases');
for(const alias of aliases){const u=new URL(alias.target,base);assert.equal(u.origin,base);assert.equal(u.pathname,'/posts/');assert.equal(u.searchParams.get('search'),'1');}
assert(!aliases.some(a=>a.route==='/tags/site-notice/'),'Notice archive stays live');
const samples=[aliases.find(a=>a.route==='/tags/'),...['C++','C#','Linux','小故事'].map(tag=>aliases.find(a=>new URL(a.target,base).searchParams.get('tag')===tag)),...['/tags/c-2/','/tags/c-3/'].map(route=>aliases.find(a=>a.route===route))].filter(Boolean);
assert(samples.length>=4,'Exercise slug collisions and non-ASCII tags');
async function fixture(browser,width,theme,js=true){
  const context=await browser.newContext({viewport:{width,height:900},hasTouch:width<981,isMobile:width<981,reducedMotion:'reduce',javaScriptEnabled:js});
  const requests=[],errors=[];
  await context.route('**/*',route=>{
    const u=new URL(route.request().url());requests.push({path:u.pathname,method:route.request().method()});
    if(u.origin!==base||u.pathname.startsWith('/uploads/'))return route.fulfill({body:svg,contentType:'image/svg+xml'});
    if(u.pathname.includes('/api/'))return route.fulfill({json:{views:83,items:[],messages:[]}});
    const root=u.pathname.startsWith('/static/')?path.join(repo,'web/static'):build;
    const file=path.resolve(root,decodeURIComponent(u.pathname.replace(/^\/static\//,'/').slice(1))+(u.pathname.endsWith('/')?'index.html':''));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
    return route.fulfill({body:fs.readFileSync(file),contentType:({'.html':'text/html','.css':'text/css','.js':'application/javascript','.json':'application/json','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream'});
  });
  await context.addInitScript(theme=>{
    localStorage.setItem('songline-theme',theme);sessionStorage.setItem('songline-home-boot-v21.4','1');
    localStorage.setItem('songline-privacy-v1',JSON.stringify({version:1,statistics:false,expires:Date.now()+86400000}));
  },theme);
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));return {context,page,requests,errors};
}
async function ready(page){
  await page.waitForFunction(()=>window.SonglinePageModules&&document.querySelector('[data-content-archive]')&&!document.documentElement.classList.contains('songline-page-transitioning'));
  await page.evaluate(()=>SonglinePageModules.ready(document));
}
async function filtering(page,tag){
  const state=await page.locator('[data-content-archive]').evaluate((archive,tag)=>{
    const records=[...archive.querySelectorAll('[data-archive-kind="article"]')];
    const norm=s=>s.trim().toLowerCase();
    return {total:records.length,visible:records.filter(r=>!r.hidden).length,expected:records.filter(r=>!tag||(r.dataset.tags||'').split(',').map(norm).includes(norm(tag))).length};
  },tag||'');
  assert.equal(state.visible,state.expected,'Exact migrated tag filtering: '+tag);
  assert(await page.locator('[data-archive-search-field]').isVisible());
  assert.equal(await page.locator('[data-archive-search-input]').inputValue(),tag||'');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
  return state;
}
(async()=>{
  const browser=await chromium.launch({headless:true,channel:'msedge'}),report=[];
  try{
    for(const [width,theme] of [[1440,'dark'],[1440,'light'],[390,'dark'],[390,'light']]){
      const {context,page,requests,errors}=await fixture(browser,width,theme);
      for(const alias of samples){
        await page.goto(base+alias.route);await ready(page);
        const url=new URL(page.url());assert.equal(url.pathname,'/posts/');
        assert.equal(url.search,new URL(alias.target,base).search);
        const tag=url.searchParams.get('tag'),state=await filtering(page,tag);
        if(tag){
          const historyState=await page.evaluate(()=>history.state);
          await page.locator('[data-archive-search-clear]').click();
          assert.equal(await page.locator('[data-archive-kind="article"]:not([hidden])').count(),state.total);
          assert.equal(new URL(page.url()).searchParams.get('tag'),null);
          assert.deepEqual(await page.evaluate(()=>history.state),historyState);
          await page.reload();await ready(page);await filtering(page,null);
        }
        report.push({width,theme,alias:alias.route,target:alias.target});
        console.log('PASS direct bookmark / exact filter / clear / reload',width,theme,alias.route);
      }
      await page.goto(base+'/');await page.evaluate(()=>SonglinePageModules.ready(document));
      const origin=await page.evaluate(()=>performance.timeOrigin),alias=samples.find(a=>new URL(a.target,base).searchParams.get('tag'));
      await page.evaluate(url=>SonglinePageTransition.navigateLink(url),base+alias.route);await ready(page);
      assert.equal(await page.evaluate(()=>performance.timeOrigin),origin,'Alias navigation does not refresh');
      const tag=new URL(alias.target,base).searchParams.get('tag');await filtering(page,tag);
      await page.locator('[data-archive-search-input]').fill('不会存在的文章_xyz');
      assert.equal(await page.locator('[data-archive-kind="article"]:not([hidden])').count(),0);
      assert(await page.locator('[data-archive-empty="articles"]').isVisible());
      await page.locator('[data-archive-search-input]').press('Escape');
      assert.equal(new URL(page.url()).searchParams.get('tag'),null);assert.equal(new URL(page.url()).searchParams.get('q'),null);
      await page.locator('[data-archive-search-term]').first().click();
      const query=await page.locator('[data-archive-search-input]').inputValue();assert.equal(new URL(page.url()).searchParams.get('q'),query);
      await page.reload();await ready(page);assert.equal(await page.locator('[data-archive-search-input]').inputValue(),query);
      // Start a fresh SPA round to verify there is no phantom alias history entry.
      await page.goto(base+'/');await page.evaluate(()=>SonglinePageModules.ready(document));
      await page.evaluate(url=>SonglinePageTransition.navigateLink(url),base+alias.route);await ready(page);
      await page.goBack();await page.waitForURL(base+'/');await page.evaluate(()=>SonglinePageModules.ready(document));
      await page.goForward();await ready(page);assert.equal(new URL(page.url()).pathname,'/posts/');await filtering(page,tag);
      await page.evaluate(url=>SonglinePageTransition.navigateLink(url),base+'/tags/site-notice/');await ready(page);
      assert.equal(new URL(page.url()).pathname,'/tags/site-notice/');assert.equal(await page.locator('[data-notice-archive]').count(),1);
      assert.equal(await page.locator('#songline-archive-style').count(),1);
      await page.screenshot({path:path.join(out,'notices-'+width+'-'+theme+'.png')});
      assert(!requests.some(r=>r.path.includes('/pages/tags/')||r.path.includes('/pages/posts/list.')),'No retired resource request');
      assert(!requests.some(r=>r.path.includes('/api/')&&r.method!=='GET'),'No API writes');assert.deepEqual(errors,[]);
      await context.close();console.log('PASS AJAX alias / history / editable search / notices',width,theme);
    }
    const {context,page}=await fixture(browser,390,'dark',false);
    await page.goto(base+samples[0].route);await page.waitForURL(u=>u.pathname==='/posts/');
    assert.equal(await page.locator('[data-content-archive]').count(),1,'Meta redirect works without JavaScript');await context.close();
    console.log('PASS no-JavaScript redirect;',aliases.length,'lightweight aliases checked');
  }finally{fs.writeFileSync(path.join(out,'alias-report.json'),JSON.stringify({aliases,checks:report},null,2));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
