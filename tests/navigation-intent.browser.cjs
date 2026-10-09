const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const base=process.env.BLOG_TEST_URL||'http://127.0.0.1:8080';
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  for(const width of [390,1440]){
   const page=await browser.newPage({viewport:{width,height:900},hasTouch:width<981,isMobile:width<981});
   await page.addInitScript(()=>{localStorage.setItem('songline-privacy-v1',JSON.stringify({version:1,statistics:false,expires:Date.now()+86400000}));sessionStorage.setItem('songline-home-boot-v21.4','1');});
   async function checkMapHeader(){

    const dock=await page.locator('[data-site-map]').evaluate(element=>{
     const rect=element.getBoundingClientRect();
     return {bottom:rect.bottom,top:rect.top,height:innerHeight,inHeader:!!element.closest('.modern-site-header'),count:document.querySelectorAll('[data-site-map]').length};
    });
    assert.equal(dock.count,1,'page swaps must not duplicate the site map');
    assert(dock.inHeader,'map remains in the shared header');
    assert.ok(dock.top>=0 && dock.bottom<=60,'map entrance stays in the top bar: '+JSON.stringify(dock));
   }
   if(process.env.UI_SOURCE_CSS) await page.route('**/css/**',async route=>{
    const file='static'+new URL(route.request().url()).pathname;
    if(fs.existsSync(file)) await route.fulfill({contentType:'text/css',body:fs.readFileSync(file)});else await route.continue();
   });
   await page.goto(base+'/friends/');await page.waitForTimeout(2500);
   await checkMapHeader();
   if(width<981){
    await page.setViewportSize({width,height:740});await page.waitForTimeout(350);await checkMapHeader();
    await page.setViewportSize({width,height:900});await page.waitForTimeout(350);await checkMapHeader();
   }
   await page.locator('[data-site-map-toggle]').click();
   await page.waitForTimeout(400);
   const home=page.locator('[data-site-map] a[href="/"]');
   let b=await home.boundingBox();
   await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();
   await page.mouse.move(width/2,150,{steps:12});await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:12});await page.mouse.up();
   await page.waitForTimeout(500);assert.equal(new URL(page.url()).pathname,'/friends/','drag back onto navigation must not activate');
   await page.mouse.move(width/2,150);await page.mouse.down();await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:12});await page.mouse.up();
   await page.waitForTimeout(500);assert.equal(new URL(page.url()).pathname,'/friends/','canvas drag ending at navigation must not activate');
   if(await page.locator('[data-site-map-toggle]').getAttribute('aria-expanded')==='false') await page.locator('[data-site-map-toggle]').click();
   await home.click();await page.waitForURL(base+'/');await page.waitForTimeout(2000);
   await checkMapHeader();
   await page.locator('[data-site-map-toggle]').click();
   await page.waitForTimeout(400);
   await page.screenshot({path:`local-only/ui-layout/${width}-map.png`});
   const room=page.locator('[data-site-map] a[href="/friends/memories/"]');
   b=await room.boundingBox();assert(b&&b.width>20);
   await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();
   await page.mouse.move(b.x+b.width/2+25,b.y+b.height/2+15,{steps:5});await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:5});await page.mouse.up();
   await page.waitForTimeout(500);assert.equal(new URL(page.url()).pathname,'/','map drag must not activate');
   await room.click();await page.waitForURL('**/friends/memories/');await page.waitForTimeout(2000);
   await checkMapHeader();
   console.log(`PASS ${width}: map ignores dragging, deliberate clicks navigate`);
   await page.close();
  }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
