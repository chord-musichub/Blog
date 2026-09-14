const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const base=process.env.BLOG_TEST_URL||'http://127.0.0.1:8080';
const out='local-only/ui-layout';
fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  for(const width of (process.env.UI_WIDTHS||'360,390,900,1440').split(',').map(Number)){
   const page=await browser.newPage({viewport:{width,height:900},isMobile:width<981,hasTouch:width<981});
   if(process.env.UI_SOURCE_CSS) await page.route("**/css/**",async route=>{
    const file="static"+new URL(route.request().url()).pathname;
    if(fs.existsSync(file)) await route.fulfill({contentType:"text/css",body:fs.readFileSync(file)});else await route.continue();
   });
   await page.addInitScript(()=>localStorage.setItem('songline-theme','dark'));
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   for(const route of ['/', '/tools/', '/posts/', '/friends/', '/friends/memories/', '/posts/c-note/', '/tools/random-number/']){
    await page.goto(base+route);await page.waitForTimeout(2200);
    const name=route.replaceAll('/','-')||'home';
    if(route==='/'){
     const rec=await page.evaluate(()=>{const stage=document.querySelector('.songline-terminal-feature-stage');const cards=[...document.querySelectorAll('[data-home-recommendation-card]')];const pool=JSON.parse(document.querySelector('[data-home-recommendation-pool]').textContent);return {ratio:stage.offsetWidth/stage.offsetHeight,top:stage.getBoundingClientRect().top,urls:cards.map(c=>new URL(c.href).pathname),latest:new URL(pool[0].url,location.href).pathname};});
     assert(Math.abs(rec.ratio-16/9)<.015,'recommendation frame is 16:9');
     assert.equal(new Set(rec.urls).size,rec.urls.length,'recommendations do not repeat');
     assert.equal(rec.urls[0],rec.latest,'first recommendation is newest');
     if(width<981)assert(rec.top<280,'mobile terminal starts in first screen');
    }
    if(route==='/tools/'){
     await page.locator('.tool-card').first().hover();
     for(const selector of ['.tool-card-icon','.tool-card-arrow'])assert.deepEqual(await page.locator(selector).first().evaluate(e=>{const c=getComputedStyle(e);return [c.backgroundImage,c.backgroundColor,c.backdropFilter,c.boxShadow]}),['none','rgba(0, 0, 0, 0)','none','none']);
    }
    if(route==='/posts/'){
     await page.locator('[data-archive-search-trigger]').click();
     assert(await page.locator('[data-archive-search-term]').count()>10,'complete term list is not capped at ten');
     await page.locator('[data-archive-search-term]').last().click();
     assert.equal(await page.locator('[data-archive-search-term]').last().getAttribute('aria-pressed'),'true');
     await page.locator('[data-archive-search-clear]').click();
     await page.locator('[data-archive-mode="projects"]').click();
     assert.equal(await page.locator('[data-archive-mode="projects"]').getAttribute('aria-selected'),'true');
     await page.locator('[data-archive-mode="articles"]').click();
    }
    await page.screenshot({path:`${out}/${width}${name}.png`});
    if(width<981){
     assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${width} ${route}: horizontal overflow`);
     const nav=await page.locator("[data-elevator-nav]").boundingBox();
     const map=await page.locator("[data-site-map-toggle]").boundingBox();
     assert(nav.x+nav.width<map.x, "map and elevator must not overlap");
     if(route==='/friends/memories/'){
      const room=await page.locator('.memory-room').boundingBox();assert(room.y+room.height<=nav.y,'timeline fits above dock');
     }
    }
    console.log(`PASS ${width} ${route}`);
   }
   if(width<981){
    await page.goto(base+'/posts/'+encodeURIComponent('markdown的食用指南')+'/');await page.waitForTimeout(2200);
    await page.locator('#songline-mobile-toc-fab').click();
    await page.waitForTimeout(350);
    const drawer=await page.locator('#songline-mobile-toc-drawer').boundingBox();
    await page.screenshot({path:`${out}/${width}-toc.png`});
    assert(drawer.y>=60&&drawer.y+drawer.height<824,`TOC avoids both header and dock: ${JSON.stringify(drawer)}`);
   }
   assert.deepEqual(errors,[],'no page errors');await page.close();
  }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
