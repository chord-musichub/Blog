const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const build=process.env.BLOG_UI_BUILD;
assert(build&&fs.existsSync(path.join(build,'index.html')),'Set BLOG_UI_BUILD to an isolated Hugo build');
const baseline=process.env.MOBILE_FIX_BASELINE==='1';
const base='http://127.0.0.1:41739';
const out='local-only/mobile-navigation';fs.mkdirSync(out,{recursive:true});
const report=[];
async function fixture(context){
 await context.route('**/*',route=>{
  const u=new URL(route.request().url());
  if(u.origin!==base||u.pathname.startsWith('/uploads/'))return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="180" height="120"><rect width="180" height="120" fill="#7497ac"/></svg>'});
  if(u.pathname.startsWith('/api/'))return route.fulfill({json:u.pathname==='/api/views'?{views:83}:{messages:[],items:[]}});
  const root=path.resolve(u.pathname.startsWith('/static/')?'web/static':build);
  const file=path.resolve(root,u.pathname.replace(/^\/static\//,'/').slice(1)+(u.pathname.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:'not found'});
  return route.fulfill({body:fs.readFileSync(file),contentType:({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json'})[path.extname(file)]||'application/octet-stream'});
 });
 await context.addInitScript(()=>{sessionStorage.setItem('songline-home-boot-v21.4','1');localStorage.setItem('songline-theme','dark');localStorage.setItem('songline-privacy-v1',JSON.stringify({version:1,statistics:false,expires:Date.now()+86400000}));});
}
async function ready(page,route){await page.goto(base+route);await page.evaluate(()=>SonglinePageModules.ready(document));await page.waitForTimeout(800);}
async function dragImage(page,route,selector,canvas,moving){
 await ready(page,route);
 const point=await page.locator(selector).evaluateAll(images=>{
  for(const img of images){const r=img.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
   if(x>40&&x<innerWidth-180&&y>110&&y<innerHeight-160&&document.elementFromPoint(x,y)===img)return {x,y};}
  return null;
 });
 assert(point,'A visible image must be the actual touch target');
 await page.evaluate(()=>{window.captureLog=[];document.addEventListener('lostpointercapture',e=>captureLog.push({target:e.target.className,bubbles:e.bubbles}),true);});
 const cdp=await page.context().newCDPSession(page);
 const position=()=>page.locator(moving).evaluate(e=>new DOMMatrixReadOnly(getComputedStyle(e).transform).m41);
 const start=await position();const samples=[];
 const touch=(x)=>[{x,y:point.y,id:1,radiusX:3,radiusY:3}];
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:touch(point.x)});
 for(let i=1;i<=10;i++){
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:touch(point.x+i*12)});
  await page.waitForTimeout(25);
  samples.push({x:await position(),dragging:await page.locator(canvas).evaluate(e=>e.classList.contains('is-dragging'))});
 }
 const lost=await page.evaluate(()=>captureLog);
 await page.waitForTimeout(120);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await page.waitForTimeout(450);
 const result={route,start,samples,lost};report.push(result);console.log(JSON.stringify(result));
 if(!baseline){
  assert(samples.slice(1).every(s=>s.dragging),'Child lostpointercapture must not terminate a live touch drag');
  assert(samples.at(-1).x-start>100,'Canvas should follow the entire gesture, not only its first frame');
  assert(new Set(samples.map(s=>s.x)).size>=8,'Continuous movement across touch samples');
  assert(!await page.locator(canvas).evaluate(e=>e.classList.contains('is-dragging')),'Release clears drag state');
  assert.equal(new URL(page.url()).pathname,route,'Dragging a photo must not navigate');
 }
}
async function arrived(page,route){
 await page.waitForFunction(route=>location.pathname+location.search===route&&!document.documentElement.classList.contains('songline-page-transitioning'),route,{timeout:15000});
}
async function historyChecks(browser,legacy){
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});await fixture(context);
 if(legacy)await context.addInitScript(()=>Object.defineProperty(window,'navigation',{value:undefined,configurable:true}));
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await ready(page,'/tools/?source=previous');
 await page.evaluate(()=>scrollTo(0,480));await page.waitForTimeout(100);
 const originY=await page.evaluate(()=>scrollY);
 await page.evaluate(()=>SonglinePageTransition.navigateLink('/posts/linux-note/'));
 await page.reload();await page.evaluate(()=>SonglinePageModules.ready(document));await page.waitForTimeout(500);
 const length=await page.evaluate(()=>history.length);
 const anchor=page.locator('.article-toc .toc-body a[href^="#"]').first();
 assert(await anchor.count());await anchor.evaluate(a=>a.click());
 assert.equal(await page.evaluate(()=>history.length),length,'TOC movement should not masquerade as a previous page');
 assert(await page.evaluate(()=>history.state.songlineCanGoBack),'TOC keeps history metadata');
 await page.locator('[data-back-icon]').first().click();await arrived(page,'/tools/?source=previous');
 assert.equal(await page.evaluate(()=>history.length),length,'Back must traverse, not push the fallback URL');
 assert(Math.abs(await page.evaluate(()=>scrollY)-originY)<3,'Restore previous page scroll');
 await page.evaluate(()=>history.forward());await arrived(page,'/posts/linux-note/');
 await page.evaluate(()=>history.back());await arrived(page,'/tools/?source=previous');
 await page.evaluate(()=>SonglinePageTransition.navigateLink('/friends/memories/'));
 await page.locator('[data-back-icon]').click();await arrived(page,'/tools/?source=previous');
 assert.deepEqual(errors,[]);await context.close();
 const direct=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});await fixture(direct);
 const p=await direct.newPage();await ready(p,'/tools/random-number/');
 await p.locator('[data-back-icon]').click();await arrived(p,'/tools/');await direct.close();
 const full=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});await fixture(full);
 if(legacy)await full.addInitScript(()=>Object.defineProperty(window,'navigation',{value:undefined,configurable:true}));
 const documentPage=await full.newPage();await ready(documentPage,'/tools/?full=previous');
 await documentPage.evaluate(()=>{
  const a=document.createElement('a');a.href='/posts/linux-note/';a.textContent='Full document';a.dataset.noPageTransition='';a.id='native-test-link';document.body.prepend(a);
 });
 await documentPage.locator('#native-test-link').evaluate(a=>a.click());await documentPage.waitForURL(base+'/posts/linux-note/');await documentPage.waitForLoadState();
 await documentPage.locator('[data-back-icon]').click();await arrived(documentPage,'/tools/?full=previous');
 await full.close();
 console.log('PASS actual previous page, query/scroll, reload, forward/back, memories, direct-entry fallback; legacy='+legacy);
}
async function viewportChecks(browser){
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});await fixture(context);
 const page=await context.newPage();const cdp=await context.newCDPSession(page);
 // This distinguishes small/large CSS viewports; ordinary setViewportSize alone cannot reproduce toolbar gaps.
 await cdp.send('Emulation.setSmallViewportHeightDifferenceOverride',{difference:120});
 for(const route of ['/','/posts/c-note/','/friends/','/friends/memories/']){
  await ready(page,route);
  const coverage=await page.locator('.site-bg-layer').evaluate(e=>({top:e.getBoundingClientRect().top,bottom:e.getBoundingClientRect().bottom,height:innerHeight,position:getComputedStyle(e).position}));
  report.push({route,coverage});console.log({route,coverage});
  if(!baseline)assert(coverage.bottom>=coverage.height-1,'Scene background must cover the toolbar-hidden viewport');
 }
 if(!baseline){
  let release;const gate=new Promise(resolve=>{release=resolve;});
  await page.route('**/tools/',async route=>{await gate;return route.fallback();});
  await page.evaluate(()=>{window.pendingNavigation=SonglinePageTransition.navigateLink('/tools/');});
  await page.waitForSelector('.songline-page-transition-overlay.is-covering');await page.waitForTimeout(450);
  await page.setViewportSize({width:390,height:920});
  const curtain=await page.locator('.songline-page-transition-overlay').boundingBox();
  assert(curtain.y<=0&&curtain.y+curtain.height>=920,'Loading curtain covers an expanded viewport');
  await page.screenshot({path:out+'/loading-expanded.png'});release();await page.evaluate(()=>pendingNavigation);
  await context.close();
  // The head may be blocked by a slow external script: theme/base must already be painted.
  const slow=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await fixture(slow);
  await slow.addInitScript(()=>localStorage.setItem('songline-theme','light'));
  let unblock;const blocking=new Promise(resolve=>{unblock=resolve;});
  await slow.route('**/static/document-transition.js?*',async route=>{await blocking;return route.fallback();});
  const initial=await slow.newPage();await initial.goto(base+'/',{waitUntil:'commit'});
  await initial.waitForFunction(()=>document.documentElement.getAttribute('data-theme')==='light');
  assert.equal(await initial.evaluate(()=>getComputedStyle(document.documentElement).backgroundColor),'rgb(243, 195, 173)');
  report.push({earlyLightBase:await initial.evaluate(()=>getComputedStyle(document.documentElement).backgroundColor)});
  unblock();await initial.waitForLoadState();await slow.close();
  console.log('PASS expanded viewport, loading curtain and pre-stylesheet theme base');
 }else await context.close();
}
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge',args:['--enable-gpu']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await fixture(context);
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await dragImage(page,'/friends/','.friends-constellation__node img, .friends-constellation__core img','[data-galaxy-stage]','[data-galaxy-world]');
  await dragImage(page,'/friends/memories/','[data-memory-open] img','[data-memory-viewport]','[data-memory-track]');
  assert.deepEqual(errors,[]);await context.close();
  await viewportChecks(browser);
  if(!baseline){await historyChecks(browser,false);await historyChecks(browser,true);}
 }finally{await browser.close();fs.writeFileSync(`${out}/${baseline?'before':'after'}.json`,JSON.stringify(report,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});
