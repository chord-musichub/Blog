const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = process.env.BLOG_TEST_URL || 'http://127.0.0.1:8080';
const out = 'local-only/visual-bugs';
fs.mkdirSync(out, {recursive:true});
const markdown = '# Linux 系统学习\n\n## 系统安装及配置\n\n### 安装与下载\n\n#### 查看已经安装的软件以及版本信息\n\n#### 按名称查找软件包\n\n##### 第五级详细说明\n\n###### 第六级完整操作步骤\n\n' + '正文内容。\n\n'.repeat(60);

async function refreshArticle(page) {
 // Exercise late Markdown rendering after the mobile drawer has initialized.
 await page.evaluate(md => {
  const reader = document.querySelector('[data-article-renderer]');
  const source = document.getElementById('article-md-source');
  delete reader.dataset.songlineRenderSyncBound;
  source.dataset.sourceUrl = ''; source.dataset.sourceFormat = 'text';
  source.textContent = JSON.stringify(md);
  const script = document.createElement('script'); script.src = '/js/article-render-sync.js?regression'; document.body.appendChild(script);
 }, markdown);
 await page.waitForFunction(() => document.querySelector('.toc-tree .toc-level-6'));
}

(async () => {
 const browser = await chromium.launch({headless:true, channel:'msedge'});
 try {
  for (const [width,touch] of [[1440,false],[1024,false],[900,false],[900,true],[390,true]]) {
   const page = await browser.newPage({viewport:{width,height:900},isMobile:touch,hasTouch:touch});
   const errors = []; page.on('pageerror',error => errors.push(error.message));
   if (process.env.BLOG_TEST_SOURCE === '1') await page.route(/\/(css|js)\//,async route => {
    const path = 'static'+new URL(route.request().url()).pathname;
    if (fs.existsSync(path)) await route.fulfill({body:fs.readFileSync(path),contentType:path.endsWith('.css')?'text/css':'application/javascript'});
    else await route.continue();
   });
   await page.goto(base+'/posts/linux-note/');
   await page.waitForSelector('.toc-tree', {state:'attached'});
   await page.waitForTimeout(600);
   await refreshArticle(page);
   if (width>980) {
    const metrics = await page.locator('.toc-tree a').evaluateAll(links => links.map(a=>({width:a.clientWidth,scroll:a.scrollWidth,height:a.clientHeight,label:a.textContent})));
    assert(metrics.every(a => a.width>=65 && a.scroll<=a.width+1),'all heading levels retain readable width: '+JSON.stringify(metrics));
    assert(metrics[3].height>metrics[0].height,'long fourth-level heading wraps instead of clipping');
    await page.locator('.article-toc').scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await page.screenshot({path:`${out}/${width}-toc.png`});
    await page.locator('.toc-head').click();
    assert.equal(await page.locator('.article-shell').getAttribute('data-toc-state'),'collapsed');
    await page.reload(); await page.waitForSelector('.article-shell[data-toc-state="collapsed"]');
    await page.locator('.toc-head').click();
   } else {
    const fab = page.locator('#songline-mobile-toc-fab');
    await fab.click();
    await page.waitForTimeout(150);
    const links = page.locator('.mobile-toc-item');
    assert.equal(await links.count(),7,'drawer refreshed after delayed article render');
    assert((await links.first().getAttribute('class')).includes('depth-1'),'first heading is not over-indented');
    await page.screenshot({path:`${out}/${width}-${touch}-toc.png`});
    await links.nth(3).click();
    await page.waitForTimeout(650);
    assert(!(await page.locator('html').getAttribute('class')).includes('mobile-toc-open'),'heading selection closes drawer');
    assert(decodeURIComponent(new URL(page.url()).hash).includes('查看已经安装'),'heading anchor resolves');
   }
   await page.goto(base+'/friends/');
   await page.waitForSelector('[data-friend-id]');await page.waitForTimeout(1000);
   const appearance = () => page.locator('.friends-constellation__edge-vignette').evaluate(e => {
    const style=getComputedStyle(e,'::before');return {blur:style.backdropFilter,mask:style.maskImage,background:getComputedStyle(document.querySelector('[data-galaxy-stage]')).backgroundColor};
   });
   const initial=await appearance();
   assert.equal(initial.background,'rgba(0, 0, 0, 0)','original starfield remains visible through the stage');
   assert.equal(initial.blur,width>980?'blur(2.5px)':'blur(2px)');
   const world=page.locator('[data-galaxy-world]');
   const before=await world.evaluate(e=>e.style.transform);
   // Before the drag threshold there is no pointer capture. A release outside
   // the stage must still clear the pending gesture before the next drag.
   await page.evaluate(() => {
    const stage=document.querySelector('[data-galaxy-stage]');
    stage.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:7,button:0,isPrimary:true,clientX:20,clientY:20}));
    window.dispatchEvent(new PointerEvent('pointerup',{pointerId:7,button:0}));
    stage.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:8,button:0,isPrimary:true,clientX:20,clientY:20}));
    window.dispatchEvent(new Event('blur'));
   });
   // Start on the main avatar (an anchor): native HTML dragging used to cancel it.
   const core=await page.locator('[data-center-open] img').boundingBox();
   await page.mouse.move(core.x+core.width/2,core.y+core.height/2);await page.mouse.down();
   await page.mouse.move(core.x+core.width/2+65,core.y+core.height/2-70,{steps:16});
   assert.notEqual(await world.evaluate(e=>e.style.transform),before,'avatar drag pans the world');
   assert.deepEqual(await appearance(),initial,'drag keeps the original fixed blur and mask');
   await page.screenshot({path:`${out}/${width}-${touch}-drag.png`});
   await page.waitForTimeout(180);
   const stopped=await world.evaluate(e=>e.style.transform);
   await page.mouse.up();await page.waitForTimeout(180);
   assert.equal(await world.evaluate(e=>e.style.transform),stopped,'holding still before release must not fling');
   assert.equal(new URL(page.url()).pathname,'/friends/','drag must not activate the profile link');
   await page.mouse.move(width*.5,230);await page.mouse.down();
   await page.mouse.move(width*.55,290,{steps:10});
   await page.evaluate(()=>{const e=document.querySelector('[data-galaxy-stage]');e.dispatchEvent(new PointerEvent('lostpointercapture',{pointerId:1}));});
   assert.equal(await page.locator('.friends-constellation__sky.is-dragging').count(),0,'lost capture cannot leave drag state stuck');
   await page.mouse.up();
   assert.deepEqual(errors,[]);
   console.log(`PASS ${width} ${touch?'touch':'mouse'}: nested headings, delayed TOC, remembered collapse, stable starfield and avatar drag`);
   await page.close();
  }
 } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exit(1)});
