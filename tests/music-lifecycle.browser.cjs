const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const base=process.env.BLOG_TEST_URL||'http://127.0.0.1:8080';
// Silent local WAV: no external music, uploads or user file-system access.
const wav=Buffer.alloc(44+8000*2*30);
wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge',args:['--mute-audio']});
 try {
  const context=await browser.newContext({viewport:{width:1440,height:900}});
  await context.route('**/api/views?**',r=>r.fulfill({json:{views:83}}));
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   sessionStorage.setItem('songline-home-boot-v21.4','1');
   const create=URL.createObjectURL,revoke=URL.revokeObjectURL;
   window.activeMusicURLs=new Set();
   URL.createObjectURL=function(blob){const url=create.call(this,blob);activeMusicURLs.add(url);return url;};
   URL.revokeObjectURL=function(url){activeMusicURLs.delete(url);return revoke.call(this,url);};
  });
  await page.goto(base+'/');
  await page.waitForFunction(()=>window.__songlineHomeMusicPlayer);
  await page.locator('[data-home-music-file]').setInputFiles({name:'lifecycle.wav',mimeType:'audio/wav',buffer:wav});
  await page.waitForFunction(()=>document.querySelector('[data-home-music-audio]').readyState>=2);
  assert.equal(await page.evaluate(()=>activeMusicURLs.size),1);
  assert.equal(await page.locator('[data-home-music-audio]').evaluate(e=>e.disableRemotePlayback),false,'live player retains its normal capabilities');
  await page.locator('[data-home-music-toggle]').click();
  await page.waitForFunction(()=>!document.querySelector('[data-home-music-audio]').paused);
  await page.locator('[data-home-music-toggle]').click();
  await page.waitForFunction(()=>document.querySelector('[data-home-music-audio]').paused);
  await page.evaluate(href=>SonglinePageTransition.navigateLink(href),base+'/friends/');
  await page.evaluate(href=>SonglinePageTransition.navigateLink(href),base+'/');
  await page.waitForFunction(()=>window.__songlineHomeMusicPlayer && document.querySelector('[data-home-music]')?.dataset.homeMusicReady==='1');
  assert.equal(await page.evaluate(()=>activeMusicURLs.size),0,'old audio object URL is released');
  assert.equal(await page.locator('[data-home-music-audio]').evaluate(e=>e.disableRemotePlayback),false,'temporary-document cleanup does not disable the live player');
  await page.locator('[data-home-music-file]').setInputFiles({name:'after-return.wav',mimeType:'audio/wav',buffer:wav});
  await page.waitForFunction(()=>document.querySelector('[data-home-music-audio]').readyState>=2);
  await page.locator('[data-home-music-toggle]').click();
  await page.waitForFunction(()=>!document.querySelector('[data-home-music-audio]').paused);
  await page.evaluate(()=>{__songlineHomeMusicPlayer.destroy();document.dispatchEvent(new Event('visibilitychange'));});
  assert.equal(await page.evaluate(()=>activeMusicURLs.size),0);
  assert.deepEqual(errors,[]);
  console.log('PASS local music selection, play/pause, return navigation, URL cleanup, live player capabilities');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
