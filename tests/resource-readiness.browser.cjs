// NODE_PATH may point to the desktop's bundled node_modules (Playwright).
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../web/static/resource-readiness.js'), 'utf8');
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="steelblue"/></svg>';

(async()=>{
  const browser = await chromium.launch({headless:true, channel:'msedge'});
  try{
    const page = await browser.newPage({viewport:{width:1280,height:800}});
    const errors = [];
    page.on('pageerror', error=>errors.push(error.message));
    let releaseImage;
    const gate = new Promise(resolve=>releaseImage=resolve);
    await page.route('https://loading.test/**', async route=>{
      if(route.request().url().endsWith('/slow.svg')) await gate;
      await route.fulfill({contentType:'image/svg+xml',body:svg});
    });
    await page.setContent('<img id="slow" src="https://loading.test/slow.svg" width="120" height="80"><img src="https://loading.test/offscreen.svg" loading="lazy" style="position:absolute;top:20000px;width:120px;height:80px">', {waitUntil:'domcontentloaded'});
    await page.addScriptTag({content:source});
    await page.evaluate(()=>{window.finished=false; window.readyTask=SonglineResources.prepare(document,{modules:false}).then(()=>window.finished=true);});
    assert.equal(await page.evaluate(()=>finished), false, 'must not reveal before the visible image arrives');
    releaseImage();
    await page.evaluate(()=>readyTask);
    assert.equal(await page.locator('#slow').getAttribute('data-image-state'),'ready');
    assert.equal(await page.evaluate(()=>SonglineResources.lastReport.timedOut),false);
    console.log('PASS visible images block until decoded; offscreen lazy images do not block');

    await page.route('https://loading.test/fail.svg', route=>route.abort());
    await page.evaluate(()=>{const img=new Image(); img.id='bad';img.src='https://loading.test/fail.svg';img.width=120;img.height=80;document.body.append(img);});
    await page.evaluate(()=>SonglineResources.prepare(document,{modules:false}));
    assert.equal(await page.locator('#bad').getAttribute('data-image-state'),'error');
    console.log('PASS failed image settles without exposing a broken image or hanging');

    await page.route('https://loading.test/late.svg', async route=>{await new Promise(resolve=>setTimeout(resolve,500));await route.fulfill({contentType:'image/svg+xml',body:svg});});
    await page.evaluate(()=>{const img=new Image();img.id='late';img.width=120;img.height=80;img.src='https://loading.test/late.svg';document.body.append(img);});
    const timed = await page.evaluate(()=>SonglineResources.prepare(document,{modules:false,timeout:60}));
    assert.equal(timed.timedOut,true);
    assert.equal(await page.locator('#late').getAttribute('data-image-state'),'pending');
    await page.waitForFunction(()=>document.querySelector('#late').dataset.imageState==='ready');
    console.log('PASS bounded wait leaves a placeholder; late response reveals after decoding');
    await page.route('https://loading.test/replacement.svg', async route=>{await new Promise(resolve=>setTimeout(resolve,500));await route.fulfill({contentType:'image/svg+xml',body:svg});});
    await page.evaluate(()=>{const img=document.querySelector('#slow');img.src='https://loading.test/replacement.svg';window.replacement=SonglineResources.image(img);});
    assert.equal(await page.locator('#slow').getAttribute('data-image-state'),'pending','a new src must not reuse readiness of the old bitmap');
    await page.evaluate(()=>replacement);
    assert.equal(await page.locator('#slow').getAttribute('data-image-state'),'ready');
    console.log('PASS reused image waits for its replacement source');
    await page.route('https://loading.test/no-size.svg', async route=>{await new Promise(resolve=>setTimeout(resolve,400));await route.fulfill({contentType:'image/svg+xml',body:svg});});
    await page.evaluate(()=>{const img=new Image();img.id='no-size';img.src='https://loading.test/no-size.svg';document.body.append(img);});
    await page.evaluate(()=>SonglineResources.prepare(document,{modules:false}));
    assert.equal(await page.locator('#no-size').getAttribute('data-image-state'),'ready');
    console.log('PASS unsized Markdown image participates before intrinsic dimensions arrive');
    await page.route('https://loading.test/background.svg', async route=>{await new Promise(resolve=>setTimeout(resolve,400));await route.fulfill({contentType:'image/svg+xml',body:svg});});
    await page.evaluate(()=>{const bg=document.createElement('section');bg.id='lazy-scene';bg.className='lazy-bg';bg.dataset.bg='https://loading.test/background.svg';bg.style.cssText='width:100px;height:80px';document.body.prepend(bg);});
    await page.evaluate(()=>SonglineResources.prepare(document,{modules:false}));
    assert.equal(await page.locator('#lazy-scene').getAttribute('data-bg-loaded'),'1');
    console.log('PASS lazy scene background is applied only after readiness');
    let releaseVeryLate;
    const veryLateGate=new Promise(resolve=>releaseVeryLate=resolve);
    await page.route('https://loading.test/very-late.svg',async route=>{await veryLateGate;await route.fulfill({contentType:'image/svg+xml',body:svg});});
    await page.evaluate(()=>{
      const nativeTimeout=window.setTimeout;
      window.setTimeout=(fn,ms,...args)=>nativeTimeout(fn,ms===30000?50:ms,...args);
      const img=new Image();img.id='very-late';img.src='https://loading.test/very-late.svg';document.body.append(img);
      window.veryLateTask=SonglineResources.image(img);
      window.setTimeout=nativeTimeout;
    });
    await page.evaluate(()=>veryLateTask);
    assert.equal(await page.locator('#very-late').getAttribute('data-image-state'),'error');
    releaseVeryLate();
    await page.waitForFunction(()=>document.querySelector('#very-late').dataset.imageState==='ready');
    console.log('PASS image recovers even after the request observation deadline');
    assert.deepEqual(errors,[]);

    if(process.env.BLOG_TEST_URL){
      const base=process.env.BLOG_TEST_URL;
      fs.mkdirSync(path.join(__dirname,'../local-only/performance'),{recursive:true});
      const site = await browser.newPage({viewport:{width:1440,height:900}});
      const failures=[];
      let slowAvatarRequested=false, slowAvatarReleased=false;
      await site.route('**/uploads/admin/friends/kfc.jpg',async route=>{
        slowAvatarRequested=true;
        await new Promise(resolve=>setTimeout(resolve,5000));
        slowAvatarReleased=true;
        await route.continue();
      });
      site.on('pageerror',error=>failures.push(error.message));
      await site.addInitScript(()=>{window.readinessSnapshots=[];window.addEventListener('songline:resources-ready',()=>{readinessSnapshots.push({path:location.pathname,images:Array.from(document.images).filter(i=>{const r=i.getBoundingClientRect();return r.width&&r.height&&r.top<innerHeight&&r.bottom>0&&r.left<innerWidth&&r.right>0&&!i.closest('[hidden],[aria-hidden="true"]');}).map(i=>({src:i.getAttribute('src'),state:i.dataset.imageState,complete:i.complete}))});});});
      await site.goto(base,{waitUntil:'domcontentloaded'});
      await site.waitForFunction(()=>window.SonglineResources && SonglineResources.lastReport && !document.documentElement.classList.contains('is-booting'),{},{timeout:35000});
      for(const route of ['/friends/','/friends/memories/','/tools/','/posts/','/']){
        const began=Date.now();
        await site.evaluate(route=>window.SonglinePageTransition.navigateLink(route),route);
        const navigationMs=Date.now()-began;
        const state=await site.evaluate(()=>({path:location.pathname,report:SonglineResources.lastReport,locked:document.documentElement.classList.contains('songline-page-transitioning'),broken:Array.from(document.images).filter(i=>{const r=i.getBoundingClientRect();return r.width && r.height && r.top<innerHeight && r.bottom>0 && r.left<innerWidth && r.right>0 && !i.closest('[hidden],[aria-hidden="true"]') && i.dataset.imageState==='error';}).length}));
        assert.equal(state.path,route);assert.equal(state.locked,false);
        if(route==='/friends/'){
          assert.ok(slowAvatarRequested && !slowAvatarReleased,'slow secondary media must not keep navigation locked');
          assert.ok(navigationMs<4000,'slow-avatar page should become interactive before four seconds');
          assert.ok(state.report.pending>0 && state.report.timedOut,'pending media must be reported, not called fully ready');
          assert.equal(await site.locator('img[src="/uploads/admin/friends/kfc.jpg"]').getAttribute('data-image-state'),'pending');
          await site.waitForFunction(()=>document.querySelector('img[src="/uploads/admin/friends/kfc.jpg"]').dataset.imageState==='ready');
        }
        console.log('PAGE',JSON.stringify({...state,navigationMs}));
        const snapshot=await site.evaluate(()=>readinessSnapshots.at(-1));
        assert.ok(snapshot.images.every(i=>i.state),'every visible image must participate in readiness: '+JSON.stringify(snapshot));
        await site.screenshot({path:path.join(__dirname,'../local-only/performance/'+(route==='/'?'home':route.replaceAll('/','-'))+'.png')});
      }
      assert.deepEqual(failures,[],'real pages must not produce script errors');
      fs.mkdirSync(path.join(__dirname,'../local-only/performance'),{recursive:true});
      await site.screenshot({path:path.join(__dirname,'../local-only/performance/home.png')});
      console.log('PASS real page round trip');
      await site.evaluate(()=>SonglinePageTransition.navigateLink('/posts/'));
      const warmStart=Date.now();
      await site.evaluate(()=>SonglinePageTransition.navigateLink('/'));
      assert.ok(Date.now()-warmStart<2200,'warm navigation must not retain the old fixed 2.22 second wait');
      console.log('PASS warm page navigation',Date.now()-warmStart,'ms');
      const mobile=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
      mobile.on('pageerror',error=>failures.push(error.message));
      await mobile.goto(base+'/friends/memories/',{waitUntil:'domcontentloaded'});
      await mobile.waitForFunction(()=>window.SonglineResources && SonglineResources.lastReport,{},{timeout:35000});
      for(const route of ['/tools/','/posts/','/']){
        await mobile.evaluate(route=>SonglinePageTransition.navigateLink(route),route);
        assert.equal(await mobile.evaluate(()=>location.pathname),route);
      }
      await mobile.screenshot({path:path.join(__dirname,'../local-only/performance/mobile-home.png')});
      assert.deepEqual(failures,[]);
      console.log('PASS mobile direct entry and reduced-motion navigation');
    }
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
