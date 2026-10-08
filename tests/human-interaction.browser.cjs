// Offline keyboard, touch and modal audit, including the previous build.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const builds={before:process.env.BLOG_UI_BASELINE,after:process.env.BLOG_UI_BUILD};
for(const build of Object.values(builds))assert(build&&fs.existsSync(path.join(build,'index.html')));
const base='http://human-interaction.test',out=path.resolve('local-only/human-interaction');
const report=[];
const wav=Buffer.alloc(44+8000*2*3);
wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
async function fixture(browser,build,width){
 const context=await browser.newContext({viewport:{width,height:900},hasTouch:width<981,isMobile:width<981});
 const errors=[];
 await context.route('**/*',route=>{
  const u=new URL(route.request().url());
  if(u.origin!==base||u.pathname.startsWith('/uploads/'))return route.fulfill({body:'<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100"><rect width="160" height="100" fill="#607d8b"/></svg>',contentType:'image/svg+xml'});
  if(u.pathname.includes('/api/'))return route.fulfill({json:{views:83,items:[],messages:[],scores:[]}});
  const root=path.resolve(u.pathname.startsWith('/static/')?'web/static':build);
  const file=path.resolve(root,decodeURIComponent(u.pathname.replace(/^\/static\//,'/').slice(1))+(u.pathname.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
  return route.fulfill({body:fs.readFileSync(file),contentType:({'.html':'text/html','.css':'text/css','.js':'application/javascript','.json':'application/json','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream'});
 });
 await context.addInitScript(()=>{
  const now=Date.now;window.clockAdvance=0;Date.now=()=>now()+clockAdvance;
  localStorage.setItem('songline-theme','dark');sessionStorage.setItem('songline-home-boot-v21.4','1');
  localStorage.setItem('songline-privacy-v1',JSON.stringify({version:1,statistics:false,expires:Date.now()+86400000}));
  localStorage.setItem('songline_focus_timer_settings',JSON.stringify({durationMinutes:1,soundEnabled:false,showOverlay:true}));
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));return {context,page,errors};
}
async function ready(page,route){
 await page.goto(base+route);await page.evaluate(()=>SonglinePageModules.ready(document));
 await page.waitForFunction(()=>!document.documentElement.classList.contains('is-scene-preparing'));await page.waitForTimeout(280);
}
async function modalDesign(page,selector){return page.locator(selector).evaluate(e=>{
 const r=e.getBoundingClientRect(),s=getComputedStyle(e);
 return {rect:['x','y','width','height'].map(k=>Math.round(r[k]*10)/10),styles:['color','backgroundColor','border','borderRadius','fontSize','lineHeight'].map(k=>s[k])};
});}
function sameModalDesign(actual,expected,label){
 assert.deepEqual(actual.styles,expected.styles,label+' styles');
 assert(actual.rect.every((value,index)=>Math.abs(value-expected.rect[index])<.5),label+' geometry: '+JSON.stringify({actual,expected}));
}
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  for(const width of process.env.HUMAN_WIDTH?[Number(process.env.HUMAN_WIDTH)]:[390,1440]){
   const pair={width};
   for(const [mode,build] of Object.entries(builds)){
    const {context,page,errors}=await fixture(browser,build,width);pair[mode]={};
    await ready(page,'/tools/2048/');
    const sound=page.locator('[data-2048-sound-toggle]');await sound.focus();await page.keyboard.press('Enter');
    pair[mode].keyboardFocus=await sound.evaluate(e=>document.activeElement===e);await sound.evaluate(e=>e.blur());
    pair[mode].pauseWrites=await page.evaluate(()=>{
     const pause=document.querySelector('[data-2048-pause]'),observer=new MutationObserver(()=>{});observer.observe(pause,{attributes:true,attributeFilter:['data-tool-paused']});
     document.body.dispatchEvent(new KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true,cancelable:true}));
     for(let i=0;i<20;i++)document.body.dispatchEvent(new KeyboardEvent('keydown',{key:' ',code:'Space',repeat:true,bubbles:true,cancelable:true}));
     const writes=observer.takeRecords().length;observer.disconnect();return writes;
    });
    if(mode==='after'){
     assert(pair.after.keyboardFocus);assert.equal(pair.after.pauseWrites,1);
     const policy=await page.evaluate(()=>{
      const flags=[{ctrlKey:true},{altKey:true},{metaKey:true},{isComposing:true},{keyCode:229}];
      return flags.map(flag=>{const event=new KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true,cancelable:true,...flag});document.body.dispatchEvent(event);return event.defaultPrevented;});
     });assert(policy.every(prevented=>!prevented));
     // Native keyboard button focus stays usable for successive actions.
     for(const [route,selector] of [['/tools/snake/','[data-snake-start]'],['/tools/flappy-bird/','[data-flappy-sound-toggle]'],['/tools/reaction-test/','[data-reaction-sound-toggle]'],['/tools/typing-practice/','[data-typing-sound-toggle]']]){
      await ready(page,route);
      const button=page.locator(selector);await button.waitFor({state:'visible'});await button.focus();await page.keyboard.press('Enter');assert(await button.evaluate(e=>document.activeElement===e),'Keyboard focus retained: '+route);
      if(route==='/tools/snake/'){
       await button.evaluate(e=>e.addEventListener('keydown',event=>window.directionEvent=event,{once:true}));
       await page.keyboard.press('ArrowUp');assert(await page.evaluate(()=>directionEvent.defaultPrevented),'Keyboard start still permits immediate directional play');
      }
     }
     await ready(page,'/tools/audio-visualizer/');
     const chooser=page.waitForEvent('filechooser');await page.locator('[data-av-upload]').focus();await page.keyboard.press('Enter');
     await (await chooser).setFiles({name:'interaction.wav',mimeType:'audio/wav',buffer:wav});
     const nowCard=page.locator('[data-av-now]');await page.waitForFunction(()=>document.querySelector('[data-audio-visualizer]').classList.contains('is-local-audio-live'));
     assert(await nowCard.evaluate(e=>document.activeElement===e),'Keyboard file selection transfers focus out of the hidden source panel');
     const display=page.locator('[data-av-display-mode]');await display.focus();await page.keyboard.press('Enter');assert(await page.locator('[data-av-exit-display]').evaluate(e=>document.activeElement===e));
     await page.keyboard.press('Escape');assert(await display.evaluate(e=>document.activeElement===e));
    }
    await ready(page,'/friends/memories/');
    const photo=page.locator('[data-memory-open]').last();await photo.evaluate(e=>e.click());
    const lightbox=page.locator('[data-memory-lightbox]');await lightbox.waitFor({state:'visible'});
    await page.locator('[data-memory-lightbox-image]').evaluate(img=>SonglineResources.image(img));
    pair[mode].memoryDesign=await modalDesign(page,'.memory-lightbox__panel');
    pair[mode].modalFocusContained=await page.evaluate(()=>{
     document.querySelector('.memory-room__back').focus();return document.querySelector('[data-memory-lightbox]').contains(document.activeElement);
    });
    if(mode==='after'){
     assert(pair.after.modalFocusContained);assert(await lightbox.evaluate(e=>e.matches(':modal')));
     await page.keyboard.press('Escape');assert(!await lightbox.isVisible());assert(await photo.evaluate(e=>document.activeElement===e));
     await photo.evaluate(e=>e.click());await page.mouse.click(3,3);assert(!await lightbox.isVisible());
     await page.evaluate(()=>{const photo=[...document.querySelectorAll('[data-memory-open]')].at(-1);photo.click();document.querySelector('[data-memory-close]').click();photo.click();});
     await page.waitForTimeout(100);assert(await lightbox.isVisible(),'Stale close event must not hide a reopened modal');
     await page.evaluate(()=>SonglinePageTransition.navigateLink('/tools/'));
     assert.equal(await page.locator('dialog:modal').count(),0);assert(!await page.evaluate(()=>document.documentElement.classList.contains('is-memory-lightbox-open')));
    }
    await ready(page,'/tools/focus-timer/');const toggle=page.locator('[data-focus-toggle]');await toggle.focus();await page.keyboard.press('Enter');
    await page.evaluate(()=>{clockAdvance+=61000;document.dispatchEvent(new Event('visibilitychange'));});
    const finish=page.locator('[data-focus-finish]');await finish.waitFor({state:'visible'});await page.waitForTimeout(260);
    pair[mode].finishDesign=await modalDesign(page,'.focus-finish-card');
    if(mode==='after'){
     assert(await finish.evaluate(e=>e.matches(':modal')));
     const outside=await toggle.evaluate(e=>{e.focus();return document.activeElement===e;});assert(!outside);
     await page.keyboard.press('Escape');assert(!await finish.isVisible());assert(await toggle.evaluate(e=>document.activeElement===e));
     await page.locator('[data-focus-reset]').click();await toggle.click();await page.evaluate(()=>{clockAdvance+=61000;document.dispatchEvent(new Event('visibilitychange'));});
     await finish.waitFor({state:'visible'});await page.mouse.click(3,3);assert(!await finish.isVisible());
     await page.locator('[data-focus-reset]').click();await toggle.click();await page.evaluate(()=>{clockAdvance+=61000;document.dispatchEvent(new Event('visibilitychange'));});
     await finish.waitFor({state:'visible'});await page.evaluate(()=>SonglinePageTransition.navigateLink('/tools/'));
     assert.equal(await page.locator('dialog:modal').count(),0);
    }
    if(width<981){
     await ready(page,'/posts/linux-note/');const fab=page.locator('#songline-mobile-toc-fab');
     await fab.tap();await page.waitForTimeout(120);
     pair[mode].touchFocus=await page.evaluate(()=>document.activeElement?.hasAttribute('data-mobile-toc-search')?'search':document.activeElement?.hasAttribute('data-mobile-toc-close')?'close':'other');
     if(mode==='after'){
      assert.equal(pair.after.touchFocus,'close');
      await page.keyboard.press('Escape');assert(await fab.evaluate(e=>document.activeElement===e));
      await page.keyboard.press('Enter');await page.waitForTimeout(120);assert(await page.locator('[data-mobile-toc-search]').evaluate(e=>document.activeElement===e));
      await page.locator('[data-mobile-toc-search]').evaluate(e=>e.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',isComposing:true,bubbles:true,cancelable:true})));
      assert.equal(await page.locator('#songline-mobile-toc-drawer').getAttribute('aria-hidden'),'false');await page.keyboard.press('Escape');
     }
    }
    assert.deepEqual(errors,[]);await context.close();
   }
   assert.equal(pair.before.keyboardFocus,false);assert.equal(pair.before.pauseWrites,21);assert.equal(pair.before.modalFocusContained,false);
   sameModalDesign(pair.after.memoryDesign,pair.before.memoryDesign,'Memory modal panel');sameModalDesign(pair.after.finishDesign,pair.before.finishDesign,'Timer modal panel');
   report.push(pair);console.log('PASS',JSON.stringify(pair));
  }
 }finally{fs.writeFileSync(path.join(out,'interaction-report.json'),JSON.stringify(report,null,2));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
