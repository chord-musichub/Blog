const assert=require('node:assert/strict'),fs=require('node:fs');
const {launch,fixture,ready}=require('./helpers/interaction-fixture.cjs');
const source=process.env.BLOG_LANGUAGE_BUILD || 'local-only/language-2026-10-09/build';
const out='local-only/language-2026-10-09/screenshots';
const admin=process.env.BLOG_LANGUAGE_ADMIN || 'http://127.0.0.1:8091';
(async()=>{
 fs.mkdirSync(out,{recursive:true});const browser=await launch();const results=[];
 try{
  for(const [width,theme,reduced,delays] of [[1440,'dark',false,false],[390,'dark',false,false],[320,'light',true,true],[1440,'light',true,false]]){
   const f=await fixture(browser,source,{width,theme,reduced,delays,cpu:delays?4:1});const {page}=f;page.setDefaultTimeout(15000);
   try{
    await ready(page,f.origin,'/');
    assert.equal(await page.locator('[data-language-toggle]').innerText(),'中');
    await page.locator('[data-language-toggle]').focus();await page.keyboard.press('Enter');
    await page.waitForFunction(()=>document.documentElement.lang==='en');
    assert.equal(await page.locator('[data-language-toggle]').innerText(),'en');
    assert.deepEqual(await page.locator('.songline-terminal-stat-label').allTextContents(),['Articles','Tools','Projects','Messages']);
    const boxes=await page.evaluate(()=>[...document.querySelectorAll('.logo,[data-site-map-toggle],.header-icons')].map(n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};}));
    assert(boxes[0].right<=boxes[1].left && boxes[1].right+4<=boxes[2].left,'Logo, map and actions must not overlap: '+JSON.stringify(boxes));
    const pref=await page.evaluate(()=>({stored:localStorage.getItem('songline-language'),button:[...document.querySelectorAll('.header-icons>*')].map(e=>({theme:e.hasAttribute('data-theme-toggle'),lang:e.hasAttribute('data-language-toggle')}))}));
    assert.equal(pref.stored,'en');assert(pref.button.at(-1).lang && pref.button.at(-2).theme);
    await page.screenshot({path:`${out}/home-en-${width}-${theme}.png`});
    await page.evaluate(()=>window.__languageSentinel=SonglineI18n);
    async function go(key,route){
     await page.locator('[data-site-map-toggle]').click();await page.locator(`[data-site-map] a[data-page-key="${key}"]`).click();
     await page.waitForFunction(route=>location.pathname===route && !document.documentElement.classList.contains('songline-page-transitioning'),route);
     await page.evaluate(()=>SonglinePageModules.ready(document));
     assert(await page.evaluate(()=>window.__languageSentinel===SonglineI18n),'AJAX navigation keeps the shared language runtime');
     assert.equal(await page.locator('[data-language-toggle]').innerText(),'en');
    }
    await go('posts','/posts/');assert.equal(await page.locator('[data-site-map-current]').innerText(),'Archive');
    assert.equal(await page.locator('[data-archive-mode="articles"] span').first().innerText(),'Articles');
    await page.locator('[data-archive-search-trigger]').click();assert.equal(await page.locator('[data-archive-search-input]').getAttribute('placeholder'),'Search articles or projects…');
    await page.locator('[data-archive-search-input]').fill('Linux');assert.match(await page.locator('[data-archive-status]').textContent(),/^Search \/ Articles/);
    const nodeCount=await page.locator('*').count();
    for(let i=0;i<10;i++){await page.locator('[data-language-toggle]').click();await page.locator('[data-language-toggle]').click();}
    assert.equal(await page.locator('*').count(),nodeCount,'Repeated language changes do not add DOM nodes');
    await go('tools','/tools/');assert.equal(await page.locator('[data-tools-search]').getAttribute('placeholder'),'Search tools');
    for(const q of ['focus','番茄钟']){await page.locator('[data-tools-search]').fill(q);await page.waitForFunction(()=>document.querySelector('[data-tools-search-count]').textContent.startsWith('Found'));assert(await page.locator('.tool-card:visible').count()>0,'Bilingual tool search: '+q);}
    await page.locator('[data-tools-search]').fill('no-match-fixture');assert.equal(await page.locator('[data-tools-search-count]').innerText(),'Found 0 / 37 tools');
    await page.locator('[data-tools-search]').fill('');
    await go('friends','/friends/');assert.equal(await page.locator('[data-site-map-current]').innerText(),'Friends');
    await go('memories','/friends/memories/');assert.equal(await page.locator('[data-site-map-current]').innerText(),'Memories');
    const memBox=await page.locator('[data-site-map-toggle]').boundingBox(),actions=await page.locator('.header-icons').boundingBox();assert(memBox.x+memBox.width<=actions.x,'English Memories label fits header');
    await page.goBack();await page.waitForFunction(()=>location.pathname==='/friends/'&&!document.documentElement.classList.contains('songline-page-transitioning'));
    assert.equal(await page.locator('[data-site-map-current]').innerText(),'Friends');
    await page.goForward();await page.waitForFunction(()=>location.pathname==='/friends/memories/'&&!document.documentElement.classList.contains('songline-page-transitioning'));
    assert.equal(await page.locator('[data-site-map-current]').innerText(),'Memories');
    await ready(page,f.origin,'/posts/linux-note/');
    const before=await page.locator('.markdown-body').first().textContent();
    await page.evaluate(()=>{const el=document.createElement('p');el.textContent='首页';document.querySelector('.markdown-body').append(el);});
    await page.locator('[data-language-toggle]').click();await page.locator('[data-language-toggle]').click();
    assert.equal(await page.locator('.markdown-body p').last().textContent(),'首页','User content matching an interface key stays verbatim');
    assert((await page.locator('.markdown-body').first().textContent()).startsWith(before));
    await page.reload();assert.equal(await page.locator('[data-language-toggle]').innerText(),'en','English persists through reload');
    await ready(page,f.origin,'/tools/reaction-test/');await page.locator('[data-reaction-stage]').click();
    assert(!/[\u3400-\u9fff]/.test(await page.locator('[data-reaction-title]').textContent()),'Live game status is translated');
    await page.locator('[data-language-toggle]').click();assert.equal(await page.locator('[data-language-toggle]').innerText(),'中');
    await ready(page,f.origin,'/tools/typing-practice/');await page.locator('[data-typing-mode="mixed"]').click();
    const exercise=await page.locator('[data-typing-text]').textContent();await page.locator('[data-language-toggle]').click();assert.equal(await page.locator('[data-typing-text]').textContent(),exercise,'Typing corpus stays unchanged');
    await ready(page,f.origin,'/tools/audio-visualizer/');const language=page.locator('.audio-language-controls [data-language-toggle]');assert(await language.isVisible());
    const themeButton=page.locator('.audio-language-controls [data-theme-toggle]');assert(await themeButton.isVisible());
    assert((await themeButton.boundingBox()).x<(await language.boundingBox()).x);
    await language.click();assert.equal(await language.innerText(),'中');
    assert.deepEqual(f.errors,[]);results.push({surface:'public',width,theme,reduced,slow:delays,passed:true});console.log('Public passed',width,theme);
   }finally{await f.close();}
  }
  for(const width of [1440,390,320]){
   const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});const page=await context.newPage(),errors=[];page.on('dialog',dialog=>dialog.accept());page.on('pageerror',e=>errors.push(e.message));
   await context.addInitScript(()=>localStorage.setItem('songline-theme','dark'));
   // Only GETs against a read-only server with generated fixture data.
   await page.goto(admin+'/write/login?error='+encodeURIComponent('账号或密码不对'));await page.locator('[data-language-toggle]').click();
   assert.equal(await page.locator('.error').innerText(),'Incorrect username or password');
   assert.equal(await page.locator('h1').innerText(),'Welcome back');assert.equal(await page.locator('input[name="username"]').getAttribute('placeholder'),null);
   await page.locator('input[name="username"]').fill('首页');await page.locator('input[name="password"]').fill('中文密码');await page.locator('[data-password-toggle]').click();assert.equal(await page.locator('input[name="password"]').getAttribute('type'),'text');
   assert.equal(await page.locator('[data-password-toggle]').getAttribute('aria-label'),'Password visible; click to hide');
   await page.locator('[data-language-toggle]').click();assert.equal(await page.locator('input[name="username"]').inputValue(),'首页');assert.equal(await page.locator('input[name="password"]').inputValue(),'中文密码');await page.locator('[data-language-toggle]').click();
   const authBoxes=await page.locator('.auth-preferences button').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().x));assert(authBoxes[1]>authBoxes[0]);
   await page.screenshot({path:`${out}/login-en-${width}.png`});
   await page.goto(admin+'/write/password/request');assert.equal(await page.locator('h1').innerText(),'Request password reset');
   for(const role of ['owner','admin','user']){
    for(const route of ['/write/','/write/articles/new','/write/account','/write/admin','/write/admin/media',...(role==='owner'?['/write/settings','/write/compose/projects','/write/compose/memories','/write/admin/site','/write/admin/theme','/write/settings/manuscript']:[])]){
     await page.goto(admin+route+'?role='+role);await page.waitForFunction(()=>document.documentElement.lang==='en');
     const lang=page.locator('.admin-client-actions [data-language-toggle]');assert.equal(await lang.innerText(),'en');
     const rects=await page.locator('.admin-client-actions [data-admin-theme-toggle],.admin-client-actions [data-language-toggle]').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right};}));assert(rects[0].right<=rects[1].left,'Backend theme and language controls do not overlap');
     if(route==='/write/articles/new'){
      await page.locator('[name="title"]').fill('首页');await page.locator('textarea[name="body"]').fill('## 首页\n中文正文');
      await lang.click();await lang.click();assert.equal(await page.locator('[name="title"]').inputValue(),'首页');assert.equal(await page.locator('textarea[name="body"]').inputValue(),'## 首页\n中文正文');
      assert.equal(await page.locator('[data-editor-dirty]').innerText(),'Unsaved changes');
      const dialog=await page.evaluate(()=>{const form=document.getElementById('article-delete-form');if(!form)return null;let text='';const original=window.confirm;window.confirm=message=>{text=message;return false;};try{form.onsubmit(new Event('submit'));}finally{window.confirm=original;}return text;});
      if(dialog)assert.equal(dialog,'Delete this article? Published content will be removed from the website.');
      await page.evaluate(()=>{document.querySelector('form').dataset.submitting='1';});
     }
     if(route==='/write/' && role==='owner'){
       assert((await page.locator('.dashboard-welcome h1').innerText()).includes(', welcome back'));
       await page.evaluate(()=>{document.querySelector('.dashboard-article-row__main strong').textContent='首页';});
       await lang.click();await lang.click();
       assert.equal(await page.locator('.dashboard-article-row__main strong').first().innerText(),'首页');
     }
     if(route==='/write/' && role==='owner')await page.screenshot({path:`${out}/creator-en-${width}.png`});
    }
   }
   assert.deepEqual(errors,[]);results.push({surface:'backend',width,roles:3,passed:true});console.log('Backend passed',width);await context.close();
  }
  // Storage denied: language switching works for this document without persistence.
  const f=await fixture(browser,source,{width:390,reduced:true});await f.context.addInitScript(()=>{Storage.prototype.getItem=function(){throw Error('denied');};Storage.prototype.setItem=function(){throw Error('denied');};});
  try{await ready(f.page,f.origin,'/tools/');if(await f.page.locator('[data-privacy-collapse]').isVisible())await f.page.locator('[data-privacy-collapse]').click();await f.page.locator('[data-language-toggle]').click();assert.equal(await f.page.locator('[data-site-map-current]').innerText(),'Tools');assert.deepEqual(f.errors,[]);results.push({storageDenied:true,passed:true});}finally{await f.close();}
  // Public and creator routes on one origin share the same preference.
  const shared=await fixture(browser,source,{width:390,reduced:true,adminOrigin:admin});
  try{
    const page=shared.page;await ready(page,shared.origin,'/tools/');await page.locator('[data-language-toggle]').click();
    await page.goto(shared.origin+'/write/login');assert.equal(await page.locator('h1').innerText(),'Welcome back');
    await page.locator('[data-language-toggle]').click();await ready(page,shared.origin,'/posts/');assert.equal(await page.locator('[data-site-map-current]').innerText(),'档案');
    results.push({sharedOrigin:true,passed:true});assert.deepEqual(shared.errors,[]);
  }finally{await shared.close();}
  fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
