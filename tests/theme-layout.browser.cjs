const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const base=process.env.BLOG_TEST_URL||'http://127.0.0.1:8080';
fs.mkdirSync('local-only/ui-layout',{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  await page.addInitScript(()=>localStorage.setItem('songline-theme','light'));
  for(const route of ['/','/posts/','/tools/']){
   await page.goto(base+route);await page.waitForTimeout(2200);
   assert.equal(await page.locator('body').evaluate(e=>e.classList.contains('dark')),false,'light theme is active');
   if(route==='/posts/')await page.locator('[data-archive-search-trigger]').click();
   if(route==='/tools/'){
    await page.locator('.tool-card').first().hover();
    assert.equal(await page.locator('.tool-card-icon').first().evaluate(e=>getComputedStyle(e).backgroundImage),'none');
   }
   await page.screenshot({path:`local-only/ui-layout/light${route.replaceAll('/','-')}.png`});
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   console.log('PASS light',route);
  }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
