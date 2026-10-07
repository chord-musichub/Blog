// Same-content before/after audit. Every request is fulfilled locally; no production writes.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const repo=path.resolve(__dirname,'..');
const builds={before:process.env.BLOG_UI_BASELINE,after:process.env.BLOG_UI_BUILD};
for(const build of Object.values(builds))assert(build&&fs.existsSync(path.join(build,'index.html')),'Provide both fresh Hugo builds');
const base='http://runtime-audit.test';
const out=path.join(repo,'local-only/runtime-optimization');fs.mkdirSync(out,{recursive:true});
const placeholder='<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100"><rect width="160" height="100" fill="#607d8b"/></svg>';
async function fixture(browser,build,width,theme){
 const context=await browser.newContext({viewport:{width,height:900},hasTouch:width<981,isMobile:width<981,reducedMotion:'reduce'});
 const requests=[];
 await context.route('**/*',route=>{
  const u=new URL(route.request().url());requests.push({path:u.pathname,method:route.request().method(),query:u.search});
  if(u.origin!==base||u.pathname.startsWith('/uploads/'))return route.fulfill({body:placeholder,contentType:'image/svg+xml'});
  if(u.pathname.startsWith('/api/'))return route.fulfill({json:u.pathname==='/api/views'?{views:83}:{items:[],messages:[]}});
  const root=path.resolve(u.pathname.startsWith('/static/')?path.join(repo,'web/static'):build);
  const relative=decodeURIComponent(u.pathname.replace(/^\/static\//,'/').slice(1));
  const file=path.resolve(root,relative+(u.pathname.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
  return route.fulfill({body:fs.readFileSync(file),contentType:({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json'})[path.extname(file)]||'application/octet-stream'});
 });
 await context.addInitScript(theme=>{
  localStorage.setItem('songline-theme',theme);localStorage.setItem('songline-privacy-v1',JSON.stringify({version:1,statistics:false,expires:Date.now()+86400000}));sessionStorage.setItem('songline-home-boot-v21.4','1');
  let seed=42;Math.random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
 },theme);
 const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
 return {context,page,requests,errors};
}
async function ready(page,route){
 await page.goto(base+route);await page.evaluate(()=>SonglinePageModules.ready(document));await page.mouse.move(0,0);await page.waitForTimeout(400);
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'Horizontal overflow');
}
async function geometry(page){return page.evaluate(()=>[...document.querySelectorAll('main.container,.content-archive,.archive-record__index,.content-archive__search-trigger,.songline-terminal-frame,.friends-constellation,.memory-room,.tools-excavation,.article-reader')].map(el=>{const r=el.getBoundingClientRect();return [el.className,...['x','y','width','height'].map(k=>Math.round(r[k]*10)/10)];}));}
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});const report=[];
 try{
  if(!process.env.BLOG_UI_LIFECYCLE_ONLY)for(const width of [390,1440])for(const theme of ['light','dark']){
   for(const route of ['/posts/','/tags/site-notice/','/posts/linux-note/','/','/friends/','/friends/memories/','/tools/','/tools/random-number/']){
    if(process.env.BLOG_UI_ARCHIVES_ONLY&&route!=='/posts/'&&route!=='/tags/site-notice/')continue;
    const pair={width,theme,route};
    for(const [mode,build] of Object.entries(builds)){
     const {context,page,requests,errors}=await fixture(browser,build,width,theme);
     await ready(page,route);pair[mode]={geometry:await geometry(page),viewRequests:requests.filter(r=>r.path==='/api/views').length,searchUtils:requests.filter(r=>r.path==='/js/search-utils.js').length,assetBytes:[...new Set(requests.filter(r=>/^\/(css|js)\//.test(r.path)).map(r=>r.path))].reduce((sum,file)=>sum+fs.statSync(path.join(build,file)).size,0)};
     const archive=page.locator('[data-content-archive]');
     if(await archive.count()){
      if(mode==='after'){
       assert.equal(pair[mode].viewRequests,0,'Collapsed archive does not fetch counts');assert.equal(pair[mode].searchUtils,0,'Archive owns its search and needs no legacy helpers');
       assert(!await page.evaluate(()=>typeof SonglineInitPostsListLayout==='function'),'Retired card layout has no runtime entry');
      }
      const first=page.locator('[data-archive-trigger]').first();await first.click();
      await page.waitForFunction(()=>document.querySelector('.archive-record.is-open .real-views')?.dataset.viewLoaded==='1');
      if(mode==='after')assert.equal(requests.filter(r=>r.path==='/api/views').length,1,'Only the expanded article reads its count');
      assert.equal(await page.locator('.archive-record.is-open .real-views b').textContent(),'83');
      await page.waitForFunction(()=>getComputedStyle(document.querySelector('.archive-record.is-open .archive-record__detail')).opacity==='1');
      pair[mode].expandedGeometry=await page.locator('.archive-record.is-open .archive-record__drawer, .archive-record.is-open .archive-record__detail').evaluateAll(nodes=>nodes.map(el=>{const r=el.getBoundingClientRect();return ['x','y','width','height'].map(k=>Math.round(r[k]*10)/10);}));
      await page.screenshot({path:path.join(out,`archive-${mode}-${width}-${theme}-${route.startsWith('/posts')?'posts':'notices'}.png`)});
      const input=page.locator('[data-archive-search-input]');await page.locator('[data-archive-search-trigger]').click();
      const values=await page.locator('[data-archive-panel="articles"] [data-archive-record]').evaluateAll(nodes=>nodes.map(node=>({title:node.dataset.title,summary:node.dataset.summary,searchText:node.dataset.searchText,tags:node.dataset.tags,author:node.dataset.author})));
      if(mode==='after')await page.locator('[data-archive-record]').evaluateAll(nodes=>{
       window.searchTextReads=0;nodes.forEach(node=>{const dataset=node.dataset;Object.defineProperty(node,'dataset',{get:()=>new Proxy(dataset,{get(target,key){if(key==='searchText')window.searchTextReads++;return target[key];}})});});
      });
      let firstReads=0;
      for(const query of ['linux','LINUX 系统','公告','does-not-exist-xyq','']){
       await input.fill(query);
       const terms=query.trim().toLowerCase().split(/[\s,，;；|]+/).filter(Boolean);
       const expected=values.filter(record=>terms.every(term=>Object.values(record).join(' ').trim().toLowerCase().includes(term))).length;
       assert.equal(await page.locator('[data-archive-record]:visible').count(),expected,'Search semantics preserved for '+query);
       if(mode==='after'){
        const reads=await page.evaluate(()=>window.searchTextReads);
        if(query==='linux')firstReads=reads;else assert.equal(reads,firstReads,'Subsequent search reuses normalized text');
       }
      }
      pair[mode].normalizedTextReads=mode==='after'?await page.evaluate(()=>window.searchTextReads):null;
      if(await page.locator('[data-archive-mode="projects"]').count()){
       await page.locator('[data-archive-mode="projects"]').click();assert(await page.locator('[data-archive-panel="projects"]').isVisible());
       await page.locator('[data-archive-mode="articles"]').click();assert.equal(await page.locator('[data-archive-panel="articles"] [data-archive-record]:visible').count(),values.length);
      }
     }
     assert.deepEqual(errors,[]);assert(!requests.some(r=>r.path==='/api/views'&&r.method==='POST'),'Read-only audit');
     await context.close();
    }
    assert.deepEqual(pair.after.geometry,pair.before.geometry,'Visible layout remains the same: '+route);assert.deepEqual(pair.after.expandedGeometry,pair.before.expandedGeometry,'Expanded layout remains the same: '+route);report.push(pair);
    console.log('PASS',width,theme,route,'count requests',pair.before.viewRequests+' → '+pair.after.viewRequests);
   }
  }
  // Repeated in-document navigation checks lifecycle, restoration and consent on readers.
  if(!process.env.BLOG_UI_ARCHIVES_ONLY)for(const width of [390,1440]){
   const {context,page,requests,errors}=await fixture(browser,builds.after,width,'dark');await ready(page,'/');
   const cdp=await context.newCDPSession(page);const samples=[];
   for(let cycle=0;cycle<3;cycle++){
    for(const route of ['/posts/','/tags/site-notice/','/posts/linux-note/','/tools/','/friends/','/friends/memories/','/']){
     // A pointer left over a record intentionally opens the next archive's row.
     await page.mouse.move(0,0);
     await page.evaluate(href=>SonglinePageTransition.navigateLink(href),base+route);await page.evaluate(()=>SonglinePageModules.ready(document));
     assert.equal(new URL(page.url()).pathname,route);assert.equal(await page.locator('[data-elevator-nav]').count(),1,'One navigation instance at '+width+' '+cycle+' '+route);
     assert.equal(await page.locator('link#songline-home-runtime-style').count(),route==='/'?1:0,'Home-only styles follow AJAX navigation');
     assert.equal(await page.locator('link[href*="navigation-motion.css"]').count(),0,'Retired navigation stylesheet is not restored');
     if(route==='/')assert(await page.evaluate(()=>{
      const styles=[...document.head.querySelectorAll('link[rel="stylesheet"]')].map(link=>new URL(link.href).pathname);
      return styles.indexOf('/css/site.css')<styles.indexOf('/css/site-runtime.css')&&styles.indexOf('/css/site-runtime.css')<styles.indexOf('/css/site-modern.css');
     }),'Home-only startup styles retain cascade order after reentry');
     if(route==='/posts/'||route==='/tags/site-notice/'){
      const count=requests.filter(r=>r.path==='/api/views').length;await page.waitForTimeout(100);
      assert.equal(requests.filter(r=>r.path==='/api/views').length,count);
      await page.locator('[data-archive-trigger]').first().click();await page.waitForFunction(()=>document.querySelector('.archive-record.is-open .real-views')?.dataset.viewLoaded==='1');
     }
    }
    await page.waitForTimeout(1000);await cdp.send('HeapProfiler.collectGarbage');samples.push(await cdp.send('Memory.getDOMCounters'));
   }
   assert(samples[2].nodes<=samples[1].nodes+120);assert(samples[2].jsEventListeners<=samples[1].jsEventListeners+15);assert.equal(samples[2].documents,samples[1].documents);assert.deepEqual(errors,[]);
   report.push({width,lifecycle:samples});console.log('PASS lifecycle',width,samples);await context.close();
  }
 }finally{fs.writeFileSync(path.join(out,process.env.BLOG_UI_LIFECYCLE_ONLY?'lifecycle-report.json':process.env.BLOG_UI_ARCHIVES_ONLY?'archive-report.json':'report.json'),JSON.stringify(report,null,2));await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
