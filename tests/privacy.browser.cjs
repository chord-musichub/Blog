const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const build=process.env.BLOG_UI_BUILD;
assert(build&&fs.existsSync(path.join(build,'index.html')),'Set BLOG_UI_BUILD to a fresh isolated Hugo build');
const base='http://127.0.0.1:41739',key='songline-privacy-v1';
async function fixture(browser,options={}){
 const context=await browser.newContext({viewport:options.viewport||{width:390,height:844},reducedMotion:options.boot?'no-preference':'reduce'});
 const calls=[];
 await context.route('**/*',route=>{
  const u=new URL(route.request().url());
  if(u.origin!==base||u.pathname.startsWith('/uploads/'))return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="180" height="120"><rect width="180" height="120" fill="#7497ac"/></svg>'});
  if(u.pathname.startsWith('/api/')){if(u.pathname==='/api/views')calls.push(route.request().method());return route.fulfill({json:u.pathname==='/api/views'?{views:83}:{messages:[],items:[]}});}
  const root=path.resolve(u.pathname.startsWith('/static/')?'web/static':build);
  const file=path.resolve(root,u.pathname.replace(/^\/static\//,'/').slice(1)+(u.pathname.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:'not found'});
  return route.fulfill({body:fs.readFileSync(file),contentType:({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json'})[path.extname(file)]||'application/octet-stream'});
 });
 await context.addInitScript(({theme,expired,blocked,boot})=>{
  if(!boot)sessionStorage.setItem('songline-home-boot-v21.4','1');
  localStorage.setItem('songline-theme',theme||'dark');
  if(expired)localStorage.setItem('songline-privacy-v1',JSON.stringify({version:1,statistics:true,expires:Date.now()-1000}));
  if(blocked){Storage.prototype.getItem=function(){throw Error('blocked');};Storage.prototype.setItem=function(){throw Error('blocked');};}
 },options);
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 async function ready(route='/posts/linux-note/'){
  await page.goto(base+route);await page.evaluate(()=>SonglinePageModules.ready(document));await page.waitForTimeout(450);
 }
 return {context,page,calls,errors,ready};
}
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge',args:['--enable-gpu']});
 try{
  for(const viewport of [{width:360,height:640},{width:844,height:390},{width:1440,height:900}])for(const theme of ['dark','light']){
   const f=await fixture(browser,{viewport,theme});await f.ready();
   const panel=f.page.locator('#privacyPreferences');assert(await panel.isVisible());
   assert(f.calls.length>0&&f.calls.every(method=>method==='GET'),'No increments before consent');
   await panel.locator('[data-privacy-collapse]').click();assert(!await panel.isVisible());
   assert.equal(await f.page.evaluate(()=>localStorage.getItem('songline-privacy-v1')),null,'Collapsing is not consent');
   await f.page.getByRole('button',{name:'隐私偏好',exact:true}).click();
   await panel.locator('summary').click();
   const box=await panel.boundingBox();assert(box.x>=0&&box.y>=0&&box.x+box.width<=viewport.width&&box.y+box.height<=viewport.height);
   assert.equal(box.y,0,'Drawer attaches to the top of the viewport');
   assert(box.width>=viewport.width-20,'Drawer spans the viewport, allowing a scrollbar');
   assert(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
   await panel.locator('[data-privacy-choice="necessary"]').click();assert(!await panel.isVisible());
   await f.page.getByRole('button',{name:'隐私偏好',exact:true}).click();assert(await panel.isVisible());
   assert(await panel.locator('button').first().evaluate(el=>document.activeElement===el));
   await panel.locator('[data-privacy-choice="statistics"]').click();await f.page.waitForTimeout(100);
   assert.equal(f.calls.filter(m=>m==='POST').length,1);
   await f.page.reload();await f.page.evaluate(()=>SonglinePageModules.ready(document));await f.page.waitForTimeout(150);
   assert(!await panel.isVisible());assert.equal(f.calls.filter(m=>m==='POST').length,1,'Reload deduplicates the same article');
   await f.page.getByRole('button',{name:'隐私偏好',exact:true}).click();await f.page.keyboard.press('Escape');
   assert.equal(await f.page.evaluate(()=>SonglinePrivacy.allows('statistics')),true,'Escape only collapses, preserving the saved choice');
   await f.page.getByRole('button',{name:'隐私偏好',exact:true}).click();await panel.locator('[data-privacy-choice="necessary"]').click();
   assert.equal(await f.page.evaluate(()=>SonglinePrivacy.allows('statistics')),false);
   assert.equal(await f.page.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.startsWith('songline-viewed:')).length),0);
   await f.page.evaluate(()=>SonglinePageTransition.navigateLink('/tools/'));
   await f.page.waitForFunction(()=>location.pathname==='/tools/'&&!document.documentElement.classList.contains('songline-page-transitioning'));
   assert.equal(await panel.count(),1);await f.page.getByRole('button',{name:'隐私偏好',exact:true}).click();assert(await panel.isVisible());
   const nextBox=await panel.boundingBox();assert(nextBox.x>=0&&nextBox.y>=0&&nextBox.x+nextBox.width<=viewport.width,'Dialog fits pages with scrollbars too');
   fs.mkdirSync('local-only/privacy',{recursive:true});await f.page.screenshot({path:'local-only/privacy/drawer-'+viewport.width+'-'+theme+'.png'});
   assert.deepEqual(f.errors,[]);console.log('privacy layout / choices / persistence / navigation',viewport,theme,'PASS');await f.context.close();
  }
  for(const options of [{expired:true},{blocked:true}]){
   const f=await fixture(browser,options);await f.ready();assert(await f.page.locator('#privacyPreferences').isVisible());
   assert(f.calls.every(m=>m==='GET'));await f.page.locator('[data-privacy-choice="statistics"]').click();await f.page.waitForTimeout(100);assert(f.calls.includes('POST'));
   await f.page.getByRole('button',{name:'隐私偏好',exact:true}).click();
   if(options.blocked)assert((await f.page.locator('[data-privacy-status]').textContent()).includes('仅在本页面有效'));
   assert.deepEqual(f.errors,[]);console.log('privacy storage',options,'PASS');await f.context.close();
  }
  const f=await fixture(browser);await f.ready();await f.page.locator('[data-privacy-choice="statistics"]').click();
  const other=await f.context.newPage();await other.goto(base+'/tools/');await other.waitForFunction(()=>window.SonglinePrivacy);
  await other.getByRole('button',{name:'隐私偏好',exact:true}).click();await other.locator('[data-privacy-choice="necessary"]').click();
  await f.page.waitForFunction(()=>!SonglinePrivacy.allows('statistics'));
  assert.equal(await f.page.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.startsWith('songline-viewed:')).length),0);
  console.log('privacy cross-tab withdrawal PASS');await f.context.close();
  const first=await fixture(browser,{boot:true});await first.ready('/');
  await first.page.waitForFunction(()=>!document.documentElement.classList.contains('is-booting')&&!document.documentElement.classList.contains('is-boot-preparing'));
  await first.page.locator('[data-privacy-choice="necessary"]').click();await first.page.locator('#privacyPreferences').waitFor({state:'hidden'});
  await first.page.getByRole('button',{name:'隐私偏好',exact:true}).click();
  assert(await first.page.locator('#privacyPreferences').evaluate(el=>el.getAnimations().length>0),'Normal motion slides the drawer open');
  await first.page.waitForTimeout(320);
  assert.equal((await first.page.locator('#privacyPreferences').boundingBox()).y,0);
  await first.page.locator('[data-privacy-collapse]').click();
  assert(await first.page.locator('#privacyPreferences').evaluate(el=>el.getAnimations().length>0),'Normal motion slides the drawer closed');
  await first.page.locator('#privacyPreferences').waitFor({state:'hidden'});
  await first.page.evaluate(()=>{SonglinePrivacy.open();document.querySelector('[data-privacy-choice="necessary"]').click();SonglinePrivacy.open();});
  await first.page.waitForTimeout(350);assert(await first.page.locator('#privacyPreferences').isVisible(),'A cancelled close cannot hide the reopened drawer');
  assert.deepEqual(first.errors,[]);console.log('privacy first home boot PASS');await first.context.close();
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
