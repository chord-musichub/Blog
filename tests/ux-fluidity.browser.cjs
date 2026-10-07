// Offline interaction regression; all media and APIs are local fixtures.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const builds={before:process.env.BLOG_UI_BASELINE,after:process.env.BLOG_UI_BUILD};
for(const build of Object.values(builds))assert(build&&fs.existsSync(path.join(build,'index.html')));
const base='http://ux-fluidity.test',out=path.resolve('local-only/ux-fluidity');
async function fixture(browser,build,width){
 const context=await browser.newContext({viewport:{width,height:900},hasTouch:width<981,isMobile:width<981});
 const requests=[],errors=[];
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());requests.push({path:u.pathname,method:route.request().method()});
  if(u.origin!==base||u.pathname.startsWith('/uploads/'))return route.fulfill({body:'<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100"><rect width="160" height="100" fill="#607d8b"/></svg>',contentType:'image/svg+xml'});
  if(u.pathname.includes('/api/'))return route.fulfill({json:{views:83,items:[],messages:[],scores:[]}});
  const root=path.resolve(u.pathname.startsWith('/static/')?'web/static':build);
  const file=path.resolve(root,decodeURIComponent(u.pathname.replace(/^\/static\//,'/').slice(1))+(u.pathname.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
  if(u.pathname.endsWith('/')&&route.request().headers()['x-requested-with'])await new Promise(resolve=>setTimeout(resolve,160));
  return route.fulfill({body:fs.readFileSync(file),contentType:({'.html':'text/html','.css':'text/css','.js':'application/javascript','.json':'application/json','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream'});
 });
 await context.addInitScript(()=>{
  localStorage.setItem('songline-theme','dark');sessionStorage.setItem('songline-home-boot-v21.4','1');
  localStorage.setItem('songline-privacy-v1',JSON.stringify({version:1,statistics:false,expires:Date.now()+86400000}));
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 return {context,page,requests,errors};
}
async function ready(page,route){
 await page.goto(base+route);await page.evaluate(()=>SonglinePageModules.ready(document));
 await page.waitForFunction(()=>!document.documentElement.classList.contains('is-scene-preparing'));
}
async function idle(page){await page.waitForFunction(()=>!document.documentElement.classList.contains('songline-page-transitioning'));}
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'}),report=[];
 try{
  for(const width of process.env.UX_WIDTH?[Number(process.env.UX_WIDTH)]:[390,1440]){
   const pair={width};
   for(const [mode,build] of Object.entries(builds)){
    const {context,page,requests,errors}=await fixture(browser,build,width);await ready(page,'/posts/?search=1');
    const input=page.locator('[data-archive-search-input]');
    pair[mode]=await input.evaluate(input=>{
     const replace=history.replaceState.bind(history);let updates=0;history.replaceState=(...args)=>{updates++;return replace(...args);};
     input.focus();input.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));
     for(const value of ['l','li','lin','linux']){input.value=value;input.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true}));}
     input.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,key:'Escape',isComposing:true}));
     const pending={updates,value:input.value,focused:document.activeElement===input};
     input.value='linux';input.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));
     input.dispatchEvent(new InputEvent('input',{bubbles:true}));
     return Promise.resolve().then(()=>{const committed={updates,value:input.value,url:new URL(location.href).searchParams.get('q')};history.replaceState=replace;return {pending,committed};});
    });
    if(mode==='after'){
     assert.deepEqual(pair.after.pending,{updates:0,value:'linux',focused:true});
     assert.equal(pair.after.committed.updates,1);assert.equal(pair.after.committed.url,'linux');
     const burst=await input.evaluate(input=>{
      const replace=history.replaceState.bind(history);let updates=0;history.replaceState=(...args)=>{updates++;return replace(...args);};
      for(let i=0;i<20;i++){input.value='linux '+i;input.dispatchEvent(new InputEvent('input',{bubbles:true}));}
      return Promise.resolve().then(()=>{history.replaceState=replace;return {updates,query:new URL(location.href).searchParams.get('q')};});
     });assert.deepEqual(burst,{updates:1,query:'linux 19'});pair.after.burst=burst;
     await input.fill('');await page.mouse.move(0,0);
     // Focusing a pinned drawer's contents must not turn it into a hover drawer.
     await page.locator('[data-archive-trigger]').first().evaluate(n=>n.click());
     await page.locator('.archive-record.is-pinned a').first().focus();
     assert.equal(await page.locator('.archive-record.is-pinned').count(),1);
     await page.locator('[data-archive-trigger]').first().evaluate(n=>n.click());
     assert.equal(await page.locator('.archive-record.is-open').count(),0);
     // Exercise existing project detail markup when it has a destination.
     const detail=page.locator('[data-archive-open-url]').first();
     if(await detail.count()){
      const childKey=await detail.evaluate(detail=>{
       const link=document.createElement('a');link.href='/tools/';link.textContent='fixture';detail.append(link);
       const event=new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true});link.dispatchEvent(event);link.remove();
       return {prevented:event.defaultPrevented,tabindex:detail.tabIndex,role:detail.getAttribute('role')};
      });assert.deepEqual(childKey,{prevented:false,tabindex:0,role:'link'});
     }
     const epoch=await page.evaluate(()=>performance.timeOrigin);
     // Last click wins while preserving one document and intermediate history.
     await page.evaluate(()=>{
      window.firstNavigation=SonglinePageTransition.navigateLink('/friends/');
      const link=document.createElement('a');link.href='/tags/site-notice/';document.body.append(link);link.click();link.remove();
      window.latestNavigation=SonglinePageTransition.navigateLink('/tools/');
     });
     await page.evaluate(()=>Promise.all([firstNavigation,latestNavigation]));await idle(page);
     assert.equal(new URL(page.url()).pathname,'/tools/');assert.equal(await page.evaluate(()=>performance.timeOrigin),epoch);
     assert(!requests.some(r=>r.path==='/tags/site-notice/'),'Superseded queued destination must not be fetched');
     await page.goBack();await page.waitForURL(base+'/friends/');await idle(page);
     assert.equal(await page.locator('[data-edge]').count()>0,true);
     await page.goForward();await page.waitForURL(base+'/tools/');await idle(page);
     // Pick a real deep heading, then enter from another page using AJAX.
     await page.evaluate(()=>SonglinePageTransition.navigateLink('/posts/linux-note/'));
     const id=await page.locator('.article-reader h2[id],.article-reader h3[id],.article-reader h4[id]').last().getAttribute('id');assert(id);
     await page.evaluate(()=>SonglinePageTransition.navigateLink('/tools/'));
     await page.evaluate(hash=>SonglinePageTransition.navigateLink('/posts/linux-note/#'+encodeURIComponent(hash)),id);await idle(page);
     const deepLink=await page.evaluate(id=>{
      const target=document.getElementById(id),r=target.getBoundingClientRect(),header=document.querySelector('.site-header');
      return {top:r.top,headerBottom:header?header.getBoundingClientRect().bottom:0,scrollY,maxScroll:document.documentElement.scrollHeight-innerHeight,scrollBehavior:getComputedStyle(document.documentElement).scrollBehavior};
     },id);
     assert(deepLink.scrollY>0);
     assert(deepLink.top>=0&&(deepLink.top<180||(deepLink.scrollY===deepLink.maxScroll&&deepLink.top<900)), 'Deep link aligned or visibly clamped at document end: '+JSON.stringify(deepLink));
     pair.after.deepLink=deepLink;
     // Back restores the actual saved offset instead of jumping to URL hash.
     await context.route('**/md-source/linux-note.md',async route=>{await new Promise(resolve=>setTimeout(resolve,1800));await route.fallback();});
     await page.evaluate(()=>scrollTo({top:250,behavior:'instant'}));await page.evaluate(()=>SonglinePageTransition.navigateLink('/tools/'));
     await page.goBack();await page.waitForURL(u=>u.pathname==='/posts/linux-note/');await idle(page);
     await page.waitForTimeout(2000);
     assert(Math.abs(await page.evaluate(()=>scrollY)-250)<3,'History scroll restoration wins over a stale hash');
     await page.evaluate(()=>SonglinePageTransition.navigateLink('/tools/'));
     const historyLength=await page.evaluate(()=>history.length);
     await page.evaluate(()=>{
      window.interruptedNavigation=SonglinePageTransition.navigateLink('/friends/');
      window.cancelledNavigation=SonglinePageTransition.navigateLink('/tags/site-notice/');
      history.back();
     });
     await page.waitForURL(u=>u.pathname==='/posts/linux-note/');
     await page.evaluate(()=>Promise.all([interruptedNavigation,cancelledNavigation]));
     await page.waitForFunction(()=>document.querySelector('.article-reader')&&!document.documentElement.classList.contains('songline-page-transitioning'));
     assert.equal(await page.evaluate(()=>history.length),historyLength,'Back during loading must not push a phantom entry');
     assert(Math.abs(await page.evaluate(()=>scrollY)-250)<3);
     await page.goForward();await page.waitForURL(base+'/tools/');await idle(page);
     assert.equal(await page.evaluate(()=>performance.timeOrigin),epoch);
    }
    assert.deepEqual(errors,[]);assert(!requests.some(r=>r.path.includes('/api/')&&r.method!=='GET'));
    await context.close();
   }
   assert(pair.before.pending.updates>0);assert.equal(pair.before.pending.value,'','Baseline reproduces IME Escape swallowing');
   report.push(pair);console.log('PASS',JSON.stringify(pair));
  }
 }finally{fs.writeFileSync(path.join(out,'interaction-report.json'),JSON.stringify(report,null,2));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
