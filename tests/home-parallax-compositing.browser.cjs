// Offline, real-image hardware regression for the retained parallax change.
const {chromium}=require('playwright'),sharp=require('sharp');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const repo=path.resolve(__dirname,'..'),base='http://home-gpu.test';
const builds={before:process.env.BLOG_UI_BASELINE,after:process.env.BLOG_UI_BUILD};
for(const build of Object.values(builds))assert(build&&fs.existsSync(path.join(build,'index.html')),'Provide both Hugo builds');
const out=path.join(repo,'local-only/gpu-optimization-2026-10-09');
fs.mkdirSync(out,{recursive:true});
const report=[];
async function fixture(browser,mode,width,height,dpr,theme){
 const build=path.resolve(builds[mode]),errors=[];
 const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:dpr,isMobile:width<981,hasTouch:width<981,reducedMotion:'no-preference'});
 await context.route('**/*',route=>{
  const u=new URL(route.request().url());
  if(u.origin!==base)return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100"><rect width="160" height="100" fill="#607d8b"/></svg>'});
  if(/^\/(?:write\/|static\/)?api\//.test(u.pathname))return route.fulfill({json:{items:[],messages:[],views:83,scores:[]}});
  const root=u.pathname.startsWith('/static/')?path.join(repo,'web/static'):build;
  const file=path.resolve(root,decodeURIComponent(u.pathname.replace(/^\/static\//,'/').slice(1))+(u.pathname.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
  return route.fulfill({body:fs.readFileSync(file),contentType:({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'})[path.extname(file)]||'application/octet-stream'});
 });
 await context.addInitScript(theme=>{
  localStorage.setItem('songline-theme',theme);sessionStorage.setItem('songline-home-boot-v21.4','1');
  localStorage.setItem('songline-privacy-v1',JSON.stringify({version:1,statistics:false,expires:Date.now()+86400000}));
  let seed=42;Math.random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
 },theme);
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/');await page.evaluate(()=>SonglinePageModules.ready(document));
 await page.waitForFunction(()=>!document.documentElement.classList.contains('is-scene-preparing'));
 await page.waitForTimeout(1000);
 return {context,page,errors};
}
async function delta(a,b){
 const x=await sharp(a).removeAlpha().raw().toBuffer(),y=await sharp(b).removeAlpha().raw().toBuffer();
 assert.equal(x.length,y.length);let sum=0,changed=0;
 for(let i=0;i<x.length;i+=3){let d=0;for(let c=0;c<3;c++)d+=Math.abs(x[i+c]-y[i+c]);sum+=d;if(d>15)changed++;}
 return {mean:sum/x.length,changedRatio:changed/(x.length/3)};
}
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-gpu','--mute-audio']});
 try{
  const info=await (await browser.newBrowserCDPSession()).send('SystemInfo.getInfo');
  assert.equal(info.gpu.featureStatus.gpu_compositing,'enabled');assert(/NVIDIA/.test(info.gpu.auxAttributes.glRenderer));
  for(const [width,height,dpr,theme] of [[2560,1440,2,'dark'],[2560,1440,2,'light'],[1440,900,1,'dark'],[1440,900,1,'light'],[390,844,2,'dark'],[390,844,2,'light']]){
   let reference;
   for(const mode of ['before','after']){
    const {context,page,errors}=await fixture(browser,mode,width,height,dpr,theme);
    // Exercise repeated restores and the real pointer/easing path before
    // freezing for deterministic visual comparisons (not a performance claim).
    if(width>980){
     for(let i=0;i<3;i++)await page.evaluate(()=>SonglineInitHomeParallax());
     await page.mouse.move(width*.8,height*.7,{steps:20});await page.waitForTimeout(500);
     assert(await page.locator('.site-bg-layer').evaluate(e=>parseFloat(e.style.getPropertyValue('--home-parallax-x'))>0));
     assert.equal(await page.locator('.site-bg-layer').evaluate(e=>getComputedStyle(e).willChange),'transform');
    }
    await page.evaluate(()=>{
     document.dispatchEvent(new Event('pointerleave'));
     window.dispatchEvent(new Event('songline:page-transition-start'));
     window.requestAnimationFrame=()=>0;
     document.getAnimations().forEach(a=>{a.pause();a.currentTime=0;});
     document.querySelectorAll('svg').forEach(s=>{s.pauseAnimations?.();s.setCurrentTime?.(0);});
    });
    const samples=[];
    for(const [x,y] of [[0,0],[1.2,.6],[-1.2,-.6]]){
     const geometry=await page.evaluate(({x,y})=>{
      const bg=document.querySelector('.site-bg-layer');bg.style.setProperty('--home-parallax-x',x+'px');bg.style.setProperty('--home-parallax-y',y+'px');
      const nodes=[bg,...document.querySelectorAll('[data-home-parallax]:not(.site-bg-layer)')];
      return nodes.map(n=>{const r=n.getBoundingClientRect(),s=getComputedStyle(n);return {rect:[r.x,r.y,r.width,r.height],transform:s.transform,filter:s.filter,opacity:s.opacity,willChange:s.willChange,before:getComputedStyle(n,'::before').transform};});
     },{x,y});
     const png=await page.screenshot({path:path.join(out,`home-${width}-${dpr}-${theme}-${x}-${mode}.png`)});
     samples.push({geometry,png});
    }
    if(mode==='before')reference=samples;
    else for(let i=0;i<samples.length;i++){
     assert.deepEqual(samples[i].geometry,reference[i].geometry);
     const pixels=await delta(samples[i].png,reference[i].png);
     assert(pixels.mean<.15&&pixels.changedRatio<.003,JSON.stringify({width,theme,...pixels}));
     report.push({width,height,dpr,theme,phase:i,...pixels});
    }
    assert.deepEqual(errors,[]);await context.close();
   }
   console.log('PASS home motion / restores / visual states',width,dpr,theme);
  }
 }finally{fs.writeFileSync(path.join(out,'home-visual-report.json'),JSON.stringify(report,null,2));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
