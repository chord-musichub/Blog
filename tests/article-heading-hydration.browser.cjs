const assert=require('node:assert/strict');
const {launch,fixture,ready}=require('./helpers/interaction-fixture.cjs');
const build=process.env.BLOG_ARTICLE_PRESENTATION_BUILD||'local-only/article-trigger-fix-2026-10-10/build';
async function settle(page,path){await page.waitForFunction(path=>location.pathname===path&&!document.documentElement.classList.contains('songline-page-transitioning'),path);}
(async()=>{const browser=await launch();try{for(const width of [1440,390]){
 const f=await fixture(browser,build,{width});const {page}=f;
 let release,requested;function reset(){requested=new Promise(resolve=>{f.sourceRequested=resolve;});release=null;}
 await page.route('**/article-source-fixture.md',route=>new Promise(resolve=>{release=async()=>{await route.continue();resolve();};f.sourceRequested();}));
 try{for(const entry of ['direct','ajax']){
  reset();
  if(entry==='direct')await ready(page,f.origin,'/posts/linux-note/');
  else{await page.evaluate(()=>SonglinePageTransition.navigateLink('/posts/'));await settle(page,'/posts/');await page.evaluate(()=>SonglinePageTransition.navigateLink('/posts/linux-note/'));await settle(page,'/posts/linux-note/');}
  await requested;await page.locator('[data-article-summary]').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>document.querySelector('[data-article-summary]').dataset.summaryState==='typing');
  await release();
  await page.evaluate(()=>document.querySelector('.article-reader').songlineRenderReady);
  // Await the exact reader-only scan used by asynchronous production rendering.
  await page.evaluate(()=>SonglinePageModules.ready(document.querySelector('.article-reader')));
  assert.equal(await page.locator('[data-article-summary]').getAttribute('data-summary-state'),'typing','Reader hydration must not finish the heading animation');
  assert.equal(await page.locator('.article-heading__summary-visual').count(),1);
  await page.waitForFunction(()=>document.querySelector('.article-heading__summary-visual')?.textContent.length>0);
  const typed=await page.locator('.article-heading__summary-visual').textContent(),source=await page.locator('[data-article-summary-source]').textContent();
  assert(typed.length<source.length);assert.equal(await page.locator('[data-article-summary-source]').evaluate(n=>getComputedStyle(n).opacity),'0');
  await page.evaluate(()=>SonglinePageModules.ready(document.querySelector('.article-reader')));
  assert.equal(await page.locator('.article-heading__summary-visual').count(),1,'Repeated body scans reuse the live heading');
  console.log('PASS delayed Markdown heading',width,entry);
 }
 assert.deepEqual(f.errors,[]);
 }finally{await f.close();}
}}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
