const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=process.env.BLOG_TEST_URL||'http://127.0.0.1:8080';
const build=process.env.BLOG_READER_BUILD;
const out='local-only/reader-layout';
fs.mkdirSync(out,{recursive:true});

(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try {
  for(const [width,theme,height=900] of [[1440,'dark'],[1440,'light'],[1024,'dark'],[1024,'dark',500],[820,'dark'],[390,'dark'],[390,'light']]) {
   const page=await browser.newPage({viewport:{width,height},hasTouch:width<=820,isMobile:width<=820});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(theme=>{localStorage.setItem('songline-theme',theme);localStorage.setItem('songline-toc-state','expanded');},theme);
   await page.route('**/api/views?**',route=>route.fulfill({json:{views:83}}));
   if(build) await page.route('**/posts/c-note/',route=>route.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(build,'posts/c-note/index.html'))}));
   await page.goto(base+'/posts/c-note/');
   await page.waitForSelector('.article-heading');
   assert.equal(await page.locator('.article-heading__eyebrow').count(),0,'ordinary articles have no NOTES eyebrow');
   await page.waitForFunction(()=>document.querySelector('[data-article-renderer]')?.dataset.songlineRenderSyncBound==='1');
   await page.waitForTimeout(600);
   const cover=await page.locator('.article-heading__cover').boundingBox();
   assert(cover.width<=241 && cover.height<=160,`cover stays compact: ${JSON.stringify(cover)}`);
   const size=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
   assert(size.scroll<=size.width+1,`no horizontal overflow: ${JSON.stringify(size)}`);
   await page.screenshot({path:`${out}/${width}-${height}-${theme}-intro.png`});
   // Tall and wide source images cannot enlarge the reserved cover area.
   for(const [w,h] of [[200,1600],[1600,200]]) {
    await page.locator('.article-heading__cover img').evaluate((img,{w,h})=>{img.src='data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="steelblue"/></svg>`);},{w,h});
    const next=await page.locator('.article-heading__cover').boundingBox();
    assert.equal(next.height,cover.height,'image dimensions cannot expand the header');
   }
   await page.locator('.article-heading__cover').evaluate(e=>e.classList.add('cover-mode-contain'));
   assert.equal(await page.locator('.article-heading__cover img').evaluate(e=>getComputedStyle(e).objectFit),'contain','contain preference is respected');
   // Generate a long directory after initialization, as asynchronous Markdown does.
   await page.evaluate(()=>{
    const reader=document.querySelector('[data-article-renderer]');
    const source=document.getElementById('article-md-source');
    delete reader.dataset.songlineRenderSyncBound;
    source.dataset.sourceUrl='';source.dataset.sourceFormat='text';
    source.textContent=JSON.stringify(Array.from({length:55},(_,i)=>`## 章节 ${i+1}\n\n${'长文阅读测试。'.repeat(50)}\n\n`).join(''));
    const script=document.createElement('script');script.src='/js/article-render-sync.js?reader-test';document.body.appendChild(script);
   });
   await page.waitForFunction(()=>document.querySelectorAll('.toc-tree a').length===55);
   if(width>980) {
    const shellTop=await page.locator('.article-shell').evaluate(e=>e.getBoundingClientRect().top+scrollY);
    for(const delta of [200,1300,3100]) {
     await page.evaluate(y=>scrollTo({top:y,behavior:'instant'}),shellTop+delta);
     await page.waitForTimeout(100);
     const toc=await page.locator('.article-toc').boundingBox();
     assert(Math.abs(toc.y-96)<2,`TOC follows viewport at ${width}, scroll ${delta}: ${JSON.stringify(toc)}`);
     assert(toc.y+toc.height<=height-20,'directory fits the screen');
    }
    const before=await page.evaluate(()=>scrollY);
    await page.locator('.article-toc .toc-body').evaluate(e=>e.scrollTop=300);
    assert(await page.locator('.article-toc .toc-body').evaluate(e=>e.scrollTop)>200,'long TOC scrolls internally');
    assert.equal(await page.evaluate(()=>scrollY),before,'TOC scrolling preserves article position');
    await page.screenshot({path:`${out}/${width}-${height}-${theme}-reading.png`});
    await page.locator('.toc-head').click();
    assert.equal(await page.locator('.article-shell').getAttribute('data-toc-state'),'collapsed');
    assert(Math.abs((await page.locator('.article-toc').boundingBox()).y-96)<2,'collapsed directory also follows');
    await page.locator('.toc-head').click();
    await page.locator('.toc-tree a').nth(30).click();
    await page.waitForTimeout(700);
    assert(decodeURIComponent(new URL(page.url()).hash).includes('章节-31'),'directory anchors still navigate');
    await page.evaluate(()=>{const e=document.querySelector('.article-shell');scrollTo({top:e.getBoundingClientRect().bottom+scrollY-180,behavior:'instant'});});
    const bottom=await page.locator('.article-shell').evaluate(e=>e.getBoundingClientRect().bottom);
    const toc=await page.locator('.article-toc').boundingBox();
    assert(toc.y+toc.height<=bottom+2,'directory stops at article end');
   } else {
    await page.evaluate(()=>scrollTo({top:1800,behavior:'instant'}));
    const fab=page.locator('#songline-mobile-toc-fab');
    await fab.click();
    assert.equal(await page.locator('.mobile-toc-item').count(),55,'mobile drawer still follows late-rendered headings');
    await page.locator('.mobile-toc-item').nth(5).click();
    await page.waitForTimeout(700);
    assert(!(await page.locator('html').getAttribute('class')).includes('mobile-toc-open'),'mobile drawer closes after navigating');
   }
   assert.deepEqual(errors,[]);
   console.log(`PASS ${width}x${height} ${theme}: compact cover, article metadata, sticky/scrollable TOC, collapse and anchors`);
   await page.close();
  }
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
