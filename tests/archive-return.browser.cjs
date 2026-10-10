const assert=require('node:assert/strict');
const {launch,fixture,ready}=require('./helpers/interaction-fixture.cjs');
const build=process.env.BLOG_ARTICLE_PRESENTATION_BUILD||'local-only/article-typing-archive-return-2026-10-10/build';
async function settled(page,path){await page.waitForFunction(path=>location.pathname===path&&!document.documentElement.classList.contains('songline-page-transitioning'),path);}
async function checkDrawer(page,href){
 assert.equal(await page.locator('.archive-record.is-open').count(),1);
 assert.equal(await page.locator('.archive-record.is-open a.archive-record__detail--open').getAttribute('href'),href);
 assert.equal(await page.locator('.archive-record.is-open [data-archive-trigger]').getAttribute('aria-expanded'),'true');
 assert.equal(await page.locator('.archive-record.is-open [data-archive-drawer]').evaluate(n=>n.inert),false);
 assert.equal(await page.evaluate(()=>history.state.testArchiveMarker),'preserved');
 assert.equal(new URL(page.url()).searchParams.get('article_page'),'2');
}
(async()=>{const browser=await launch();try{for(const width of [1440,390]){
 const f=await fixture(browser,build,{width,reduced:true});const {page}=f;
 try{
  await ready(page,f.origin,'/posts/?article_page=2&q=测试');
  assert.equal(await page.locator('.archive-record.is-open').count(),0,'Fresh archive starts collapsed');
  await page.evaluate(()=>history.replaceState({...history.state,testArchiveMarker:'preserved'},'',location.href));
  const record=page.locator('[data-archive-panel="articles"] [data-archive-record]:not([hidden])').first();
  await record.locator('[data-archive-trigger]').click();
  const href=await record.locator('a.archive-record__detail--open').getAttribute('href');
  await record.locator('a.archive-record__detail--open').click();await settled(page,href);
  await page.locator('[data-back-icon]').click();await settled(page,'/posts/');await checkDrawer(page,href);
  for(let i=0;i<10;i++){
   await page.locator('.archive-record.is-open a.archive-record__detail--open').click();await settled(page,href);
   await page.goBack();await settled(page,'/posts/');await checkDrawer(page,href);
   if(i===0){await page.goForward();await settled(page,href);await page.goBack();await settled(page,'/posts/');await checkDrawer(page,href);}
  }
  await page.locator('.archive-record.is-open [data-archive-trigger]').focus();await page.keyboard.press('Escape');
  assert.equal(await page.locator('.archive-record.is-open').count(),0);assert.equal(await page.evaluate(()=>history.state.songlineArchiveDrawer.record),null);
  await page.evaluate(()=>SonglinePageTransition.navigateLink('/posts/linux-note/'));await settled(page,'/posts/linux-note/');await page.goBack();await settled(page,'/posts/');
  assert.equal(await page.locator('.archive-record.is-open').count(),0,'Manual close remains closed on return');
  // Reopening then changing page must discard the drawer instead of reopening
  // the row in the same position on another slice.
  await record.locator('[data-archive-trigger]').click();
  await page.locator('[data-archive-pagination="articles"] [data-archive-page="1"]').click();
  assert.equal(await page.locator('.archive-record.is-open').count(),0);assert.equal(await page.evaluate(()=>history.state.songlineArchiveDrawer.record),null);
  await page.evaluate(()=>SonglinePageTransition.navigateLink('/posts/linux-note/'));await settled(page,'/posts/linux-note/');await page.goBack();await settled(page,'/posts/');assert.equal(await page.locator('.archive-record.is-open').count(),0);
  assert.deepEqual(f.errors,[]);console.log('PASS archive return and 10 cycles',width);
 }finally{await f.close();}
}}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
