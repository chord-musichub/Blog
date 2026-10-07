// Compare two isolated Hugo builds; all API writes and remote media are mocked.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const sharp=require('sharp');
const base='http://component-audit.test';
const builds={before:process.env.BLOG_UI_BASELINE,after:process.env.BLOG_UI_BUILD};
for(const dir of Object.values(builds))assert(dir&&fs.existsSync(path.join(dir,'index.html')),'Provide BLOG_UI_BASELINE and BLOG_UI_BUILD');
const out=process.env.COMPONENT_REPORT_DIR||'local-only/component-loading';fs.mkdirSync(out,{recursive:true});
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100"><rect width="160" height="100" fill="#607d8b"/></svg>';
async function fixture(context,build){
 await context.route('**/*',route=>{
  const u=new URL(route.request().url());
  if(u.origin!==base||u.pathname.startsWith('/uploads/'))return route.fulfill({body:svg,contentType:'image/svg+xml'});
  if(u.pathname.startsWith('/api/'))return route.fulfill({json:u.pathname==='/api/views'?{views:83}:{items:[],messages:[]}});
  const root=path.resolve(u.pathname.startsWith('/static/')?'web/static':build);
  const relative=u.pathname.startsWith('/static/')?u.pathname.slice(8):u.pathname.slice(1);
  const file=path.resolve(root,relative+(u.pathname.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:'fixture not found'});
  return route.fulfill({body:fs.readFileSync(file),contentType:({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json'})[path.extname(file)]||'application/octet-stream'});
 });
 await context.addInitScript(()=>{
  sessionStorage.setItem('songline-home-boot-v21.4','1');
  let seed=42;Math.random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
 });
}
async function snapshot(page,build){
 return page.evaluate(()=>({
  assets:[...performance.getEntriesByType('resource')].map(e=>new URL(e.name).pathname).filter(p=>/^\/(css|js)\//.test(p)),
  starstreamNodes:document.querySelectorAll('.songline-starstream-layer, .songline-starstream-layer *').length,
  hiddenHero:document.querySelectorAll('.songline-home-scene-frame img').length,
  geometry:[...document.querySelectorAll('main.container, .songline-home-scene, .friend-detail-hero, .friend-profile-row, .memory-card, [data-memory-timeline], .friends-constellation, .tools-excavation, .article-reader')].map(e=>{
   const r=e.getBoundingClientRect();return [e.className,...['x','y','width','height'].map(k=>Math.round(r[k]*10)/10)];
  })
 })).then(data=>({...data,assetBytes:[...new Set(data.assets)].reduce((sum,p)=>sum+fs.statSync(path.join(build,p)).size,0)}));
}
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge',args:['--enable-gpu']});
 const report=[];
 try{
  const friend=fs.readdirSync(path.join(builds.after,'friends')).find(name=>!['memories','index.html'].includes(name)&&fs.existsSync(path.join(builds.after,'friends',name,'index.html')));
  assert(friend,'Need a friend profile fixture');
  for(const width of [1440,390])for(const theme of ['light','dark']){
   for(const route of ['/','/posts/linux-note/','/tools/','/friends/memories/',`/friends/${friend}/`,'/friends/']){
    const pair={width,theme,route};
    const screenshots={};
    for(const [mode,build] of Object.entries(builds)){
     const context=await browser.newContext({viewport:{width,height:900},hasTouch:width<981,isMobile:width<981});
     await fixture(context,build);
     await context.addInitScript(value=>localStorage.setItem('songline-theme',value),theme);
     const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
     await page.goto(base+route);await page.evaluate(()=>SonglinePageModules.ready(document));await page.waitForTimeout(1100);
     pair[mode]=await snapshot(page,build);
     assert.deepEqual(errors,[]);
     // Freeze/mask moving planetary trails for the content-only comparison;
     // their actual presence and lifecycle are checked without masking below.
     if(route.startsWith('/friends/')&&route!='/friends/'){
      await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important}.songline-starstream-layer{visibility:hidden!important}'});
      screenshots[mode]=await page.screenshot({path:`${out}/${width}-${theme}-${friend}-${route.includes('memories')?'memories':'profile'}-${mode}.png`});
     }
     await context.close();
    }
    assert.deepEqual(pair.after.geometry,pair.before.geometry,'Visible geometry must remain unchanged');
    if(['/','/posts/linux-note/','/tools/'].includes(route)){
     assert.equal(pair.after.starstreamNodes,0);
     assert(!pair.after.assets.includes('/js/space-ribbons.js'));
    }else{
     assert(pair.after.starstreamNodes>0,'Keep planetary trails on '+route);
     assert(pair.after.assets.includes('/js/space-ribbons.js'));
    }
    assert(!pair.after.assets.includes('/js/pages/tags/flow.js'));
    if(route==='/')assert.equal(pair.after.hiddenHero,0);
    if(route.startsWith('/friends/')&&route!='/friends/'){
     assert(!pair.after.assets.includes('/css/pages/friends/galaxy.css'));
     const a=await sharp(screenshots.before).raw().toBuffer();const b=await sharp(screenshots.after).raw().toBuffer();
     const delta=a.reduce((sum,v,i)=>sum+Math.abs(v-b[i]),0)/a.length;
     assert(delta<1,`Unexpected pixel difference: ${delta}`);pair.meanPixelDifference=delta;
    }
    report.push(pair);console.log({width,theme,route,savedBytes:pair.before.assetBytes-pair.after.assetBytes,pixelDifference:pair.meanPixelDifference});
   }
  }
  const context=await browser.newContext();await fixture(context,builds.after);
  const page=await context.newPage();const requests=[];const errors=[];
  page.on('request',r=>requests.push(new URL(r.url()).pathname));page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/');await page.waitForTimeout(500);
  for(let cycle=0;cycle<2;cycle++)for(const route of ['/friends/','/posts/linux-note/','/friends/memories/','/tools/','/']){
   await page.evaluate(href=>SonglinePageTransition.navigateLink(href),base+route);await page.waitForTimeout(700);
   const count=await page.locator('.songline-starstream-layer').count();
   assert.equal(count,route.startsWith('/friends/')?1:0,`Planetary-trail lifecycle ${route}`);
   assert.equal(await page.locator('#songline-friends-galaxy-style').count(),route==='/friends/'?1:0);
  }
  assert.equal(requests.filter(p=>p==='/js/space-ribbons.js').length,1,'Load planetary trails once across repeat navigation');
  for(const route of ['/friends/songline/','/tools/random-number/']){
   await page.evaluate(href=>SonglinePageTransition.navigateLink(href),base+route);await page.waitForTimeout(700);
   assert.equal(await page.locator('.songline-starstream-layer').count(),1,'Keep planetary trails on '+route);
  }
  for(const width of [390,1440]){
   await page.setViewportSize({width,height:900});
   await page.evaluate(()=>{window.dispatchEvent(new Event('pageshow'));document.dispatchEvent(new Event('visibilitychange'));});
   await page.waitForTimeout(700);
   assert.equal(await page.locator('[data-songline-space-ribbons], [data-songline-starstream]').count(),1,'Resize and resume preserve exactly one trail layer');
  }
  assert(!requests.includes('/js/pages/tags/flow.js'),'Retired tag drift must not return');
  assert.deepEqual(errors,[]);await context.close();
  const reduced=await browser.newContext({reducedMotion:'reduce'});await fixture(reduced,builds.after);
  const reducedPage=await reduced.newPage();const reducedRequests=[];
  reducedPage.on('request',r=>reducedRequests.push(new URL(r.url()).pathname));
  await reducedPage.goto(base+'/friends/');await reducedPage.evaluate(()=>SonglinePageModules.ready(document));await reducedPage.waitForTimeout(500);
  assert(!reducedRequests.includes('/js/space-ribbons.js'),'Reduced motion must not download the disabled effect');
  assert.equal(await reducedPage.locator('.songline-starstream-layer').count(),0);await reduced.close();
  console.log('PASS planetary-trail restoration, retired tag drift absence and galaxy CSS lifecycle');
 }finally{await browser.close();fs.writeFileSync(out+'/report.json',JSON.stringify(report,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});
