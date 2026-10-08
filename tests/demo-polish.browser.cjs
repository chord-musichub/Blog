// All requests are fulfilled locally, including simulated submissions.
// No production API, OAuth, GitHub or third-party writes.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const base='http://demo-polish.test',repo=path.resolve(__dirname,'..');
const build=path.resolve(process.env.BLOG_UI_BUILD||'local-only/polish-2026-10-08/final/public');
const out=path.join(repo,'local-only/polish-2026-10-08');
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100"><rect width="160" height="100" fill="#607d8b"/></svg>';
const initial=[{id:'one',name:'示例访客',content:'一条用来验证弹窗、键盘和网络降级的留言。',created_at:'2026-10-08T01:00:00Z'}];
async function fixture(browser,width,theme,{storage,source=build}={}){
 const context=await browser.newContext({viewport:{width,height:900},isMobile:width<981,hasTouch:width<981,reducedMotion:'reduce'});
 const state={read:'ok',write:'ok',posts:0,reads:0,messages:initial,hold:null,release:null},errors=[];
 await context.addInitScript(({theme,storage})=>{
  localStorage.setItem('songline-theme',theme);sessionStorage.setItem('songline-home-boot-v21.4','1');
  localStorage.setItem('songline-privacy-v1',JSON.stringify({version:1,statistics:false,expires:Date.now()+86400000}));
  if(storage==='denied')Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Blocked','SecurityError');}});
  if(storage==='quota')Storage.prototype.setItem=function(){throw new DOMException('Full','QuotaExceededError');};
 },{theme,storage});
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());
  if(u.pathname==='/runtime-config.js')return route.fulfill({contentType:'application/javascript',body:'window.BlogRuntimeConfig={publicApiUrl:"http://backup.demo-polish.test"};'});
  if(u.pathname==='/api/messages'){
   if(req.method()==='POST'){
    state.posts++;await new Promise(resolve=>setTimeout(resolve,120));
    if(state.write==='missing'&&u.origin===base)return route.fulfill({status:404,json:{error:'模拟无此路由'}});
    if(state.write==='timeout'){
     await new Promise(resolve=>setTimeout(resolve,9000));
     return route.fulfill({status:201,json:{messages:initial}}).catch(()=>{});
    }
    if(state.write==='fail')return route.fulfill({status:500,json:{error:'模拟保存失败，请稍后确认。'}});
    if(state.write==='invalid')return route.fulfill({contentType:'text/html',body:'<html>Bad gateway</html>'});
    state.messages=[...initial,{...JSON.parse(req.postData()),id:'two',created_at:'2026-10-08T02:00:00Z'}];
    return route.fulfill({status:201,json:{messages:state.messages}});
   }
   state.reads++;
   if(state.read==='missing'&&u.origin===base)return route.fulfill({status:404,json:{error:'模拟无此路由'}});
   if(state.read==='fail')return route.fulfill({status:503,json:{error:'模拟断网'}});
   if(state.read==='invalid')return route.fulfill({contentType:'text/html',body:'<html>Gateway</html>'});
   const snapshot=state.messages;
   if(state.read==='hold'){
    state.hold=new Promise(resolve=>{state.release=resolve;});await state.hold;
   }
   return route.fulfill({json:{messages:snapshot}}).catch(()=>{});
  }
  if(u.pathname.includes('/api/'))return route.fulfill({json:{views:83,scores:[],items:[],messages:[],authenticated:false}});
  if(u.origin!==base||u.pathname.startsWith('/uploads/'))return route.fulfill({contentType:'image/svg+xml',body:svg});
  const root=u.pathname.startsWith('/static/')?path.join(repo,'web/static'):source;
  const file=path.resolve(root,decodeURIComponent(u.pathname.replace(/^\/static\//,'/').slice(1))+(u.pathname.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
  return route.fulfill({body:fs.readFileSync(file),contentType:({'.html':'text/html','.css':'text/css','.js':'application/javascript','.json':'application/json'})[path.extname(file)]||'application/octet-stream'});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 return {page,context,state,errors};
}
async function ready(page,route='/'){
 await page.goto(base+route);await page.waitForFunction(()=>window.SonglinePageModules);
 await page.evaluate(()=>SonglinePageModules.ready(document));
 await page.waitForFunction(()=>!document.documentElement.classList.contains('is-scene-preparing'));
 if(await page.locator('#privacyPreferences').isVisible())await page.locator('[data-privacy-collapse]').click();
}
async function compose(page){
 await page.locator('[data-home-panel-goto]').click();
 await page.locator('[data-home-message-compose-open]').click();
 await page.locator('[data-home-message-form] textarea').fill('新的测试留言，仅保存到本地模拟响应。');
}
async function submit(page){await page.evaluate(()=>document.querySelector('[data-home-message-form]').requestSubmit());}
async function panelDesign(page){return page.locator('.songline-home-message-focus-panel').evaluate(el=>{
 const rect=el.getBoundingClientRect(),style=getComputedStyle(el);
 return {rect:['x','y','width','height'].map(k=>Math.round(rect[k])),style:['color','backgroundImage','padding','border','fontSize'].map(k=>style[k])};
});}
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  for(const width of [390,1440])for(const theme of ['dark','light']){
   const f=await fixture(browser,width,theme);await ready(f.page);
   await f.page.locator('[data-home-panel-goto]').click();
   const entry=f.page.locator('[data-home-message-entry]').first();await entry.click();
   const dialog=f.page.locator('[data-home-message-focus]');
   assert(await dialog.evaluate(el=>el.matches(':modal')));
   await f.page.locator('[data-home-panel-return]').evaluate(el=>el.focus());
   assert(await dialog.evaluate(el=>el.contains(document.activeElement)),'Background cannot receive focus');
   const after=await panelDesign(f.page);
   await dialog.screenshot({path:path.join(out,`message-modal-${width}-${theme}.png`)});
   if(process.env.BLOG_UI_BASELINE){
    const old=await fixture(browser,width,theme,{source:path.resolve(process.env.BLOG_UI_BASELINE)});await ready(old.page);
    await old.page.locator('[data-home-panel-goto]').click();await old.page.locator('[data-home-message-entry]').first().click();
    assert.deepEqual(after,await panelDesign(old.page),'Modal appearance remains unchanged');await old.context.close();
   }
   await f.page.keyboard.press('Escape');assert(!await dialog.isVisible());assert(await entry.evaluate(el=>document.activeElement===el));
   await entry.click();await f.page.mouse.click(2,2);assert(!await dialog.isVisible());
   await f.page.evaluate(()=>{const entry=document.querySelector('[data-home-message-entry]');entry.click();document.querySelector('[data-home-message-focus-close]').click();entry.click();});
   await f.page.waitForTimeout(50);assert(await dialog.isVisible(),'Stale native close event cannot hide a reopened dialog');
   await f.page.evaluate(()=>SonglinePageTransition.navigateLink('/tools/'));assert.equal(await f.page.locator('dialog:modal').count(),0);
   await f.page.waitForFunction(()=>location.pathname==='/tools/'&&!document.documentElement.classList.contains('songline-page-transitioning'));
   assert.equal(await f.page.locator('[data-home-message-focus]').count(),0);assert.deepEqual(f.errors,[]);
   await f.context.close();console.log('PASS message modal appearance/focus/close/cleanup',width,theme);
  }
  for(const scenario of ['ok','fail','invalid','timeout','missing']){
   const f=await fixture(browser,390,'dark');await ready(f.page);f.state.write=scenario;await compose(f.page);
   await f.page.evaluate(()=>{const form=document.querySelector('[data-home-message-form]');form.requestSubmit();form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
   await f.page.waitForFunction(()=>!document.querySelector('[data-home-message-form] button[type=submit]').disabled);
   assert.equal(f.state.posts,scenario==='missing'?2:1,'Only explicit missing routes can use the configured alternative');
   if(scenario==='ok'||scenario==='missing')assert.equal(await f.page.locator('[data-home-message-count]').textContent(),'2');
   else{
    assert((await f.page.locator('[data-home-message-form] textarea').inputValue()).includes('新的测试留言'));
    const status=await f.page.locator('[data-home-message-compose-status]').textContent();assert(status);
    if(scenario==='invalid'||scenario==='timeout')assert(status.includes('确认是否已发布'),'Ambiguous responses must advise checking before manual resubmission');
   }
   assert.deepEqual(f.errors,[]);await f.context.close();console.log('PASS submission single-flight/preserved draft',scenario);
  }
  {
   const f=await fixture(browser,390,'dark');f.state.read='missing';await ready(f.page);await f.page.locator('[data-home-panel-goto]').click();
   await f.page.waitForFunction(()=>document.querySelector('[data-home-message-count]').textContent==='1');assert(f.state.reads>=2&&f.state.reads<=4&&f.state.reads%2===0);
   assert.deepEqual(f.errors,[]);await f.context.close();console.log('PASS read-only fallback to configured API');
  }
  {
   const f=await fixture(browser,390,'dark');f.state.read='fail';await ready(f.page);await f.page.locator('[data-home-panel-goto]').click();
   await f.page.waitForFunction(()=>document.querySelector('[data-home-message-load-status]').textContent.includes('暂时无法'));
   assert.equal(await f.page.locator('[data-home-message-count]').textContent(),'—');
   f.state.read='ok';await f.page.locator('[data-home-panel-return]').click();await f.page.locator('[data-home-panel-goto]').click();
   await f.page.waitForFunction(()=>document.querySelector('[data-home-message-count]').textContent==='1');
   assert.equal(await f.page.locator('[data-home-message-load-status]').isVisible(),false);
   await f.page.locator('[data-home-message-compose-open]').click();await f.page.locator('[data-home-message-preview-toggle]').click();
   assert.equal(await f.page.locator('[data-home-message-content-field]').isVisible(),true,'Empty required input stays reachable');
   assert.deepEqual(f.errors,[]);await f.context.close();console.log('PASS read failure/reopen recovery/empty preview');
  }
  {
   const f=await fixture(browser,390,'dark');f.state.read='hold';await ready(f.page);await compose(f.page);
   await submit(f.page);await f.page.waitForFunction(()=>document.querySelector('[data-home-message-count]').textContent==='2');
   f.state.release();await f.page.waitForTimeout(200);assert.equal(await f.page.locator('[data-home-message-count]').textContent(),'2','Late initial GET cannot overwrite a successful POST');
   assert.deepEqual(f.errors,[]);await f.context.close();console.log('PASS stale read after successful submission');
  }
  for(const storage of ['denied','quota']){
   const f=await fixture(browser,390,'dark',{storage});
   for(const route of ['2048','snake','flappy-bird','reaction-test','typing-practice']){
    await ready(f.page,'/tools/'+route+'/');
    const selectors={'2048':'[data-2048-sound-toggle]',snake:'[data-snake-start]','flappy-bird':'[data-flappy-sound-toggle]','reaction-test':'[data-reaction-sound-toggle]','typing-practice':'[data-typing-sound-toggle]'};
    await f.page.locator(selectors[route]).click();
    if(route==='2048'){await f.page.keyboard.press('ArrowLeft');await f.page.keyboard.press('ArrowDown');assert(await f.page.locator('.game-2048-tile').count()>0);}
    if(route==='typing-practice'){
     await f.page.locator('[data-typing-input]').fill('Typing');
     await f.page.waitForTimeout(500); // let the one-off best-score sync finish
     await f.page.evaluate(()=>{const get=SonglineRuntime.storage.getItem;window.bestReads=0;SonglineRuntime.storage.getItem=function(key){if(key.startsWith('songline-typing-best-'))bestReads++;return get(key);};});
     await f.page.waitForTimeout(500);assert.equal(await f.page.evaluate(()=>bestReads),0,'Timer ticks do not reread synchronous storage');
     await f.page.evaluate(()=>{SonglineRuntime.storage.setItem('songline-typing-best-english','1234');dispatchEvent(new StorageEvent('storage',{key:'songline-typing-best-english'}));});
     assert.equal(await f.page.locator('[data-typing-best]').textContent(),'1.23s','External best-score updates remain visible');
    }
    if(route==='reaction-test'){await f.page.locator('[data-reaction-start]').click();assert(await f.page.locator('[data-reaction-stage]').evaluate(el=>el.classList.contains('is-waiting')));}
    assert.deepEqual(f.errors,[],'Tool works without persistence: '+route+' '+storage);
   }
   // Memory fallback survives in-document page changes, not full reloads.
   await f.page.evaluate(()=>SonglineRuntime.storage.setItem('songline-2048-best-v1','128'));
   await f.page.evaluate(()=>SonglinePageTransition.navigateLink('/tools/2048/'));
   await f.page.waitForFunction(()=>location.pathname==='/tools/2048/'&&!document.documentElement.classList.contains('songline-page-transitioning'));
   await f.page.evaluate(()=>SonglinePageModules.ready(document));
   assert.equal(await f.page.locator('[data-2048-best]').textContent(),'128');
   assert.deepEqual(f.errors,[]);await f.context.close();console.log('PASS game/storage fallback',storage);
  }
  {
   const f=await fixture(browser,390,'dark');let release;
   const delayed=new Promise(resolve=>release=resolve);
   await f.context.route('**/*typing-scores*',async route=>{
    const mode=new URL(route.request().url()).searchParams.get('mode');
    if(mode==='english')await delayed;
    return route.fulfill({json:{scores:[{score:mode==='english'?9000:1200}]}}).catch(()=>{});
   });
   await ready(f.page,'/tools/typing-practice/');await f.page.locator('[data-typing-mode="mixed"]').click();
   await f.page.waitForFunction(()=>document.querySelector('[data-typing-top-scores]').textContent.includes('1.20s'));
   release();await f.page.waitForTimeout(500);
   assert((await f.page.locator('[data-typing-top-scores]').textContent()).includes('1.20s'),'Late English scores cannot replace the mixed leaderboard');
   assert((await f.page.evaluate(()=>SonglineRuntime.storage.getItem('songline-typing-top3-cache-mixed'))).includes('1200'));
   assert.deepEqual(f.errors,[]);await f.context.close();console.log('PASS out-of-order typing mode responses');
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
