// Offline stress audit; APIs/media are fixtures, not production requests.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const builds={before:process.env.BLOG_UI_BASELINE,after:process.env.BLOG_UI_BUILD};
for(const build of Object.values(builds))assert(build&&fs.existsSync(path.join(build,'index.html')));
const base='http://stable-performance.test',out='local-only/stability-performance';fs.mkdirSync(out,{recursive:true});
const report=[];
async function fixture(browser,build,width,theme){
 const context=await browser.newContext({viewport:{width,height:900},hasTouch:width<981,isMobile:width<981});
 await context.route('**/*',route=>{
  const u=new URL(route.request().url());
  if(u.origin!==base||u.pathname.startsWith('/uploads/'))return route.fulfill({body:'<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="#607d8b"/></svg>',contentType:'image/svg+xml'});
  if(u.pathname.includes('/api/'))return route.fulfill({json:{items:[],messages:[],views:83,scores:[]}});
  const root=u.pathname.startsWith('/static/')?path.resolve('web/static'):path.resolve(build);
  const file=path.resolve(root,decodeURIComponent(u.pathname.replace(/^\/static\//,'/').slice(1))+(u.pathname.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
  return route.fulfill({body:fs.readFileSync(file),contentType:({'.html':'text/html','.css':'text/css','.js':'application/javascript','.json':'application/json','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream'});
 });
 await context.addInitScript(theme=>{
  localStorage.setItem('songline-theme',theme);localStorage.setItem('songline-privacy-v1',JSON.stringify({version:1,statistics:false,expires:Date.now()+86400000}));sessionStorage.setItem('songline-home-boot-v21.4','1');
  const get=CSSStyleDeclaration.prototype.getPropertyValue;
  window.lensStyleReads=0;CSSStyleDeclaration.prototype.getPropertyValue=function(name){if(name.startsWith('--lens-'))lensStyleReads++;return get.call(this,name);};
  const interval=window.setInterval,clear=window.clearInterval;window.auditIntervals=new Set();
  window.setInterval=function(...args){const id=interval(...args);auditIntervals.add(id);return id;};
  window.clearInterval=function(id){auditIntervals.delete(id);return clear(id);};
 },theme);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/friends/');await page.evaluate(()=>SonglinePageModules.ready(document));
 await page.waitForFunction(()=>document.querySelector('.songline-starstream-layer.is-visible'));
 await page.waitForTimeout(1400);
 return {context,page,errors};
}
async function begin(page){await page.evaluate(()=>{
 const lines=document.querySelector('.friends-constellation__lines'),layer=document.querySelector('.songline-starstream-layer');
 window.initialEdges=[...lines.children];window.initialTrails=[...layer.querySelectorAll('path')];
 window.stableAudit={edgeRemovals:0,visibleDrops:0};
 window.stableObserver=new MutationObserver(records=>records.forEach(r=>{
  if(r.type==='childList')stableAudit.edgeRemovals+=r.removedNodes.length;
  else if(r.attributeName==='class'&&r.oldValue.includes('is-visible')&&!r.target.classList.contains('is-visible'))stableAudit.visibleDrops++;
 }));
 stableObserver.observe(lines,{childList:true});stableObserver.observe(layer,{attributes:true,attributeOldValue:true});
 lensStyleReads=0;
});}
async function drag(context,page,width){
 if(width<981){
  const cdp=await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:width*.52,y:350}]});
  for(let i=1;i<=24;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:width*(.52+.15*i/24),y:350+100*i/24}]});
  await page.waitForTimeout(100);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
 }else{
  await page.mouse.move(width*.52,350);await page.mouse.down();await page.mouse.move(width*.67,450,{steps:24});await page.waitForTimeout(100);await page.mouse.up();
 }
}
async function navigate(page,route){
 const epoch=await page.evaluate(()=>performance.timeOrigin);
 await page.evaluate(url=>SonglinePageTransition.navigateLink(url),base+route);
 assert.equal(new URL(page.url()).pathname,route);assert.equal(await page.evaluate(()=>performance.timeOrigin),epoch,'Navigation stays in-document');
 await page.evaluate(()=>SonglinePageModules.ready(document));
}
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge',args:['--enable-gpu']});
 try{
  for(const width of [1440,390])for(const theme of ['light','dark']){
   const pair={width,theme};
   for(const [mode,build] of Object.entries(builds)){
    const {context,page,errors}=await fixture(browser,build,width,theme);await begin(page);
    await drag(context,page,width);await page.waitForTimeout(900);
    const motionReads=await page.evaluate(()=>lensStyleReads);
    for(let i=0;i<4;i++){
     await page.setViewportSize({width:width+(i%2?0:20),height:900+(i%2?0:20)});await page.waitForTimeout(150);
     await page.evaluate(()=>{for(let n=0;n<8;n++)SonglineInitSpaceRibbons();});await page.waitForTimeout(380);
    }
    pair[mode]=await page.evaluate(()=>{
     stableObserver.disconnect();const lines=document.querySelector('.friends-constellation__lines');
     return {...stableAudit,edges:lines.children.length,edgesRetained:initialEdges.every(n=>n.isConnected&&n.parentNode===lines),trailsRetained:initialTrails.every(n=>n.isConnected),intervals:auditIntervals.size};
    });pair[mode].motionStyleReads=motionReads;
    if(mode==='after'){
     assert.equal(pair.after.edgeRemovals,0,'Resizes must reuse line nodes');assert(pair.after.edgesRetained);
     assert.equal(pair.after.visibleDrops,0,'Rescans must not restart the background fade');assert(pair.after.trailsRetained);
     assert.equal(motionReads,0,'Motion does not read per-avatar CSS custom properties');
     // Interrupt a drag/zoom, then return from visibility/page-cache suspension.
     await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.auditHidden||false});});
     for(let i=0;i<4;i++){
      await page.evaluate(()=>{document.querySelector('[data-galaxy-zoom="in"]').click();auditHidden=true;document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));});
      await page.waitForTimeout(40);
      assert.equal(await page.locator('[data-galaxy-stage].is-moving').count(),0);
      await page.evaluate(()=>{auditHidden=false;document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});
     }
     await page.waitForTimeout(700);assert.equal(await page.locator('.songline-starstream-layer.is-visible').count(),1);
     // Boot wait must be singleton and immediately cancelled on departure.
     const pending=await page.evaluate(()=>{
      document.body.dataset.pageSection='posts';window.dispatchEvent(new Event('songline:page-swap'));
      document.body.dataset.pageSection='friends';document.documentElement.classList.add('is-boot-preparing');
      for(let i=0;i<30;i++)SonglineInitSpaceRibbons();const waiting=auditIntervals.size;
      document.body.dataset.pageSection='posts';window.dispatchEvent(new Event('songline:page-swap'));
      const cancelled=auditIntervals.size;document.documentElement.classList.remove('is-boot-preparing');return {waiting,cancelled};
     });assert.equal(pending.waiting,1);assert.equal(pending.cancelled,0);
     await page.evaluate(()=>{document.body.dataset.pageSection='friends';window.dispatchEvent(new Event('songline:page-swap'));});
     await page.waitForFunction(()=>document.querySelector('.songline-starstream-layer.is-visible'));
     // Same connected DOM can be released/reinitialized without dead controls or duplicate edges.
     for(let i=0;i<3;i++){
      await page.evaluate(()=>{__songlineFriendGalaxyCleanup();SonglineInitFriendGalaxy(document);});await page.waitForTimeout(120);
      assert.equal(await page.locator('[data-edge]').count(),pair.after.edges);
     }
     await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(100);
     assert.equal(await page.locator('.songline-starstream-layer').count(),0);
     await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForFunction(()=>document.querySelector('.songline-starstream-layer.is-visible'));
     // Dragging the core may not navigate; its next deliberate click uses shared history.
     const core=page.locator('[data-center-open]');const rect=await core.boundingBox();
     await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await page.mouse.down();await page.mouse.move(rect.x+rect.width/2+50,rect.y+rect.height/2+30,{steps:10});await page.mouse.up();await page.waitForTimeout(500);
     assert.equal(new URL(page.url()).pathname,'/friends/');
     const epoch=await page.evaluate(()=>performance.timeOrigin),href=await core.getAttribute('href');
     await core.evaluate(n=>n.click());await page.waitForFunction(path=>location.pathname===path&&document.querySelector('.friend-detail-hero'),new URL(href,base).pathname);
     assert.equal(await page.evaluate(()=>performance.timeOrigin),epoch,'Core link uses shared navigation');
     await page.waitForFunction(()=>!document.documentElement.classList.contains('songline-page-transitioning'));
     await navigate(page,'/friends/');await navigate(page,'/friends/memories/');
     for(let i=0;i<3;i++){
      await page.evaluate(()=>{__songlineMemoryRoomCleanup();SonglineInitMemoryRoom(document);});
      const photo=page.locator('[data-memory-open]').last();await photo.evaluate(n=>n.click());
      assert(await page.locator('[data-memory-lightbox]').isVisible());await page.keyboard.press('Escape');
      assert(!await page.locator('[data-memory-lightbox]').isVisible());
     }
     await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));Object.defineProperty(document,'hidden',{configurable:true,value:false});window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});
     await navigate(page,'/tools/');await navigate(page,'/friends/');
     assert.equal(await page.locator('[data-edge]').count(),pair.after.edges);
     assert.equal(await page.locator('.songline-starstream-layer').count(),1);
     // An explicit empty graph and duplicate identities must not fabricate relations.
     await page.evaluate(()=>{
      __songlineFriendGalaxyCleanup();
      document.querySelector('#friend-galaxy-data').textContent=JSON.stringify([{id:'songline',username:'songline',name:'Host',avatar:'/uploads/host.png',url:'/friends/songline/'},{id:'same',name:'One'},{id:'same',name:'Duplicate'}]);
      document.querySelector('#friend-galaxy-link-data').textContent=JSON.stringify({songline:[],same:[]});SonglineInitFriendGalaxy(document);
     });await page.waitForTimeout(100);assert.equal(await page.locator('[data-friend-id]').count(),1);assert.equal(await page.locator('[data-edge]').count(),0);
    }
    assert.deepEqual(errors,[]);await context.close();
   }
   assert(pair.before.edgeRemovals>0,'Baseline exposes line churn');assert(pair.before.motionStyleReads>0,'Baseline exposes per-frame CSS reads');
   report.push(pair);console.log('PASS',JSON.stringify(pair));
  }
 }finally{await browser.close();fs.writeFileSync(path.join(out,'stress-report.json'),JSON.stringify(report,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});
