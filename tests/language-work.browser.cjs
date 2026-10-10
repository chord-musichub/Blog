// Comparable real-page language work; fixture data never touches user content.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {launch,fixture,ready}=require('./helpers/interaction-fixture.cjs');
const variants=JSON.parse(process.env.LANGUAGE_WORK_VARIANTS||'{}');
const out=process.env.LANGUAGE_WORK_OUT||'local-only/final-optimization-2026-10-10';
const mode=process.env.LANGUAGE_WORK_MODE||'performance';
const aligned=process.env.LANGUAGE_WORK_ALIGNED==='1';
function stats(values){const a=[...values].sort((a,b)=>a-b),q=p=>a[Math.ceil(a.length*p)-1];return {n:a.length,median:q(.5),p95:q(.95),min:a[0],max:a.at(-1),iqr:q(.75)-q(.25)};}
async function performanceRun(browser,source,width,cpu,large,profile){
 const f=await fixture(browser,source,{width,cpu});
 try{
  if(profile)await f.context.addInitScript(()=>{
   window.__walks={walkers:0,steps:0};const create=document.createTreeWalker.bind(document);
   document.createTreeWalker=function(...args){__walks.walkers++;const walker=create(...args),step=walker.nextNode.bind(walker);walker.nextNode=function(){__walks.steps++;return step();};return walker;};
  });
  await ready(f.page,f.origin,'/posts/linux-note/');
  await f.page.waitForTimeout(600);
  if(large)await f.page.evaluate(()=>{
   const reader=document.querySelector('.markdown-body'),fragment=document.createDocumentFragment();
   for(let i=0;i<1000;i++){const p=document.createElement('p');p.textContent='首页 '+i+'：这是用户正文，语言切换应保留原文。';fragment.append(p);}
   reader.append(fragment);
  });
  // Warm both languages and let asynchronous hydration settle equally.
  await f.page.evaluate(()=>{SonglineI18n.setLanguage('en');SonglineI18n.setLanguage('zh');});await f.page.waitForTimeout(200);
  const samples=await f.page.evaluate(async({profile,aligned})=>{
   const rows=[],button=document.querySelector('[data-language-toggle]');
   const content=()=>JSON.stringify(Array.from(document.querySelectorAll('.markdown-body p,.markdown-body h1,.markdown-body h2')).map(n=>n.textContent));
   const body=content();
   const frame=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   for(let i=0;i<(profile?4:60);i++){
    if(profile)__walks={walkers:0,steps:0};
    const start=performance.now();button.click();const handled=performance.now()-start;
    await frame();const presented=performance.now()-start;
    if(content()!==body)throw Error('User content changed');
    rows.push({kind:'toggle',handled,presented,walks:profile?{...__walks}:null});
   }
   SonglineI18n.setLanguage('en');await frame();
   for(let i=0;i<(profile?4:100);i++){
    // Removal work in the preceding iteration must not move the next input's
    // phase inside the frame and bias the double-RAF latency proxy.
    if(aligned)await frame();
    const status=document.createElement('p');status.dataset.i18nUi='';status.textContent='正在加载留言…';
    if(profile)__walks={walkers:0,steps:0};
    const start=performance.now();document.body.append(status);
    await Promise.resolve();await Promise.resolve();const handled=performance.now()-start;
    if(status.textContent!==SonglineI18n.t('正在加载留言…'))throw Error('Live UI not translated');
    await frame();const presented=performance.now()-start;
    rows.push({kind:'insert',handled,presented,walks:profile?{...__walks}:null});
    status.remove();await Promise.resolve();await Promise.resolve();
   }
   return rows;
  },{profile,aligned});
  assert.deepEqual(f.errors,[]);
  return {width,cpu,large,samples,summary:Object.fromEntries(['toggle','insert'].map(kind=>[kind,{handled:stats(samples.filter(s=>s.kind===kind).map(s=>s.handled)),presented:stats(samples.filter(s=>s.kind===kind).map(s=>s.presented)),walks:profile?samples.find(s=>s.kind===kind).walks:null}]))};
 }finally{await f.close();}
}
async function regressionRun(browser,source,width,theme,reduced){
 const f=await fixture(browser,source,{width,theme,reduced,delays:width===320});
 try{
  const page=f.page;await ready(page,f.origin,'/tools/');
  await page.locator('[data-language-toggle]').focus();await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.documentElement.lang==='en');
  const checks=await page.evaluate(async()=>{
   const root=document.createElement('section');document.body.append(root);
   const settle=async()=>{await Promise.resolve();await Promise.resolve();};
   const check=(value,expected)=>{if(value!==expected)throw Error(JSON.stringify({value,expected}));};
   const ui=document.createElement('div');ui.dataset.i18nUi='';ui.innerHTML='<span>首页</span><span data-i18n-ui>工具</span>';root.append(ui);await settle();
   check(ui.firstChild.textContent,'Home');check(ui.lastChild.textContent,'Tools');
   ui.firstChild.firstChild.nodeValue='档案';await settle();check(ui.firstChild.textContent,'Archive');
   const owned=document.createElement('span');owned.dataset.i18nText='';owned.textContent='首页';root.append(owned);await settle();check(owned.textContent,'Home');
   owned.firstChild.nodeValue='工具';await settle();check(owned.textContent,'Tools');
   owned.textContent='档案';await settle();check(owned.textContent,'Archive');
   const input=document.createElement('input');input.dataset.i18nAttrs='placeholder aria-label';input.placeholder='搜索工具';input.value='首页';root.append(input);await settle();check(input.placeholder,'Search tools');check(input.value,'首页');
   input.setAttribute('aria-label','首页');await settle();check(input.getAttribute('aria-label'),'Home');
   const text=document.createElement('p');text.textContent='首页';root.append(text);await settle();check(text.textContent,'首页');
   text.dataset.i18nUi='';await settle();check(text.textContent,'Home');
   const ignore=document.createElement('div');ignore.dataset.i18nIgnore='';ignore.innerHTML='<span data-i18n-ui>首页</span>';root.append(ignore);await settle();check(ignore.textContent,'首页');
   const dynamic=document.createElement('section');dynamic.innerHTML='<p data-i18n-ui>朋友</p>';root.append(dynamic);await settle();check(dynamic.textContent,'Friends');root.append(dynamic);await settle();check(dynamic.textContent,'Friends');
   const removed=document.createElement('p');removed.dataset.i18nUi='';removed.textContent='首页';root.append(removed);removed.remove();await settle();
   SonglineI18n.setLanguage('zh');check(owned.textContent,'档案');check(ui.firstChild.textContent,'档案');check(input.placeholder,'搜索工具');check(ignore.textContent,'首页');
   SonglineI18n.setLanguage('en');check(owned.textContent,'Archive');check(ui.firstChild.textContent,'Archive');
   owned.replaceChildren();await settle();SonglineI18n.setLanguage('zh');SonglineI18n.setLanguage('en');check(owned.textContent,'');
   const batch=document.createElement('div');root.append(batch);
   for(let i=0;i<100;i++){const p=document.createElement('p');p.textContent='首页';if(i%10===0)p.dataset.i18nUi='';batch.append(p);}
   await settle();Array.from(batch.children).forEach((p,i)=>check(p.textContent,i%10===0?'Home':'首页'));batch.remove();await settle();
   SonglineI18n.setText(owned,'正在保存…');await settle();check(owned.textContent,'Saving…');SonglineI18n.setContent(owned,'首页');await settle();SonglineI18n.setLanguage('zh');SonglineI18n.setLanguage('en');check(owned.textContent,'首页');
   const children=root.childElementCount;for(let i=0;i<20;i++){SonglineI18n.setLanguage('zh');SonglineI18n.setLanguage('en');}check(root.childElementCount,children);
   root.remove();await settle();return {dynamicText:true,attributes:true,nestedScopes:true,userContent:true,removedNodes:true,setters:true};
  });
  await page.evaluate(()=>SonglinePageTransition.navigateLink('/posts/'));
  assert.equal(await page.locator('[data-site-map-current]').innerText(),'Archive');
  await page.evaluate(()=>SonglinePageTransition.navigateLink('/posts/linux-note/'));
  await page.waitForTimeout(reduced?100:800);
  assert.equal(await page.locator('[data-language-toggle]').innerText(),'en');
  await page.goBack();await page.waitForFunction(()=>location.pathname==='/posts/'&&!document.documentElement.classList.contains('songline-page-transitioning'));
  assert.equal(await page.locator('[data-site-map-current]').innerText(),'Archive');
  await page.goForward();await page.waitForFunction(()=>location.pathname==='/posts/linux-note/'&&!document.documentElement.classList.contains('songline-page-transitioning'));
  await page.reload();assert.equal(await page.locator('[data-language-toggle]').innerText(),'en');
  await page.evaluate(()=>localStorage.setItem('songline-language','zh'));await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
  assert.equal(await page.locator('[data-language-toggle]').innerText(),'中');
  assert.deepEqual(f.errors,[]);return {width,theme,reduced,...checks,ajax:true,history:true,pageshow:true};
 }finally{await f.close();}
}
async function bulkRun(browser,source){
 const f=await fixture(browser,source,{width:390,cpu:4});
 try{
  await ready(f.page,f.origin,'/posts/linux-note/');await f.page.waitForTimeout(600);
  const samples=await f.page.evaluate(async()=>{
   SonglineI18n.setLanguage('en');const reader=document.querySelector('.markdown-body'),rows=[];
   const frame=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   await frame();
   for(let i=0;i<40;i++){
    const fragment=document.createDocumentFragment(),nodes=[];
    for(let j=0;j<1000;j++){const p=document.createElement('p');p.textContent='首页';if(j%50===0)p.dataset.i18nUi='';nodes.push(p);fragment.append(p);}
    const start=performance.now();reader.append(fragment);await Promise.resolve();await Promise.resolve();
    rows.push(performance.now()-start);
    if(nodes.some((p,j)=>p.textContent!==(j%50===0?'Home':'首页')))throw Error('Bulk insertion changed UI or content');
    await frame();nodes.forEach(p=>p.remove());await frame();
   }
   return rows;
  });
  assert.deepEqual(f.errors,[]);return {samples,summary:stats(samples)};
 }finally{await f.close();}
}
// Element Timing protects visible first paint; double RAF is only a frame proxy.
async function paintRun(browser,source){
 const f=await fixture(browser,source,{width:390,cpu:4});
 try{
  await ready(f.page,f.origin,'/posts/linux-note/');await f.page.waitForTimeout(600);
  const samples=await f.page.evaluate(async()=>{
    if(!PerformanceObserver.supportedEntryTypes.includes('element'))throw Error('Element Timing unsupported');
    const reader=document.querySelector('.markdown-body'),fragment=document.createDocumentFragment();for(let i=0;i<1000;i++){const p=document.createElement('p');p.textContent='首页 '+i+'：保留用户原文。';fragment.append(p);}reader.append(fragment);
    SonglineI18n.setLanguage('en');await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const waiting=new Map(),observer=new PerformanceObserver(list=>{for(const entry of list.getEntries()){const cb=waiting.get(entry.identifier);if(cb){waiting.delete(entry.identifier);cb(entry.renderTime);}}});observer.observe({type:'element',buffered:true});
    const samples=[];
    for(let i=0;i<100;i++){
     await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
     const status=document.createElement('p'),id='hint-'+i;status.dataset.i18nUi='';status.textContent='正在加载留言…';status.setAttribute('elementtiming',id);status.style.cssText='position:fixed;left:16px;bottom:16px;margin:0;padding:8px;font:16px sans-serif;background:#182936;color:white;z-index:999999';
     let timeout;const painted=new Promise((resolve,reject)=>{timeout=setTimeout(()=>reject(Error('Element Timing timeout')),1500);waiting.set(id,resolve);});
     const at=performance.now();document.body.append(status);const renderAt=await painted;clearTimeout(timeout);
     if(status.textContent!=='Loading messages…')throw Error('Hint not translated');samples.push(renderAt-at);status.remove();await Promise.resolve();await Promise.resolve();
    }
    observer.disconnect();return samples;
   });
  assert.deepEqual(f.errors,[]);return {samples,summary:stats(samples)};
 }finally{await f.close();}
}
(async()=>{
 assert(Object.keys(variants).length,'Set LANGUAGE_WORK_VARIANTS');fs.mkdirSync(out,{recursive:true});const browser=await launch(),start=Date.now(),report={mode,aligned,browser:browser.version(),results:[],elapsedMs:0};
 try{
  if(mode==='paint')for(let round=0;round<Number(process.env.LANGUAGE_WORK_ROUNDS||1);round++)for(const [name,source] of (round%2?Object.entries(variants).reverse():Object.entries(variants))){const result=await paintRun(browser,source);report.results.push({round,name,...result});console.log('Visible first paint',round,name,JSON.stringify(result.summary));}
  else if(mode==='bulk')for(const [name,source] of Object.entries(variants)){const result=await bulkRun(browser,source);report.results.push({name,...result});console.log('Bulk content',name,JSON.stringify(result.summary));}
  else if(mode==='regression')for(const [name,source] of Object.entries(variants))for(const [width,theme,reduced] of [[1440,'dark',false],[390,'light',false],[320,'dark',true]]){const result=await regressionRun(browser,source,width,theme,reduced);report.results.push({name,...result});console.log('PASS language behavior',name,width);}
  else for(let round=0;round<Number(process.env.LANGUAGE_WORK_ROUNDS||1);round++)for(const width of JSON.parse(process.env.LANGUAGE_WORK_WIDTHS||'[1440,390]'))for(const cpu of JSON.parse(process.env.LANGUAGE_WORK_CPUS||'[1,4]'))for(const large of JSON.parse(process.env.LANGUAGE_WORK_LARGE||'[false,true]'))for(const [name,source] of (round%2?Object.entries(variants).reverse():Object.entries(variants))){const result=await performanceRun(browser,source,width,cpu,large,mode==='profile');report.results.push({round,name,...result});console.log(name,width,cpu,large,JSON.stringify(result.summary));}
 }catch(error){report.error=error.stack;throw error;}
 finally{report.elapsedMs=Date.now()-start;fs.writeFileSync(path.join(out,process.env.LANGUAGE_WORK_REPORT||`${mode}.json`),JSON.stringify(report,null,2));await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
