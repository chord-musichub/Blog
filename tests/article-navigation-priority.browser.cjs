// A collapsed map leaves page controls accessible; an explicitly opened map owns its panel.
const assert = require('node:assert/strict');
const {fixture, ready, launch} = require('./helpers/interaction-fixture.cjs');
const source = process.env.BLOG_MAP_BUILD || 'local-only/header-map-2026-10-09/build';
(async () => {
  const browser = await launch();
  try {
    for (const width of [1440, 390]) {
      const f = await fixture(browser, source, {width, reduced:true});
      try {
        const {page} = f;
        await ready(page, f.origin, '/posts/linux-note/');
        const toggle = page.locator('[data-site-map-toggle]');
        const home = page.locator('[data-site-map] a[data-page-key="home"]');
        await toggle.click();
        const point = await home.evaluate(el => {const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};});
        await page.keyboard.press('Escape');
        for (const kind of ['button','link','summary','label','disabled']) {
          await page.evaluate(({point,kind}) => {
            document.getElementById('article-control-test')?.remove();
            const host=document.createElement('div');host.id='article-control-test';
            host.style.cssText=`position:fixed;left:${point.x-18}px;top:${point.y-18}px;width:36px;height:36px;z-index:500;`;
            host.innerHTML={button:'<button type="button">复制</button>',link:'<a href="#article-test-anchor">链接</a>',summary:'<details><summary>展开</summary><p>内容</p></details>',label:'<label for="article-test-check">选择</label><input id="article-test-check" type="checkbox" style="position:absolute;left:70px">',disabled:'<button type="button" disabled>不可用</button>'}[kind];
            const control=host.querySelector('button,a,summary,label');
            control.style.cssText='display:block;box-sizing:border-box;width:36px;height:36px;margin:0;padding:0;';
            window.articleControlClicks=0;
            control.addEventListener('click',event=>{window.articleControlClicks++;if(kind==='link')event.preventDefault();});
            document.body.appendChild(host);
          }, {point,kind});
          await page.mouse.click(point.x,point.y);
          assert.equal(new URL(page.url()).pathname,'/posts/linux-note/');
          assert.equal(await page.evaluate(()=>window.articleControlClicks),kind==='disabled'?0:1);
          if(kind==='summary') assert(await page.locator('#article-control-test details').evaluate(el=>el.open));
          if(kind==='label') assert(await page.locator('#article-test-check').isChecked());
        }
        await toggle.click();
        await home.click();
        await page.waitForFunction(()=>location.pathname==='/'&&!document.documentElement.classList.contains('songline-page-transitioning'));
        assert.equal(await page.evaluate(()=>window.articleControlClicks),0,'The open map does not forward navigation to the disabled control beneath it');
        assert.deepEqual(f.errors,[]);
        console.log(`PASS ${width}px: collapsed map leaves controls usable; explicit map click owns navigation`);
      } finally {await f.close();}
    }
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
