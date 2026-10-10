// Isolated public build + read-only creator preview; never save user data.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {launch,fixture,ready}=require('./helpers/interaction-fixture.cjs');
const build=process.env.BLOG_UI_BUGFIX_BUILD||'local-only/ui-bugfixes-2026-10-10/after';
const out=process.env.BLOG_UI_BUGFIX_OUT||'local-only/ui-bugfixes-2026-10-10';
const selected=process.env.BLOG_UI_BUGFIX_PHASE;
const run=name=>!selected||selected===name;
const admin=process.env.BLOG_UI_BUGFIX_ADMIN||'http://127.0.0.1:8091';
(async()=>{fs.mkdirSync(out,{recursive:true});const browser=await launch();try{
 if(run('memory'))for(const width of [1440,390]){
  const f=await fixture(browser,build,{width});try{
   const dialog=fs.readFileSync('layouts/friends/memories.html','utf8').match(/<dialog\b[\s\S]*?<\/dialog>/)[0];
   const cards=Array.from({length:3},(_,slot)=>`<article class="memory-room__memory" data-memory-card data-memory-month-index="0" data-memory-title="回忆 ${slot}" data-memory-description="完整简介，关闭详情后仍沿图片阅读。" data-memory-image="/album-landscape.svg" style="--memory-index:0;--memory-slot:${slot}"><span class="memory-room__stem"></span><button class="memory-room__image-button" data-memory-open><img src="/album-landscape.svg" alt="测试回忆"></button><div class="memory-room__caption"><h1>回忆 ${slot}</h1><p>完整简介，关闭详情后仍沿图片阅读。</p></div></article>`).join('');
   await f.page.route(f.origin+'/memory-fixture.html',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html></html>'}));
   await f.page.goto(f.origin+'/memory-fixture.html');
   await f.page.setContent(`<html data-theme="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"><base href="${f.origin}/"><link rel="stylesheet" href="/css/pages/friends/memories.css"><style>body{margin:0;background:#071322;font-family:system-ui,sans-serif}</style></head><body data-page-section="friends"><main class="container"><section class="memory-room" data-memory-room><div class="memory-room__viewport" data-memory-viewport><div class="memory-room__track" data-memory-track data-memory-count="1">${cards}</div></div></section></main>${dialog}</body></html>`);
   await f.page.addScriptTag({url:f.origin+'/js/pages/friends/memories.js'});await f.page.evaluate(()=>SonglineInitMemoryRoom(document));
   await f.page.evaluate(()=>document.fonts.ready.then(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))));
   const opener=f.page.locator('[data-memory-open]').first(),title=f.page.locator('.memory-room__caption h1').first();
   await f.page.mouse.move(1,1);const left=(await title.boundingBox()).x;
   for(const method of ['button','escape','backdrop','button']){
    await opener.click();await f.page.locator('[data-memory-lightbox]').waitFor({state:'visible'});
    if(method==='button')await f.page.locator('[data-memory-close]').click();else if(method==='escape')await f.page.keyboard.press('Escape');else await f.page.mouse.click(2,2);
    await f.page.locator('[data-memory-lightbox]').waitFor({state:'hidden'});await f.page.mouse.move(1,1);await f.page.waitForTimeout(300);
    assert(await opener.evaluate(n=>document.activeElement===n),'Close restores photo focus');
    assert(Math.abs((await title.boundingBox()).x-left)<1,'Restored focus must not shift the caption horizontally: '+JSON.stringify({width,method,left,after:await title.boundingBox(),caption:await title.evaluate(n=>{const s=getComputedStyle(n.parentNode);return {left:s.left,width:s.width,transform:s.transform,hover:n.parentNode.previousElementSibling.matches(':hover'),focus:n.parentNode.previousElementSibling.matches(':focus-visible'),innerWidth,scrollX,scrollY};})}));
    assert.equal(await f.page.locator('dialog:modal').count(),0);
   }
   await opener.focus();await f.page.keyboard.press('Enter');await f.page.locator('[data-memory-lightbox]').waitFor({state:'visible'});await f.page.keyboard.press('Escape');
   await f.page.waitForTimeout(300);assert(Math.abs((await title.boundingBox()).x-left)<1);assert.deepEqual(f.errors,[]);
   await f.page.screenshot({path:`${out}/memory-closed-${width}.png`});console.log('PASS memory close/focus geometry',width);
  }finally{await f.close();}
 }
 if(run('audio'))for(const width of [1440,390,320])for(const theme of ['dark','light']){
  const f=await fixture(browser,build,{width,theme});try{
   await ready(f.page,f.origin,'/tools/audio-visualizer/');
   async function aligned(){const boxes=await f.page.locator('.av-controls button').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right};}));assert.equal(boxes.length,7);assert(boxes.every(r=>Math.abs(r.y-boxes[0].y)<1),'Every stage action shares one row');assert(boxes.every((r,i)=>r.x>=0&&r.right<=width&&(!i||r.x>=boxes[i-1].right)),'Actions fit without overlap');}
   await aligned();const toggle=f.page.locator('.av-controls [data-theme-toggle]');
   for(const hover of [false,true]){if(hover)await toggle.hover();assert.equal(await toggle.evaluate(n=>getComputedStyle(n).backgroundColor),'rgba(0, 0, 0, 0)');assert.equal(await toggle.evaluate(n=>getComputedStyle(n).borderTopColor),'rgba(0, 0, 0, 0)');assert.equal(await toggle.evaluate(n=>getComputedStyle(n).boxShadow),'none');}
   await toggle.click();await f.page.waitForFunction(theme=>document.documentElement.dataset.theme!==theme,theme);
   await f.page.locator('.av-controls [data-language-toggle]').click();await f.page.waitForFunction(()=>document.documentElement.lang==='en');await aligned();
   await f.page.screenshot({path:`${out}/audio-controls-${width}-${theme}.png`});
   await f.page.locator('.av-controls [data-language-toggle]').click();await f.page.waitForFunction(()=>document.documentElement.lang==='zh-CN');
   await f.page.evaluate(()=>SonglinePageTransition.navigateLink('/tools/'));await f.page.waitForFunction(()=>location.pathname==='/tools/'&&!document.documentElement.classList.contains('songline-page-transitioning'));
   await f.page.evaluate(()=>SonglinePageTransition.navigateLink('/tools/audio-visualizer/'));await f.page.waitForFunction(()=>location.pathname==='/tools/audio-visualizer/'&&!document.documentElement.classList.contains('songline-page-transitioning'));await aligned();
   assert.deepEqual(f.errors,[]);console.log('PASS audio preferences/row/AJAX',width,theme);
  }finally{await f.close();}
 }
 if(run('pet')){
  const f=await fixture(browser,build);try{await ready(f.page,f.origin,'/');const pet=f.page.locator('[data-desktop-pet]');await pet.hover();assert.equal(await pet.getAttribute('title'),null);assert(await pet.getAttribute('aria-label'));await pet.click();await pet.focus();await f.page.keyboard.press('Enter');assert.deepEqual(f.errors,[]);console.log('PASS pet hover without tooltip, click/keyboard');}finally{await f.close();}
 }
 if(run('return'))for(const [width,reduced] of [[1440,false],[390,false],[390,true]]){
  const f=await fixture(browser,build,{width,reduced,adminOrigin:admin});try{
   await f.context.addInitScript(()=>sessionStorage.removeItem('songline-home-boot-v21.4'));
   for(const route of ['/write/','/write/account','/write/admin/media','/write/articles/new','/write/compose/projects','/write/compose/memories','/write/admin/site']){
    await f.page.goto(f.origin+route);await f.page.locator('.admin-client-home').click();await f.page.waitForURL(f.origin+'/');
    await f.page.waitForFunction(()=>!document.documentElement.matches('.document-cover,.is-scene-preparing,.is-booting,.is-boot-preparing')&&!document.querySelector('#songline-scene-entry-loader'));
    assert.equal(await f.page.locator('.site-boot-overlay').count(),0,'Returning must not start another home boot');
    assert.equal(await f.page.locator('[data-language-toggle]').evaluate(n=>{const r=n.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===n;}),true,'Home is interactive after return');
   }
   assert.deepEqual(f.errors,[]);console.log('PASS creator routes return/reduced motion',width,reduced);
  }finally{await f.close();}
 }
 if(run('failure'))for(const [mode,width] of [['reject',1440],['throw',390],['hang',390]]){
  const f=await fixture(browser,build,{width,adminOrigin:admin});try{
   await f.page.route('**/static/resource-readiness.js?*',async route=>{
    const response=await route.fetch();const extra=mode==='reject'?"()=>Promise.reject(Error('fixture readiness failure'))":mode==='throw'?"()=>{throw Error('fixture initialization failure');}":'()=>new Promise(()=>{})';
    await route.fulfill({response,body:(await response.text())+`;window.SonglineResources.enter=${extra};`});
   });
   await f.page.goto(f.origin+'/write/account');await f.page.locator('.admin-client-home').click();await f.page.waitForURL(f.origin+'/');
   await f.page.waitForFunction(()=>!document.documentElement.matches('.document-cover,.is-scene-preparing')&&!document.querySelector('#songline-scene-entry-loader'),null,{timeout:21000});
   assert.deepEqual(f.errors,[],'Readiness failures cannot escape as unhandled rejections');
   await f.page.locator('[data-language-toggle]').click();await f.page.waitForFunction(()=>document.documentElement.lang==='en');
   console.log('PASS failed/hung readiness recovers',mode,width);
  }finally{await f.close();}
 }
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
