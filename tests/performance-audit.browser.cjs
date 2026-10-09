// Diagnostic benchmark, not a production latency guarantee. Use the same
// browser, CPU rate and site snapshot for baseline/after comparisons.
const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const base=process.env.BLOG_TEST_URL||'http://127.0.0.1:8080';
const label=process.env.PERF_LABEL||'current';
const cpu=Number(process.env.PERF_CPU||4);
const out='local-only/performance-audit';
fs.mkdirSync(out,{recursive:true});

(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge',args:['--enable-gpu']});
 const report={label,cpu,browser:browser.version(),pages:[]};
 try {
  for(const [width,route] of [[1440,'/'],[1440,'/posts/linux-note/'],[390,'/posts/linux-note/'],[1440,'/friends/'],[390,'/friends/'],[390,'/friends/memories/'],[390,'/tools/']]) {
   const context=await browser.newContext({viewport:{width,height:900},isMobile:width<981,hasTouch:width<981});
   if(process.env.PERF_SOURCE==='1') await context.route(/\/(css|js|static)\//,async route=>{
    const url=new URL(route.request().url());
    if(url.origin!==new URL(base).origin) return route.continue();
    const file=(url.pathname.startsWith('/static/')?'web':'static')+url.pathname;
    if(!fs.existsSync(file)) return route.continue();
    await route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.css')?'text/css':'application/javascript'});
   });
   let viewRequests=0;
   await context.route('**/api/views?**',route=>{viewRequests++;return route.fulfill({json:{views:83}});});
   const page=await context.newPage();
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(()=>{
    sessionStorage.setItem('songline-home-boot-v21.4','1');
    window.perfAudit={longTasks:[],shifts:[],rects:0,navRects:0,rafCallbacks:0};
    const rect=Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect=function(){perfAudit.rects++;if(this.closest?.('[data-site-map]'))perfAudit.navRects++;return rect.call(this);};
    const raf=window.requestAnimationFrame;
    window.requestAnimationFrame=fn=>raf.call(window,t=>{perfAudit.rafCallbacks++;fn(t);});
    try{new PerformanceObserver(list=>list.getEntries().forEach(e=>perfAudit.longTasks.push(e.duration))).observe({type:'longtask',buffered:true});}catch(e){}
    try{new PerformanceObserver(list=>list.getEntries().forEach(e=>{if(!e.hadRecentInput)perfAudit.shifts.push(e.value);})).observe({type:'layout-shift',buffered:true});}catch(e){}
   });
   const cdp=await context.newCDPSession(page);
   await cdp.send('Emulation.setCPUThrottlingRate',{rate:cpu});
   await cdp.send('Performance.enable');
   const started=Date.now();
   await page.goto(base+route,{waitUntil:'load'});
   await page.waitForTimeout(2400);
   const load=await page.evaluate(()=>({longTasks:perfAudit.longTasks.length,longTaskMs:Math.round(perfAudit.longTasks.reduce((a,b)=>a+b,0)),layoutShift:perfAudit.shifts.reduce((a,b)=>a+b,0),resources:performance.getEntriesByType('resource').length,decodedKB:Math.round(performance.getEntriesByType('resource').reduce((sum,r)=>sum+r.decodedBodySize,0)/1024),scripts:performance.getEntriesByType('resource').filter(r=>r.initiatorType==='script').length}));
   const metrics=async()=>Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
   const before=await metrics();
   await page.evaluate(()=>{perfAudit.rects=0;perfAudit.navRects=0;perfAudit.rafCallbacks=0;});
   // A fixed event count exposes avoidable per-event work independent of FPS.
   await page.evaluate(()=>{
    for(let i=0;i<240;i++) document.dispatchEvent(new PointerEvent('pointermove',{clientX:innerWidth/2+(i%20),clientY:180+(i%60),bubbles:true,pointerId:1}));
   });
   await page.waitForTimeout(100);
   const pointer=await page.evaluate(()=>({rects:perfAudit.rects,navRects:perfAudit.navRects}));
   const after=await metrics();
   await page.evaluate(()=>{perfAudit.rafCallbacks=0;});
   await page.waitForTimeout(1000);
   const idleCallbacks=await page.evaluate(()=>perfAudit.rafCallbacks);
   const requestBefore=viewRequests;
   await page.evaluate(()=>{for(let i=0;i<4;i++)window.SonglineInitViews?.(document);});
   await page.waitForTimeout(120);
   const rescannedViewRequests=viewRequests-requestBefore;
   const item={route,width,loadMs:Date.now()-started,...load,pointer:{...pointer,layoutCount:after.LayoutCount-before.LayoutCount,styleCount:after.RecalcStyleCount-before.RecalcStyleCount,taskMs:Math.round((after.TaskDuration-before.TaskDuration)*1000)},idleCallbacks,rescannedViewRequests,errors};
   report.pages.push(item);console.log(JSON.stringify(item));
   assert.deepEqual(errors,[]);
   if(process.env.PERF_ASSERT==='1'){
    assert(pointer.navRects<=12,'fixed pointer burst must not remeasure navigation for every event');
    assert.equal(rescannedViewRequests,0,'rescanning loaded counters must not issue requests');
   }
   await context.close();
  }
 } finally {fs.writeFileSync(path.join(out,label+'.json'),JSON.stringify(report,null,2));await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
