// Run against the opt-in, read-only TestCreatorCenterVisualPreview fixture.
// CREATOR_CENTER_PREVIEW=1 go test ./cmd/server -run TestCreatorCenterVisualPreview -timeout 10m
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const base=process.env.ADMIN_UI_URL||'http://127.0.0.1:8091';

(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  for(const width of [320,390,700,1440])for(const theme of ['light','dark'])for(const role of ['owner','admin','user']){
   const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
   await context.addInitScript(theme=>localStorage.setItem('songline-theme',theme),theme);
   const page=await context.newPage(),errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   const routes=width===390&&theme==='dark'&&role==='owner'
    ? ['/write/','/write/articles/new','/write/admin/media','/write/admin/site','/write/compose/projects','/write/compose/memories','/write/account']
    : ['/write/account'];
   for(const route of routes){
    const response=await page.goto(base+route+'?role='+role);
    assert.equal(response.status(),200);
    const home=page.locator('.admin-client-nav .admin-client-home');
    assert.equal(await home.count(),1);assert(await home.isVisible());
    assert.equal(await home.getAttribute('href'),'/');
    assert.equal(await home.getAttribute('aria-label'),'返回网站主页');
    assert.notEqual(await home.getAttribute('data-document-transition'),null);
    const geometry=await page.locator('.admin-client-nav').evaluate(header=>{
     const elements=[...header.children].filter(el=>getComputedStyle(el).display!=='none');
     const controls=[...header.querySelectorAll('.admin-client-actions>*')];
     const boxes=[...elements,...controls].map(el=>el.getBoundingClientRect());
     return {inside:boxes.every(b=>b.left>=0&&b.right<=innerWidth&&b.top>=0&&b.bottom<=header.getBoundingClientRect().bottom),
      overlaps:elements.some((el,i)=>i>0&&el.getBoundingClientRect().left<elements[i-1].getBoundingClientRect().right),
      controlsOverlap:controls.some((el,i)=>i>0&&el.getBoundingClientRect().left<controls[i-1].getBoundingClientRect().right),
      overflow:document.documentElement.scrollWidth>innerWidth};
    });
    assert.deepEqual(geometry,{inside:true,overlaps:false,controlsOverlap:false,overflow:false},JSON.stringify({width,theme,role,route,geometry}));
    const background=await home.evaluate(el=>getComputedStyle(el).backgroundColor);
    await home.hover();assert.notEqual(await home.evaluate(el=>getComputedStyle(el).backgroundColor),background);
    await home.focus();assert.equal(await home.evaluate(el=>getComputedStyle(el).outlineStyle),'solid');
   }
   assert.deepEqual(errors,[]);await context.close();
   console.log('PASS top-bar home/navigation layout',width,theme,role);
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
