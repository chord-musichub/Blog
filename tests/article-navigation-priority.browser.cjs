// The floating desktop map yields to overlapping article controls.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const base=process.env.BLOG_TEST_URL||'http://127.0.0.1:8080';
const article=process.env.BLOG_TEST_ARTICLE||'/posts/c-note/';
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try {
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  await page.route('**/api/views?**',route=>route.fulfill({json:{views:1}}));
  await page.goto(base+article);
  await page.waitForSelector('[data-site-map][data-site-map-ready="1"]');
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const home=page.locator('[data-site-map] a[data-page-key="home"]');
  for(const kind of ['button','link','summary','label','disabled']) {
   await page.evaluate(()=>document.getElementById('article-control-test')?.remove());
   await home.focus();await page.waitForTimeout(300);
   const point=await home.evaluate(a=>{const r=a.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};});
   await page.evaluate(({point,kind})=>{
    const host=document.createElement('div');host.id='article-control-test';
    host.style.cssText=`position:fixed;left:${point.x-18}px;top:${point.y-18}px;width:36px;height:36px;z-index:100;`;
    const markup={button:'<button type="button">复制</button>',link:'<a href="#article-test-anchor">链接</a>',summary:'<details><summary>展开</summary><p>内容</p></details>',label:'<label for="article-test-check">选择</label><input id="article-test-check" type="checkbox" style="position:absolute;left:70px">',disabled:'<button type="button" disabled>不可用</button>'};
    host.innerHTML=markup[kind];
    const control=host.querySelector('button,a,summary,label');
    control.style.cssText='display:block;box-sizing:border-box;width:36px;height:36px;margin:0;padding:0;';
    window.articleControlClicks=0;
    control.addEventListener('click',event=>{window.articleControlClicks++;if(kind==='link')event.preventDefault();});
    document.body.appendChild(host);
   },{point,kind});
   await page.mouse.click(point.x,point.y);
   await page.waitForTimeout(150);
   assert.equal(new URL(page.url()).pathname,article,`${kind} overlap must not activate the map`);
   assert.equal(await page.evaluate(()=>window.articleControlClicks),kind==='disabled'?0:1,`${kind} activates once`);
   if(kind==='summary') assert(await page.locator('#article-control-test details').evaluate(e=>e.open));
   if(kind==='label') assert(await page.locator('#article-test-check').isChecked());
  }
  await page.evaluate(()=>document.getElementById('article-control-test').remove());
  await home.focus();await home.click();await page.waitForURL(base+'/');
  assert.deepEqual(errors,[]);
  console.log('PASS article controls outrank the floating map: button/link/disclosure/label/disabled; unobstructed navigation still works');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
