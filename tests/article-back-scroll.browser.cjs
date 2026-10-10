const assert=require('node:assert/strict'),fs=require('node:fs');
const {launch,fixture,ready}=require('./helpers/interaction-fixture.cjs');
const build=process.env.BLOG_ARTICLE_BACK_BUILD||'local-only/article-back-background-2026-10-10/build';
const out=process.env.BLOG_ARTICLE_BACK_OUT||'local-only/article-back-background-2026-10-10';
async function navigation(page,route){await page.evaluate(route=>SonglinePageTransition.navigateLink(route),route);await page.waitForFunction(route=>location.pathname===route&&!document.documentElement.classList.contains('songline-page-transitioning'),route);}
(async()=>{fs.mkdirSync(out,{recursive:true});const browser=await launch();try{
 for(const width of [1440,390,320])for(const theme of ['dark','light']){
  const f=await fixture(browser,build,{width,theme,reduced:theme==='light'});try{
   await ready(f.page,f.origin,'/posts/linux-note/');await f.page.locator('#songline-scene-entry-loader').waitFor({state:'detached'});
   async function pinned(){for(const y of [400,1000,100000]){
    await f.page.evaluate(y=>scrollTo({top:y,behavior:'instant'}),y);await f.page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const state=await f.page.locator('main.container > [data-back-icon]').evaluate(n=>{const r=n.getBoundingClientRect(),header=document.querySelector('.modern-site-header').getBoundingClientRect();return {top:r.top,bottom:r.bottom,x:r.x,right:r.right,position:getComputedStyle(n).position,headerBottom:header.bottom,hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('[data-back-icon]')===n};});
    assert.equal(state.position,'sticky');assert(Math.abs(state.top-72)<1,JSON.stringify({width,theme,y,state}));assert(state.top>=state.headerBottom&&state.bottom<=900&&state.x>=0&&state.right<=width);assert(state.hit,'Pinned return must remain clickable');
   }}
   await pinned();const back=f.page.locator('main.container > [data-back-icon]');await f.page.mouse.move(0,0);
   async function palette(control){return control.evaluate(n=>{const s=getComputedStyle(n);return {background:s.backgroundColor,color:s.color,border:s.borderTopWidth,borderColor:s.borderTopColor,radius:s.borderTopLeftRadius,shadow:s.boxShadow};});}
   const surface=await palette(back),top=f.page.locator('.back-to-top-button'),bottom=f.page.locator('.scroll-to-bottom-button');
   assert.notEqual(surface.background,'rgba(0, 0, 0, 0)','Article return has a visible background');assert.notEqual(surface.shadow,'none');
   assert.deepEqual(surface,await palette(top),'Return matches the top control');assert.deepEqual(surface,await palette(bottom),'Return matches the bottom control');
   await top.hover();await f.page.waitForTimeout(220);const hover=await palette(top);
   await back.hover();await f.page.waitForTimeout(220);assert.deepEqual(await palette(back),hover,'Hover colors and surface match the reading controls');
   assert.notEqual(hover.background,surface.background,'Hover makes the surface more distinct');
   await f.page.mouse.move(0,0);await back.focus();await f.page.waitForTimeout(220);
   assert.deepEqual(await palette(back),hover,'Keyboard focus retains the highlighted surface');
   assert.notEqual(await back.evaluate(n=>getComputedStyle(n).outlineStyle),'none','Keyboard focus remains visible');
   await back.evaluate(n=>n.blur());await f.page.waitForTimeout(220);
   await f.page.screenshot({path:`${out}/article-back-${width}-${theme}.png`});
   await f.page.locator('main.container > [data-back-icon]').click();await f.page.waitForFunction(()=>location.pathname==='/posts/'&&!document.documentElement.classList.contains('songline-page-transitioning'));
   const record=f.page.locator('.archive-record').first();await record.locator('[data-archive-trigger]').click();await record.locator('.archive-record__detail--open').click();
   await f.page.waitForFunction(()=>location.pathname!='/posts/'&&location.pathname.startsWith('/posts/')&&!document.documentElement.classList.contains('songline-page-transitioning'));
   await pinned();await f.page.locator('main.container > [data-back-icon]').focus();await f.page.keyboard.press('Enter');await f.page.waitForFunction(()=>location.pathname==='/posts/'&&!document.documentElement.classList.contains('songline-page-transitioning'));
   assert.equal(await f.page.locator('.archive-record.is-open').count(),1,'Pinned return preserves the archive drawer');
   await navigation(f.page,'/tools/');assert.equal(await f.page.locator('main.container > [data-back-icon]').count(),0,'No article control survives departure');
   assert.deepEqual(f.errors,[]);console.log('PASS scrolling/direct/AJAX/keyboard/archive return',width,theme);
  }finally{await f.close();}
 }
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
