const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),sharp=require('sharp');
const {fixture,ready,launch}=require('./helpers/interaction-fixture.cjs');
const variants=JSON.parse(process.env.INTERACTION_VARIANTS||'{}');
assert(variants.before&&variants.after,'Provide before/after isolated sources');
const out=path.resolve(process.env.INTERACTION_REPORT_DIR||'local-only/interaction-2026-10-09');
fs.mkdirSync(out,{recursive:true});
const report={visual:[],search:[],navigation:[],lifecycle:[]};
async function output(page){return page.evaluate(()=>({
  count:document.querySelector('[data-tools-search-count]').textContent,
  cards:[...document.querySelectorAll('.modern-tools-grid .tool-app-card, .modern-tools-grid .tool-card')].map(card=>[card.textContent,card.hidden,card.style.cssText,card.classList.contains('is-search-hit')]),
  strata:[...document.querySelectorAll('.tools-strata')].map(layer=>layer.hidden),
  empty:document.querySelector('.tools-empty-state').hidden
}));}
async function search(browser,width){
  const outputs={};
  for(const [variant,source] of Object.entries(variants)){
    const f=await fixture(browser,source,{width,reduced:true});
    try{
      await ready(f.page,f.origin,'/tools/?q=markdown');outputs[variant]=[await output(f.page)];
      const input=f.page.locator('[data-tools-search]');
      for(const query of ['游戏','GAME','数字，游戏','不存在','','MD','中文 输入']){await input.fill(query);outputs[variant].push(await output(f.page));}
      await input.evaluate(input=>{
        input.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));
        input.value='随机';input.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true}));
        input.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));
        input.dispatchEvent(new InputEvent('input',{bubbles:true}));
      });outputs[variant].push(await output(f.page));
      await input.press('Enter');outputs[variant].push(await output(f.page));
      await input.press('Escape');outputs[variant].push(await output(f.page));
      await input.fill('不存在');await input.evaluate(input=>{input.value='';input.dispatchEvent(new Event('search',{bubbles:true}));});outputs[variant].push(await output(f.page));
      await input.fill('游戏');await f.page.locator('.songline-search-clear').click();assert(await input.evaluate(input=>document.activeElement===input));outputs[variant].push(await output(f.page));
      if(variant==='after'){
        const repeat=await input.evaluate(input=>{
          input.value='游戏';input.dispatchEvent(new InputEvent('input',{bubbles:true}));
          const list=document.querySelector('.modern-tools-grid'),initial=[...list.children],observer=new MutationObserver(()=>{});
          observer.observe(list,{subtree:true,childList:true,attributes:true});
          for(let i=0;i<20;i++)input.dispatchEvent(new InputEvent('input',{bubbles:true}));
          const mutations=observer.takeRecords().length;observer.disconnect();return {mutations,retained:initial.every((node,i)=>node===list.children[i])};
        });assert.deepEqual(repeat,{mutations:0,retained:true});
        await f.page.evaluate(()=>{const item=document.querySelector('.tool-app-card');item.hidden=false;item.style.display='block';});
        await input.fill('不存在');assert.equal(await f.page.locator('.tool-app-card:not([hidden])').count(),0);
      }
      await f.page.evaluate(()=>SonglinePageModules.ready(document));
      await f.page.evaluate(()=>SonglinePageTransition.navigateLink('/friends/'));
      await f.page.evaluate(()=>SonglinePageTransition.navigateLink('/tools/?q=markdown'));
      outputs[variant].push(await output(f.page));assert.deepEqual(f.errors,[]);
    }finally{await f.close();}
  }
  assert.deepEqual(outputs.after,outputs.before,'Search matching, classes, inline styles, clear and reentry remain identical');
  report.search.push({width,scenarios:outputs.after.length,repeatedResultMutations:0});console.log('PASS search',width);
}
async function navigation(browser,width,reduced){
  const f=await fixture(browser,variants.after,{width,reduced,delays:true,theme:'light'});
  try{
    await ready(f.page,f.origin,'/posts/');const epoch=await f.page.evaluate(()=>performance.timeOrigin);
    if(!reduced){
      await f.page.evaluate(()=>{window.earlyNavigation=SonglinePageTransition.navigateLink('/friends/');});
      await f.page.waitForFunction(()=>document.querySelector('link[data-songline-transition-preload]'));
      assert.equal(await f.page.locator('[data-content-archive]').count(),1,'The old content stays intact during warming');
      assert.equal(await f.page.locator('#songline-friends-galaxy-style').count(),0,'Preloading must not apply target CSS');
      assert.equal(await f.page.evaluate(()=>document.documentElement.dataset.theme),'light');
      await f.page.evaluate(()=>earlyNavigation);
      assert.equal(await f.page.evaluate(()=>document.documentElement.dataset.theme),'dark');
      assert.equal(f.requests.filter(request=>new URL(request.url,f.origin).pathname==='/css/pages/friends/galaxy.css').length,1,'The stylesheet consumes its preload without a second HTTP transfer');
      await f.page.evaluate(()=>SonglinePageTransition.navigateLink('/posts/'));
    }
    await f.page.evaluate(()=>{
      window.firstNavigation=SonglinePageTransition.navigateLink('/friends/');
      window.latestNavigation=SonglinePageTransition.navigateLink('/tools/');
    });await f.page.evaluate(()=>latestNavigation);
    assert.equal(new URL(f.page.url()).pathname,'/tools/');assert.equal(await f.page.evaluate(()=>performance.timeOrigin),epoch);
    await f.page.evaluate(()=>{
      window.pendingNavigation=SonglinePageTransition.navigateLink('/friends/');
      history.back();
    });
    await f.page.waitForFunction(()=>location.pathname==='/friends/'&&!document.documentElement.classList.contains('songline-page-transitioning'));
    // The previous completed destination is the friends page; history traversal
    // during a request must not push another duplicate entry over it.
    await f.page.evaluate(()=>history.back());
    await f.page.waitForFunction(()=>location.pathname==='/posts/'&&!document.documentElement.classList.contains('songline-page-transitioning'));
    await f.page.evaluate(()=>SonglinePageTransition.navigateLink('/posts/linux-note/#%E4%BB%A3%E7%A0%81'));
    assert(await f.page.locator('#代码').count());
    const legacyTarget=await f.page.evaluate(async()=>new DOMParser().parseFromString(await (await fetch('/tags/linux/')).text(),'text/html').querySelector('meta[name="songline-archive-target"]').content);
    await f.page.evaluate(()=>SonglinePageTransition.navigateLink('/tags/linux/'));
    assert.equal(new URL(f.page.url()).pathname,'/posts/');assert.equal(new URL(f.page.url()).searchParams.get('tag'),new URL(legacyTarget,f.origin).searchParams.get('tag'));
    assert.equal(await f.page.locator('link[data-songline-transition-preload]').count(),0);assert.deepEqual(f.errors,[]);
    report.navigation.push({width,reduced,history:true,queue:true,hash:true,legacy:true});console.log('PASS navigation',width,reduced);
  }finally{await f.close();}
}
async function failures(browser){
  for(const fault of ['/friends/','/css/pages/friends/galaxy.css']){
    const f=await fixture(browser,variants.after,{delays:true});
    try{
      await ready(f.page,f.origin,'/posts/');const epoch=await f.page.evaluate(()=>performance.timeOrigin);
      f.faults.set(fault,503);
      await f.page.evaluate(()=>{SonglinePageTransition.navigateLink('/friends/');});
      await f.page.waitForFunction(previous=>performance.timeOrigin!==previous,epoch);
      await f.page.waitForLoadState('load');assert.equal(new URL(f.page.url()).pathname,'/friends/');
      assert.equal(await f.page.locator('link[data-songline-transition-preload]').count(),0);assert.deepEqual(f.errors,[]);
      report.navigation.push({fault,documentFallback:true});console.log('PASS fallback',fault);
    }finally{await f.close();}
  }
}
async function visual(browser,width,theme){
  for(const route of ['/','/posts/','/posts/linux-note/','/friends/','/friends/memories/','/tools/']){
    const states={},pixels={};
    for(const [variant,source] of Object.entries(variants)){
      const f=await fixture(browser,source,{width,theme,reduced:true});
      try{
        await ready(f.page,f.origin,route);
        await f.page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}'});
        await f.page.evaluate(()=>SonglineResources.prepare(document,{modules:false}));
        states[variant]=await f.page.evaluate(()=>{
          const nodes=[...document.querySelectorAll('main.container,.content-archive,.friends-constellation,.memory-room,.tools-excavation,.article-reader')];
          return {overflow:document.documentElement.scrollWidth>innerWidth+2,geometry:nodes.map(node=>{const r=node.getBoundingClientRect();return ['x','y','width','height'].map(key=>Math.round(r[key]*10)/10);}),styles:nodes.map(node=>{const s=getComputedStyle(node);return ['display','color','backgroundColor','fontSize','padding'].map(key=>s[key]);})};
        });
        pixels[variant]=await f.page.screenshot({path:path.join(out,`${width}-${theme}-${route.replace(/\W/g,'_')}-${variant}.png`),mask:[f.page.locator('canvas')],animations:'disabled'});
        assert.deepEqual(f.errors,[]);
      }finally{await f.close();}
    }
    assert.equal(states.after.overflow,false);assert.deepEqual(states.after,states.before);
    const a=await sharp(pixels.before).ensureAlpha().raw().toBuffer(),b=await sharp(pixels.after).ensureAlpha().raw().toBuffer();
    let sum=0;for(let i=0;i<a.length;i++)sum+=Math.abs(a[i]-b[i]);const delta=sum/a.length;
    assert(delta<.35,'Unexpected visible difference '+route+': '+delta);report.visual.push({width,theme,route,meanPixelDifference:delta});
  }console.log('PASS visual',width,theme);
}
async function lifecycle(browser,width){
  const reduced=process.env.INTERACTION_LIFECYCLE_MOTION!=='normal';
  const f=await fixture(browser,variants.after,{width,reduced});
  try{
    await f.page.addInitScript(()=>{
      window.interactionTasks={};
      for(const [schedule,cancel,recurring] of [['setTimeout','clearTimeout',false],['setInterval','clearInterval',true],['requestAnimationFrame','cancelAnimationFrame',false],['requestIdleCallback','cancelIdleCallback',false]]){
        if(!window[schedule])continue;
        const pending=new Set(),start=window[schedule].bind(window),stop=window[cancel].bind(window);
        interactionTasks[schedule]=pending;
        window[schedule]=function(callback,...args){const id=start(function(...values){if(!recurring)pending.delete(id);return callback.apply(this,values);},...args);pending.add(id);return id;};
        window[cancel]=function(id){pending.delete(id);return stop(id);};
      }
    });
    await ready(f.page,f.origin,'/friends/');const epoch=await f.page.evaluate(()=>performance.timeOrigin),samples=[];
    for(let round=0;round<10;round++){
      for(const route of ['/posts/linux-note/','/tools/','/friends/memories/','/','/friends/'])await f.page.evaluate(route=>SonglinePageTransition.navigateLink(route),route);
      // Let bounded initialization/icon correction settle before identical GC.
      await f.page.waitForTimeout(600);await f.cdp.send('HeapProfiler.collectGarbage');
      samples.push({...await f.cdp.send('Memory.getDOMCounters'),tasks:await f.page.evaluate(()=>Object.fromEntries(Object.entries(interactionTasks).map(([key,set])=>[key,set.size])))});
      assert.equal(await f.page.evaluate(()=>performance.timeOrigin),epoch);
      assert.equal(await f.page.locator('[data-site-map]').count(),1);assert.equal(await f.page.locator('link[data-songline-transition-preload]').count(),0);
    }
    const steady=samples.slice(2);
    for(const key of ['documents','nodes','jsEventListeners'])assert(steady.at(-1)[key]<=steady[0][key]+({documents:0,nodes:120,jsEventListeners:15}[key]),key+' accumulated');
    for(const key of Object.keys(steady[0].tasks))assert(steady.at(-1).tasks[key]<=steady[0].tasks[key]+2,key+' accumulated');
    assert.deepEqual(f.errors,[]);report.lifecycle.push({width,reduced,samples});console.log('PASS lifecycle',width,reduced,JSON.stringify(samples));
  }finally{await f.close();}
}
(async()=>{
  const browser=await launch();
  try{
    const only=process.env.INTERACTION_REGRESSION_ONLY;
    if(!only||only==='search')for(const width of [1440,390])await search(browser,width);
    if(!only||only==='navigation'){for(const width of [1440,390])for(const reduced of [false,true])await navigation(browser,width,reduced);await failures(browser);}
    if(!only||only==='visual')for(const width of [1440,390])for(const theme of ['dark','light'])await visual(browser,width,theme);
    if(!only||only==='lifecycle')for(const width of [1440,390])await lifecycle(browser,width);
  }finally{fs.writeFileSync(path.join(out,process.env.INTERACTION_REGRESSION_ONLY?'regressions-'+process.env.INTERACTION_REGRESSION_ONLY+'.json':'regressions.json'),JSON.stringify(report,null,2));await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
