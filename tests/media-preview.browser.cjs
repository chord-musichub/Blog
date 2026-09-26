// Controlled before/after: identical freshly built HTML and seed assets;
// only derived-image bytes differ. No production data or counters are written.
const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const build=process.env.BLOG_PREVIEW_BUILD;
const audit=process.env.BLOG_PREVIEW_AUDIT;
assert(build && audit,'set BLOG_PREVIEW_BUILD and BLOG_PREVIEW_AUDIT');
const base=process.env.BLOG_TEST_URL||'http://127.0.0.1:8080';
const out='local-only/media-preview';fs.mkdirSync(out,{recursive:true});
const mime=file=>({'.css':'text/css','.js':'application/javascript','.html':'text/html','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.json':'application/json'})[path.extname(file)]||'application/octet-stream';
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge',args:['--enable-gpu']});
 const report=[];
 try {
  for(const [width,route,selector] of [[390,'/friends/memories/','[data-memory-card] img'],[1440,'/friends/','.friends-constellation__node img, [data-center-avatar]'],[390,'/posts/c-note/','.article-heading__cover img'],[390,'/tools/','.tool-card-icon img[src^="/uploads/"]']]) {
   const pair=[];
   for(const preview of [false,true]) {
    const context=await browser.newContext({viewport:{width,height:900},isMobile:width<981,hasTouch:width<981});
    const counts={imageBytes:0,imageRequests:0};
    await context.route('**/*',async r=>{
     const u=new URL(r.request().url());if(u.origin!==new URL(base).origin)return r.continue();
     if(u.pathname==='/api/views')return r.fulfill({json:{views:83}});
     let file;
     if(u.pathname.startsWith('/uploads/')) {
      const size=u.searchParams.get('preview');
      const derived=path.join(audit,'generated',size==='160'?'160':'640',u.pathname);
      file=preview && ['640','160'].includes(size) && fs.existsSync(derived)?derived:path.join('static',u.pathname);
      if(!fs.existsSync(file)) file=path.join('data/media',u.pathname.slice('/uploads/'.length));
      if(fs.existsSync(file)){counts.imageBytes+=fs.statSync(file).size;counts.imageRequests++;}
     } else if(u.pathname.startsWith('/static/'))file=path.join('web',u.pathname);
     else file=path.join(build,u.pathname,u.pathname.endsWith('/')?'index.html':'');
     if(file && fs.existsSync(file) && fs.statSync(file).isFile())return r.fulfill({body:fs.readFileSync(file),contentType:mime(file)});
     return r.continue();
    });
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base+route);await page.waitForTimeout(1600);
    assert.deepEqual(errors,[]);
    const images=page.locator(selector);assert(await images.count()>0,'expected image fixtures');
    // Load the same complete set in both cases; native lazy thresholds and
    // decoder speed otherwise make a fixed-time byte comparison misleading.
    await images.evaluateAll(async nodes=>{nodes.forEach(img=>img.loading='eager');await Promise.all(nodes.map(img=>img.decode()));});
    const boxes=await images.evaluateAll(nodes=>nodes.map(img=>{const r=img.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};}));
    const broken=await images.evaluateAll(nodes=>nodes.filter(img=>img.complete && !img.naturalWidth).length);
    assert.equal(broken,0,'no broken images');
    await page.screenshot({path:`${out}/${route.split('/').filter(Boolean).join('-')}-${preview?'preview':'original'}.png`});
    pair.push({preview,...counts,boxes});
    if(preview && route.includes('memories')) {
     await page.locator('[data-memory-open]').first().evaluate(el=>el.click());
     await page.waitForFunction(()=>{const img=document.querySelector('[data-memory-lightbox-image]');return img?.complete && img.naturalWidth>0;});
     const src=await page.locator('[data-memory-lightbox-image]').getAttribute('src');
     assert(!src.includes('preview='),'lightbox keeps original-resolution image');
    }
    await context.close();
   }
   assert.equal(pair[0].boxes.length,pair[1].boxes.length);
   pair[0].boxes.forEach((box,i)=>Object.keys(box).forEach(key=>assert(Math.abs(box[key]-pair[1].boxes[i][key])<2,`unchanged image layout ${route} ${i}.${key}`)));
   assert(pair[1].imageBytes<=pair[0].imageBytes,'preview never increases image payload; small/unsupported images pass through');
   assert(pair[0].imageBytes>0,'controlled image payload must be measured');
   const item={route,width,originalBytes:pair[0].imageBytes,previewBytes:pair[1].imageBytes,savedPercent:Math.round(100*(1-pair[1].imageBytes/pair[0].imageBytes)),originalRequests:pair[0].imageRequests,previewRequests:pair[1].imageRequests};
   report.push(item);console.log(item);
  }
 } finally {fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
