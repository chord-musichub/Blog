// Offline scene audit: real local backgrounds, isolated builds and mocked APIs.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const repo=path.resolve(__dirname,'..'),base='http://scene-audit.test';
const builds={before:process.env.BLOG_UI_BASELINE,after:process.env.BLOG_UI_BUILD};
assert(builds.after&&fs.existsSync(path.join(builds.after,'index.html')),'Provide a fresh BLOG_UI_BUILD');
const out=path.join(repo,'local-only/scene-readiness');fs.mkdirSync(out,{recursive:true});
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100"><rect width="160" height="100" fill="#607d8b"/></svg>';
const oldSources={};
const phase=process.env.BLOG_SCENE_PHASE||(process.env.BLOG_SCENE_DYNAMIC_ONLY?'dynamic':'all');
const runPhase=name=>phase==='all'||phase===name;
function backgroundPaths(page){return page.evaluate(()=>{
 const urls=new Set();
 [document.body,...document.querySelectorAll('.site-bg-layer')].forEach(node=>{
  if(getComputedStyle(node).display==='none')return;
  [null,'::before','::after'].forEach(pseudo=>{
   const style=getComputedStyle(node,pseudo);
   if(style.display==='none'||(pseudo&&['none','normal'].includes(style.content)))return;
   style.backgroundImage.replace(/url\((["']?)(.*?)\1\)/g,(_,quote,url)=>urls.add(new URL(url,location.href).pathname));
  });
 });return [...urls].sort();
});}
async function fixture(browser,{mode='after',width=390,theme='dark',boot=false,reduced=true,slow=true,handoff=false}={}){
 const context=await browser.newContext({viewport:{width,height:900},hasTouch:width<981,isMobile:width<981,reducedMotion:reduced?'reduce':'no-preference'});
 const requests=[],errors=[];let release;
 const gate=new Promise(resolve=>release=resolve);
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());requests.push(u.pathname);
  if(u.origin!==base)return route.fulfill({body:svg,contentType:'image/svg+xml'});
  if(u.pathname.startsWith('/api/'))return route.fulfill({json:u.pathname==='/api/views'?{views:83}:{items:[],messages:[]}});
  if(u.pathname.startsWith('/uploads/admin/background/')){
   if(slow)await gate;
   return route.fulfill({body:fs.readFileSync(path.join(repo,'static',decodeURIComponent(u.pathname))),contentType:'image/png'});
  }
  if(u.pathname.startsWith('/uploads/'))return route.fulfill({body:svg,contentType:'image/svg+xml'});
  if(mode==='before'&&['/static/resource-readiness.js','/static/document-transition.js'].includes(u.pathname)){
   if(!oldSources[u.pathname])oldSources[u.pathname]=execFileSync('git',['show',(process.env.BLOG_UI_BASELINE_REF||'HEAD')+':web'+u.pathname],{cwd:repo,encoding:'utf8'});
   return route.fulfill({body:oldSources[u.pathname],contentType:'application/javascript'});
  }
  const root=path.resolve(u.pathname.startsWith('/static/')?path.join(repo,'web/static'):builds[mode]);
  const file=path.resolve(root,decodeURIComponent(u.pathname.replace(/^\/static\//,'/').slice(1))+(u.pathname.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
  return route.fulfill({body:fs.readFileSync(file),contentType:({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json'})[path.extname(file)]||'application/octet-stream'});
 });
 await context.addInitScript(({theme,boot,handoff})=>{
  localStorage.setItem('songline-theme',theme);localStorage.setItem('songline-privacy-v1',JSON.stringify({version:1,statistics:false,expires:Date.now()+86400000}));
  if(!boot)sessionStorage.setItem('songline-home-boot-v21.4','1');
  if(handoff)sessionStorage.setItem('songline-document-handoff',JSON.stringify({at:Date.now(),target:location.href,backend:false}));
  window.decodedScenes=new Set();window.sceneEvents=[];
  const decode=HTMLImageElement.prototype.decode;
  HTMLImageElement.prototype.decode=async function(){
   await decode.call(this);
   if(this.src.includes('/uploads/admin/background/')){
    // Prove that download completion alone is not enough to open the curtain.
    await new Promise(resolve=>setTimeout(resolve,100));
    decodedScenes.add(new URL(this.src).pathname);
   }
  };
  window.addEventListener('songline:resources-ready',event=>sceneEvents.push({path:location.pathname,report:event.detail,decoded:[...decodedScenes]}));
 },{theme,boot,handoff});
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
 return {context,page,requests,errors,release};
}
async function ready(page,route){
 await page.waitForFunction(route=>location.pathname===route&&SonglineResources.lastReport&&!document.documentElement.classList.contains('is-scene-preparing')&&!document.documentElement.classList.contains('is-booting')&&!document.documentElement.classList.contains('songline-page-transitioning')&&!document.documentElement.classList.contains('document-cover'),route);
}
async function assertScene(page){
 const paths=await backgroundPaths(page);
 assert(paths.length,'Test page must actually use a background');
 const state=await page.evaluate(()=>({decoded:[...decodedScenes],report:SonglineResources.lastReport,state:document.documentElement.dataset.sceneState}));
 assert.equal(state.state,'ready');assert.equal(state.report.sceneReady,true);assert.equal(state.report.scenePending,0);
 for(const image of paths)assert(state.decoded.includes(image),'Scene decoded before reveal: '+image);
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'No horizontal overflow');
 return {paths,...state};
}
async function syntheticCases(browser){
 const context=await browser.newContext(),page=await context.newPage();
 let releaseA,releaseB,releaseLate,fail=true;
 const gateA=new Promise(resolve=>releaseA=resolve),gateB=new Promise(resolve=>releaseB=resolve),gateLate=new Promise(resolve=>releaseLate=resolve);
 const calls=[];
 await page.route('https://scene-delay.test/**',async route=>{
  const url=route.request().url();calls.push(url);
  if(url.endsWith('/a.svg'))await gateA;
  if(url.endsWith('/b.svg'))await gateB;
  if(url.endsWith('/late.svg'))await gateLate;
  if(url.endsWith('/error.svg')&&fail)return route.abort();
  return route.fulfill({body:svg,contentType:'image/svg+xml'});
 });
 await page.setContent('<style>body{min-height:100vh;background-image:url(https://scene-delay.test/a.svg)}</style>',{waitUntil:'domcontentloaded'});
 await page.addScriptTag({content:fs.readFileSync(path.join(repo,'web/static/resource-readiness.js'),'utf8')});
 let result=await page.evaluate(()=>SonglineResources.scene({timeout:40}));
 assert.equal(result.sceneReady,false);assert.equal(result.scenePending,1);assert.equal(result.sceneTimedOut,true);
 assert(await page.getByRole('status').isVisible());
 await page.evaluate(()=>{
  window.dispatchEvent(new Event('songline:page-transition-start'));
  document.body.style.backgroundImage='url(https://scene-delay.test/b.svg)';
 });
 result=await page.evaluate(()=>SonglineResources.scene({timeout:40}));assert.equal(result.scenePending,1);
 releaseA();await page.waitForTimeout(150);
 assert.equal(await page.evaluate(()=>document.documentElement.dataset.sceneState),'pending','Old scene completion cannot mark the new scene ready');
 releaseB();await page.waitForFunction(()=>document.documentElement.dataset.sceneState==='ready');
 assert(!await page.getByRole('status').isVisible(),'Late decoded scene clears pending notice');
 await page.evaluate(()=>{document.body.style.backgroundImage='url(https://scene-delay.test/a.svg)';return SonglineResources.scene();});
 assert.equal(calls.filter(url=>url.endsWith('/a.svg')).length,1,'Shared background warm-up survives navigation and is reused');
 await page.evaluate(()=>{document.body.style.backgroundImage='url(https://scene-delay.test/error.svg)';return SonglineResources.scene();});
 assert.equal(await page.evaluate(()=>document.documentElement.dataset.sceneState),'error');
 assert(await page.getByRole('button',{name:'重试',exact:true}).isVisible());
 fail=false;await page.getByRole('button',{name:'重试',exact:true}).click();
 await page.waitForFunction(()=>document.documentElement.dataset.sceneState==='ready');
 assert(!await page.getByRole('status').isVisible());
 await page.evaluate(()=>{
  document.body.style.backgroundImage='url(https://scene-delay.test/late.svg)';
  const timeout=window.setTimeout;
  window.setTimeout=(fn,ms,...args)=>timeout(fn,ms===30000?50:ms,...args);
  window.lateSceneTask=SonglineResources.scene({timeout:100});
  window.setTimeout=timeout;
 });
 await page.evaluate(()=>lateSceneTask);
 assert.equal(await page.evaluate(()=>document.documentElement.dataset.sceneState),'error');
 releaseLate();await page.waitForFunction(()=>document.documentElement.dataset.sceneState==='ready');
 assert(!await page.getByRole('status').isVisible(),'A response after the observation deadline also clears the notice');
 console.log('PASS critical timeout, late recovery, stale scene protection, shared warm-up and explicit retry');
 await context.close();
}
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'}),report=[];
 try{
  if(builds.before&&runPhase('comparison')){
   for(const boot of [false,true]){
    const f=await fixture(browser,{mode:'before',width:1440,boot,reduced:false});
    await f.page.goto(base+'/',{waitUntil:'domcontentloaded'});await f.page.waitForTimeout(3100);
    const state=await f.page.evaluate(()=>({decoded:[...decodedScenes],report:SonglineResources.lastReport,booting:document.documentElement.classList.contains('is-booting')}));
    assert.equal(state.booting,false);assert.equal(state.decoded.length,0);assert(state.report.pending>0);
    report.push({baseline:true,boot,...state});console.log('REPRODUCED old reveal before background, first boot:',boot);
    f.release();await f.context.close();
   }
   const f=await fixture(browser,{mode:'before',width:1440,theme:'light',slow:false});
   await f.page.goto(base+'/friends/',{waitUntil:'domcontentloaded'});await ready(f.page,'/friends/');
   await f.page.evaluate(()=>SonglinePageTransition.navigateLink('/'));
   assert(f.requests.includes('/uploads/admin/background/qiandai-background-black.png'),'Baseline should reproduce the unwanted night-scene download');
   report.push({baseline:true,extraNightBackground:true});console.log('REPRODUCED unused night background on returning from friends');await f.context.close();
  }
  if(builds.before&&runPhase('comparison'))for(const width of [390,1440])for(const theme of ['light','dark'])for(const route of ['/','/posts/','/tools/','/friends/']){
   const geometries=[];
   for(const mode of ['before','after']){
    const f=await fixture(browser,{mode,width,theme,slow:false});
    await f.page.goto(base+route,{waitUntil:'domcontentloaded'});await ready(f.page,route);await f.page.mouse.move(0,0);await f.page.waitForTimeout(250);
    geometries.push(await f.page.evaluate(()=>[...document.querySelectorAll('.site-bg-layer,.site-header,main.container,.songline-terminal-frame,.content-archive,.friends-constellation,.tools-excavation')].map(node=>{const rect=node.getBoundingClientRect();return [node.className,...['x','y','width','height'].map(key=>Math.round(rect[key]*10)/10)];})));
    assert.deepEqual(f.errors,[]);await f.context.close();
   }
   assert.deepEqual(geometries[1],geometries[0],'Stable scene layout unchanged: '+width+' '+theme+' '+route);
  }
  if(runPhase('cold'))for(const width of [390,1440])for(const theme of ['light','dark']){
   for(const route of ['/','/posts/','/posts/linux-note/','/tags/site-notice/','/tools/','/tools/random-number/','/friends/','/friends/memories/']){
    const f=await fixture(browser,{width,theme});
    await f.page.goto(base+route,{waitUntil:'domcontentloaded'});await f.page.evaluate(()=>SonglinePageModules.ready(document));
    // On representative pages wait longer than the former secondary-media budget.
    await f.page.waitForTimeout(['/','/posts/','/tools/'].includes(route)?1450:100);
    assert(await f.page.evaluate(()=>document.documentElement.classList.contains('is-scene-preparing')),'Cold direct entry remains covered: '+route);
    assert.equal(await f.page.evaluate(()=>decodedScenes.size),0);
    const expected=await backgroundPaths(f.page);
    const preloads=await f.page.locator('[data-scene-preload]').evaluateAll(nodes=>nodes.map(node=>new URL(node.href).pathname).sort());
    assert.deepEqual(preloads,expected,'Preload only the actual selected scene');
    assert.deepEqual([...new Set(f.requests.filter(url=>url.includes('/uploads/admin/background/')))].sort(),expected,'Do not fetch hidden or opposite-theme backgrounds');
    f.release();await ready(f.page,route);const state=await assertScene(f.page);
    assert(!await f.page.locator('.songline-scene-status:visible').count());assert.deepEqual(f.errors,[]);
    if(route==='/')await f.page.screenshot({path:path.join(out,`home-${width}-${theme}.png`)});
    report.push({width,theme,route,...state});console.log('PASS cold scene',width,theme,route);await f.context.close();
   }
  }
  if(runPhase('entry'))for(const width of [390,1440]){
   const f=await fixture(browser,{width,theme:'dark',boot:true,reduced:false});
   await f.page.goto(base+'/',{waitUntil:'domcontentloaded'});await f.page.waitForTimeout(3100);
   assert(await f.page.evaluate(()=>document.documentElement.classList.contains('is-booting')),'First boot does not finish while the background is pending');
   f.release();await ready(f.page,'/');await assertScene(f.page);assert.deepEqual(f.errors,[]);
   console.log('PASS first boot waits for scene',width);await f.context.close();
  }
  if(runPhase('entry'))for(const reduced of [false,true]){
   const f=await fixture(browser,{width:390,theme:'light',handoff:true,reduced});
   await f.page.goto(base+'/posts/',{waitUntil:'domcontentloaded'});await f.page.waitForTimeout(1450);
   assert(await f.page.evaluate(()=>document.documentElement.classList.contains('is-scene-preparing')||document.documentElement.classList.contains('document-arriving')));
   if(!reduced)assert(await f.page.evaluate(()=>{
    const cover=getComputedStyle(document.documentElement,'::after');
    return parseFloat(cover.width)>=innerWidth&&parseFloat(cover.height)>=innerHeight;
   }),'Document handoff cover must not inherit entry-spinner dimensions');
   f.release();await ready(f.page,'/posts/');await assertScene(f.page);assert.deepEqual(f.errors,[]);
   console.log('PASS document handoff waits for scene, reduced:',reduced);await f.context.close();
  }
  // A new page/target theme must wait; cached scenes should need no cold delay.
  if(runPhase('dynamic'))for(const width of [390,1440]){
   const f=await fixture(browser,{width,theme:'light',slow:false,reduced:false});
   await f.page.goto(base+'/friends/',{waitUntil:'domcontentloaded'});await ready(f.page,'/friends/');
   for(let cycle=0;cycle<2;cycle++)for(const route of ['/','/posts/','/tools/','/tools/random-number/','/friends/memories/','/friends/']){
    await f.page.mouse.move(0,0);
    const start=Date.now();await f.page.evaluate(route=>SonglinePageTransition.navigateLink(route),route);await ready(f.page,route);await assertScene(f.page);
    assert.equal(await f.page.locator('[data-elevator-nav]').count(),1);
    if(route==='/')assert(!f.requests.includes('/uploads/admin/background/qiandai-background-black.png'),'Leaving friends restores the target theme before requesting its background');
    if(cycle)assert(Date.now()-start<2200,'Warm navigation should not gain a fixed scene delay');
   }
   // Block only the next theme's home image, not the already loaded night sky.
   await f.page.evaluate(()=>SonglinePageTransition.navigateLink('/'));
   let releaseTheme;const themeGate=new Promise(resolve=>releaseTheme=resolve);
   await f.page.route('**/qiandai-background-black.png',async route=>{await themeGate;return route.fulfill({body:fs.readFileSync(path.join(repo,'static/uploads/admin/background/qiandai-background-black.png')),contentType:'image/png'});});
   await f.page.locator('[data-theme-toggle]').click();await f.page.waitForTimeout(1500);
   assert(await f.page.locator('.songline-theme-transition').count());
   assert(!await f.page.locator('.songline-theme-transition').evaluate(node=>node.classList.contains('is-leaving')),'Theme curtain cannot leave on the old fixed timer');
   releaseTheme();await f.page.locator('.songline-theme-transition').waitFor({state:'detached'});await assertScene(f.page);
   assert.equal(await f.page.evaluate(()=>document.documentElement.dataset.theme),'dark');assert.deepEqual(f.errors,[]);
   report.push({width,navigation:true,themeSwitch:true});console.log('PASS round trip, warm navigation and delayed theme switch',width);await f.context.close();
  }
  if(runPhase('synthetic')||phase==='dynamic')await syntheticCases(browser);
 }finally{fs.writeFileSync(path.join(out,phase==='all'?'report.json':phase+'-report.json'),JSON.stringify(report,null,2));await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
