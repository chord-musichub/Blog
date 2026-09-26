const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const base=process.env.BLOG_TEST_URL||'http://127.0.0.1:8080';
const out='local-only/page-lifecycle';fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge',args:['--enable-gpu']});
 const report=[];
 try {
  for(const width of [1440,390]) {
   const context=await browser.newContext({viewport:{width,height:900},hasTouch:width<981,isMobile:width<981});
   await context.route('**/api/views?**',r=>r.fulfill({json:{views:83}}));
   const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(()=>sessionStorage.setItem('songline-home-boot-v21.4','1'));
   if(process.env.LIFECYCLE_HEAP==='1')await page.addInitScript(()=>{
    const parse=DOMParser.prototype.parseFromString;window.parsedDocuments=[];
    DOMParser.prototype.parseFromString=function(...args){const doc=parse.apply(this,args);parsedDocuments.push(new WeakRef(doc));return doc;};
   });
   await page.goto(base+'/friends/');await page.waitForTimeout(1000);
   await page.evaluate(()=>window.lifecycleDocument=performance.timeOrigin);
   const cdp=await context.newCDPSession(page);const samples=[];
   for(let cycle=0;cycle<3;cycle++) {
    for(const route of ['/posts/linux-note/','/tools/','/friends/memories/','/','/friends/']) {
     await page.evaluate(href=>window.SonglinePageTransition.navigateLink(href),base+route);
     assert.equal(new URL(page.url()).pathname,route);
     assert(await page.evaluate(()=>window.lifecycleDocument===performance.timeOrigin),'navigation must stay in the same document');
     assert.equal(await page.locator('[data-elevator-nav]').count(),1,'one navigation instance');
     const overflow=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,htmlOverflow:getComputedStyle(document.documentElement).overflowX,bodyOverflow:getComputedStyle(document.body).overflowX,offenders:[...document.querySelectorAll('body *')].map(e=>({name:e.tagName+'.'+e.className,rect:e.getBoundingClientRect()})).filter(e=>e.rect.width>0&&e.rect.right>innerWidth+2).slice(0,12).map(e=>({name:e.name,right:e.rect.right,width:e.rect.width}))}));
     if(overflow.scroll>overflow.width+2){
      overflow.maxScrollX=await page.evaluate(()=>{const y=scrollY;scrollTo({left:10000,top:y,behavior:'instant'});const x=scrollX;scrollTo({left:0,top:y,behavior:'instant'});return x;});
      await page.screenshot({path:out+'/overflow-'+width+'.png'});
     }
     assert(overflow.scroll<=overflow.width+2,`no horizontal overflow after swapping ${route}: ${JSON.stringify(overflow)}`);
     if(!route.startsWith('/posts/'))assert.equal(await page.locator('.songline-reading-float-button').count(),0,'reader portals removed on departure');
    }
    await page.waitForTimeout(1200);
    await cdp.send('HeapProfiler.collectGarbage');
    const sample=await cdp.send('Memory.getDOMCounters');samples.push(sample);console.log({width,cycle,...sample});
   }
   assert.deepEqual(errors,[]);
   if(process.env.LIFECYCLE_HEAP==='1'){
    console.log('PARSED MEDIA',JSON.stringify(await page.evaluate(()=>parsedDocuments.map(ref=>{const doc=ref.deref();return doc?{title:doc.title,media:[...doc.querySelectorAll('audio,video')].map(e=>({html:e.outerHTML,disabled:e.disableRemotePlayback}))}:null;}))));
    const chunks=[];cdp.on('HeapProfiler.addHeapSnapshotChunk',e=>chunks.push(e.chunk));
    await cdp.send('HeapProfiler.takeHeapSnapshot');fs.writeFileSync(out+`/heap-${width}.json`,chunks.join(''));
   }
   // Allow small browser/tool bookkeeping variation, but not accumulating a
   // new galaxy, timeline, article, or global listener set each cycle.
   assert(samples[2].jsEventListeners<=samples[1].jsEventListeners+15,'global/DOM listeners accumulate across cycles');
   assert(samples[2].nodes<=samples[1].nodes+120,'detached page nodes accumulate across cycles');
   assert.equal(samples[2].documents,samples[1].documents,'temporary parsed documents accumulate across cycles');
   report.push({width,samples,errors});await context.close();
  }
 } finally {fs.writeFileSync(out+'/report.json',JSON.stringify(report,null,2));await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
