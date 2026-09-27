// Synthetic third-party origins: no external service, credentials or site data.
const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const readSource=file=>process.env.RESOURCE_AUDIT_BASELINE
 ? require('node:child_process').execFileSync('git',['show','HEAD:'+file],{encoding:'utf8'})
 : fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const loader=readSource('web/static/resource-readiness.js');
const renderer=readSource('static/js/markdown-renderer.js');
const articleSync=readSource('static/js/article-render-sync.js');
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="steelblue"/></svg>';
const report=[];
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try {
  async function check(name,run){
   const page=await browser.newPage({viewport:{width:900,height:700}});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('https://media.test/**',r=>r.fulfill({contentType:'image/svg+xml',body:svg}));
   await page.setContent('<main></main>');
   await page.addScriptTag({content:loader});
   try{const evidence=await run(page);assert.deepEqual(errors,[]);report.push({name,passed:true,...evidence});console.log('PASS',name,evidence||'');}
   catch(e){report.push({name,passed:false,error:e.message});console.log('FAIL',name,e.message);}
   finally{await page.close();}
  }
  await check('Markdown offscreen images do not compete with the first screen',async page=>{
   let images=0;page.on('request',r=>{if(r.url().startsWith('https://media.test/article-'))images++;});
   await page.addScriptTag({content:renderer});
   await page.evaluate(()=>{document.querySelector('main').innerHTML='<div style="height:20000px"></div>'+SonglineMarkdown.render(Array.from({length:20},(_,i)=>`![picture ${i}](https://media.test/article-${i}.svg)`).join('\n\n'));});
   await page.waitForTimeout(350);const before=images;
   assert.equal(before,0,'offscreen image requests before scrolling');
   await page.locator('img').first().scrollIntoViewIfNeeded();
   await page.waitForFunction(()=>document.querySelector('img').naturalWidth>0);
   return {beforeScrollRequests:before,afterScrollRequests:images};
  });
  await check('Managed tool icons wait until near the viewport',async page=>{
   let images=0;page.on('request',r=>{if(r.url().endsWith('/deferred.svg'))images++;});
   await page.evaluate(()=>{document.querySelector('main').innerHTML='<div style="height:20000px"></div><img data-image-src="https://media.test/deferred.svg" width="120" height="80">';SonglineResources.observe(document);});
   await page.waitForTimeout(200);assert.equal(images,0);
   await page.locator('img').scrollIntoViewIfNeeded();
   await page.waitForFunction(()=>document.querySelector('img').dataset.imageState==='ready',null,{timeout:1500});
   assert.equal(images,1);return {requests:images};
  });
  await check('A failed external image recovers once on reconnect',async page=>{
   let calls=0;
   await page.route('https://media.test/retry.svg',r=>++calls===1?r.abort():r.fulfill({contentType:'image/svg+xml',body:svg}));
   await page.evaluate(()=>{document.querySelector('main').innerHTML='<img src="https://media.test/retry.svg" width="120" height="80">';return SonglineResources.image(document.querySelector('img'));});
   assert.equal(await page.locator('img').getAttribute('data-image-state'),'error');
   await page.evaluate(()=>window.dispatchEvent(new Event('online')));
   await page.waitForFunction(()=>document.querySelector('img').dataset.imageState==='ready',null,{timeout:1500});
   assert.equal(calls,2);return {requests:calls};
  });
  await check('Slow lazy background applies even after observation timeout',async page=>{
   let release;const gate=new Promise(r=>release=r);
   await page.route('https://media.test/late-bg.svg',async r=>{await gate;await r.fulfill({contentType:'image/svg+xml',body:svg});});
   await page.evaluate(()=>{
    const timer=window.setTimeout;window.setTimeout=(fn,ms,...a)=>timer(fn,ms===30000?60:ms,...a);
    document.querySelector('main').innerHTML='<section class="lazy-bg" data-bg="https://media.test/late-bg.svg" style="width:120px;height:80px"></section>';
    window.prepared=SonglineResources.prepare(document,{modules:false,timeout:10});
   });
   await page.evaluate(()=>prepared);await page.waitForTimeout(100);release();
   await page.waitForFunction(()=>document.querySelector('.lazy-bg').dataset.bgLoaded==='1',null,{timeout:1500});
  });
  await check('Source replacement cancels old readiness without duplicate decoding',async page=>{
   let release;const gate=new Promise(r=>release=r);
   await page.route('https://media.test/source-*.svg',async r=>{await gate;await r.fulfill({contentType:'image/svg+xml',body:svg});});
   await page.evaluate(()=>{
    const img=new Image();img.width=120;img.height=80;document.querySelector('main').append(img);
    window.decodeCalls=0;const decode=img.decode.bind(img);img.decode=()=>{decodeCalls++;return decode();};
    img.src='https://media.test/source-a.svg';window.a=SonglineResources.image(img);
    img.src='https://media.test/source-b.svg';window.b=SonglineResources.image(img);
   });release();
   await page.evaluate(()=>Promise.all([a,b]));
   const count=await page.evaluate(()=>decodeCalls);assert.equal(count,1,'old listeners must not decode the replacement');
   return {decodeCalls:count};
  });
  await check('Leaving a page releases unfinished image listeners',async page=>{
   let release;const gate=new Promise(r=>release=r);
   await page.route('https://media.test/depart.svg',async r=>{await gate;await r.fulfill({contentType:'image/svg+xml',body:svg});});
   await page.evaluate(()=>{
    const img=new Image();img.src='https://media.test/depart.svg';document.querySelector('main').append(img);
    window.departed=false;SonglineResources.image(img).then(()=>departed=true);
    window.dispatchEvent(new CustomEvent('songline:page-transition-start'));
    document.querySelector('main').remove();
   });
   try{await page.waitForFunction(()=>departed,null,{timeout:1000});}finally{release();}
  });
  await check('Repeated reconnect events do not create an image retry storm',async page=>{
   let calls=0;await page.route('https://media.test/unavailable.svg',r=>{calls++;return r.abort();});
   await page.evaluate(()=>{document.querySelector('main').innerHTML='<img src="https://media.test/unavailable.svg" width="120" height="80">';return SonglineResources.image(document.querySelector('img'));});
   for(let i=0;i<4;i++){await page.evaluate(()=>window.dispatchEvent(new Event('online')));await page.waitForTimeout(80);}
   assert.equal(calls,2,'one initial request and at most one reconnect retry');return {requests:calls};
  });
  await check('Article hydration reuses already loaded external images',async page=>{
   let requests=0;await page.route('https://media.test/reused.svg',r=>{requests++;return r.fulfill({headers:{'cache-control':'no-store'},contentType:'image/svg+xml',body:svg});});
   await page.addScriptTag({content:renderer});
   await page.evaluate(()=>{
    document.querySelector('main').innerHTML='<article data-article-renderer="songline-markdown"><p><img src="https://media.test/reused.svg" alt="same"></p></article><script id="article-md-source" type="application/json">"![same](https://media.test/reused.svg)"</script>';
    window.original=document.querySelector('article img');return SonglineResources.image(original);
   });
   await page.addScriptTag({content:articleSync});
   await page.waitForFunction(()=>document.querySelector('article').dataset.songlineRenderSyncBound==='1');
   assert(await page.evaluate(()=>document.querySelector('article img')===original),'loaded bitmap element must survive hydration');
   await page.waitForTimeout(100);assert.equal(requests,1);return {requests};
  });
  await check('Late image recovery also refreshes its readiness result',async page=>{
   let release;const gate=new Promise(r=>release=r);
   await page.route('https://media.test/late-result.svg',async r=>{await gate;return r.fulfill({contentType:'image/svg+xml',body:svg});});
   await page.evaluate(()=>{
    const timer=window.setTimeout;window.setTimeout=(fn,ms,...a)=>timer(fn,ms===30000?50:ms,...a);
    const img=new Image();img.src='https://media.test/late-result.svg';document.querySelector('main').append(img);window.waitImage=SonglineResources.image(img);
   });
   assert((await page.evaluate(()=>waitImage)).failed);release();
   await page.waitForFunction(()=>document.querySelector('img').dataset.imageState==='ready');
   assert.equal((await page.evaluate(()=>SonglineResources.image(document.querySelector('img')))).failed,false);
  });
  await check('An obsolete prepare cannot publish readiness after navigation',async page=>{
   let release;const gate=new Promise(r=>release=r);
   await page.route('https://media.test/obsolete.svg',async r=>{await gate;return r.fulfill({contentType:'image/svg+xml',body:svg});});
   const result=await page.evaluate(async()=>{
    document.querySelector('main').innerHTML='<img src="https://media.test/obsolete.svg" width="120" height="80">';
    let reports=0;window.addEventListener('songline:resources-ready',()=>reports++);
    const task=SonglineResources.prepare(document,{modules:false,timeout:1000});
    setTimeout(()=>{window.dispatchEvent(new Event('songline:page-transition-start'));document.querySelector('main').replaceChildren();},70);
    return {outcome:await task,reports};
   });release();assert.equal(result.outcome.cancelled,true);assert.equal(result.reports,0);
  });
  await check('Page restoration restarts a cancelled lazy background',async page=>{
   let release;const gate=new Promise(r=>release=r);
   await page.route('https://media.test/restored.svg',async r=>{await gate;return r.fulfill({contentType:'image/svg+xml',body:svg});});
   await page.evaluate(async()=>{
    document.querySelector('main').innerHTML='<section class="lazy-bg" data-bg="https://media.test/restored.svg" style="width:120px;height:80px"></section>';
    await SonglineResources.prepare(document,{modules:false,timeout:10});window.dispatchEvent(new Event('pagehide'));
   });release();await page.waitForTimeout(80);
   await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
   await page.waitForFunction(()=>document.querySelector('.lazy-bg').dataset.bgLoaded==='1',null,{timeout:1500});
  });
 }finally{await browser.close();fs.mkdirSync('local-only/external-resources',{recursive:true});fs.writeFileSync(`local-only/external-resources/${process.env.RESOURCE_AUDIT_BASELINE?'baseline':'after'}.json`,JSON.stringify(report,null,2));}
 if(!process.env.RESOURCE_AUDIT_BASELINE)assert(report.every(r=>r.passed),'external resource regression failed');
})().catch(e=>{console.error(e);process.exitCode=1;});
