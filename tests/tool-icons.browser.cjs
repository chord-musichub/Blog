// Real tools HTML; all external requests are synthetic, never production writes.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const build=path.resolve(process.env.BLOG_UI_BUILD||'');
assert(fs.existsSync(path.join(build,'tools/index.html')),'Set BLOG_UI_BUILD to a fresh Hugo build');
const base='http://tool-icons.test';
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36"><rect width="36" height="36" fill="steelblue"/></svg>';
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  for(const width of [390,1440])for(const theme of ['light','dark'])for(const mode of ['primary','unavailable']){
   const context=await browser.newContext({viewport:{width,height:900},isMobile:width<981,hasTouch:width<981,reducedMotion:'reduce'});
   const requests=[],errors=[],consoleErrors=[];
   await context.addInitScript(theme=>{localStorage.setItem('songline-theme',theme);sessionStorage.setItem('songline-home-boot-v21.4','1');},theme);
   await context.route('**/*',route=>{
    const req=route.request(),url=new URL(req.url());requests.push({url:req.url(),method:req.method()});
    if(url.origin!==base){
     if(mode==='unavailable')return route.abort();
     return route.fulfill({contentType:'image/svg+xml',body:svg});
    }
    if(url.pathname.startsWith('/api/'))return route.fulfill({json:{items:[],views:0}});
    if(url.pathname.startsWith('/uploads/'))return route.fulfill({contentType:'image/svg+xml',body:svg});
    const root=path.resolve(url.pathname.startsWith('/static/')?path.join(__dirname,'../web/static'):build);
    const relative=decodeURIComponent(url.pathname.replace(/^\/static\//,'/').slice(1));
    const file=path.resolve(root,relative+(url.pathname.endsWith('/')?'index.html':''));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
    let body=fs.readFileSync(file);
    // Playwright unconditionally aborts URLs ending in /favicon.ico before
    // context.route sees them. A stable fixture-only query bypasses that rule.
    // Production markup and addresses remain unchanged.
    if(url.pathname==='/tools/')body=body.toString().replace(/((?:data-image-src|src)=["']?https:\/\/[^"'\s>]+\/favicon\.ico)/g,'$1?fixture=1');
    return route.fulfill({body,contentType:({'.html':'text/html','.css':'text/css','.js':'application/javascript','.json':'application/json','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream'});
   });
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',msg=>{if(msg.type()==='error')consoleErrors.push(msg.text());});
   async function checkIcon(icon){
    await icon.scrollIntoViewIfNeeded();
    await page.waitForFunction(()=>{const icons=[...document.querySelectorAll('.tool-card-icon > img[data-image-src]')];return icons.some(img=>img.getBoundingClientRect().top>=0&&img.getBoundingClientRect().top<innerHeight&&['ready','error'].includes(img.dataset.imageState));});
    await icon.waitFor({state:'attached'});
    const handle=await icon.elementHandle();
    try{await page.waitForFunction(({img,state})=>img.dataset.imageState===state,{img:handle,state:mode==='unavailable'?'error':'ready'},{timeout:5000});}
    catch(error){
     console.error({width,theme,mode,icon:await icon.evaluate(img=>({html:img.outerHTML,complete:img.complete,naturalWidth:img.naturalWidth})),requests:requests.filter(r=>new URL(r.url).origin!==base),errors,consoleErrors});throw error;
    }
    finally{await handle.dispose();}
    assert.deepEqual(await icon.evaluate(img=>[img.getBoundingClientRect().width,img.getBoundingClientRect().height]),[36,36]);
    const fallback=icon.locator('..').locator('.tool-icon-fallback');
    assert.equal(await fallback.isVisible(),mode==='unavailable');
    if(mode==='primary')assert.equal(await icon.getAttribute('src'),await icon.getAttribute('data-image-src'));
   }
   await page.goto(base+'/tools/');await page.evaluate(()=>SonglinePageModules.ready(document));
   const icons=page.locator('.tool-card-icon > img[data-image-src]');assert.equal(await icons.count(),27);
   await checkIcon(icons.first());
   const lastTitle=await icons.last().evaluate(img=>img.closest('.tool-card').querySelector('h2').textContent);
   await page.locator('[data-tools-search]').fill(lastTitle);await checkIcon(icons.last());
   const before=requests.filter(r=>new URL(r.url).origin!==base).length;
   await page.evaluate(()=>{for(let i=0;i<10;i++)SonglineResources.observe(document);});await page.waitForTimeout(100);
   assert.equal(requests.filter(r=>new URL(r.url).origin!==base).length,before,'Repeated observation does not request icons again');
   await page.evaluate(()=>SonglinePageTransition.navigateLink('/posts/'));
   await page.evaluate(()=>SonglinePageTransition.navigateLink('/tools/'));
   await page.evaluate(()=>SonglinePageModules.ready(document));await checkIcon(page.locator('.tool-card-icon > img[data-image-src]').first());
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
   assert.deepEqual(errors,[]);assert(!requests.some(r=>r.method!=='GET'),'No external writes');
   assert(!requests.some(r=>/(^|\.)(google|gstatic|googleusercontent)\.com$/.test(new URL(r.url).hostname)),'No requests to Google');
   console.log('PASS tools icons',width,theme,mode,'scroll/search/reentry');await context.close();
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
