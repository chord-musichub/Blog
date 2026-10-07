// Same-content, offline comparison. No production requests or real API writes.
const {chromium}=require('playwright');
const sharp=require('sharp');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const repo=path.resolve(__dirname,'..');
const builds={before:path.resolve(process.env.BLOG_UI_BASELINE||'local-only/cleanup-performance/before/public'),after:path.resolve(process.env.BLOG_UI_BUILD||'local-only/cleanup-performance/after/public')};
for(const build of Object.values(builds))assert(fs.existsSync(path.join(build,'index.html')),'Provide both Hugo builds');
const out=path.join(repo,'local-only/cleanup-performance');fs.mkdirSync(out,{recursive:true});
const base='http://cleanup-audit.test';
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100"><rect width="160" height="100" fill="#607d8b"/></svg>';
const tools=['random-number','2048','snake','reaction-test','flappy-bird','typing-practice','gacha','focus-timer','audio-visualizer','markdown-previewer'];
const report=[];
async function fixture(browser,mode,width,theme){
  const build=builds[mode],requests=[],errors=[];
  const context=await browser.newContext({viewport:{width,height:1000},hasTouch:width<981,isMobile:width<981,reducedMotion:'reduce'});
  await context.route('**/*',route=>{
    const u=new URL(route.request().url());requests.push({path:u.pathname,method:route.request().method()});
    if(u.origin!==base||u.pathname.startsWith('/uploads/'))return route.fulfill({body:svg,contentType:'image/svg+xml'});
    if(/^\/(?:write\/|static\/)?api\//.test(u.pathname))return route.fulfill({json:{views:83,items:[],messages:[],scores:[{score:300},{score:200},{score:100}]}});
    const root=u.pathname.startsWith('/static/')?(mode==='before'?path.join(out,'before/admin-static'):path.join(repo,'web/static')):build;
    const file=path.resolve(root,decodeURIComponent(u.pathname.replace(/^\/static\//,'/').slice(1))+(u.pathname.endsWith('/')?'index.html':''));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
    return route.fulfill({body:fs.readFileSync(file),contentType:({'.html':'text/html','.css':'text/css','.js':'application/javascript','.json':'application/json','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream'});
  });
  await context.addInitScript(theme=>{
    localStorage.setItem('songline-theme',theme);localStorage.setItem('songline-privacy-v1',JSON.stringify({version:1,statistics:false,expires:Date.now()+86400000}));sessionStorage.setItem('songline-home-boot-v21.4','1');
    let seed=42;Math.random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
  },theme);
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  return {context,page,requests,errors};
}
async function ready(page,route){
  await page.goto(base+route);await page.evaluate(()=>SonglinePageModules.ready(document));
  await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}'});
  // CSS animation freezing does not stop the tag river's requestAnimationFrame.
  // Sample the same deterministic initial phase in both builds.
  await page.evaluate(()=>{
    const stage=document.querySelector('[data-tag-river-stage]');
    if(!stage)return;
    cancelAnimationFrame(stage.__tagRiverMotionFrame);
    stage.__tagRiverMotionToken=(stage.__tagRiverMotionToken||0)+1;
    stage.querySelectorAll('.tag-river-strip').forEach(strip=>{
      const motion=strip.__tagRiverMotion;
      const x=motion?-(motion.offset/motion.duration*50):0;
      strip.style.setProperty('transform','translate3d('+x.toFixed(4)+'%,0,0)','important');
    });
  });
  await page.mouse.move(0,0);await page.waitForTimeout(250);
}
async function snapshot(page){return page.evaluate(()=>{
  const properties=['display','position','color','backgroundColor','backgroundImage','borderTop','borderRadius','fontFamily','fontSize','fontWeight','lineHeight','padding','gap','boxShadow'];
  const nodes=[...document.querySelectorAll('main.container,.content-archive,.archive-record__index,.songline-terminal-frame,.friends-constellation,.memory-room,.tools-excavation,.article-reader,.article-toc,.tool-detail-surface,.tool-actionbar,.tool-detail-ranking,.tool-detail-surface input,.tool-detail-surface select,.tool-detail-surface button,.tool-detail-surface textarea')];
  return {geometry:nodes.map(e=>{const r=e.getBoundingClientRect();return [e.tagName,e.className,...['x','y','width','height'].map(k=>Math.round(r[k]*10)/10)];}),styles:nodes.map(e=>{const s=getComputedStyle(e);return properties.map(k=>s[k]);}),overflow:document.documentElement.scrollWidth>innerWidth+2};
});}
async function bytes(build,requests){return [...new Set(requests.filter(r=>/^\/(css|js)\//.test(r.path)).map(r=>r.path))].reduce((sum,p)=>sum+fs.statSync(path.join(build,p)).size,0);}
async function pixels(page,file){return page.screenshot({path:file,mask:[page.locator('canvas')],animations:'disabled'});}
async function meanDifference(a,b){const x=await sharp(a).ensureAlpha().raw().toBuffer(),y=await sharp(b).ensureAlpha().raw().toBuffer();assert.equal(x.length,y.length);let sum=0;for(let i=0;i<x.length;i++)sum+=Math.abs(x[i]-y[i]);return sum/x.length;}
async function typingAudit(browser,mode){
  const {context,page,errors}=await fixture(browser,mode,390,'light');await ready(page,'/tools/typing-practice/');
  await page.locator('[data-typing-sound-toggle]').click();
  const value=await page.locator('[data-typing-text]').textContent();
  await page.evaluate(()=>{
    const pane=document.querySelector('[data-typing-text]');window.typingAudit={initial:[...pane.children],childList:0,attributes:0};
    window.typingObserver=new MutationObserver(entries=>entries.forEach(e=>typingAudit[e.type]++));typingObserver.observe(pane,{subtree:true,childList:true,attributes:true});
  });
  const started=Date.now();
  for(let i=1;i<=80;i++)await page.locator('[data-typing-input]').fill(value.slice(0,i));
  const mutations=await page.evaluate(()=>{
    const pane=document.querySelector('[data-typing-text]');typingObserver.disconnect();return {childList:typingAudit.childList,attributes:typingAudit.attributes,retained:typingAudit.initial.every((node,i)=>node===pane.children[i]),length:pane.children.length};
  });
  assert.equal(await page.locator('[data-typing-errors]').textContent(),'0');
  const mutated=value.slice(0,19)+'!'+value.slice(20,80);await page.locator('[data-typing-input]').fill(mutated);
  assert.equal(await page.locator('[data-typing-errors]').textContent(),'1');assert.equal(await page.locator('.typing-text .is-wrong').count(),1);
  await page.locator('[data-typing-input]').fill(value.slice(0,19));assert.equal(await page.locator('[data-typing-errors]').textContent(),'0');assert.equal(await page.locator('.typing-text .is-correct').count(),19);
  await page.locator('[data-typing-input]').fill(value.slice(0,-2));
  assert(await page.locator('[data-typing-text]').evaluate(e=>{const a=e.getBoundingClientRect(),b=e.querySelector('.is-current').getBoundingClientRect();return b.top>=a.top&&b.bottom<=a.bottom;}));
  await page.locator('[data-typing-restart]').click();
  const resetScroll=await page.locator('[data-typing-text]').evaluate(e=>e.scrollTop);
  if(mode==='after')assert.equal(resetScroll,0,'Restart returns the reference to its first line');
  await page.locator('[data-typing-mode="mixed"]').click();assert.equal(await page.locator('[data-typing-errors]').textContent(),'0');assert.equal(await page.locator('.typing-text .is-correct').count(),0);
  const mixed=await page.locator('[data-typing-text]').textContent();
  await page.locator('[data-typing-input]').evaluate((e,value)=>{e.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));e.value=value;e.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true}));},mixed.slice(0,3));
  assert.equal(await page.locator('.typing-text .is-correct').count(),0,'Composition remains pending');
  await page.locator('[data-typing-input]').evaluate(e=>e.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true})));
  assert.equal(await page.locator('.typing-text .is-correct').count(),3);
  await page.locator('[data-typing-input]').fill(mixed);assert(await page.locator('[data-typing-input]').isDisabled());assert.equal(await page.locator('[data-typing-progress]').textContent(),'100%');
  assert.deepEqual(errors,[]);await context.close();return {...mutations,resetScroll,inputRoundTripMs:Date.now()-started};
}
(async()=>{
  const browser=await chromium.launch({headless:true,channel:'msedge'});
  try{
    const friend=fs.readdirSync(path.join(builds.after,'friends')).find(name=>!['memories','index.html'].includes(name)&&fs.existsSync(path.join(builds.after,'friends',name,'index.html')));
    const tag=fs.readdirSync(path.join(builds.after,'tags')).find(name=>!['site-notice','index.html','page'].includes(name)&&fs.existsSync(path.join(builds.after,'tags',name,'index.html')));
    const routes=process.env.CLEANUP_ROUTES?JSON.parse(process.env.CLEANUP_ROUTES):['/','/posts/','/tags/site-notice/','/posts/linux-note/','/friends/','/friends/memories/',`/friends/${friend}/`,'/tools/','/tags/',`/tags/${tag}/`,...tools.map(name=>'/tools/'+name+'/')];
    const cases=process.env.CLEANUP_CASES?JSON.parse(process.env.CLEANUP_CASES):[[1440,'dark'],[1440,'light'],[390,'dark'],[390,'light']];
    for(const [width,theme] of cases)for(const route of routes){
      const pair={width,theme,route};let before;
      for(const mode of ['before','after']){
        const {context,page,requests,errors}=await fixture(browser,mode,width,theme);await ready(page,route);
        pair[mode]={...await snapshot(page),assetBytes:await bytes(builds[mode],requests)};
        assert(!pair[mode].overflow,'No horizontal overflow');assert.deepEqual(errors,[]);
        const file=path.join(out,route.replace(/[^a-z0-9]+/gi,'-')+'-'+width+'-'+theme+'-'+mode+'.png');
        const screenshot=await pixels(page,file);
        if(mode==='before')before=screenshot;else pair.meanPixelDifference=await meanDifference(before,screenshot);
        await context.close();
      }
      assert.deepEqual(pair.after.geometry,pair.before.geometry,'Geometry unchanged: '+route);
      assert.deepEqual(pair.after.styles,pair.before.styles,'Visible styles unchanged: '+route);
      assert(pair.meanPixelDifference<.35,'Unexpected visible pixel difference at '+route+': '+pair.meanPixelDifference);
      assert(pair.after.assetBytes<pair.before.assetBytes,'Less requested source on '+route);
      report.push(pair);console.log('PASS',width,theme,route,'saved bytes',pair.before.assetBytes-pair.after.assetBytes,'pixel delta',pair.meanPixelDifference.toFixed(4));
    }
    const typing={before:await typingAudit(browser,'before'),after:await typingAudit(browser,'after')};
    assert(typing.before.childList>=80);assert.equal(typing.before.retained,false);assert.equal(typing.after.childList,0);assert.equal(typing.after.retained,true);assert(typing.after.attributes<400);
    report.push({typing});console.log('PASS typing node reuse',typing);
  }finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
