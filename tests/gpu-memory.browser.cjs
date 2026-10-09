// Isolated offline GPU audit with real repository images and NVIDIA process
// memory. CDP layer bounds are diagnostics, not measured VRAM: their coordinate
// units can differ between headful and headless device emulation.
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const repo=path.resolve(__dirname,'..'),base='http://gpu-audit.test',build=path.resolve(process.env.BLOG_UI_BUILD||'');
assert(fs.existsSync(path.join(build,'index.html')),'Provide a fresh Hugo build');
const out=path.resolve(process.env.GPU_REPORT_DIR||path.join(repo,'local-only/gpu-optimization-2026-10-09'));fs.mkdirSync(out,{recursive:true});
const label=process.env.GPU_LABEL||'baseline',width=+(process.env.GPU_WIDTH||2560),height=+(process.env.GPU_HEIGHT||1440),dpr=+(process.env.GPU_DPR||1),runs=+(process.env.GPU_RUNS||1),warmup=+(process.env.GPU_WARMUP_MS||8000),routes=JSON.parse(process.env.GPU_ROUTES||'["/","/posts/","/posts/linux-note/","/tools/","/friends/"]');
const variants=JSON.parse(process.env.GPU_VARIANTS||'null')||[{label,build,css:process.env.GPU_OVERRIDE||''}];
const report={label,width,height,dpr,runs,warmupMs:warmup,sampleIntervalMs:1000,observationSeconds:5,interaction:process.env.GPU_INTERACTION||'idle',results:[]};
function vram(pid){
 const xml=execFileSync('nvidia-smi',['-q','-x'],{encoding:'utf8'});
 const block=[...xml.matchAll(/<process_info>([\s\S]*?)<\/process_info>/g)].map(m=>m[1]).find(block=>block.match(/<pid>(\d+)<\/pid>/)?.[1]===String(pid));
 assert(block,'GPU process must be listed by nvidia-smi');const value=block.match(/<used_memory>([\d.]+) MiB<\/used_memory>/);assert(value,'VRAM measurement unavailable');return +value[1];
}
const median=values=>{const s=[...values].sort((a,b)=>a-b);return s[Math.floor(s.length/2)];};
async function sampleMemory(cdp){const p=(await cdp.send('SystemInfo.getProcessInfo')).processInfo.find(p=>p.type==='GPU');assert(p);return {pid:p.id,MiB:vram(p.id)};}
async function measure(route,run,variant){
 const activeBuild=path.resolve(variant.build||build);
 assert(fs.existsSync(path.join(activeBuild,'index.html')),'Missing variant build');
 const browser=await chromium.launch({channel:'msedge',headless:process.env.GPU_HEADFUL!=='1',args:['--enable-gpu','--mute-audio']});
 try{
  const bcdp=await browser.newBrowserCDPSession(),info=await bcdp.send('SystemInfo.getInfo');
  assert.equal(info.gpu.featureStatus.gpu_compositing,'enabled');assert(/NVIDIA/.test(info.gpu.auxAttributes.glRenderer),'Hardware NVIDIA backend required');
  report.browser=browser.version();report.renderer=info.gpu.auxAttributes.glRenderer;report.headful=process.env.GPU_HEADFUL==='1';
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:dpr,reducedMotion:'no-preference'});
  await context.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(u.origin!==base)return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100"><rect width="160" height="100" fill="#607d8b"/></svg>'});
   if(/^\/(?:write\/|static\/)?api\//.test(u.pathname))return route.fulfill({json:{items:[],messages:[],views:83,scores:[]}});
   const root=u.pathname.startsWith('/static/')?path.join(repo,'web/static'):activeBuild;
   const file=path.resolve(root,decodeURIComponent(u.pathname.replace(/^\/static\//,'/').slice(1))+(u.pathname.endsWith('/')?'index.html':''));
   if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
   return route.fulfill({body:fs.readFileSync(file),contentType:({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'})[path.extname(file)]||'application/octet-stream'});
  });
  await context.addInitScript(()=>{if(location.protocol==='about:')return;localStorage.setItem('songline-theme','dark');sessionStorage.setItem('songline-home-boot-v21.4','1');localStorage.setItem('songline-privacy-v1',JSON.stringify({version:1,statistics:false,expires:Date.now()+86400000}));});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('about:blank');await page.waitForTimeout(500);const blank=await sampleMemory(bcdp);
  const cdp=await context.newCDPSession(page);let layers=[];cdp.on('LayerTree.layerTreeDidChange',event=>layers=event.layers||[]);await cdp.send('LayerTree.enable');
  await page.goto(base+route);await page.evaluate(()=>SonglinePageModules.ready(document));await page.waitForFunction(()=>!document.documentElement.classList.contains('is-scene-preparing'));
  await cdp.send('LayerTree.enable');
  if(variant.css)await page.addStyleTag({content:variant.css});
  await page.waitForTimeout(warmup);
  const samples=[];await page.evaluate(interaction=>{window.gpuFrames=[];let last=performance.now(),start=last;window.gpuMeasuring=true;function frame(now){if(!gpuMeasuring)return;gpuFrames.push(now-last);last=now;if(interaction==='home')document.dispatchEvent(new PointerEvent('pointermove',{clientX:innerWidth*(.5+.4*Math.sin((now-start)/700)),clientY:innerHeight*(.5+.35*Math.cos((now-start)/1100)),pointerType:'mouse',bubbles:true}));requestAnimationFrame(frame);}requestAnimationFrame(frame);},process.env.GPU_INTERACTION);
  for(let i=0;i<5;i++){await page.waitForTimeout(1000);samples.push((await sampleMemory(bcdp)).MiB);}
  const frames=await page.evaluate(()=>{gpuMeasuring=false;return gpuFrames.slice(1);});frames.sort((a,b)=>a-b);
  const details=[];
  for(const layer of layers.filter(l=>l.drawsContent)){
   let node='',reasons=[];try{reasons=(await cdp.send('LayerTree.compositingReasons',{layerId:layer.layerId})).compositingReasons;}catch{}
   if(layer.backendNodeId)try{node=(await cdp.send('DOM.describeNode',{backendNodeId:layer.backendNodeId})).node;node={name:node.nodeName,attributes:node.attributes};}catch{}
   details.push({width:layer.width,height:layer.height,node,reasons});
  }
  details.sort((a,b)=>b.width*b.height-a.width*a.height);
  const viewport=await page.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,visualWidth:visualViewport.width,visualScale:visualViewport.scale,world:document.querySelector('[data-galaxy-world]')?.getBoundingClientRect().toJSON()}));
  assert.equal(viewport.width,width,'Actual CSS viewport must match the workload');
  assert.equal(viewport.height,height,'Actual CSS viewport must match the workload');
  assert(Math.abs(viewport.dpr-dpr)<.001,'Actual DPR must match the workload');
  const data={variant:variant.label,route,run,viewport,blankMiB:blank.MiB,samplesMiB:samples,medianMiB:median(samples),minMiB:Math.min(...samples),maxMiB:Math.max(...samples),addedMedianMiB:median(samples)-blank.MiB,layers:details,layerCount:layers.length,frameCount:frames.length,frameMedianMs:median(frames),frameP95Ms:frames[Math.floor(frames.length*.95)],errors};
  if(process.env.GPU_SCREENSHOT==='1')await page.screenshot({path:path.join(out,label+'-'+route.replace(/[^a-z0-9]/gi,'-')+'-'+run+'.png'),animations:'disabled'});
  assert.deepEqual(errors,[]);console.log(JSON.stringify({...data,layers:details.slice(0,5)}));report.results.push(data);
 }finally{await browser.close();}
}
(async()=>{try{for(let run=0;run<runs;run++)for(const route of routes)for(const variant of (run%2?[...variants].reverse():variants))await measure(route,run,variant);}finally{fs.writeFileSync(path.join(out,label+'.json'),JSON.stringify(report,null,2));}})().catch(e=>{console.error(e);process.exitCode=1;});
