// Offline queue and SVG-node reuse comparison. No production API calls/uploads.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const repo=path.resolve(__dirname,'..'),base='http://runtime-reuse.test';
const builds={after:path.resolve(process.env.BLOG_UI_BUILD||'')};
if(process.env.BLOG_UI_BASELINE)builds.before=path.resolve(process.env.BLOG_UI_BASELINE);
for(const build of Object.values(builds))assert(fs.existsSync(path.join(build,'index.html')),'Provide a fresh Hugo build');
const out=path.join(repo,'local-only/cleanup-2026-10-09');fs.mkdirSync(out,{recursive:true});const results=[];
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100"><rect width="160" height="100" fill="#607d8b"/></svg>';
async function fixture(browser,build,width){
 const context=await browser.newContext({viewport:{width,height:1000},isMobile:width<981,hasTouch:width<981,reducedMotion:'reduce'});
 await context.route('**/*',route=>{
  const u=new URL(route.request().url());if(u.origin!==base||u.pathname.startsWith('/uploads/'))return route.fulfill({body:svg,contentType:'image/svg+xml'});
  if(u.pathname.includes('/api/'))return route.fulfill({json:{items:[],messages:[],views:83,scores:[]}});
  const root=u.pathname.startsWith('/static/')?path.join(repo,'web/static'):build;
  const file=path.resolve(root,decodeURIComponent(u.pathname.replace(/^\/static\//,'/').slice(1))+(u.pathname.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
  return route.fulfill({body:fs.readFileSync(file),contentType:({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json'})[path.extname(file)]||'application/octet-stream'});
 });
 await context.addInitScript(()=>{
  localStorage.setItem('songline-theme','dark');sessionStorage.setItem('songline-home-boot-v21.4','1');localStorage.setItem('songline-privacy-v1',JSON.stringify({version:1,statistics:false,expires:Date.now()+86400000}));
  window.reuseAudit={rowListeners:0};const add=EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener=function(type,...args){if(type==='click'&&this instanceof Element&&this.matches('.av-playlist-main,.av-playlist-remove'))reuseAudit.rowListeners++;return add.call(this,type,...args);};
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/tools/audio-visualizer/');await page.evaluate(()=>SonglinePageModules.ready(document));await page.waitForFunction(()=>!!window.__songlineAudioVisualizerCleanup);return {context,page,errors};
}
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--mute-audio']});
 try{
  for(const width of [1440,390])for(const [mode,build] of Object.entries(builds)){
   const {context,page,errors}=await fixture(browser,build,width);
   const icons=await page.evaluate(()=>{
    const nodes=[...document.querySelectorAll('[data-ui-icon]')],children=nodes.map(n=>n.firstElementChild);
    const observer=new MutationObserver(()=>{});observer.observe(document.body,{subtree:true,childList:true});
    for(let i=0;i<20;i++)SonglineIcons.replace(document);
    const mutations=observer.takeRecords().filter(r=>r.target instanceof Element&&r.target.matches('[data-ui-icon]')).length;observer.disconnect();
    return {count:nodes.length,mutations,retained:nodes.every((n,i)=>n.firstElementChild===children[i])};
   });
   await page.locator('[data-av-file]').evaluate(input=>{
    const wav=new Uint8Array(44+16000*2*20),view=new DataView(wav.buffer),text=(offset,value)=>[...value].forEach((c,i)=>wav[offset+i]=c.charCodeAt(0));
    text(0,'RIFF');view.setUint32(4,wav.length-8,true);text(8,'WAVEfmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,16000,true);view.setUint32(28,32000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,wav.length-44,true);
    const transfer=new DataTransfer();for(let i=0;i<30;i++)transfer.items.add(new File([wav],'track-'+String(i).padStart(3,'0')+'.wav',{type:'audio/wav'}));input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
   });
   await page.waitForFunction(()=>document.querySelectorAll('.av-playlist-item').length===30&&document.querySelector('[data-av-sample-rate]').dataset.source==='file');
   await page.locator('[data-av-playlist-toggle]').click();await page.locator('[data-av-playlist]').waitFor({state:'visible'});
   await page.evaluate(()=>{reuseAudit.rows=[...document.querySelector('[data-av-playlist-list]').children];reuseAudit.changes=0;reuseAudit.observer=new MutationObserver(records=>reuseAudit.changes+=records.length);reuseAudit.observer.observe(document.querySelector('[data-av-playlist-list]'),{childList:true});});
   for(const index of [1,17,3,0]){
    await page.locator('.av-playlist-main strong').nth(index).click();
    await page.waitForFunction(index=>document.querySelector('[data-av-title]').textContent==='track-'+String(index).padStart(3,'0')&&document.querySelector('[data-av-sample-rate]').dataset.source==='file',index);await page.waitForTimeout(80);
   }
   const queue=await page.evaluate(()=>{reuseAudit.observer.disconnect();return {retained:reuseAudit.rows.every((n,i)=>n===document.querySelector('[data-av-playlist-list]').children[i]),focus:document.querySelector('.av-playlist-main')===document.activeElement,changes:reuseAudit.changes,rowListeners:reuseAudit.rowListeners};});
   await page.locator('.av-playlist-remove').nth(2).click();assert.equal(await page.locator('.av-playlist-item').count(),29);
   await page.locator('.av-playlist-main strong').nth(2).click();await page.waitForFunction(()=>document.querySelector('[data-av-title]').textContent==='track-003','Reindexed rows play the correct retained track');
   await page.keyboard.press('Escape');await page.locator('[data-av-return]').click();assert.equal(await page.locator('.av-playlist-item').count(),0);
   if(mode==='after'){assert(icons.retained);assert.equal(icons.mutations,0);assert(queue.retained);assert(queue.focus);assert.equal(queue.changes,0);assert.equal(queue.rowListeners,0);}
   assert.deepEqual(errors,[]);results.push({mode,width,icons,queue});console.log('PASS',JSON.stringify(results.at(-1)));await context.close();
  }
 }finally{fs.writeFileSync(path.join(out,'runtime-reuse-report.json'),JSON.stringify(results,null,2));await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
