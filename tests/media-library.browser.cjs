// Uses the opt-in read-only creator fixture; intercepts every POST locally.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = process.env.CREATOR_TEST_URL || 'http://127.0.0.1:8091';

(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try {
  for(const width of [1440,390]) {
   const page=await browser.newPage({viewport:{width,height:900}});
   const errors=[]; page.on('pageerror',e=>errors.push(e.message));
   const posts=[];
   await page.route('**/*',route=>{
    if(route.request().method()!=='POST') return route.continue();
    posts.push(route.request());
    if(route.request().url().includes('action=media-crop')) return route.fulfill({json:{ok:true,path:'/uploads/songline/cropped.webp'}});
    return route.fulfill({contentType:'text/html',body:'Category form captured without changing any data.'});
   });
   await page.route('**/uploads/songline/markdown.png',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#294766"/></svg>'}));
   await page.goto(base+'/write/admin/media');
   const item=page.locator('[data-media-item]').first();
   await item.locator('summary').click();
   const select=item.locator('.media-category-form select');
   assert.equal(await select.inputValue(),'general','current category is selected');
   await select.selectOption('memories');
   await page.locator('#mediaSearch').fill('回忆');
   assert.equal(await item.isVisible(),false,'uncommitted dropdown choices do not contaminate category search');
   await page.locator('#mediaSearch').fill('通用素材');
   assert(await item.isVisible(),'search matches saved category');
   await page.locator('#mediaSearch').fill('markdown');
   assert(await item.isVisible(),'search matches filename');
   await page.locator('#mediaSearch').fill('');
   for(const locator of [select,item.locator('.media-category-form button')]) {
    await locator.scrollIntoViewIfNeeded();
    const box=await locator.boundingBox();
    assert(box.x>=0 && box.x+box.width<=width+1,`classification control clipped at ${width}: ${JSON.stringify(box)}`);
   }
   fs.mkdirSync('local-only/media-library',{recursive:true});
   await page.screenshot({path:`local-only/media-library/${width}.png`,fullPage:true});
   await Promise.all([page.waitForURL('**/write/admin/media'),item.locator('.media-category-form button').click()]);
   await page.waitForFunction(()=>document.body.textContent.includes('Category form captured'));
   const form=new URLSearchParams(posts[0].postData());
   assert.equal(form.get('action'),'categorize');
   assert.equal(form.get('category'),'memories');
   assert.equal(form.get('old_path'),'/uploads/songline/markdown.png');
   assert.deepEqual(errors,[]);
   console.log(`PASS ${width}: existing-media category control, search, original path, responsive form (POST intercepted)`);
   await page.close();
  }
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
