// Offline real-player audit. Files and requests remain inside this test context.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const repo=path.resolve(__dirname,'..'),base='http://home-player.test';
const builds={after:path.resolve(process.env.BLOG_UI_BUILD||'')};
if(process.env.BLOG_UI_BASELINE)builds.before=path.resolve(process.env.BLOG_UI_BASELINE);
for(const build of Object.values(builds))assert(fs.existsSync(path.join(build,'index.html')),'Provide a Hugo build');
const out=path.join(repo,'local-only/multi-cleanup-2026-10-08');fs.mkdirSync(out,{recursive:true});
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100"><rect width="160" height="100" fill="#607d8b"/></svg>';
const results=[];
async function fixture(browser,build,width){
 const context=await browser.newContext({viewport:{width,height:900},hasTouch:width<981,isMobile:width<981,reducedMotion:'reduce'});
 await context.route('**/*',route=>{
  const u=new URL(route.request().url());
  if(u.origin!==base||u.pathname.startsWith('/uploads/'))return route.fulfill({body:svg,contentType:'image/svg+xml'});
  if(u.pathname.includes('/api/'))return route.fulfill({json:{views:83,items:[],messages:[],scores:[]}});
  const root=u.pathname.startsWith('/static/')?path.join(repo,'web/static'):build;
  const file=path.resolve(root,decodeURIComponent(u.pathname.replace(/^\/static\//,'/').slice(1))+(u.pathname.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
  return route.fulfill({body:fs.readFileSync(file),contentType:({'.html':'text/html','.css':'text/css','.js':'application/javascript','.json':'application/json','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream'});
 });
 await context.addInitScript(()=>{
  localStorage.setItem('songline-theme','dark');sessionStorage.setItem('songline-home-boot-v21.4','1');
  localStorage.setItem('songline-privacy-v1',JSON.stringify({version:1,statistics:false,expires:Date.now()+86400000}));
  window.homeAudit={barWrites:0,urls:new Set(),contexts:[]};
  const set=CSSStyleDeclaration.prototype.setProperty;
  CSSStyleDeclaration.prototype.setProperty=function(key,...args){if(key==='--bar-scale')homeAudit.barWrites++;return set.call(this,key,...args);};
  const create=URL.createObjectURL,revoke=URL.revokeObjectURL;
  URL.createObjectURL=function(blob){const url=create.call(this,blob);homeAudit.urls.add(url);return url;};
  URL.revokeObjectURL=function(url){homeAudit.urls.delete(url);return revoke.call(this,url);};
  const Context=window.AudioContext;
  if(Context)window.AudioContext=class extends Context{constructor(...args){super(...args);homeAudit.contexts.push(this);}};
  let hidden=false;Object.defineProperty(document,'hidden',{configurable:true,get:()=>hidden});
  window.homeAuditHidden=value=>{hidden=value;document.dispatchEvent(new Event('visibilitychange'));};
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(base+'/');await page.evaluate(()=>SonglinePageModules.ready(document));
 return {context,page,errors};
}
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge',args:['--mute-audio']});
 try{
  for(const width of [1440,390])for(const [mode,build] of Object.entries(builds)){
   const {context,page,errors}=await fixture(browser,build,width);
   await page.locator('[data-home-music-folder]').evaluate(input=>{
    const wav=new Uint8Array(44+8000*2*60),view=new DataView(wav.buffer),text=(offset,value)=>[...value].forEach((c,i)=>wav[offset+i]=c.charCodeAt(0));
    text(0,'RIFF');view.setUint32(4,wav.length-8,true);text(8,'WAVEfmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,8000,true);view.setUint32(28,16000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,wav.length-44,true);
    const files=new DataTransfer();for(let i=0;i<30;i++)files.items.add(new File([wav],'track-'+String(i).padStart(3,'0')+'.wav',{type:'audio/wav'}));
    input.files=files.files;input.dispatchEvent(new Event('change',{bubbles:true}));
   });
   await page.waitForFunction(()=>document.querySelector('[data-home-music-playlist-list]').children.length===30);
   await page.waitForFunction(()=>document.querySelector('[data-home-music-audio]').readyState>=2);
   await page.locator('[data-home-music-list-toggle]').click();
   await page.evaluate(()=>{homeAudit.rows=[...document.querySelector('[data-home-music-playlist-list]').children];homeAudit.replacements=0;homeAudit.observer=new MutationObserver(entries=>homeAudit.replacements+=entries.length);homeAudit.observer.observe(document.querySelector('[data-home-music-playlist-list]'),{childList:true});});
   for(const index of [1,3,17,0]){
    await page.locator('[data-home-music-playlist-list] button span').nth(index).click();
    await page.waitForFunction(index=>document.querySelector('[data-home-music-title]').textContent==='track-'+String(index).padStart(3,'0'),index);
    await page.waitForFunction(()=>!document.querySelector('[data-home-music-audio]').paused);
    await page.waitForTimeout(80);
   }
   const retained=await page.evaluate(()=>homeAudit.rows.every((node,i)=>node===document.querySelector('[data-home-music-playlist-list]').children[i]));
   const focus=await page.locator('[data-home-music-playlist-list] button').first().evaluate(node=>node===document.activeElement);
   const replacements=await page.evaluate(()=>homeAudit.replacements);
   await page.waitForTimeout(180);await page.evaluate(()=>homeAudit.barWrites=0);await page.waitForTimeout(300);
   const repeatedBarWrites=await page.evaluate(()=>homeAudit.barWrites);
   await page.evaluate(()=>{homeAuditHidden(true);homeAudit.barWrites=0;});await page.waitForTimeout(200);
   const hiddenBarWrites=await page.evaluate(()=>homeAudit.barWrites);
   assert.equal(await page.locator('[data-home-music-audio]').evaluate(node=>node.paused),false,'Background optimization does not stop playback');
   await page.evaluate(()=>homeAuditHidden(false));
   await page.locator('[data-home-music-next]').click();await page.waitForFunction(()=>document.querySelector('[data-home-music-title]').textContent==='track-001');
   const stats={mode,width,retained,focus,replacements,repeatedBarWrites,hiddenBarWrites};
   if(mode==='after'){assert(retained);assert(focus);assert.equal(replacements,0);assert.equal(repeatedBarWrites,0);assert.equal(hiddenBarWrites,0);}
   await page.evaluate(()=>{homeAudit.observer.disconnect();homeAudit.rows=[];});
   await page.evaluate(()=>SonglinePageTransition.navigateLink('/posts/'));
   await page.waitForFunction(()=>location.pathname==='/posts/'&&!document.documentElement.classList.contains('songline-page-transitioning'));
   assert.equal(await page.evaluate(()=>homeAudit.urls.size),0);
   assert.equal(await page.evaluate(()=>homeAudit.contexts.filter(ctx=>ctx.state!=='closed').length),0);
   assert.deepEqual(errors,[]);results.push(stats);console.log('PASS',JSON.stringify(stats));await context.close();
  }
 }finally{fs.writeFileSync(path.join(out,'home-player-report.json'),JSON.stringify(results,null,2));await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
