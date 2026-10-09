// Paired, same-content benchmark. Rendering/animation is enabled during timing.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const {fixture, ready, launch} = require('./helpers/interaction-fixture.cjs');
const variants = JSON.parse(process.env.INTERACTION_VARIANTS || '{}');
assert(Object.keys(variants).length, 'Set INTERACTION_VARIANTS to isolated source directories');
const out = path.resolve(process.env.INTERACTION_REPORT_DIR || 'local-only/interaction-2026-10-09');
fs.mkdirSync(out, {recursive:true});
const routes = JSON.parse(process.env.INTERACTION_ROUTES || '["/posts/","/posts/linux-note/","/friends/","/friends/memories/","/tools/","/"]');
const report = {conditions:{routes, delays:{html:40, css:180, background:300}, browser:process.env.BLOG_BROWSER_PATH || '/opt/google/chrome/chrome', cpuModel:require('node:os').cpus()[0]?.model, realLocalImages:true, animation:true, cachePolicy:'cold clears HTTP cache per navigation; warm visits all routes first; live document module/decoder state persists'}, navigation:[], search:[]};
function summary(values) {
  const sorted = [...values].sort((a,b) => a-b);
  return {n:values.length, median:sorted[Math.floor(sorted.length/2)], p95:sorted[Math.ceil(sorted.length*.95)-1], min:sorted[0], max:sorted.at(-1)};
}
async function navigation(browser, variant, source, width, cpu, cache) {
  const f = await fixture(browser, source, {width, cpu, delays:true, instrument:true});
  try {
    await ready(f.page, f.origin, '/');
    if (cache === 'warm') for (const route of routes) await f.page.evaluate(route => SonglinePageTransition.navigateLink(route), route);
    const samples = [];
    for (let i=0; i<Number(process.env.INTERACTION_NAV_SAMPLES || 10); i++) {
      const route = routes[i % routes.length];
      if (cache === 'cold') await f.cdp.send('Network.clearBrowserCache');
      samples.push(await f.page.evaluate(async route => {
        const at = performance.now();
        await SonglinePageTransition.navigateLink(route);
        return {route, total:performance.now()-at, coveredWait:__interactionRevealAt-__interactionCoverAt, cover:__interactionCoverAt-__interactionStartAt};
      }, route));
      assert.equal(await f.page.locator('link[data-songline-transition-preload]').count(), 0);
    }
    assert.deepEqual(f.errors, []);
    const row = {variant, width, cpu, cache, samples, total:summary(samples.map(s=>s.total)), coveredWait:summary(samples.map(s=>s.coveredWait))};
    report.navigation.push(row); console.log('NAV', variant, width, cpu, cache, JSON.stringify({total:row.total, coveredWait:row.coveredWait}));
  } finally {await f.close();}
}
async function search(browser, variant, source, width, cpu, size) {
  const f = await fixture(browser, source, {width, cpu});
  try {
    await ready(f.page, f.origin, '/tools/');
    if (size === 300) await f.page.evaluate(() => {
      const old = document.querySelector('[data-tools-search]'), fresh = old.cloneNode(true); old.replaceWith(fresh);
      delete fresh.dataset.songlineSearchBound; delete fresh.dataset.songlineClearBound;
      const list = document.querySelector('.modern-tools-grid'), layer = list.querySelector('.tools-strata'), example = list.querySelector('.tool-app-card, .tool-card');
      list.querySelectorAll('.tool-app-card, .tool-card').forEach(card => card.remove());
      for(let i=0;i<300;i++) {const card=example.cloneNode(true); card.dataset.toolKeywords = '固定 测试 group'+(i%3); layer.append(card);}
      SonglineInitSearch(document);
    });
    const data = await f.page.evaluate(async () => {
      const input=document.querySelector('[data-tools-search]'), list=document.querySelector('.modern-tools-grid');
      const samples=[], observer=new MutationObserver(()=>{});
      const terms=['游戏','game','不存在','MD','数字，游戏','','group1','GROUP1','group2','固定'];
      observer.observe(list,{attributes:true,childList:true,subtree:true});
      for(let i=0;i<100;i++) {
        input.value=terms[Math.floor(i/2)%terms.length]; // Equal adjacent results exercise repeated input too.
        const at=performance.now(); input.dispatchEvent(new InputEvent('input',{bubbles:true}));
        const handler=performance.now()-at, mutations=observer.takeRecords().length;
        // Double RAF is a rendering opportunity proxy, not production INP.
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        samples.push({handler, presentation:performance.now()-at, mutations});
      }
      observer.disconnect();
      return {samples,cards:list.querySelectorAll('.tool-app-card, .tool-card').length};
    });
    assert.deepEqual(f.errors, []);
    const row={variant,width,cpu,size:data.cards,samples:data.samples,handler:summary(data.samples.map(s=>s.handler)),presentation:summary(data.samples.map(s=>s.presentation)),mutations:data.samples.reduce((n,s)=>n+s.mutations,0)};
    report.search.push(row); console.log('SEARCH',variant,width,cpu,row.size,JSON.stringify({handler:row.handler,presentation:row.presentation,mutations:row.mutations}));
  } finally {await f.close();}
}
(async()=>{
  const browser=await launch();
  report.conditions.browserVersion=browser.version();
  try {
    for(let round=0;round<Number(process.env.INTERACTION_REPEATS||1);round++) for(const width of JSON.parse(process.env.INTERACTION_WIDTHS||(process.env.INTERACTION_SMOKE?'[390]':'[1440,390]'))) for(const cpu of JSON.parse(process.env.INTERACTION_CPUS||(process.env.INTERACTION_SMOKE?'[1]':'[1,4]'))) {
      const entries=Object.entries(variants);if(round%2)entries.reverse();
      if(process.env.INTERACTION_ONLY!=='search')for(const cache of JSON.parse(process.env.INTERACTION_CACHES||'["cold","warm"]')) for(const [variant,source] of entries) await navigation(browser,variant,source,width,cpu,cache);
      if(process.env.INTERACTION_ONLY!=='navigation')for(const size of ['current',300]) for(const [variant,source] of [...entries].reverse()) await search(browser,variant,source,width,cpu,size);
    }
  } finally {fs.writeFileSync(path.join(out,process.env.INTERACTION_REPORT_NAME || 'performance.json'),JSON.stringify(report,null,2));await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
