const assert=require('node:assert/strict'),fs=require('node:fs');
const {launch,fixture,ready}=require('./helpers/interaction-fixture.cjs');
const build=process.env.BLOG_ARTICLE_PRESENTATION_BUILD || 'local-only/article-album-2026-10-10/build';
const out=process.env.BLOG_ARTICLE_PRESENTATION_OUT || 'local-only/article-album-2026-10-10';
async function navigation(page,path){await page.evaluate(path=>SonglinePageTransition.navigateLink(path),path);await page.waitForFunction(()=>!document.documentElement.classList.contains('songline-page-transitioning'));}
(async()=>{fs.mkdirSync(out,{recursive:true});const browser=await launch(),results=[];
try{for(const [width,theme,reduced] of [[1440,'dark',false],[1440,'light',false],[390,'dark',false],[390,'light',false],[1440,'light',true],[390,'dark',true]]){
 const f=await fixture(browser,build,{width,theme,reduced});const {page}=f;
 try{
  await ready(page,f.origin,'/posts/linux-note/');
  const summary=page.locator('[data-article-summary]'),source=page.locator('[data-article-summary-source]');
  if(!reduced)await summary.scrollIntoViewIfNeeded();
  const original=await source.textContent(),before=await summary.boundingBox();
  assert(original.length>0);
  if(reduced){assert.equal(await summary.getAttribute('data-summary-state'),'complete');assert.equal(await page.locator('.article-heading__summary-visual').count(),0);}
  else{
   const overlay=page.locator('.article-heading__summary-visual');assert.equal(await overlay.getAttribute('aria-hidden'),'true');
   const partial=await overlay.textContent();assert(partial.length<original.length,'Visual layer starts with a partial summary');
   await page.waitForFunction(()=>document.querySelector('[data-article-summary]').dataset.summaryState==='complete',null,{timeout:45000});
   assert.equal(await page.locator('.article-heading__summary-visual').count(),0);
  }
  assert.equal(await source.textContent(),original,'Author summary is never rewritten');
  const after=await summary.boundingBox();assert(Math.abs(before.height-after.height)<1,'Typing cannot shift reserved summary height');
  const geometry=await page.evaluate(()=>{const card=document.querySelector('.article-heading'),cover=card.querySelector('figure'),main=card.querySelector('.article-heading__main');const a=card.getBoundingClientRect(),b=cover.getBoundingClientRect(),c=main.getBoundingClientRect();return {main:{y:c.y,height:c.height},card:{x:a.x,y:a.y,width:a.width,height:a.height},cover:{x:b.x,y:b.y,width:b.width,height:b.height},fit:getComputedStyle(cover.querySelector('img')).objectFit,title:getComputedStyle(card.querySelector('h1')).color,overflow:document.documentElement.scrollWidth>innerWidth};});
  assert(Math.abs(geometry.card.width-geometry.cover.width)<3,'Image fills the upper panel');assert(geometry.cover.y+geometry.cover.height<=geometry.main.y+1,'All text sits below the image');assert.equal(geometry.fit,'contain');assert.equal(geometry.title,theme==='dark'?'rgb(238, 244, 251)':'rgb(22, 45, 66)');assert.equal(geometry.overflow,false);
  const metaColors=await page.locator('.article-heading .meta-row span').evaluateAll(nodes=>nodes.map(n=>getComputedStyle(n).color));assert(metaColors.every(c=>c===(theme==='dark'?'rgb(192, 210, 229)':'rgb(72, 97, 118)')),'Metadata uses the lower panel theme');
  assert.equal(await page.locator('.article-heading .tag').first().evaluate(n=>getComputedStyle(n).color),theme==='dark'?'rgb(192, 210, 229)':'rgb(72, 97, 118)');
  for(const language of ['en','zh']){await page.evaluate(language=>SonglineI18n.setLanguage(language),language);const aligned=await page.locator('.article-heading .meta-row').first().evaluate(row=>{const r=row.getBoundingClientRect();return [...row.children].every(n=>{const b=n.getBoundingClientRect();return b.x>=r.x-1&&b.right<=r.right+1;});});assert(aligned,'Metadata stays within its panel in '+language);if(width<600){assert.equal(await page.locator('.article-heading .meta-row').first().evaluate(n=>getComputedStyle(n).display),'flex','Metadata wraps naturally on mobile');}}
  await page.screenshot({path:`${out}/article-${width}-${theme}-${reduced?'reduced':'motion'}.png`});
  for(const [w,h] of [[100,1600],[1600,100]]){
   await page.locator('.article-heading__cover img').evaluate((img,{w,h})=>img.src='data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="white"/></svg>`),{w,h});
   assert.equal((await summary.boundingBox()).height,after.height,'Wide and tall covers cannot move text');
  }
  await page.locator('.article-heading__cover').evaluate(n=>n.classList.add('cover-mode-cover'));assert.equal(await page.locator('.article-heading__cover img').evaluate(n=>getComputedStyle(n).objectFit),'contain');
  await page.locator('.article-heading__cover img').evaluate(n=>n.src='/missing-fixed-cover.png');assert(await page.locator('.article-heading h1').isVisible(),'Failed image leaves readable card');
  await navigation(page,'/posts/');const triggers=page.locator('[data-archive-panel="articles"] [data-archive-trigger]'),first=triggers.first(),record=page.locator('[data-archive-panel="articles"] [data-archive-record]').first();
  await first.hover();assert.equal(await first.getAttribute('aria-expanded'),'false','Hover does not open drawer');
  await first.focus();assert.equal(await first.getAttribute('aria-expanded'),'false','Focus alone does not open drawer');assert.equal(await record.locator('[data-archive-drawer]').evaluate(n=>n.inert),true);
  await page.keyboard.press('Enter');assert.equal(await first.getAttribute('aria-expanded'),'true');assert.equal(await record.locator('[data-archive-drawer]').evaluate(n=>n.inert),false);
  await page.mouse.move(0,0);await page.waitForTimeout(240);assert.equal(await first.getAttribute('aria-expanded'),'true','Moving away leaves clicked drawer open');
  await first.click();assert.equal(await first.getAttribute('aria-expanded'),'false','Second click closes it');
  await first.focus();await page.keyboard.press('Space');assert.equal(await first.getAttribute('aria-expanded'),'true');
  await triggers.nth(1).click();assert.equal(await first.getAttribute('aria-expanded'),'false');assert.equal(await page.locator('.archive-record.is-open').count(),1);
  await page.keyboard.press('Escape');assert.equal(await page.locator('.archive-record.is-open').count(),0);assert.equal(await triggers.nth(1).evaluate(n=>document.activeElement===n),true);
  await first.click();await page.waitForFunction(()=>getComputedStyle(document.querySelector('.archive-record.is-open .archive-record__detail')).opacity==='1');
  await record.locator('.archive-record__detail--open').click();await page.waitForFunction(()=>location.pathname.startsWith('/posts/')&&location.pathname!='/posts/'&&!document.documentElement.classList.contains('songline-page-transitioning'));
  await page.goBack();await page.waitForFunction(()=>location.pathname==='/posts/'&&!document.documentElement.classList.contains('songline-page-transitioning'));assert.equal(await page.locator('.archive-record.is-open').count(),1,'Returning restores the drawer explicitly opened before entering the article');assert.equal(await first.getAttribute('aria-expanded'),'true');assert.equal(await record.locator('[data-archive-drawer]').evaluate(n=>n.inert),false);
  await navigation(page,'/posts/linux-note/');assert.equal(await page.locator('.article-reading-divider').count(),1,'AJAX restores one separator');assert.equal(await page.locator('.article-reading-divider').evaluate(n=>getComputedStyle(n).borderTopWidth),'2px');await page.evaluate(()=>SonglineInitArticleHeading(document));assert((await page.locator('.article-heading__summary-visual').count())<=1,'Repeated initialization uses one animation');
  if(!reduced){await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>document.querySelector('[data-article-summary]').dataset.summaryState==='complete',null,{timeout:45000});assert.equal(await page.locator('.article-heading__summary-visual').count(),0,'Changing motion preference stops pending animation');}
  // Three complete AJAX round trips cannot retain overlays or active callbacks.
  for(let i=0;i<3;i++){await navigation(page,'/posts/');await navigation(page,'/posts/linux-note/');await page.locator('[data-article-summary]').scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.querySelector('[data-article-summary]').dataset.summaryState==='complete',null,{timeout:45000});assert.equal(await page.locator('.article-heading__summary-visual').count(),0);}
  assert.deepEqual(f.errors,[]);results.push({width,theme,reduced,passed:true,geometry});console.log('PASS',width,theme,reduced?'reduced':'motion');
 }finally{await f.close();}
}
// A short viewport used to consume the entire animation below the fold.
for(const width of [1440,390]){
 const f=await fixture(browser,build,{width});const {page}=f;
 try{
  await page.setViewportSize({width,height:width<600?400:600});
  await ready(page,f.origin,'/posts/linux-note/');
  await page.waitForTimeout(3500);
  assert.equal(await page.locator('[data-article-summary]').getAttribute('data-summary-state'),'waiting','Offscreen summary does not spend its animation');
  assert.equal(await page.locator('.article-heading__summary-visual').textContent(),'');
  const before=await page.locator('.article-reader').boundingBox();
  await page.locator('[data-article-summary]').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>document.querySelector('[data-article-summary]').dataset.summaryState==='typing');
  await page.waitForFunction(()=>document.querySelector('.article-heading__summary-visual').textContent.length>0);
  const part=await page.locator('.article-heading__summary-visual').textContent();
  assert(part.length<(await page.locator('[data-article-summary-source]').textContent()).length,'User sees partial typing with a cursor');
  await page.screenshot({path:`${out}/typing-${width}.png`});
  await page.waitForFunction(()=>document.querySelector('[data-article-summary]').dataset.summaryState==='complete',null,{timeout:45000});
  assert.equal((await page.locator('.article-reader').boundingBox()).height,before.height,'Typing leaves the body layout unchanged');
  // AJAX initialization must also wait until the restored summary is on screen.
  await navigation(page,'/posts/');await navigation(page,'/posts/linux-note/');
  assert.equal(await page.locator('[data-article-summary]').getAttribute('data-summary-state'),'waiting');
  await page.locator('[data-article-summary]').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>document.querySelector('[data-article-summary]').dataset.summaryState==='typing');
  await navigation(page,'/posts/');
  assert.equal(await page.locator('.article-heading__summary-visual').count(),0,'Departure disposes pending typing');
  await page.goBack();await page.waitForFunction(()=>location.pathname==='/posts/linux-note/'&&!document.documentElement.classList.contains('songline-page-transitioning'));
  await page.locator('[data-article-summary]').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>['typing','complete'].includes(document.querySelector('[data-article-summary]').dataset.summaryState));
  assert.deepEqual(f.errors,[]);console.log('PASS visible typing',width);
 }finally{await f.close();}
}
fs.writeFileSync(out+'/results.json' ,JSON.stringify(results,null,2));}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
