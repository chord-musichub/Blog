const assert=require('node:assert/strict'),fs=require('node:fs');
const {launch,fixture,ready}=require('./helpers/interaction-fixture.cjs');
const build=process.env.BLOG_ARTICLE_ALBUM_BUILD||'local-only/article-album-2026-10-10/build';
const out=process.env.BLOG_ARTICLE_ALBUM_OUT||'local-only/article-album-2026-10-10';
(async()=>{fs.mkdirSync(out,{recursive:true});const browser=await launch(),results=[];
try{for(const width of [1440,390,320])for(const theme of ['dark','light']){
 const f=await fixture(browser,build,{width,theme,reduced:true});const {page}=f;
 try{
  for(const shape of ['landscape','portrait','panorama']){
   await ready(page,f.origin+'/','posts/album-'+shape+'/');
   await page.waitForFunction(()=>document.querySelector('[data-cover-state]').dataset.coverState==='ready');
   const layout=await page.evaluate(()=>{
    const cover=document.querySelector('.article-heading__cover'),image=cover.querySelector('img'),main=document.querySelector('.article-heading__main'),byline=main.querySelector('.article-heading__byline'),title=main.querySelector('h1'),summary=main.querySelector('[data-article-summary]'),reader=document.querySelector('.article-reader'),divider=document.querySelector('.article-reading-divider');
    const box=n=>{const b=n.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height,bottom:b.bottom};};
    const style=n=>{const s=getComputedStyle(n);return {background:s.backgroundImage,color:s.color,border:s.borderTopWidth,shadow:s.boxShadow,display:s.display,font:s.fontSize};};
    return {divider:box(divider),dividerStyle:style(divider),footer:box(main.querySelector('.article-heading__footer')),image:box(image),cover:box(cover),main:box(main),byline:box(byline),title:box(title),summary:box(summary),reader:box(reader),natural:[image.naturalWidth,image.naturalHeight],titleStyle:style(title),headingStyle:style(document.querySelector('.article-heading')),readerStyle:style(reader),bylineStyle:style(byline),overflow:document.documentElement.scrollWidth>innerWidth};
   });
   assert(Math.abs(layout.image.width/layout.image.height-layout.natural[0]/layout.natural[1])<.01,'Cover retains original proportions');
   assert(layout.image.height<=(width<601?450:520)+1,'Height respects album limit');
   assert(Math.abs((layout.cover.width-layout.image.width)/2-(layout.image.x-layout.cover.x))<1,'Portrait and small covers are centered');
   assert(layout.image.bottom<=layout.main.y+1,'Image is separate from text');
   assert(Math.abs(layout.main.y-layout.cover.bottom-(width<601?20:28))<1,'Cover-to-text gap follows the spec');
   assert(layout.byline.bottom<=layout.title.y+1 && layout.title.bottom<=layout.summary.y+1,'Byline, title, summary follow the intended order');
   assert.equal(layout.dividerStyle.border,'2px','Introduction and body have a visible separator');
   assert(layout.footer.bottom<layout.divider.y && layout.divider.bottom<layout.reader.y,'Separator sits between introduction and body');
   assert(Math.abs(layout.divider.x-layout.reader.x)<1 && Math.abs(layout.divider.width-layout.reader.width)<1,'Separator follows the reading axis');
   for(const b of [layout.byline,layout.summary,layout.reader])assert(Math.abs(layout.title.x-b.x)<1,'Text and body share a left edge');
   for(const s of [layout.headingStyle,layout.readerStyle]){assert.equal(s.background,'none');assert.equal(s.border,'0px');assert.equal(s.shadow,'none');}
   assert.equal(layout.titleStyle.font,width<601?'26px':'32px');assert.equal(layout.bylineStyle.display,'flex');assert.equal(layout.overflow,false);
   // History data retains cover mode; this detail view still shows the full photo.
   assert.equal(await page.locator('.article-heading__cover img').evaluate(n=>getComputedStyle(n).objectFit),'contain');
   for(const language of ['en','zh']){
    await page.evaluate(language=>SonglineI18n.setLanguage(language),language);
    await page.locator('.article-heading h1').evaluate(n=>n.textContent='A very long article title · '+('文字与风景相遇 '.repeat(12)));
    await page.locator('.article-heading__byline .meta-icon-item').last().evaluate(n=>n.textContent='很长的作者名称_'+('songline'.repeat(14)));
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Long title/author cannot overflow in either language');
   }
   // Return to original data for reviewable screenshots.
   await ready(page,f.origin+'/','posts/album-'+shape+'/');
   await page.screenshot({path:`${out}/album-${shape}-${width}-${theme}.png`,fullPage:false});
   if(shape==='landscape'){
    const download=page.locator('[data-md-download]');const waiting=page.waitForEvent('download');await download.click();await waiting;assert.equal(await download.locator('svg').count(),1,'Download icon survives transient status');
    assert.equal(await download.locator('[data-md-download-label]').innerText(),'下载 .md');
    if(width>980){await page.locator('.toc-tree a').last().click();await page.waitForFunction(()=>location.hash.length>1);await page.waitForFunction(()=>{const y=document.querySelector('.article-reader h2').getBoundingClientRect().y;return y>60&&y<150;});await page.locator('.toc-head').click();assert.equal(await page.locator('.article-shell').getAttribute('data-toc-state'),'collapsed');await page.locator('.toc-head').click();}
    else{await page.locator('#songline-mobile-toc-fab').click();assert.equal(await page.locator('.mobile-toc-item').count(),2);await page.locator('.mobile-toc-item').last().click();assert(!(await page.locator('html').getAttribute('class')).includes('mobile-toc-open'));}
   }
   results.push({width,theme,shape,passed:true,layout});
  }
  // Failure remains readable and switchable; retrying a valid source restores the photo.
  await page.evaluate(()=>document.querySelector('.article-heading__cover img').src='/album-missing.svg');await page.waitForFunction(()=>document.querySelector('[data-cover-state]').dataset.coverState==='error');
  assert(await page.locator('.article-heading__cover-error').isVisible());await page.evaluate(()=>SonglineI18n.setLanguage('en'));assert.equal(await page.locator('.article-heading__cover-error').innerText(),'Image unavailable');
  assert(await page.locator('.article-heading h1').isVisible());await page.evaluate(()=>document.querySelector('.article-heading__cover img').src='/album-portrait.svg');await page.waitForFunction(()=>document.querySelector('[data-cover-state]').dataset.coverState==='ready');
  // Scope guard: Markdown preview keeps its own card and no album marker.
  await ready(page,f.origin+'/','tools/markdown-previewer/');assert.equal(await page.locator('[data-article-layout="album"]').count(),0);
  assert.equal(await page.locator('[data-md-preview]').evaluate(n=>getComputedStyle(n).borderTopWidth),'1px','Standalone preview keeps its card border');
  assert.deepEqual(f.errors,[]);console.log('PASS album',width,theme);
 }finally{await f.close();}
}
// Slow image: native event handlers preserve a visible loading state, then show original proportions.
const slow=await fixture(browser,build,{width:390,reduced:true});try{
 await ready(slow.page,slow.origin+'/','posts/album-landscape/');let release,blockedReady;const blocked=new Promise(resolve=>blockedReady=resolve);await slow.page.route('**/album-slow.svg',route=>new Promise(resolve=>{release=async()=>{await route.continue();resolve();};blockedReady();}));
 await slow.page.evaluate(()=>{const figure=document.querySelector('[data-cover-state]');figure.dataset.coverState='loading';figure.querySelector('img').src='/album-slow.svg';});
 await slow.page.waitForFunction(()=>document.querySelector('[data-cover-state]').dataset.coverState==='loading');assert(await slow.page.locator('.article-heading__cover-loading').isVisible());assert((await slow.page.locator('.article-heading__cover').boundingBox()).height>=160);await slow.page.waitForFunction(()=>document.querySelector('.article-heading__cover img').src.endsWith('album-slow.svg'));
 await blocked;await release();await slow.page.waitForFunction(()=>document.querySelector('[data-cover-state]').dataset.coverState==='ready');assert.deepEqual(slow.errors,[]);
}finally{await slow.close();}
fs.writeFileSync(out+'/album-results.json',JSON.stringify(results,null,2));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
