const assert=require('node:assert/strict');
const {launch,fixture,ready}=require('./helpers/interaction-fixture.cjs');
const build=process.env.BLOG_ARTICLE_PRESENTATION_BUILD||'local-only/article-typing-archive-return-2026-10-10/build';
const out=process.env.BLOG_ARTICLE_PRESENTATION_OUT||'local-only/article-typing-archive-return-2026-10-10';
(async()=>{const browser=await launch();try{for(const width of [1440,390]){
 const f=await fixture(browser,build,{width});try{
  await f.page.route('**/posts/linux-note/',async route=>{const response=await route.fetch();const html=(await response.text()).replace(/(<span[^>]*data-article-summary-source[^>]*>)[\s\S]*?(<\/span>)/,'$1四字简介$2');await route.fulfill({response,body:html});});
  await ready(f.page,f.origin,'/posts/linux-note/');await f.page.locator('[data-article-summary]').scrollIntoViewIfNeeded();
  await f.page.waitForFunction(()=>document.querySelector('[data-article-summary]').dataset.summaryState==='typing');
  const started=Date.now();await f.page.waitForTimeout(2000);
  assert.equal(await f.page.locator('[data-article-summary]').getAttribute('data-summary-state'),'typing','Four-character summary remains animated after 2 seconds');
  const typed=await f.page.locator('.article-heading__summary-visual').textContent();assert(typed.length>0 && typed.length<4,'Partial text is actually visible');
  assert(await f.page.locator('.article-heading__cursor').isVisible());
  await f.page.waitForTimeout(1300);assert((await f.page.locator('.article-heading__summary-visual').textContent()).length>typed.length,'Typing advances gradually over several seconds');
  assert.equal(await f.page.locator('[data-article-summary-source]').evaluate(n=>getComputedStyle(n).opacity),'0');
  await f.page.screenshot({path:`${out}/short-typing-${width}.png`});
  await f.page.waitForFunction(()=>document.querySelector('[data-article-summary]').dataset.summaryState==='complete');
  assert(Date.now()-started>=3900,'Short text cannot finish in the old 600ms budget');
  assert.equal(await f.page.locator('[data-article-summary-source]').innerText(),'四字简介');
  await f.page.evaluate(()=>SonglinePageTransition.navigateLink('/posts/'));
  await f.page.waitForFunction(()=>location.pathname==='/posts/'&&!document.documentElement.classList.contains('songline-page-transitioning'));
  await f.page.evaluate(()=>SonglinePageTransition.navigateLink('/posts/linux-note/'));
  await f.page.waitForFunction(()=>location.pathname==='/posts/linux-note/'&&!document.documentElement.classList.contains('songline-page-transitioning'));
  await f.page.locator('[data-article-summary]').scrollIntoViewIfNeeded();
  await f.page.waitForFunction(()=>document.querySelector('[data-article-summary]').dataset.summaryState==='typing');
  await f.page.waitForTimeout(2000);
  assert.equal(await f.page.locator('[data-article-summary]').getAttribute('data-summary-state'),'typing','AJAX entry uses the same slow pace');
  await f.page.emulateMedia({reducedMotion:'reduce'});
  await f.page.waitForFunction(()=>document.querySelector('[data-article-summary]').dataset.summaryState==='complete');
  assert.equal(await f.page.locator('.article-heading__summary-visual').count(),0,'Motion preference still stops and releases the slower task');
  assert.deepEqual(f.errors,[]);console.log('PASS visible short typing, AJAX and reduced motion',width);
 }finally{await f.close();}
}}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
