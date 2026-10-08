// Same-content, local-only lifecycle audit; no real clipboard writes or uploads.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const repo=path.resolve(__dirname,'..'),base='http://lifecycle-cleanup.test';
const builds={after:path.resolve(process.env.BLOG_UI_BUILD||'')};
if(process.env.BLOG_UI_BASELINE)builds.before=path.resolve(process.env.BLOG_UI_BASELINE);
for(const build of Object.values(builds))assert(fs.existsSync(path.join(build,'index.html')),'Provide a fresh Hugo build');
const out=path.join(repo,'local-only/multi-cleanup-batch-2-2026-10-08');fs.mkdirSync(out,{recursive:true});
const results=[],svg='<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100"><rect width="160" height="100" fill="#607d8b"/></svg>';
async function fixture(browser,build,width){
 const context=await browser.newContext({viewport:{width,height:900},isMobile:width<981,hasTouch:width<981,reducedMotion:'reduce'});
 await context.route('**/*',route=>{
  const u=new URL(route.request().url());
  if(u.origin!==base||u.pathname.startsWith('/uploads/'))return route.fulfill({body:svg,contentType:'image/svg+xml'});
  if(u.pathname.includes('/api/'))return route.fulfill({json:{views:83,messages:[],items:[],scores:[]}});
  const root=u.pathname.startsWith('/static/')?path.join(repo,'web/static'):build;
  const file=path.resolve(root,decodeURIComponent(u.pathname.replace(/^\/static\//,'/').slice(1))+(u.pathname.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
  return route.fulfill({body:fs.readFileSync(file),contentType:({'.html':'text/html','.css':'text/css','.js':'application/javascript','.json':'application/json','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream'});
 });
 await context.addInitScript(()=>{
  localStorage.setItem('songline-theme','dark');sessionStorage.setItem('songline-home-boot-v21.4','1');
  localStorage.setItem('songline-privacy-v1',JSON.stringify({version:1,statistics:false,expires:Date.now()+86400000}));
  window.lifecycleAudit={codeListeners:0,scrollQueries:0,copies:[],feedbackTimers:new Set()};
  const add=EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener=function(type,...args){if(type==='click'&&this instanceof Element&&this.matches('.md-code-copy'))lifecycleAudit.codeListeners++;return add.call(this,type,...args);};
  const query=Document.prototype.querySelector;
  Document.prototype.querySelector=function(selector){if(selector.includes('.songline-reading-float-button'))lifecycleAudit.scrollQueries++;return query.call(this,selector);};
  const timer=window.setTimeout,clear=window.clearTimeout;
  window.setTimeout=function(fn,delay,...args){let id=timer.call(window,()=>{lifecycleAudit.feedbackTimers.delete(id);fn(...args);},delay);if(delay===1400&&new Error().stack.includes('markdown-code-tools'))lifecycleAudit.feedbackTimers.add(id);return id;};
  window.clearTimeout=function(id){lifecycleAudit.feedbackTimers.delete(id);return clear.call(window,id);};
  Object.defineProperty(window,'isSecureContext',{configurable:true,get:()=>true});
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText(text){return new Promise((resolve,reject)=>lifecycleAudit.copies.push({text,resolve,reject}));}}});
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));return {context,page,errors};
}
async function ready(page,route){
 await page.waitForFunction(route=>location.pathname===route&&!document.documentElement.classList.contains('songline-page-transitioning')&&!document.documentElement.classList.contains('is-scene-preparing'),route);
 await page.evaluate(()=>SonglinePageModules.ready(document));
}
async function navigate(page,route){await page.evaluate(route=>SonglinePageTransition.navigateLink(route),route);await ready(page,route);}
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--mute-audio']});
 try{
  for(const width of [1440,390])for(const [mode,build] of Object.entries(builds)){
   const {context,page,errors}=await fixture(browser,build,width);
   await page.goto(base+'/tools/markdown-previewer/');await ready(page,'/tools/markdown-previewer/');
   const markdown='# 性能回归\n\n'+Array.from({length:200},(_,i)=>'## 章节 '+i+'\n\n```js\nconst n = '+i+';\n```').join('\n\n');
   await page.locator('[data-md-file]').setInputFiles({name:'many-blocks.md',mimeType:'text/markdown',buffer:Buffer.from(markdown)});
   await page.waitForFunction(()=>document.querySelectorAll('.md-code-copy').length===200);
   await page.evaluate(()=>SonglineEnhanceMarkdown(document));assert.equal(await page.locator('.md-code-copy').count(),200);
   const codeListeners=await page.evaluate(()=>lifecycleAudit.codeListeners);
   await page.locator('.md-code-copy').first().click();
   assert.equal(await page.evaluate(()=>lifecycleAudit.copies.at(-1).text),'const n = 0;');
   await page.evaluate(()=>lifecycleAudit.copies.at(-1).resolve());await page.locator('.md-code-copy').first().filter({hasText:'已复制'}).waitFor();
   await page.evaluate(()=>window.dispatchEvent(new Event('songline:page-transition-start')));
   const feedbackTimers=await page.evaluate(()=>lifecycleAudit.feedbackTimers.size);
   await page.locator('.md-code-copy').nth(1).evaluate(e=>e.click());
   await navigate(page,'/tools/');
   await page.evaluate(()=>lifecycleAudit.copies.at(-1).resolve());await page.waitForTimeout(80);
   const lateFeedbackTimers=await page.evaluate(()=>lifecycleAudit.feedbackTimers.size);
   await page.evaluate(()=>lifecycleAudit.scrollQueries=0);
   await page.evaluate(async()=>{for(let i=0;i<12;i++){window.dispatchEvent(new Event('scroll'));await new Promise(requestAnimationFrame);}});
   const scrollQueries=await page.evaluate(()=>lifecycleAudit.scrollQueries);
   await navigate(page,'/');await page.waitForFunction(()=>!!window.__songlineHomeRecommendationsCleanup);
   // Only a persisted pagehide should pause, not destroy, the existing carousel.
   const beforeCache=await page.evaluate(()=>!!window.__songlineHomeRecommendationsCleanup);
   await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
   const survivesCache=await page.evaluate(()=>!!window.__songlineHomeRecommendationsCleanup);
   await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
   const indicators=await page.locator('[data-home-recommend-indicator]').count();
   if(indicators>1){await page.locator('[data-home-recommend-indicator]').nth(1).evaluate(e=>e.click());await page.waitForFunction(()=>document.querySelectorAll('[data-home-recommendation-card]')[1].classList.contains('is-active'));}
   assert(beforeCache);
   if(mode==='after'){assert.equal(codeListeners,0);assert.equal(feedbackTimers,0);assert.equal(lateFeedbackTimers,0);assert.equal(scrollQueries,0);assert(survivesCache);}
   assert.deepEqual(errors,[]);const stats={mode,width,codeListeners,feedbackTimers,lateFeedbackTimers,scrollQueries,survivesCache};results.push(stats);console.log('PASS',JSON.stringify(stats));await context.close();
  }
 }finally{fs.writeFileSync(path.join(out,'lifecycle-report.json'),JSON.stringify(results,null,2));await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
