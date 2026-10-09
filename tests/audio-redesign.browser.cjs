// Local-only audio fixtures and intercepted routes: no real uploads or API writes.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const repo=path.resolve(__dirname,'..'),build=path.resolve(process.env.BLOG_UI_BUILD||'local-only/audio-redesign-2026-10-08/standalone/public');
const base='http://audio-stage.test',out=path.join(repo,'local-only/audio-redesign-2026-10-08');
fs.mkdirSync(out,{recursive:true});
function wav(title='潮汐之间 · Between the Tides',artist='Songline'){
 const rate=16000,n=rate*40;
 const chunk=(id,data)=>{const h=Buffer.alloc(8);h.write(id);h.writeUInt32LE(data.length,4);return Buffer.concat([h,data,Buffer.alloc(data.length&1)]);};
 const info=title?chunk('LIST',Buffer.concat([Buffer.from('INFO'),chunk('INAM',Buffer.from(title+'\0')),chunk('IART',Buffer.from(artist+'\0'))])):Buffer.alloc(0);
 const b=Buffer.alloc(44+info.length+n*2);
 b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);
 b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);
 b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);info.copy(b,36);b.write('data',36+info.length);b.writeUInt32LE(n*2,40+info.length);
 for(let i=0;i<n;i++)b.writeInt16LE(Math.round(7000*Math.sin(i*2*Math.PI*220/rate)+2500*Math.sin(i*2*Math.PI*1200/rate)),44+info.length+i*2);
 return b;
}
async function ready(p){
 await p.evaluate(()=>SonglinePageModules.ready(document));
 await p.waitForFunction(()=>!document.documentElement.classList.contains('is-scene-preparing'));
 await p.locator('#songline-scene-entry-loader').waitFor({state:'detached'});
 await p.waitForFunction(()=>!!window.__songlineAudioVisualizerCleanup);
}
async function fixture(browser,width,theme,motion,fallback=false){
 const context=await browser.newContext({viewport:{width,height:1000},isMobile:width<800,hasTouch:width<800,reducedMotion:motion});
 const requests=[];
 if(fallback)await context.addInitScript(()=>{HTMLElement.prototype.showPopover=undefined;HTMLElement.prototype.hidePopover=undefined;});
 await context.route('**/*',async r=>{
  const u=new URL(r.request().url());
  requests.push(u.pathname);
  if(u.origin!==base)return r.fulfill({status:404,body:''});
  if(/\/(?:api|static\/api|write\/api)\//.test(u.pathname))return r.fulfill({json:{views:1,scores:[],messages:[]}});
  const fileRoot=u.pathname.startsWith('/static/')?path.join(repo,'web/static'):build;
  const file=path.resolve(fileRoot,decodeURIComponent(u.pathname.replace(/^\/static\//,'/')).slice(1)+(u.pathname.endsWith('/')?'index.html':''));
  if(!file.startsWith(fileRoot+path.sep)||!fs.existsSync(file))return r.fulfill({status:404,body:''});
  const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.json':'application/json'};
  return r.fulfill({body:fs.readFileSync(file),contentType:types[path.extname(file)]||'application/octet-stream'});
 });
 await context.addInitScript(theme=>{
  localStorage.setItem('songline-theme',theme);localStorage.setItem('songline-privacy-v1',JSON.stringify({version:1,statistics:false,expires:Date.now()+86400000}));
  sessionStorage.setItem('songline-home-boot-v21.4','1');
  const create=URL.createObjectURL,revoke=URL.revokeObjectURL;
  window.avURLs=new Set();
  URL.createObjectURL=function(b){const u=create.call(this,b);avURLs.add(u);return u;};
  URL.revokeObjectURL=function(u){avURLs.delete(u);return revoke.call(this,u);};
  const clear=CanvasRenderingContext2D.prototype.clearRect;
  window.avFrames=[];
  CanvasRenderingContext2D.prototype.clearRect=function(...args){if(this.canvas.matches('[data-av-canvas]'))avFrames.push(performance.now());return clear.apply(this,args);};
 },theme);
 const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(base+'/tools/audio-visualizer/');await ready(p);
 return {p,context,errors,requests};
}
async function trackSettings(p,width,theme,titleBefore){
 const dialog=p.locator('[data-av-track-dialog]'),edit=p.locator('[data-av-track-edit]');
 const initialAudio=await p.locator('[data-av-audio]').evaluate(e=>({src:e.src,time:e.currentTime,paused:e.paused}));
 await edit.click();assert(await dialog.evaluate(e=>e.matches(':modal')));
 assert(await dialog.evaluate(e=>{const b=e.getBoundingClientRect();return b.left>=0 && b.right<=innerWidth && b.top>=0 && b.bottom<=innerHeight;}),'Track settings fit even at 320px');
 assert.equal(await p.locator('[data-av-edit-title]').inputValue(),titleBefore);
 assert.equal(await p.locator('[data-av-edit-artist]').inputValue(),'Songline');
 assert.equal(await p.locator('[data-av-edit-rate]').inputValue(),'16000');
 await p.locator('[data-av-edit-title]').fill('我的潮汐 <3');
 await p.locator('[data-av-edit-artist]').fill('手填作者');
 await p.locator('[data-av-edit-rate]').fill('44100');
 await p.screenshot({path:path.join(out,'settings-'+width+'-'+theme+'.png')});
 await p.locator('[data-av-track-close]').click();await dialog.waitFor({state:'hidden'});
 assert.equal(await p.locator('[data-av-title]').textContent(),'我的潮汐 <3');
 assert.equal(await p.locator('[data-av-title] > *').count(),0,'Manual text never becomes HTML');
 assert.equal(await p.locator('[data-av-artist]').textContent(),'手填作者');
 assert.equal(await p.locator('[data-av-sample-rate]').textContent(),'44.1 kHz · 标注');
 assert.equal(await p.locator('[data-av-sample-rate]').getAttribute('data-source'),'manual');
 const savedAudio=await p.locator('[data-av-audio]').evaluate(e=>({src:e.src,time:e.currentTime,paused:e.paused}));
 assert.equal(savedAudio.src,initialAudio.src);assert.equal(savedAudio.paused,initialAudio.paused);assert(savedAudio.time>=initialAudio.time,'Saving does not restart audio');
 await p.locator('[data-av-playlist-toggle]').click();await p.locator('[data-av-playlist]').waitFor({state:'visible'});
 assert.equal(await p.locator('.av-playlist-item').first().locator('strong').textContent(),'我的潮汐 <3');
 assert.equal(await p.locator('.av-playlist-item').first().locator('.av-playlist-main span').textContent(),'手填作者');
 await p.keyboard.press('Escape');
 await p.locator('[data-av-next]').click();await p.waitForFunction(()=>document.querySelector('[data-av-title]').textContent==='第二首');
 assert.equal(await p.locator('[data-av-artist]').textContent(),'Songline');assert.equal(await p.locator('[data-av-sample-rate]').getAttribute('data-source'),'file','Other tracks keep their own metadata');
 await p.evaluate(()=>document.querySelector('[data-av-audio]').dispatchEvent(new Event('ended')));
 await p.waitForFunction(()=>document.querySelector('[data-av-title]').textContent==='我的潮汐 <3');
 assert.equal(await p.locator('[data-av-artist]').textContent(),'手填作者');assert.equal(await p.locator('[data-av-sample-rate]').getAttribute('data-source'),'manual','List-loop wrap retains per-track settings');
 await edit.click();await p.locator('[data-av-edit-artist]').fill('只属于第一首');
 await p.evaluate(()=>document.querySelector('[data-av-audio]').dispatchEvent(new Event('ended')));
 await p.waitForFunction(()=>document.querySelector('[data-av-title]').textContent==='第二首');
 await p.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
 assert.equal(await p.locator('[data-av-artist]').textContent(),'Songline','An automatic track change cannot retarget the open editor');
 await p.locator('[data-av-prev]').click();await p.waitForFunction(()=>document.querySelector('[data-av-artist]').textContent==='只属于第一首');
 await edit.click();await p.locator('[data-av-edit-rate]').fill('-1');
 await p.locator('[data-av-track-close]').click();assert(await dialog.evaluate(e=>e.open),'Invalid rate must be corrected before saving');
 await p.locator('[data-av-edit-rate]').fill('');await p.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
 assert.equal(await p.locator('[data-av-sample-rate]').textContent(),'16 kHz','Clearing manual rate restores file metadata');
 await edit.click();await p.locator('[data-av-track-reset]').click();
 await p.mouse.click(4,4);await dialog.waitFor({state:'hidden'});
 assert.equal(await p.locator('[data-av-title]').textContent(),titleBefore);assert.equal(await p.locator('[data-av-artist]').textContent(),'Songline');
 assert.equal(await p.locator('[data-av-sample-rate]').getAttribute('data-source'),'file');
 assert.equal(await p.evaluate(()=>avReads),2,'Manual settings and resets do not reparse files');
}
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--mute-audio']});
 try{
  const cases=process.env.AUDIO_STAGE_CASES?JSON.parse(process.env.AUDIO_STAGE_CASES):[[1440,'dark','no-preference'],[1440,'light','reduce'],[390,'dark','no-preference'],[390,'light','reduce'],[320,'light','reduce']];
  for(const [width,theme,motion] of cases){
   const {p,context,errors,requests}=await fixture(browser,width,theme,motion);
   assert.equal(await p.locator('body').getAttribute('data-page-scene'),'audio');
   assert.equal(await p.locator('.av-source-panel h2').textContent(),'享受你的音乐');
   for(const selector of ['.modern-site-header','[data-site-map]','.site-bg-layer'])assert.equal(await p.locator(selector).isVisible(),false,'No site chrome: '+selector);
   assert.equal(await p.locator('.tool-detail-surface').count(),0);
   assert.equal(await p.locator('[data-av-linework]').getAttribute('aria-hidden'),'true');
   assert.equal(await p.locator('[data-av-linework]').evaluate(e=>getComputedStyle(e).pointerEvents),'none');
   assert.equal(await p.locator('.av-linework-plane').count(),2,'The background uses two reusable vector layers, not a per-cell DOM grid');
   assert.equal(await p.locator('.av-wave-plane').count(),2,'Two fixed sets of curves add staggered waves without per-frame path generation');
   assert.equal(await p.locator('[data-av-linework] canvas').count(),0,'The grid has no additional drawing loop');
   const screen=await p.locator('[data-av-stage]').boundingBox();
   assert.equal(Math.round(screen.x),0);assert.equal(Math.round(screen.y),0);
   assert.equal(Math.round(screen.width),width);assert(screen.height>=1000);
   assert(!requests.some(url=>/under-ground|tools-underground/.test(url)),'Direct studio does not request underground artwork');
   await p.locator('[data-tool-help-open]').click();assert(await p.locator('[data-tool-help-dialog]').evaluate(e=>e.matches(':modal')));
   await p.keyboard.press('Escape');
   assert(await p.locator('[data-av-upload]').isVisible());
   await p.waitForTimeout(550);
   const idleFrames=await p.evaluate(()=>avFrames.length);
   await p.waitForTimeout(300);assert.equal(await p.evaluate(()=>avFrames.length),idleFrames,'Empty studio has no recurring drawing loop');
   if(motion!=='reduce')assert.equal(await p.locator('.av-linework-plane').first().evaluate(e=>getComputedStyle(e).animationPlayState),'paused','Empty studio parks background breathing');
   for(const button of await p.locator('.av-controls button').all()){
    assert(await button.evaluate(e=>{
     const b=e.getBoundingClientRect(),s=e.closest('.av-controls').getBoundingClientRect();
     return b.left>=s.left && b.right<=s.right+1 && b.top>=s.top && b.bottom<=s.bottom+1;
    }),'Every stage control fits even at 320px');
   }
   await p.evaluate(()=>{
    const original=SonglineAudioMetadata.read;window.avReads=0;
    SonglineAudioMetadata.read=async(...args)=>{avReads++;return original(...args);};
   });
   await p.locator('[data-av-file]').setInputFiles([{name:'first.wav',mimeType:'audio/wav',buffer:wav()},{name:'second.wav',mimeType:'audio/wav',buffer:wav('第二首')}]);
   await p.waitForFunction(()=>document.querySelector('[data-av-audio]').readyState>=2 && document.querySelector('[data-av-title]').textContent.includes('潮汐'));
   await p.waitForFunction(()=>document.querySelector('[data-av-canvas]').width>100 && avFrames.length>2);
   assert.equal(await p.locator('[data-av-artist]').textContent(),'Songline');
   await p.locator('[data-av-sample-rate]').waitFor({state:'visible'});
   assert.equal(await p.locator('[data-av-sample-rate]').textContent(),'16 kHz');
   assert.equal(await p.locator('[data-av-sample-rate]').getAttribute('data-source'),'file','Show the file rate, not the AudioContext resampling rate');
   assert.equal(await p.locator('.av-source-label,.av-metrics,.av-frequency-axis,[data-av-album],[data-av-volume-value]').count(),0,'No redundant source or technical small print');
   assert(await p.locator('[data-av-cover-fallback]').isVisible());
   const pixels=await p.locator('[data-av-canvas]').evaluate(e=>{
    const bytes=e.getContext('2d').getImageData(0,0,e.width,e.height).data;let opaque=0;
    for(let i=3;i<bytes.length;i+=4)if(bytes[i]>0)opaque++;
    const b=e.getBoundingClientRect();return {width:e.width,height:e.height,ratio:opaque/(bytes.length/4),css:[b.width,b.height]};
   });
   assert(pixels.width>100&&pixels.height>100,'Hidden initial canvas is resized when playback reveals it');
   assert(pixels.ratio<.6&&pixels.ratio>.005,'Spectrum and waveform are not a solid filled rectangle');
   assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'No document overflow');
   assert(await p.locator('.av-volume-control').evaluate(e=>{
    return e.scrollWidth<=e.clientWidth+1;
   }),'Volume is not clipped inside the stage');
   await p.locator('[data-av-cover-file]').setInputFiles(path.join(repo,'static/uploads/admin/background/qiandai_background.png'));
   await p.waitForFunction(()=>!document.querySelector('[data-av-cover-img]').hidden && document.querySelector('[data-av-cover-img]').naturalWidth>0);
   await p.locator('[data-av-backdrop]').waitFor({state:'visible'});
   assert(await p.locator('[data-av-backdrop]').evaluate(e=>{const b=e.getBoundingClientRect(),stage=e.closest('[data-av-stage]').getBoundingClientRect();return Math.abs(b.top-stage.top)<1 && Math.abs(b.height-stage.height)<1;}),'Artwork background covers the complete scrollable stage, not just one viewport');
   assert(await p.locator('[data-av-backdrop]').evaluate(e=>e.width<=256 && getComputedStyle(e).filter==='none'),'Background is pre-blurred once at bounded resolution, without a full-screen filter');
   assert(await p.locator('[data-audio-visualizer]').evaluate(e=>{const hue=e.style.getPropertyValue('--av-art-hue');return hue!=='' && Number(hue)>=0 && Number(hue)<360;}),'Artwork supplies its own accent palette');
   assert.equal(await p.evaluate(()=>avURLs.size),2);
   await p.locator('[data-av-play]').click();await p.waitForFunction(()=>document.querySelector('[data-av-audio]').paused);
   await p.waitForTimeout(600);
   const pausedFrames=await p.evaluate(()=>avFrames.length);
   await p.waitForTimeout(300);assert.equal(await p.evaluate(()=>avFrames.length),pausedFrames,'Paused studio parks the drawing loop after settling');
   if(motion!=='reduce')assert.equal(await p.locator('.av-linework-plane').first().evaluate(e=>getComputedStyle(e).animationPlayState),'paused','Pausing freezes grid phase');
   assert.equal(await p.locator('[data-av-play]').getAttribute('aria-label'),'播放');
   await p.locator('[data-av-play]').click();await p.waitForFunction(()=>!document.querySelector('[data-av-audio]').paused);
   // play() changes paused synchronously; the play event updates the UI later.
   // Wait for that contract instead of racing a computed animation assertion.
   await p.waitForFunction(()=>document.querySelector('[data-audio-visualizer]').classList.contains('is-playing'));
   assert.equal(await p.locator('[data-av-motion]').count(),0,'Motion is enabled by default without a redundant control');
   if(motion==='reduce'){
    assert.equal(await p.locator('[data-av-cover]').evaluate(e=>getComputedStyle(e).transform),'none');
    assert.equal(await p.locator('.av-linework-plane').first().evaluate(e=>getComputedStyle(e).animationName),'none');
    assert.equal(await p.locator('.av-wave-plane').first().evaluate(e=>getComputedStyle(e).animationName),'none');
    assert.equal(await p.locator('.av-wave-plane').first().evaluate(e=>getComputedStyle(e).willChange),'auto');
   }else{
    assert.equal(await p.locator('.av-art-orbit').evaluate(e=>getComputedStyle(e).animationPlayState),'running');
    assert.equal(await p.locator('.av-linework-plane').first().evaluate(e=>getComputedStyle(e).animationPlayState),'running');
    const animated=await p.locator('.av-linework-plane').first().evaluate(e=>{const a=e.getAnimations()[0];return a.effect.getKeyframes().map(k=>k.opacity);});
    assert(new Set(animated).size>1,'Grid breathes using opacity keyframes');
    assert(Math.max(...animated.map(Number))<=.4,'Grid opacity peak is softer than the previous version');
    const wave=await p.locator('.av-wave-plane').first().evaluate(e=>{const a=e.getAnimations()[0];return a.effect.getKeyframes().map(k=>k.transform);});
    assert(new Set(wave).size>1,'Waves drift spatially instead of only flashing');
    await p.evaluate(()=>document.documentElement.classList.add('songline-page-hidden'));
    assert.equal(await p.locator('.av-linework-plane').first().evaluate(e=>getComputedStyle(e).animationPlayState),'paused','Global background-page guard pauses grid animations');
    await p.evaluate(()=>document.documentElement.classList.remove('songline-page-hidden'));
   }
   assert(await p.locator('[data-av-linework]').evaluate(e=>{const b=e.getBoundingClientRect(),s=e.closest('[data-av-stage]').getBoundingClientRect();return Math.abs(b.top-s.top)<1 && Math.abs(b.height-s.height)<1 && Math.abs(b.width-s.width)<1;}),'Grid covers the complete scrollable stage');
   const cadence=await p.evaluate(async()=>{
    const start=performance.now();avFrames.length=0;
    await new Promise(r=>setTimeout(r,1100));
    const gaps=avFrames.slice(1).map((t,i)=>t-avFrames[i]).sort((a,b)=>a-b);
    return {draws:avFrames.length,seconds:(performance.now()-start)/1000,median:gaps[Math.floor(gaps.length/2)]||0};
   });
   assert(cadence.draws>3,'Playback wakes the parked canvas');
   for(const mode of ['single','shuffle','list']){await p.locator('[data-av-play-mode]').click();assert.equal(await p.locator('[data-av-play-mode]').getAttribute('data-mode'),mode);assert.equal(await p.locator('[data-av-play-mode] .ui-icon:visible').count(),1);}
   const titleBefore=await p.locator('[data-av-title]').textContent();
   await p.screenshot({path:path.join(out,'stage-'+width+'-'+theme+'.png'),fullPage:true});
   if(width===1440 && theme==='dark'){
    await p.evaluate(async()=>{
     const canvas=document.createElement('canvas');canvas.width=16;canvas.height=16;
     const c=canvas.getContext('2d');c.fillStyle='#888';c.fillRect(0,0,16,16);
     const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));
     const transfer=new DataTransfer();transfer.items.add(new File([blob],'gray.png',{type:'image/png'}));
     const input=document.querySelector('[data-av-cover-file]');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
    });
    await p.waitForFunction(()=>document.querySelector('[data-audio-visualizer]').style.getPropertyValue('--av-art-hue')==='');
    assert(await p.locator('[data-av-backdrop]').isVisible(),'Gray artwork keeps its background while using the neutral default palette');
    await p.locator('[data-av-cover-file]').setInputFiles(path.join(repo,'static/uploads/admin/background/qiandai_background.png'));
    await p.waitForFunction(()=>document.querySelector('[data-audio-visualizer]').style.getPropertyValue('--av-art-hue')!=='');
    assert.equal(await p.evaluate(()=>avURLs.size),2,'Repeated palette changes do not allocate additional artwork URLs');
   }
   await p.locator('[data-av-next]').click();await p.waitForFunction(()=>document.querySelector('[data-av-title]').textContent==='第二首');
   assert(await p.locator('[data-av-cover-fallback]').isVisible());
   assert.equal(await p.locator('[data-audio-visualizer]').evaluate(e=>e.style.getPropertyValue('--av-art-hue')),'','Track without artwork restores the default palette');
   await p.locator('[data-av-prev]').click();await p.waitForFunction(()=>document.querySelector('[data-av-title]').textContent.includes('潮汐'));
   assert.equal(await p.locator('[data-av-title]').textContent(),titleBefore);
   assert(await p.locator('[data-av-cover-img]').isVisible());
   assert.equal(await p.evaluate(()=>avReads),2,'Metadata is parsed once per selected queue item');
   assert.equal(await p.evaluate(()=>avURLs.size),2,'Switching tracks retains artwork but releases superseded audio URLs');
   await trackSettings(p,width,theme,titleBefore);
   await p.locator('[data-av-progressbar]').focus();await p.keyboard.press('End');
   await p.keyboard.press('Home');await p.waitForFunction(()=>document.querySelector('[data-av-audio]').currentTime<2);
   await p.locator('[data-av-volume]').fill('0');assert.equal(await p.locator('[data-av-audio]').evaluate(e=>e.volume),0);
   await p.locator('[data-av-volume]').fill('80');
   await p.locator('[data-av-display-mode]').click();assert(await p.locator('[data-av-exit-display]').isVisible());
   assert.equal(await p.locator('[data-av-return]').isVisible(),false,'Pure display hides the return-to-tools link');
   assert.equal(await p.locator('[data-av-track-edit]').isVisible(),false,'Pure display hides the metadata editor control');
   await p.screenshot({path:path.join(out,'pure-'+width+'-'+theme+'.png'),fullPage:true});
   await p.keyboard.press('Escape');assert.equal(await p.locator('[data-av-display-mode]').getAttribute('aria-pressed'),'false');
   assert(await p.locator('[data-av-return]').isVisible(),'Exiting pure display restores return-to-tools');
   await p.locator('[data-av-display-mode]').click();await p.locator('[data-av-exit-display]').click();
   assert(await p.locator('[data-av-play]').isVisible());
   if(width>1000){
    await p.locator('[data-av-fullscreen]').click();await p.waitForFunction(()=>!!document.fullscreenElement);
    await p.waitForFunction(()=>document.querySelector('[data-av-fullscreen]').getAttribute('aria-label')==='退出全屏');
    assert.equal(Math.round((await p.locator('[data-av-stage]').boundingBox()).height),1000);
    assert.equal(await p.locator('[data-av-return]').isVisible(),false,'Fullscreen hides the return-to-tools link');
    assert.equal(await p.locator('[data-av-fullscreen]').getAttribute('aria-label'),'退出全屏');
    await p.locator('[data-av-track-edit]').click();assert(await p.locator('[data-av-track-dialog]').evaluate(e=>e.matches(':modal')),'Track editor is visible in fullscreen');
    await p.keyboard.press('Escape');await p.locator('[data-av-track-dialog]').waitFor({state:'hidden'});
    assert(await p.evaluate(()=>!!document.fullscreenElement),'Closing track settings keeps fullscreen');
    await p.locator('[data-av-playlist-toggle]').click();assert(await p.locator('[data-av-playlist]').isVisible(),'Queue is visible in fullscreen top layer');
    await p.keyboard.press('Escape');await p.waitForFunction(()=>!document.querySelector('[data-av-playlist]').matches(':popover-open'));
    assert(await p.evaluate(()=>!!document.fullscreenElement),'Escape closes the queue without exiting fullscreen');
    await p.evaluate(()=>document.exitFullscreen());
    await p.locator('[data-av-return]').waitFor({state:'visible'});
   }
   const layout=e=>{const b=e.getBoundingClientRect();return {x:b.x+scrollX,y:b.y+scrollY,width:b.width,height:b.height};};
   const beforeQueue=await p.locator('.av-now').evaluate(layout);
   await p.locator('[data-av-playlist-toggle]').click();
   await p.locator('[data-av-playlist]').waitFor({state:'visible'});
   assert.deepEqual(await p.locator('.av-now').evaluate(layout),beforeQueue,'Queue floats without vertical reflow');
   assert(await p.locator('[data-av-playlist]').evaluate(e=>{const b=e.getBoundingClientRect();return b.left>=0 && b.right<=innerWidth+1 && b.top>=0 && b.bottom<=innerHeight;}),'Queue fits the viewport');
   await p.locator('[data-av-title]').click();
   await p.locator('[data-av-playlist]').waitFor({state:'hidden'});
   await p.locator('[data-av-playlist-toggle]').focus();await p.keyboard.press('Enter');await p.locator('[data-av-playlist]').waitFor({state:'visible'});
   await p.keyboard.press('Escape');await p.locator('[data-av-playlist]').waitFor({state:'hidden'});
   await p.waitForFunction(()=>document.activeElement.matches('[data-av-playlist-toggle]'));
   await p.locator('[data-av-playlist-toggle]').click();
   await p.locator('.av-playlist-item').first().locator('.av-playlist-remove').click();
   await p.waitForFunction(()=>document.querySelector('[data-av-title]').textContent==='第二首');
   assert.equal(await p.evaluate(()=>avURLs.size),1,'Removing the artwork owner releases its URL');
   await p.screenshot({path:path.join(out,'queue-'+width+'-'+theme+'.png'),fullPage:true});
   await p.locator('[data-av-return]').click();
   await p.locator('[data-av-upload]').waitFor({state:'visible'});
   assert.equal(await p.evaluate(()=>location.pathname),'/tools/audio-visualizer/','Playback return resets the tool without navigating away');
   assert.equal(await p.locator('[data-av-return]').getAttribute('aria-label'),'返回工具页');
   assert.equal(await p.locator('.av-playlist-item').count(),0,'Returning to the music chooser clears the previous session');
   assert.equal(await p.evaluate(()=>avURLs.size),0,'Reset releases every audio and artwork URL');
   assert.equal(await p.locator('[data-av-backdrop]').isVisible(),false,'The music chooser restores its neutral background');
   await p.screenshot({path:path.join(out,'entry-'+width+'-'+theme+'.png'),fullPage:true});
   await p.locator('[data-av-file]').setInputFiles({name:'again.wav',mimeType:'audio/wav',buffer:wav('再次选择')});
   await p.waitForFunction(()=>document.querySelector('[data-av-title]').textContent==='再次选择' && document.querySelector('[data-av-audio]').readyState>=2);
   assert.equal(await p.locator('.av-playlist-item').count(),1,'Reselecting starts a clean list, not hidden old tracks');
   assert.equal(await p.locator('[data-av-return]').getAttribute('aria-label'),'返回音乐首页');
   assert.equal(await p.evaluate(()=>avURLs.size),1);
   await p.locator('[data-av-return]').focus();await p.keyboard.press('Enter');await p.locator('[data-av-upload]').waitFor({state:'visible'});
   assert(await p.locator('[data-av-upload]').evaluate(e=>document.activeElement===e),'Keyboard reset lands on a visible source chooser');
   await p.locator('[data-av-return]').click();
   await p.waitForFunction(()=>location.pathname==='/tools/'&&!document.documentElement.classList.contains('songline-page-transitioning'));
   assert.equal(await p.evaluate(()=>avURLs.size),0,'Departure releases all owned file and artwork URLs');
   assert.equal(await p.locator('body').getAttribute('data-page-scene'),null,'Standalone marker is removed after return');
   assert.notEqual(await p.locator('.modern-site-header').evaluate(e=>getComputedStyle(e).display),'none','Site header shell is restored after return');
   assert(await p.locator('.modern-site-header .logo').isVisible(),'Site logo is restored after return (desktop HUD shell has zero height)');
   assert(await p.locator('[data-site-map]').isVisible(),'Site map is restored after return');
   await p.evaluate(()=>SonglinePageTransition.navigateLink(location.origin+'/tools/audio-visualizer/'));
   await ready(p);
   assert.equal(await p.locator('body').getAttribute('data-page-scene'),'audio');
   assert.equal(await p.locator('[data-site-map]').isVisible(),false);
   assert.equal(await p.locator('[data-av-linework]').count(),1,'AJAX re-entry adds exactly one grid decoration');
   assert(await p.locator('[data-av-upload]').isVisible(),'AJAX re-entry starts a usable empty studio');
   assert.deepEqual(errors,[]);
   console.log('PASS audio stage '+width+' '+theme+' '+motion,JSON.stringify({pixels,cadence}));
   await context.close();
  }
  {
   const {p,context,errors}=await fixture(browser,390,'light','reduce',true);
   await p.locator('[data-av-file]').setInputFiles({name:'fallback.wav',mimeType:'audio/wav',buffer:wav()});
   await p.waitForFunction(()=>document.querySelector('[data-av-audio]').readyState>=2);
   await p.locator('[data-av-playlist-toggle]').click();await p.locator('[data-av-playlist]').waitFor({state:'visible'});
   await p.keyboard.press('Escape');await p.locator('[data-av-playlist]').waitFor({state:'hidden'});
   assert.equal(await p.locator('[data-av-playlist-toggle]').getAttribute('aria-expanded'),'false');
   await p.locator('[data-av-playlist-toggle]').click();await p.locator('[data-av-playlist]').waitFor({state:'visible'});
   await p.locator('[data-av-title]').click();await p.locator('[data-av-playlist]').waitFor({state:'hidden'});
   assert.deepEqual(errors,[]);await context.close();console.log('PASS fallback queue / untagged author');
  }
  // A synthetic shared stream exercises the live capture branch without a permission prompt.
  {
   const {p,context,errors}=await fixture(browser,1440,'dark','reduce');
   await p.evaluate(()=>{
    const ac=new AudioContext(),osc=ac.createOscillator(),dest=ac.createMediaStreamDestination();
    osc.connect(dest);osc.start();window.avCapture={ac,osc,stream:dest.stream};
    Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getDisplayMedia:()=>Promise.resolve(dest.stream)}});
   });
   await p.locator('[data-av-browser-audio]').click();
   await p.waitForFunction(()=>document.querySelector('[data-audio-visualizer]').classList.contains('is-browser-audio-live'));
   assert.equal(await p.locator('[data-av-title]').textContent(),'系统声音');
   assert.equal(await p.locator('[data-av-artist]').isVisible(),false);
   assert.equal(await p.locator('[data-av-track-edit]').isVisible(),false,'Shared audio is not a local editable track');
   await p.locator('[data-av-sample-rate]').waitFor({state:'visible'});
   assert.equal(await p.locator('[data-av-sample-rate]').getAttribute('data-source'),'analysis');
   assert.equal(await p.locator('[data-av-hint]').textContent(),'');
   await p.locator('[data-av-return]').click();await p.locator('[data-av-upload]').waitFor({state:'visible'});
   assert(await p.evaluate(()=>avCapture.stream.getTracks().every(t=>t.readyState==='ended')),'Return to the music chooser stops shared tracks');
   await p.evaluate(()=>{const track=avCapture.stream.getAudioTracks()[0];track.stop();track.dispatchEvent(new Event('ended'));});
   await p.locator('[data-av-upload]').waitFor({state:'visible'});
   await p.evaluate(async()=>{avCapture.osc.stop();await avCapture.ac.close();});
   assert.deepEqual(errors,[]);await context.close();
  }
  {
   const {p,context,errors}=await fixture(browser,390,'light','reduce');
   await p.locator('[data-av-file]').setInputFiles({name:'untagged.wav',mimeType:'audio/wav',buffer:wav('','')});
   await p.waitForFunction(()=>document.querySelector('[data-av-artist]').textContent==='未知作者' && document.querySelector('[data-av-sample-rate]').textContent==='16 kHz');
   assert(await p.locator('[data-av-artist]').isVisible());
   await p.locator('[data-av-playlist-toggle]').click();await p.locator('[data-av-playlist]').waitFor({state:'visible'});
   await p.locator('.av-playlist-remove').click();await p.locator('[data-av-playlist]').waitFor({state:'hidden'});
   assert.equal(await p.locator('[data-av-playlist-toggle]').getAttribute('aria-expanded'),'false');
   assert.deepEqual(errors,[]);await context.close();
  }
  // Pending capture and metadata cannot resurrect audio or artwork after departure.
  {
   const {p,context,errors}=await fixture(browser,390,'light','reduce');
   await p.evaluate(()=>{SonglineAudioMetadata.read=()=>new Promise(r=>window.resolveResetTags=r);});
   await p.locator('[data-av-file]').setInputFiles({name:'pending-reset.wav',mimeType:'audio/wav',buffer:wav()});
   await p.waitForFunction(()=>typeof resolveResetTags==='function' && document.querySelector('[data-av-audio]').readyState>=2);
   await p.locator('[data-av-return]').click();await p.locator('[data-av-upload]').waitFor({state:'visible'});
   await p.evaluate(()=>resolveResetTags({title:'不能回来的曲目',artist:'Late',cover:URL.createObjectURL(new Blob(['art'],{type:'image/png'}))}));
   await p.waitForFunction(()=>avURLs.size===0);
   assert(await p.locator('[data-av-upload]').isVisible());assert.equal(await p.locator('.av-playlist-item').count(),0);
   assert.equal(await p.locator('[data-av-backdrop]').isVisible(),false);
   assert.deepEqual(errors,[]);await context.close();console.log('PASS source reset / late metadata');
  }
  {
   const {p,context,errors}=await fixture(browser,390,'light','reduce');
   await p.evaluate(()=>{SonglineAudioMetadata.read=()=>new Promise(r=>window.resolveTags=r);});
   await p.locator('[data-av-file]').setInputFiles({name:'pending.wav',mimeType:'audio/wav',buffer:wav()});
   await p.waitForFunction(()=>typeof resolveTags==='function' && document.querySelector('[data-av-audio]').readyState>=2);
   await p.locator('[data-av-track-edit]').click();await p.locator('[data-av-edit-artist]').fill('提前手填的作者');await p.locator('[data-av-edit-rate]').fill('96000');
   await p.keyboard.press('Escape');await p.locator('[data-av-track-dialog]').waitFor({state:'hidden'});
   await p.evaluate(()=>resolveTags({title:'解析后的曲名',artist:'文件作者',sampleRate:32000}));
   await p.waitForFunction(()=>document.querySelector('[data-av-title]').textContent==='解析后的曲名');
   assert.equal(await p.locator('[data-av-artist]').textContent(),'提前手填的作者');assert.equal(await p.locator('[data-av-sample-rate]').textContent(),'96 kHz · 标注','Late metadata cannot overwrite a manual annotation');
   await p.locator('[data-av-track-edit]').click();await p.locator('[data-av-track-reset]').click();await p.keyboard.press('Escape');
   await p.locator('[data-av-track-dialog]').waitFor({state:'hidden'});
   assert.equal(await p.locator('[data-av-artist]').textContent(),'文件作者');assert.equal(await p.locator('[data-av-sample-rate]').textContent(),'32 kHz');
   await p.locator('[data-av-track-edit]').click();
   await p.evaluate(()=>SonglinePageTransition.navigateLink(location.origin+'/tools/'));
   await p.waitForFunction(()=>location.pathname==='/tools/'&&!document.documentElement.classList.contains('songline-page-transitioning'));
   assert.equal(await p.locator('[data-av-track-dialog][open]').count(),0,'Departure does not leave a modal top layer');assert.equal(await p.evaluate(()=>avURLs.size),0);
   assert.deepEqual(errors,[]);await context.close();console.log('PASS manual metadata / late tags / modal cleanup');
  }
  {
   const {p,context,errors}=await fixture(browser,1440,'dark','reduce');
   await p.evaluate(()=>{
    Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getDisplayMedia:()=>new Promise(r=>window.resolveCapture=r)}});
   });
   await p.locator('[data-av-browser-audio]').click();
   await p.waitForFunction(()=>typeof resolveCapture==='function');
   await p.evaluate(()=>SonglinePageTransition.navigateLink(location.origin+'/tools/'));
   await p.waitForFunction(()=>location.pathname==='/tools/'&&!document.documentElement.classList.contains('songline-page-transitioning'));
   assert(await p.evaluate(async()=>{
    const ac=new AudioContext(),osc=ac.createOscillator(),dest=ac.createMediaStreamDestination();
    osc.connect(dest);osc.start();const stream=dest.stream;resolveCapture(stream);
    await new Promise(r=>setTimeout(r,100));const ended=stream.getTracks().every(t=>t.readyState==='ended');
    osc.stop();await ac.close();return ended;
   }),'Permission resolved after departure stops every returned track');
   assert.deepEqual(errors,[]);await context.close();
  }
  {
   const {p,context,errors}=await fixture(browser,1440,'dark','reduce');
   await p.evaluate(()=>{SonglineAudioMetadata.read=()=>new Promise(r=>window.resolveTags=r);});
   await p.locator('[data-av-file]').setInputFiles({name:'late.wav',mimeType:'audio/wav',buffer:wav()});
   await p.waitForFunction(()=>typeof resolveTags==='function');
   await p.evaluate(()=>SonglinePageTransition.navigateLink(location.origin+'/tools/'));
   await p.waitForFunction(()=>location.pathname==='/tools/'&&!document.documentElement.classList.contains('songline-page-transitioning'));
   await p.evaluate(()=>resolveTags({title:'迟到的歌曲',cover:URL.createObjectURL(new Blob(['art'],{type:'image/png'}))}));
   await p.waitForFunction(()=>avURLs.size===0);assert.deepEqual(errors,[]);
   await context.close();
  }
  console.log('PASS pending capture / metadata cleanup');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
