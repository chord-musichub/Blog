// Isolated Hugo fixtures + browser checks. No production requests or writes.
const {chromium}=require('playwright');
const {execFileSync}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const repo=path.resolve(__dirname,'..');
const realBuild=process.env.BLOG_UI_BUILD;
assert(realBuild&&fs.existsSync(path.join(realBuild,'index.html')),'Set BLOG_UI_BUILD to a fresh Hugo build');
const out=path.join(repo,'local-only/home-notices');fs.mkdirSync(out,{recursive:true});
const fixtures=path.join(out,'fixtures');fs.mkdirSync(fixtures,{recursive:true});
const longTitle='站点更新说明：'+ '标题较长时也要保持整洁与可读。'.repeat(9);
function makeFixtures(){
 for(const count of [0,1,4,13]){
  const root=path.join(fixtures,String(count));
  fs.mkdirSync(path.join(root,'content/posts'),{recursive:true});fs.mkdirSync(path.join(root,'out'),{recursive:true});
  const write=(slug,front)=>fs.writeFileSync(path.join(root,'content/posts',slug+'.md'),'---\n'+front+'\n---\n\n测试正文。\n');
  write('ordinary','title: Ordinary article\ndate: 2026-01-01\ntags: [site-notice]\nis_notice: false');
  write('draft-notice','title: Private draft\ndate: 2026-08-01\nis_notice: true\ndraft: true');
  for(let i=1;i<=count;i++)write('notice-'+i,'title: '+JSON.stringify(i===count?longTitle:'公告 '+i)+'\ndate: 2026-07-'+String(i).padStart(2,'0')+'\nis_notice: true\nsummary: '+JSON.stringify('更新内容 '+ '长摘要应当只占两行，点击后查看完整公告。'.repeat(20)));
  fs.mkdirSync(path.join(root,'content/tags/site-notice'),{recursive:true});
  fs.writeFileSync(path.join(root,'content/tags/site-notice/_index.md'),'---\ntitle: 站点公告\nlayout: site-notice\n---\n');
  const args=['run','--pull=never','--rm','--network','none','--read-only','--tmpfs','/tmp','--user','1000:1000','--workdir','/src','--entrypoint','hugo','-e','HUGO_RESOURCEDIR=/out/resources'];
  for(const [src,dst] of [['hugo.toml','hugo.toml'],['layouts','layouts'],['assets','assets'],['assets/bootstrap','data'],['static','static']])args.push('--mount',`type=bind,src=${path.join(repo,src)},dst=/src/${dst},readonly`);
  args.push('--mount',`type=bind,src=${root}/content,dst=/src/content,readonly`,'--mount',`type=bind,src=${root}/out,dst=/out`,process.env.BLOG_HUGO_IMAGE||'blog-blog-admin:latest','--source','/src','--destination','/out/public','--minify','--noBuildLock','--cacheDir','/tmp/hugo-cache');
  execFileSync('docker',args,{stdio:'pipe',timeout:60000});
 }
}
const base='http://home-notices.test';
async function contextFor(browser,build,{width=390,height=844,theme='dark',js=true,motion='reduce'}={}){
 const context=await browser.newContext({viewport:{width,height},hasTouch:width<=980,isMobile:width<=980,reducedMotion:motion,javaScriptEnabled:js});
 await context.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.origin!==base)return route.fulfill({status:204,body:''});
  if(url.pathname.startsWith('/api/'))return route.fulfill({json:url.pathname==='/api/views'?{views:83}:{messages:[],items:[]}});
  const root=path.resolve(url.pathname.startsWith('/static/')?path.join(repo,'web/static'):build);
  const relative=decodeURIComponent(url.pathname.replace(/^\/static\//,'/').slice(1));
  const file=path.resolve(root,relative+(url.pathname.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
  return route.fulfill({body:fs.readFileSync(file),contentType:({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.json':'application/json'})[path.extname(file)]||'application/octet-stream'});
 });
 await context.addInitScript(theme=>{sessionStorage.setItem('songline-home-boot-v21.4','1');localStorage.setItem('songline-theme',theme);localStorage.setItem('songline-privacy-v1',JSON.stringify({version:1,statistics:false,expires:Date.now()+86400000}));},theme);
 return context;
}
(async()=>{
 makeFixtures();
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  for(const count of [0,1,4,13]){
   const context=await contextFor(browser,path.join(fixtures,String(count),'out/public'));
   const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base+'/');await page.evaluate(()=>SonglinePageModules.ready(document));
   assert.equal(await page.locator('[data-home-notices]').count(),1);
   assert.equal(await page.locator('[data-home-notice-latest]').count(),Math.min(1,count));
   assert.equal(await page.locator('[data-home-notice-history],.songline-notice-history,[data-home-notice-latest] p,.songline-notice-read').count(),0,'Home only shows the newest notice without excerpts or history');
   assert.equal(await page.locator('.songline-notice-empty').count(),count?0:1);
   if(count){
    assert.equal(await page.locator('[data-home-notice-latest]').getAttribute('href'),'/posts/notice-'+count+'/');
    assert.equal(await page.locator('[data-home-notice-latest] h3').textContent(),longTitle);
    const size=await page.locator('[data-home-notice-latest] h3').evaluate(e=>({h:e.offsetHeight,line:parseFloat(getComputedStyle(e).lineHeight)}));assert(size.h<=size.line*2+1);
    assert(await page.locator('[data-home-notice-latest]').evaluate(el=>el.offsetHeight<=100),'Keep even a long notice compact');
   }
   const pool=await page.locator('[data-home-recommendation-pool]').textContent();assert(!pool.includes('/notice-'),'Notices must not mix into recommendations');
   assert(!await page.locator('[data-home-notices]').textContent().then(s=>s.includes('Private draft')||s.includes('Ordinary article')));
   assert.equal(await page.locator('[data-home-notices] img').count(),0,'No extra image requests');
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.goto(base+'/tags/site-notice/');await page.evaluate(()=>SonglinePageModules.ready(document));
   assert.equal(await page.locator('[data-archive-record]').count(),count);
   assert.equal(await page.locator('[data-archive-empty="articles"]').isVisible(),count===0);
   assert.equal(await page.locator('.page-hero,.post-card,#songline-tags-style,.notice-archive__intro,.notice-archive__badge').count(),0);
   assert(!await page.locator('[data-notice-archive]').textContent().then(s=>s.includes('Private draft')||s.includes('Ordinary article')));
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   if(count)assert.equal(await page.locator('.archive-record__detail--open').first().getAttribute('href'),'/posts/notice-'+count+'/');
   if(count===13){
    await page.locator('[data-archive-search-trigger]').click();
    await page.locator('[data-archive-search-input]').fill('公告 9');
    assert.equal(await page.locator('[data-archive-record]:visible').count(),1);
    assert.equal(await page.locator('[data-archive-record]:visible .archive-record__detail--open').getAttribute('href'),'/posts/notice-9/');
    await page.locator('[data-archive-search-input]').fill('不存在的测试内容');
    assert(await page.locator('[data-archive-empty="articles"]').isVisible());
    await page.locator('[data-archive-search-clear]').click();
    assert.equal(await page.locator('[data-archive-record]:visible').count(),13);
   }
   assert.deepEqual(errors,[]);await context.close();console.log('PASS home / archive fixtures:',count);
  }
  for(const width of [360,844,1024,1440])for(const theme of ['light','dark']){
   const context=await contextFor(browser,realBuild,{width,height:width===844?390:900,theme});
   const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base+'/');await page.evaluate(()=>SonglinePageModules.ready(document));await page.waitForTimeout(400);
   const notices=page.locator('[data-home-notices]');assert.equal(await notices.count(),1);assert(await notices.isVisible());
   await notices.scrollIntoViewIfNeeded();
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.screenshot({path:path.join(out,`${width}-${theme}.png`),fullPage:true});
   const first=page.locator('[data-home-notice-latest]');const target=await first.getAttribute('href');
   await first.click();await page.waitForFunction(target=>decodeURIComponent(location.pathname)===decodeURIComponent(target),target);await page.waitForFunction(()=>!document.documentElement.classList.contains('songline-page-transitioning'));
   await page.evaluate(()=>SonglinePageTransition.navigateLink('/'));await page.waitForFunction(()=>location.pathname==='/'&&!document.documentElement.classList.contains('songline-page-transitioning'));
   assert.equal(await notices.count(),1,'Returning does not duplicate notices');
   await page.locator('[data-home-panel-goto]').click();await page.waitForFunction(()=>document.querySelector('[data-home-panel]').dataset.homePanelState==='message');
   await page.locator('[data-home-panel-return]').click();await page.waitForFunction(()=>document.querySelector('[data-home-panel]').dataset.homePanelState==='system');
   assert(await notices.isVisible());
   await page.locator('[data-home-notices] a[href="/tags/site-notice/"]').click();
   await page.waitForFunction(()=>location.pathname==='/tags/site-notice/'&&!document.documentElement.classList.contains('songline-page-transitioning'));
   assert(await page.locator('[data-notice-archive]').isVisible());
   await page.evaluate(()=>SonglinePageModules.ready(document));
   assert.equal(await page.locator('#songline-posts-list-style,#songline-posts-campus-scene-style').count(),2);
   assert.equal(await page.locator('#songline-tags-style,.page-hero,.post-card').count(),0);
   const back=page.locator('[data-notice-archive] [data-back-icon]');
   assert.equal((await back.textContent()).trim(),'');
   const backSize=await back.boundingBox();assert.equal(backSize.width,44);assert.equal(backSize.height,44);
   assert.equal(await back.locator('svg').count(),1);
   if(width<=980){
    // Dark mode intentionally makes body transparent; the root owns viewport fallback paint.
    await page.waitForFunction(expected=>getComputedStyle(document.documentElement).backgroundColor===expected,theme==='light'?'rgb(216, 235, 244)':'rgb(7, 17, 38)');
   }
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.mouse.move(0,0);await page.waitForTimeout(400);
   await page.screenshot({path:path.join(out,`archive-${width}-${theme}.png`),fullPage:true});
   const visualState=()=>{
    const select=(s,keys)=>{const css=getComputedStyle(document.querySelector(s));return keys.map(k=>css[k]);};
    return {panel:select('.content-archive',['padding','borderRadius','backgroundImage','backdropFilter']),row:select('.archive-record__index',['gridTemplateColumns','minHeight','padding']),controls:select('.content-archive__search-trigger',['fontSize','backgroundColor','borderRadius']),icons:select('.header-icons .icon-btn',['color','width','height'])};
   };
   const noticeStyle=await page.evaluate(visualState);
   const trigger=page.locator('[data-archive-trigger]').first();
   if(width>980){await trigger.hover();await page.waitForFunction(()=>document.querySelector('[data-archive-record]').classList.contains('is-open'));}
   else await trigger.click();
   assert.equal(await trigger.getAttribute('aria-expanded'),'true');
   await page.waitForFunction(()=>getComputedStyle(document.querySelector('.archive-record__detail--open')).opacity==='1');
   await page.screenshot({path:path.join(out,`archive-open-${width}-${theme}.png`),fullPage:true});
   await page.locator('.archive-record__detail--open').first().click();
   await page.waitForFunction(()=>location.pathname.startsWith('/posts/')&&!document.documentElement.classList.contains('songline-page-transitioning'));
   await page.goBack();await page.waitForFunction(()=>location.pathname==='/tags/site-notice/'&&!document.documentElement.classList.contains('songline-page-transitioning'));
   await page.locator('[data-notice-archive] [data-back-icon]').click();await page.waitForFunction(()=>location.pathname==='/'&&!document.documentElement.classList.contains('songline-page-transitioning'));
   assert.equal(await page.locator('#songline-posts-list-style').count(),0,'Archive styles removed on return home');
   await page.goto(base+'/posts/');await page.evaluate(()=>SonglinePageModules.ready(document));await page.mouse.move(0,0);await page.waitForTimeout(400);
   assert.deepEqual(await page.evaluate(visualState),noticeStyle,'Notice list and regular archive share the same panel, row, controls and top-right icon styles');
   await page.locator('[data-privacy-open]').click();
   const privacy=page.locator('#privacyPreferences');
   assert.deepEqual(await privacy.locator('[data-privacy-choice]').evaluateAll(nodes=>nodes.map(node=>node.dataset.privacyChoice)),['statistics','necessary']);
   const accept=privacy.locator('[data-privacy-choice="statistics"]'),necessary=privacy.locator('[data-privacy-choice="necessary"]');
   assert((await accept.boundingBox()).y<(await necessary.boundingBox()).y,'Statistics choice is visually above necessary-only');
   await accept.click();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('songline-privacy-v1')).statistics),true);
   await page.locator('[data-privacy-open]').click();await necessary.click();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('songline-privacy-v1')).statistics),false);
   assert.deepEqual(errors,[]);
   await context.close();console.log('PASS layout / navigation / message board:',width,theme);
  }
  const noJS=await contextFor(browser,path.join(fixtures,'4/out/public'),{js:false});const page=await noJS.newPage();await page.goto(base+'/');
  assert.equal(await page.locator('[data-home-notice-latest]').getAttribute('href'),'/posts/notice-4/');assert(await page.locator('[data-home-notice-latest]').isVisible());
  await page.goto(base+'/tags/site-notice/');assert(await page.locator('.archive-record__detail--open').first().isVisible());assert.equal(await page.locator('.archive-record__detail--open').count(),4);
  await noJS.close();console.log('PASS server-rendered without JavaScript');
  const animated=await contextFor(browser,realBuild,{motion:'no-preference'});const animatedPage=await animated.newPage();const requests=[];animatedPage.on('request',r=>requests.push(r.url()));
  await animatedPage.goto(base+'/tags/site-notice/');await animatedPage.evaluate(()=>SonglinePageModules.ready(document));await animatedPage.waitForTimeout(1500);
  assert.deepEqual(requests.filter(url=>/\/js\/space-ribbons\.js|\/(?:css|js)\/pages\/tags\//.test(url)),[],'No unused tag or background animation requests');
  await animated.close();console.log('PASS archive avoids unused modules');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
