// Offline integration audit: no production API writes or third-party requests.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const repo=path.resolve(__dirname,'..');
const build=process.env.BLOG_UI_BUILD;
assert(build && fs.existsSync(path.join(build,'index.html')),'Provide a fresh BLOG_UI_BUILD');
const baseline=process.env.BLOG_STABILITY_BASELINE==='1';
const base='http://stability.test';
const out=path.join(repo,'local-only/stability');
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100"><rect width="160" height="100" fill="#607d8b"/></svg>';
const wav=Buffer.alloc(44+8000*2*3);
wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
const results=[];
async function fixture(browser,width=1440,theme='dark'){
 const context=await browser.newContext({viewport:{width,height:900},hasTouch:width<981,isMobile:width<981});
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(u.origin!==base || u.pathname.startsWith('/uploads/'))return route.fulfill({body:svg,contentType:'image/svg+xml'});
  if(u.pathname.includes('/api/'))return route.fulfill({json:{views:83,items:[],messages:[],scores:[],authenticated:false}});
  const root=u.pathname.startsWith('/static/')?path.join(repo,'web/static'):path.resolve(build);
  const file=path.resolve(root,decodeURIComponent(u.pathname.replace(/^\/static\//,'/').slice(1))+(u.pathname.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
  return route.fulfill({body:fs.readFileSync(file),contentType:({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream'});
 });
 await context.addInitScript(theme=>{
  localStorage.setItem('songline-theme',theme);
  localStorage.setItem('songline-toc-state','expanded');
  localStorage.setItem('songline-privacy-v1',JSON.stringify({version:1,statistics:false,expires:Date.now()+86400000}));
  sessionStorage.setItem('songline-home-boot-v21.4','1');
  // Track global handlers, not transient DOM listeners; old tool pages must release them.
  const add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener;
  const listeners=[];
  EventTarget.prototype.addEventListener=function(type,fn,opts){
   if(this===window||this===document){
    const capture=typeof opts==='boolean'?opts:!!opts?.capture;
    if(!listeners.some(x=>x.target===this&&x.type===type&&x.fn===fn&&x.capture===capture))listeners.push({target:this,type,fn,capture});
   }
   return add.call(this,type,fn,opts);
  };
  EventTarget.prototype.removeEventListener=function(type,fn,opts){
   const capture=typeof opts==='boolean'?opts:!!opts?.capture;
   const i=listeners.findIndex(x=>x.target===this&&x.type===type&&x.fn===fn&&x.capture===capture);
   if(i>=0)listeners.splice(i,1);
   return remove.call(this,type,fn,opts);
  };
  window.globalHandlerCounts=()=>Object.fromEntries(['scroll','resize','visibilitychange','keydown','songline:page-transition-start'].map(type=>[type,listeners.filter(x=>x.type===type).length]));
  const raf=window.requestAnimationFrame,cancel=window.cancelAnimationFrame,frames=new Map();
  window.requestAnimationFrame=function(fn){let id=raf.call(window,time=>{frames.delete(id);fn(time);});frames.set(id,fn.name);return id;};
  window.cancelAnimationFrame=function(id){frames.delete(id);return cancel.call(window,id);};
  window.pendingTimerFrames=()=>[...frames.values()].filter(name=>name==='render').length;
  const create=URL.createObjectURL,revoke=URL.revokeObjectURL;window.activeBlobURLs=new Set();
  URL.createObjectURL=function(blob){const url=create.call(this,blob);activeBlobURLs.add(url);return url;};
  URL.revokeObjectURL=function(url){activeBlobURLs.delete(url);return revoke.call(this,url);};
  const NativeAudioContext=window.AudioContext,contexts=[];
  if(NativeAudioContext)window.AudioContext=class extends NativeAudioContext{constructor(...args){super(...args);contexts.push(new WeakRef(this));}};
  window.openAudioContexts=()=>contexts.filter(ref=>{const ctx=ref.deref();return ctx&&ctx.state!=='closed';}).length;
 },theme);
 const page=await context.newPage();const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 return {context,page,errors};
}
async function ready(page,route){
 await page.waitForFunction(route=>location.pathname===route && window.SonglinePageModules && !document.documentElement.classList.contains('songline-page-transitioning') && !document.documentElement.classList.contains('is-scene-preparing'),route);
 await page.evaluate(()=>SonglinePageModules.ready(document));
}
async function navigate(page,route){
 const origin=await page.evaluate(()=>performance.timeOrigin);
 await page.evaluate(route=>SonglinePageTransition.navigateLink(route),base+route);
 await ready(page,route);
 assert.equal(await page.evaluate(()=>performance.timeOrigin),origin,'AJAX navigation must not fall back to a refresh');
}
async function uploadFile(page,selector,file){
 if(!page.memoryPhase)return page.locator(selector).setInputFiles(file);
 // Chromium's inspector upload command pins file inputs in its console group.
 // Direct-entry tests cover that real command; repeat-visit heap checks feed an
 // equivalent FileList in-page so inspector roots do not look like app leaks.
 await page.locator(selector).evaluate((input,{name,type,bytes})=>{
  const transfer=new DataTransfer();transfer.items.add(new File([new Uint8Array(bytes)],name,{type}));
  input.files=transfer.files;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));
 },{name:file.name,type:file.mimeType,bytes:[...file.buffer]});
}
async function tools(page,route){
 if(route==='/tools/random-number/'){
  await page.locator('[data-random-min]').fill('17');await page.locator('[data-random-max]').fill('17');
  await page.locator('[data-random-min]').press('Enter');assert.equal(await page.locator('[data-random-result]').textContent(),'17');
 }else if(route==='/tools/gacha/'){
  await page.locator('[data-gacha-pull-ten]').click();assert.equal(await page.locator('[data-gacha-total]').textContent(),'10','One click must pull exactly ten');
  await page.locator('[data-gacha-reset]').click();assert.equal(await page.locator('[data-gacha-total]').textContent(),'0');
 }else if(route==='/tools/focus-timer/'){
  await page.locator('[data-focus-sound]').uncheck();
  await page.locator('[data-focus-toggle]').click();assert.equal(await page.locator('[data-focus-toggle]').textContent(),'暂停');
  const frames=await page.evaluate(()=>{for(let i=0;i<4;i++)document.dispatchEvent(new Event('visibilitychange'));return pendingTimerFrames();});
  if(!baseline)assert.equal(frames,1,'Visibility events must not multiply timer animation loops');
  await page.locator('[data-focus-toggle]').click();assert.equal(await page.locator('[data-focus-toggle]').textContent(),'开始');
  await page.locator('[data-focus-toggle]').click();
 }else if(route==='/tools/markdown-previewer/'){
  await uploadFile(page,'[data-md-file]',{name:'stability.md',mimeType:'text/markdown',buffer:Buffer.from('# 一级\n\n## 二级\n\n#### 四级 <name>\n\n```js\nconst example = 1;\n```\n\n'+('正文。'.repeat(200)+'\n\n').repeat(20))});
  await page.waitForFunction(()=>document.querySelector('[data-md-name]').textContent==='stability.md');
  assert.equal(await page.locator('[data-md-toc] a').count(),3);
  if(!baseline)await page.locator('.md-code-copy').waitFor();
 }else if(route==='/tools/2048/'){
  assert(await page.locator('.game-2048-tile').count()>0);
  const toggle=page.locator('[data-2048-sound-toggle]'),before=await toggle.getAttribute('aria-pressed');
  await toggle.click();assert.notEqual(await toggle.getAttribute('aria-pressed'),before);
  await page.locator('[data-2048-new]').click();
 }else if(route==='/tools/snake/'){
  if(await page.locator('[data-snake-start]').isVisible()){
   await page.locator('[data-snake-sound]').uncheck();await page.locator('[data-snake-start]').click();
   await page.locator('[data-snake-pause]').click();
  }else{
   await page.locator('[data-snake-overlay]').click();await page.locator('[data-snake-canvas]').click();
  }
  assert.match(await page.locator('[data-snake-state]').textContent(),/暂停/);
 }else if(route==='/tools/typing-practice/'){
  await page.locator('[data-typing-mode="mixed"]').click();assert.match(await page.locator('[data-typing-mode-label]').textContent(),/中/);
  await page.locator('[data-typing-mode="english"]').click();await page.locator('[data-typing-input]').pressSequentially('Typing');
  await page.locator('[data-typing-restart]').click();assert.equal(await page.locator('[data-typing-input]').inputValue(),'');
 }else if(route==='/tools/reaction-test/'){
  await page.locator('[data-reaction-sound-toggle]').click();await page.locator('[data-reaction-start]').click();
  assert(await page.locator('[data-reaction-stage]').evaluate(e=>e.classList.contains('is-waiting')));
 }else if(route==='/tools/flappy-bird/'){
  await page.locator('[data-flappy-sound-toggle]').click();await page.locator('[data-flappy-start]').click();
  assert.equal(await page.locator('[data-flappy-overlay]').evaluate(e=>e.hidden),true);
 }else if(route==='/tools/audio-visualizer/'){
  await uploadFile(page,'[data-av-file]',{name:'test.wav',mimeType:'audio/wav',buffer:wav});
  await page.waitForFunction(()=>document.querySelector('[data-av-audio]').readyState>=2);
  await page.locator('[data-av-display-mode]').click();assert.equal(await page.locator('[data-av-display-mode]').getAttribute('aria-pressed'),'true');
  await page.keyboard.press('Escape');assert.equal(await page.locator('[data-av-display-mode]').getAttribute('aria-pressed'),'false');
  if(await page.locator('[data-av-playlist-toggle]').isVisible()){
   await page.locator('[data-av-playlist-toggle]').click();assert.equal(await page.locator('[data-av-playlist-toggle]').getAttribute('aria-expanded'),'false');
  }
 }else if(route==='/'){
  if(await page.locator('[data-desktop-pet]').isVisible()){
   assert.equal(await page.locator('[data-desktop-pet]').getAttribute('data-desktop-pet-ready'),'1','Home-only component initializes when arriving from a reader');
   await page.locator('[data-desktop-pet]').scrollIntoViewIfNeeded();
   const pet=await page.locator('[data-desktop-pet]').boundingBox();
   await page.mouse.move(pet.x+pet.width/2,pet.y+pet.height/2);await page.mouse.down();await page.mouse.move(pet.x+pet.width/2+20,pet.y+pet.height/2,{steps:4});
   assert(await page.locator('[data-desktop-pet]').evaluate(e=>e.classList.contains('is-dragging')));
   await page.mouse.up();
   if(await page.evaluate(()=>innerWidth<981)){
    const target=await page.locator('.songline-desktop-pet__image').boundingBox(),cdp=await page.context().newCDPSession(page);
    const points=x=>[{x,y:target.y+target.height/2,id:1}];
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points(target.x+target.width/2)});
    for(let i=1;i<=4;i++){
     await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:points(target.x+target.width/2+i*8)});
     assert(await page.locator('[data-desktop-pet]').evaluate(e=>e.classList.contains('is-dragging')),'Child capture handoff cannot end the pet drag');
    }
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
   }
   if(await page.evaluate(()=>innerWidth>980))assert.equal(await page.evaluate(()=>typeof SonglineInitHomeParallax),'function');
  }
  await uploadFile(page,'[data-home-music-file]',{name:'test.wav',mimeType:'audio/wav',buffer:wav});
  await page.waitForFunction(()=>document.querySelector('[data-home-music-audio]').readyState>=2);
  await page.locator('[data-home-music-toggle]').click();await page.waitForFunction(()=>!document.querySelector('[data-home-music-audio]').paused);
  await page.locator('[data-home-music-toggle]').click();
  if(await page.locator('[data-home-panel-goto]').isVisible()){
   await page.locator('[data-home-panel-goto]').click();assert.notEqual(await page.locator('[data-home-panel]').getAttribute('data-home-panel-state'),'system');
   await page.locator('[data-home-panel-return]').click();assert.equal(await page.locator('[data-home-panel]').getAttribute('data-home-panel-state'),'system');
  }
 }else if(route==='/friends/'){
  const world=page.locator('[data-galaxy-world]');
  const before=await world.evaluate(e=>new DOMMatrixReadOnly(getComputedStyle(e).transform).a);
  const stage=await page.locator('[data-galaxy-stage]').boundingBox();
  await page.mouse.move(stage.x+stage.width/2,Math.min(800,stage.y+stage.height/2));
  await page.mouse.wheel(0,-160);await page.waitForTimeout(350);
  assert(await world.evaluate(e=>new DOMMatrixReadOnly(getComputedStyle(e).transform).a)>before);
  await page.mouse.wheel(0,160);
 }else if(route==='/tags/'){
  await page.locator('#tagRiverSearch').fill('不会存在的标签');await page.locator('#tagRiverSearchSubmit').click();
  assert.match(await page.locator('[data-tag-search-results]').textContent(),/没有|未找到|暂无/);
  await page.locator('#tagRiverSearch').press('Escape');
 }
}
async function toc(page,width){
 await page.locator('.toc-tree a').first().waitFor({state:'attached'});
 if(width>980){
  await page.evaluate(()=>{const shell=document.querySelector('.article-shell');scrollTo({top:shell.getBoundingClientRect().top+scrollY+200,behavior:'instant'});});
  await page.mouse.move(0,0);await page.waitForTimeout(220);
  const before=await page.locator('.article-toc').boundingBox();
  await page.mouse.move(before.x+before.width/2,before.y+before.height-0.5);
  const positions=[];
  for(let i=0;i<8;i++){await page.waitForTimeout(40);positions.push((await page.locator('.article-toc').boundingBox()).y);}
  const drift=Math.max(...positions)-Math.min(before.y,...positions);
  results.push({toc:{width,drift,positions}});
  if(!baseline)assert(drift<0.2,'Stationary pointer cannot cause TOC edge hover oscillation');
  await page.mouse.move(0,0);await page.waitForTimeout(220);
  const link=page.locator('.toc-tree a').first(),linkRect=await link.boundingBox();
  await page.mouse.move(linkRect.x+0.5,linkRect.y+linkRect.height/2);
  const linkPositions=[];
  for(let i=0;i<8;i++){await page.waitForTimeout(40);linkPositions.push((await link.boundingBox()).x);}
  const linkDrift=Math.max(...linkPositions)-Math.min(linkRect.x,...linkPositions);
  results.push({tocLink:{width,linkDrift,linkPositions}});
  if(!baseline)assert(linkDrift<0.2,'Directory link left edge cannot oscillate under a stationary pointer');
  await page.locator('.article-toc').focus();await page.keyboard.press('Enter');
  assert.equal(await page.locator('.article-shell').getAttribute('data-toc-state'),'collapsed');
  await page.keyboard.press('Space');assert.equal(await page.locator('.article-shell').getAttribute('data-toc-state'),'expanded');
  await page.locator('.toc-tree a').first().focus();await page.keyboard.press('Enter');
  assert.equal(await page.locator('.article-shell').getAttribute('data-toc-state'),'expanded','Anchor activation must not collapse TOC');
 }else{
  await page.locator('#songline-mobile-toc-fab').click();await page.locator('[data-mobile-toc-search]').fill('不存在的标题');
  assert.equal(await page.locator('.mobile-toc-item').count(),0);
  await page.evaluate(()=>SonglinePageModules.ready(document));
  assert.equal(await page.locator('#songline-mobile-toc-drawer').getAttribute('aria-hidden'),'false','Repeat hydration must preserve the open drawer');
  assert.equal(await page.locator('[data-mobile-toc-search]').inputValue(),'不存在的标题','Repeat hydration preserves the search');
  await page.locator('[data-mobile-toc-search]').fill('');await page.locator('.mobile-toc-item').first().click();
  assert.equal(await page.locator('#songline-mobile-toc-drawer').getAttribute('aria-hidden'),'true');
  await page.locator('#songline-mobile-toc-fab').click();await page.keyboard.press('Escape');
 }
}
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  if(baseline){
   const {context,page}=await fixture(browser);
   await page.goto(base+'/posts/linux-note/');await ready(page,'/posts/linux-note/');await toc(page,1440);
   const samples=[];
   for(let i=0;i<3;i++){
    await navigate(page,'/tools/focus-timer/');await tools(page,'/tools/focus-timer/');
    await navigate(page,'/tools/markdown-previewer/');await tools(page,'/tools/markdown-previewer/');
    await navigate(page,'/posts/');samples.push(await page.evaluate(()=>globalHandlerCounts()));
   }
   await navigate(page,'/');
   const home=await page.evaluate(()=>({petReady:document.querySelector('[data-desktop-pet]')?.dataset.desktopPetReady||null,parallaxReady:typeof SonglineInitHomeParallax==='function'}));
   results.push({baseline,samples,home});await context.close();return;
  }
  const toolRoutes=['random-number','gacha','focus-timer','markdown-previewer','2048','snake','typing-practice','reaction-test','flappy-bird','audio-visualizer'].map(x=>'/tools/'+x+'/');
  // Every tool gets a direct-entry check, not just an AJAX-entry check.
  for(const route of process.env.BLOG_STABILITY_MOBILE_ONLY||process.env.BLOG_STABILITY_DESKTOP_ONLY?[]:['/',...toolRoutes]){
   const {context,page,errors}=await fixture(browser);
   await page.goto(base+route);await ready(page,route);await tools(page,route);
   if(route==='/tools/flappy-bird/'){
    await page.waitForFunction(()=>!document.querySelector('[data-flappy-overlay]').hidden);
    await page.evaluate(()=>{dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});
    await page.keyboard.press('Space');assert.equal(await page.locator('[data-flappy-overlay]').evaluate(e=>e.hidden),true,'Keyboard works after a cached-page restore');
   }
   if(route==='/tools/audio-visualizer/'){
    await page.evaluate(()=>{dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});
    await page.waitForTimeout(100);
    await page.locator('[data-av-volume]').focus();await page.keyboard.press('Tab');await page.locator('[data-av-volume]').evaluate(e=>e.blur());
    const paused=await page.locator('[data-av-audio]').evaluate(e=>e.paused);await page.keyboard.press('Space');
    await page.waitForFunction(paused=>document.querySelector('[data-av-audio]').paused!==paused,paused);
   }
   assert.deepEqual(errors,[]);await context.close();
  }
  for(const [width,theme] of (process.env.BLOG_STABILITY_MOBILE_ONLY?[[390,'dark']]:process.env.BLOG_STABILITY_DESKTOP_ONLY?[[1440,'dark']]:[[1440,'dark'],[1440,'light'],[390,'dark']])){
   const {context,page,errors}=await fixture(browser,width,theme);
   await page.goto(base+'/posts/linux-note/');await ready(page,'/posts/linux-note/');await toc(page,width);
   page.memoryPhase=true;
   const samples=[],memory=[];const cdp=await context.newCDPSession(page);
   for(let cycle=0;cycle<3;cycle++){
    for(const route of ['/','/friends/','/friends/memories/','/tags/','/posts/','/tools/',...toolRoutes]){
     await navigate(page,route);
     await tools(page,route);
     if(route==='/tools/'){
      const search=page.locator('[data-tools-search]');await search.fill('不会存在的工具名称');
      assert.equal(await page.locator('.tools-strata:not([hidden])').count(),0);
      await search.press('Escape');assert(await page.locator('.tools-strata:not([hidden])').count()>0);
     }
     if(route==='/friends/memories/' && await page.locator('[data-memory-open]').count()){
      const visible=await page.locator('[data-memory-open]').evaluateAll(nodes=>nodes.findIndex(e=>{const r=e.getBoundingClientRect();return r.x+r.width/2>0&&r.x+r.width/2<innerWidth&&r.y+r.height/2>0&&r.y+r.height/2<innerHeight;}));
      assert(visible>=0,'At least one memory can be reached in the initial viewport');
      await page.locator('[data-memory-open]').nth(visible).click();assert.equal(await page.locator('[data-memory-lightbox]').evaluate(e=>e.hidden),false);
      await page.locator('[data-memory-close]').click();
     }
     if(!route.includes('markdown-previewer')&&!route.startsWith('/posts/'))assert.equal(await page.locator('.songline-reading-float-button').count(),0);
     assert.equal(await page.locator('[data-elevator-nav]').count(),1);
    }
    await navigate(page,'/posts/linux-note/');await toc(page,width);
    await navigate(page,'/posts/');samples.push(await page.evaluate(()=>globalHandlerCounts()));
    assert.equal(await page.evaluate(()=>activeBlobURLs.size),0,'Departing players release all local file URLs');
    assert.equal(await page.evaluate(()=>openAudioContexts()),0,'Departing games and players close audio contexts');
    // DOM.setFileInputFiles / inspector logging retains input nodes in the
    // DevTools console object group. Release that harness-only root before GC.
    await page.waitForTimeout(1600);await cdp.send('Runtime.discardConsoleEntries');
    await cdp.send('HeapProfiler.collectGarbage');memory.push(await cdp.send('Memory.getDOMCounters'));
    console.log('memory',width,theme,cycle,memory.at(-1));
   }
   results.push({width,theme,samples,memory,errors});
   if(memory[2].nodes>memory[1].nodes+150 && process.env.BLOG_STABILITY_HEAP){
    const chunks=[];cdp.on('HeapProfiler.addHeapSnapshotChunk',event=>chunks.push(event.chunk));
    await cdp.send('HeapProfiler.takeHeapSnapshot');fs.writeFileSync(path.join(out,'heap.json'),chunks.join(''));
   }
   assert.deepEqual(samples[2],samples[1],'Global handlers must not accumulate after repeated visits');
   assert(memory[2].nodes<=memory[1].nodes+150,'Tool pages cannot accumulate detached nodes');
   assert(memory[2].jsEventListeners<=memory[1].jsEventListeners+20,'Tool pages cannot accumulate DOM listeners');
   assert.equal(memory[2].documents,memory[1].documents,'Temporary documents must be released');
   await navigate(page,'/tools/random-number/');await navigate(page,'/tools/gacha/');
   await page.goBack();await ready(page,'/tools/random-number/');await tools(page,'/tools/random-number/');
   await page.goForward();await ready(page,'/tools/gacha/');await tools(page,'/tools/gacha/');
   assert.deepEqual(errors,[]);
   console.log('stability passed',width,theme);await context.close();
  }
 }finally{fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,baseline?'baseline.json':'report.json'),JSON.stringify(results,null,2));await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
