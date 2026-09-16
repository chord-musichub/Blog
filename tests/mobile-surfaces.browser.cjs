// Public pages use the real Docker build. Creator pages use the existing Go
// read-only fixture on 8091, never production accounts or write requests.
const {chromium}=require('playwright');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const out='local-only/mobile-surfaces';fs.mkdirSync(out,{recursive:true});
const publicBase=process.env.BLOG_TEST_URL||'http://127.0.0.1:8080';
const creatorBase=process.env.CREATOR_TEST_URL||'http://127.0.0.1:8091';
const tools=fs.readdirSync('content/tools',{withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>'/tools/'+d.name+'/');
const publicPaths=['/','/posts/','/friends/','/friends/songline/','/friends/memories/','/tools/','/posts/c-note/','/tools/focus-timer/',...tools];
const creatorPaths=['/write/','/write/articles/new','/write/account','/write/admin','/write/admin/media','/write/compose/projects','/write/compose/memories','/write/users/new','/write/admin/site','/write/admin/theme','/write/settings/manuscript'];
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});const failures=[];
 try{
  for(const [width,height] of [[360,640],[844,390]]){
   const page=await browser.newPage({viewport:{width,height},hasTouch:true,isMobile:true});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(()=>localStorage.setItem('songline-theme','dark'));
   for(const [base,paths] of [[publicBase,publicPaths],[creatorBase,creatorPaths]]){
    for(const path of paths){
     const response=await page.goto(base+path);await page.waitForTimeout(base===publicBase?1300:180);
     assert.equal(response.status(),200,path);
     const metrics=await page.evaluate(()=>({width:innerWidth,viewport:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,
      clipped:[...document.querySelectorAll('main input,main select,main textarea,main button,main .btn')].filter(e=>{
       const r=e.getBoundingClientRect(),s=getComputedStyle(e);
       return r.width>0&&s.visibility!=='hidden'&&!e.closest('[hidden],[inert]')&&(r.right>innerWidth+3||r.left< -3)&&!e.closest('.memory-room,.friends-constellation,.content-archive__search-terms,.formatting-toolbar,.status-tabs,.table-wrap');
      }).slice(0,8).map(e=>e.className||e.id||e.tagName)}));
     if(metrics.scroll>width+2||metrics.width>width+2||metrics.clipped.length)failures.push({width,height,path,...metrics});
     const name=path.replaceAll('/','-');
     await page.screenshot({path:`${out}/${width}x${height}${name}.png`,fullPage:base===creatorBase});
     console.log(`${metrics.clipped.length||metrics.scroll>width+2?'CHECK':'PASS'} ${width}x${height} ${path}`);
    }
   }
   if(width===360){
    await page.goto(creatorBase+'/write/');
    await page.locator('.rail-toggle').tap();
    assert(await page.locator('.creator-rail-backdrop').isVisible());
    await page.locator('.creator-rail-backdrop').tap({position:{x:320,y:200}});
    assert.equal(await page.locator('.rail-toggle').getAttribute('aria-expanded'),'false');
    assert(await page.locator('.creator-rail').evaluate(e=>e.inert));
   }
   await page.goto(creatorBase+'/write/account');
   await page.locator('[data-admin-theme-toggle]').tap();
   assert.equal(await page.locator('html').getAttribute('data-admin-theme'),'light');
   await page.screenshot({path:`${out}/${width}x${height}-account-light.png`,fullPage:true});
   assert.deepEqual(errors,[]);await page.close();
  }
 }finally{await browser.close();}
 console.log(JSON.stringify(failures,null,2));assert.deepEqual(failures,[],'mobile surfaces should not clip form controls');
})().catch(e=>{console.error(e);process.exit(1)});
