// Real built layouts, deterministic external images. Never writes view counts.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=process.env.BLOG_TEST_URL||'http://127.0.0.1:8080';
const build=process.env.BLOG_UI_BUILD;
assert(build && fs.existsSync(path.join(build,'tools/index.html')),'BLOG_UI_BUILD must point to a fresh Hugo output');
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="10" fill="steelblue"/></svg>';
const out='local-only/external-resources';fs.mkdirSync(out,{recursive:true});
// Keep this suite reproducible without the workspace's ignored source runner.
async function fixture(context,{native=false,failExternal=false}={}){
 await context.route('**/*',route=>{
  const u=new URL(route.request().url());
  if(u.origin!==new URL(base).origin)return failExternal?route.abort():route.fulfill({contentType:'image/svg+xml',body:svg});
  if(u.pathname==='/api/views')return route.fulfill({json:{views:83}});
  const root=path.resolve(u.pathname.startsWith('/static/')?path.join(__dirname,'../web/static'):build);
  const relative=u.pathname.startsWith('/static/')?u.pathname.slice('/static/'.length):u.pathname.slice(1);
  const file=path.resolve(root,relative+(u.pathname.endsWith('/')?'index.html':''));
  if(file.startsWith(root+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile()&&!u.pathname.startsWith('/uploads/')){
   let body=fs.readFileSync(file);
   // Playwright aborts exact /favicon.ico URLs before route callbacks, even
   // for card images. Only fixture HTML uses this stable query workaround.
   if(u.pathname==='/tools/')body=body.toString().replace(/((?:data-image-src|src)=["']?https:\/\/[^"'\s>]+\/favicon\.ico)/g,'$1?fixture=1');
   if(native && u.pathname==='/tools/')body=body.toString().replaceAll('data-image-src=','src=');
   const type={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream';
   return route.fulfill({body,contentType:type});
  }
  return route.fallback();
 });
}
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge',args:['--enable-gpu']});const report=[];
 try{
  for(const width of [1440,390]){
   const pairs=[];
   for(const native of [true,false]){
    const context=await browser.newContext({viewport:{width,height:900},isMobile:width<981,hasTouch:width<981});
    await fixture(context,{native});
    const page=await context.newPage();const errors=[];const requests=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(new URL(r.url()).origin!==new URL(base).origin)requests.push(r.url());});
    await page.goto(base+'/tools/',{waitUntil:'domcontentloaded'});await page.waitForTimeout(700);
    const initial=requests.length;
    const icons=page.locator('.tool-card-icon>img').filter({});
    const external=page.locator(native?'.tool-card-icon>img[src^="https://"]':'.tool-card-icon>img[data-image-src]');
    const total=await external.count();assert(total>10,'expected public external tool fixtures');
    await external.first().scrollIntoViewIfNeeded();await page.waitForTimeout(450);
    const atExternalSection=requests.length;
    const firstBox=await external.first().boundingBox();
    assert.equal(firstBox.width,36);assert.equal(firstBox.height,36);
    const lastTitle=await external.last().evaluate(img=>img.closest('.tool-card').querySelector('h2').textContent);
    await page.locator('[data-tools-search]').fill(lastTitle);await page.evaluate(()=>scrollTo(0,0));
    await external.last().scrollIntoViewIfNeeded();
    await page.waitForFunction(()=>{const cards=[...document.querySelectorAll('.tool-card')].filter(c=>c.getBoundingClientRect().width>0);return cards.length>0&&cards.every(c=>{const img=c.querySelector('img');return !img || img.naturalWidth>0;});},null,{timeout:3000});
    assert.deepEqual(errors,[]);
    await page.screenshot({path:`${out}/tools-${width}-${native?'native':'managed'}.png`});
    const item={width,mode:native?'native':'managed',totalExternalIcons:total,initialRequests:initial,nearFirstExternalRequests:atExternalSection};pairs.push(item);report.push(item);console.log(item);
    assert(await icons.count()>total);await context.close();
   }
   assert(pairs[1].initialRequests<=pairs[0].initialRequests);
   assert(pairs[1].nearFirstExternalRequests<pairs[0].nearFirstExternalRequests,'managed threshold must reduce external icon fan-out on the same layout');
  }
  const context=await browser.newContext();const page=await context.newPage();const scripts=[];const errors=[];
  await fixture(context,{failExternal:true});
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.resourceType()==='script')scripts.push(r.url());});
  await page.goto(base+'/friends/memories/',{waitUntil:'domcontentloaded'});await page.waitForTimeout(600);
  assert(!scripts.some(u=>u.includes('/friends/galaxy.js')),'memory room must not preload an unused galaxy script');
  await page.evaluate(()=>SonglinePageTransition.navigateLink('/friends/'));await page.waitForTimeout(500);
  const galaxyScripts=scripts.filter(u=>u.includes('/friends/galaxy.js'));assert.equal(galaxyScripts.length,1,'one galaxy download after arriving from another floor');
  assert(galaxyScripts[0].includes('friends=22.15'));
  await page.waitForFunction(()=>{const fallback=[...document.querySelectorAll('.friends-constellation__node img')].filter(i=>i.src.includes('user-null'));return fallback.length>0&&fallback.every(i=>i.naturalWidth>0);});
  assert.deepEqual(errors,[]);console.log('PASS slow/unavailable third parties do not block floor changes; galaxy script loaded only where needed');
  await context.close();
  const noJS=await browser.newContext({javaScriptEnabled:false});
  await fixture(noJS);
  const fallback=await noJS.newPage();await fallback.goto(base+'/tools/',{waitUntil:'domcontentloaded'});
  const fallbackIcon=fallback.locator('.tool-card-icon noscript img').first();await fallbackIcon.scrollIntoViewIfNeeded();
  assert(await fallbackIcon.isVisible());assert(!(await fallback.locator('img[data-image-src]').first().isVisible()));
  console.log('PASS no-JavaScript tool icons retain their original source');await noJS.close();
 }finally{await browser.close();fs.writeFileSync(out+'/pages.json',JSON.stringify(report,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});
