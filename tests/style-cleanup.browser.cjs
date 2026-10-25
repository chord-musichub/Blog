// Compare fresh before/after Hugo builds. Fixed local responses only; no live APIs.
// BLOG_UI_BASELINE=/before/public BLOG_UI_BUILD=/after/public node tests/style-cleanup.browser.cjs
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const {offlineSite} = require('./helpers/offline-site.cjs');
const base = 'http://style-cleanup.test';
const builds = {before:process.env.BLOG_UI_BASELINE, after:process.env.BLOG_UI_BUILD};
assert(builds.before && builds.after, 'Provide both isolated Hugo builds');
const routes = ['/', '/posts/', '/posts/linux-note/', '/tags/site-notice/', '/friends/', '/friends/songline/', '/friends/memories/', '/tools/', '/tools/markdown-previewer/', '/tools/reaction-test/', '/tools/audio-visualizer/'];
const selectors = ['.page-hero','.page-hero h1','.section-head','.toolbar-panel','.meta-row','.post-card','.btn','.pill','.songline-search-field','.searchbox','.tools-searchbox','.songline-search-clear','.search-count','.tool-card','.tool-app-card','.friends-constellation','.friends-constellation__sky','.friend-detail-hero','.memory-room','.markdown-body','.md-table-wrap','table.md-table','table.md-table th','table.md-table td','.md-code-block','.md-code-block pre','.md-code-toolbar','.md-code-copy','.md-code-block code','.tok-keyword','.tok-comment','.tok-comment .tok-string','.markdown-body h2','.md-anchor-link','.article-toc li'];
const properties = 'display position width height min-width max-width min-height max-height margin-top margin-bottom margin-left margin-right padding-top padding-right padding-bottom padding-left border-top-width border-top-style border-top-color border-radius background-color background-image box-shadow backdrop-filter color font-family font-size font-weight font-style line-height letter-spacing overflow-x overflow-y opacity transform scroll-margin-top white-space word-break overflow-wrap table-layout border-collapse flex-wrap flex-grow flex-basis grid-template-columns outline-width outline-style outline-color'.split(' ');
async function snapshot(page) {
  return page.evaluate(({selectors, properties}) => {
    const result = {};
    for (const selector of selectors) {
      result[selector] = [...document.querySelectorAll(selector)].slice(0,3).map(node => {
        const style = getComputedStyle(node);
        return Object.fromEntries(properties.map(name => [name,style.getPropertyValue(name)]));
      });
    }
    return result;
  }, {selectors, properties});
}
function compare(expected, actual, label) {
  const differences = [];
  for (const selector of selectors) {
    if (expected[selector].length !== actual[selector].length) differences.push([selector,'count',expected[selector].length,actual[selector].length]);
    for (let i=0;i<Math.min(expected[selector].length,actual[selector].length);i++) {
      for (const name of properties) if (expected[selector][i][name] !== actual[selector][i][name]) differences.push([selector,i,name,expected[selector][i][name],actual[selector][i][name]]);
    }
  }
  assert.equal(differences.length,0,label+' '+JSON.stringify(differences.slice(0,10)));
}
async function inspect(page, route) {
  await page.goto(base+route);
  await page.evaluate(() => SonglinePageModules.ready(document));
  await page.waitForFunction(() => !document.documentElement.classList.contains('is-scene-preparing'));
  await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important}'});
  if (route==='/tools/markdown-previewer/') {
    await page.locator('[data-md-file]').setInputFiles({name:'probe.md',mimeType:'text/markdown',buffer:Buffer.from('# 预览标题\n\n## 预览小节\n\n正文')});
    await page.waitForFunction(()=>document.querySelector('[data-md-name]').textContent==='probe.md');
  }
  if (route==='/posts/linux-note/' || route==='/tools/markdown-previewer/') {
    await page.waitForSelector('.markdown-body');
    await page.evaluate(() => {
      const probe=document.createElement('div');
      probe.innerHTML='<div class="md-table-wrap"><table class="md-table"><tr><th>标题</th><th></th></tr><tr><td>正文</td><td></td></tr></table></div><div class="md-code-block"><pre><code><span class="tok-keyword">const</span> a=<span class="tok-string">"text"</span>; <span class="tok-comment">// 注释 <span class="tok-string">"中文"</span></span></code></pre></div><h2>定位标题</h2><a class="md-anchor-link">锚点</a>';
      document.querySelector('.markdown-body').appendChild(probe);
    });
  }
  const result={normal:await snapshot(page)};
  if (route==='/tools/') {
    const input=page.locator('[data-tools-search]');
    await input.fill('markdown');
    await page.waitForTimeout(100);
    result.filtered=await snapshot(page);
    const clear=page.locator('.songline-search-clear');
    await clear.hover();result.hover=await snapshot(page);
    await clear.focus();result.focus=await snapshot(page);
    await clear.click();
    assert.equal(await input.inputValue(),'');
    assert.equal(await page.locator('.tool-app-card[hidden],.tool-app-card.is-search-filtered').count(),0);
  }
  return result;
}
(async () => {
  const browser=await chromium.launch({headless:true,executablePath:process.env.BLOG_BROWSER_PATH||'/opt/google/chrome/chrome',args:['--no-sandbox']});
  try {
    for (const width of [1440,820,390]) for (const theme of ['light','dark']) {
      const expected=new Map();
      for (const [phase,build] of Object.entries(builds)) {
        const context=await browser.newContext({viewport:{width,height:1000},isMobile:width<981,hasTouch:width<981,reducedMotion:'reduce'});
        await context.route('**/*',offlineSite({base,build}));
        await context.addInitScript(theme => {
          localStorage.setItem('songline-theme',theme);localStorage.setItem('songline-language','zh');
          localStorage.setItem('songline-privacy-v1',JSON.stringify({version:1,statistics:false,expires:Date.now()+86400000}));
          sessionStorage.setItem('songline-home-boot-v21.4','1');
          let seed=42;Math.random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
        },theme);
        const page=await context.newPage();
        try {
          for (const route of routes) {
            const actual=await inspect(page,route);
            if (phase==='before') expected.set(route,actual);
            else for (const state of Object.keys(actual)) compare(expected.get(route)[state],actual[state],`${width} ${theme} ${route} ${state}`);
          }
        } finally {await context.close();}
      }
      console.log('PASS computed styles / Markdown probes / search states',width,theme,routes.length,'routes');
    }
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
