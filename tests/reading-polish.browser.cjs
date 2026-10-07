// Offline regression for refresh / HUD border / shared Markdown reading design.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const build=path.resolve(process.env.BLOG_UI_BUILD||'');
assert(fs.existsSync(path.join(build,'index.html')),'Provide a fresh BLOG_UI_BUILD');
const repo=path.resolve(__dirname,'..'),base='http://reading-polish.test';
const out=path.join(repo,'local-only/reading-polish');fs.mkdirSync(out,{recursive:true});
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100"><rect width="160" height="100" fill="#607d8b"/></svg>';
const sample=['# 预览测试','## 同名章节','### 三级','#### 四级标题 <name> & 符号','##### 五级','###### 六级标题长文字'.repeat(5),'## 同名章节','```js\nconst x = 1;\n```','| A | B |\n|---|---|\n| 数据 | 数据 |',...Array.from({length:40},(_,i)=>'## 长文章 '+i+'\n\n'+('正文。'.repeat(180)))].join('\n\n');
async function fixture(browser,width=1440,theme='dark',reduced=true){
 const context=await browser.newContext({viewport:{width,height:900},isMobile:width<981,hasTouch:width<981,reducedMotion:reduced?'reduce':'no-preference'});
 const errors=[],requests=[];let gate=null,blockedPath=null,release;
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());requests.push({path:u.pathname,method:route.request().method()});
  if(u.origin!==base)return route.fulfill({body:svg,contentType:'image/svg+xml'});
  if(u.pathname==='/backend-style-test/')return route.fulfill({body:'<!doctype html><html><head></head><body></body></html>',contentType:'text/html'});
  if(u.pathname.startsWith('/api/'))return route.fulfill({json:{items:[],messages:[],views:83,scores:[]}});
  if(gate&&(blockedPath==='backgrounds'&&u.pathname.startsWith('/uploads/admin/background/')||blockedPath===u.pathname))await gate;
  const root=u.pathname.startsWith('/static/')?path.join(repo,'web/static'):build;
  const file=path.resolve(root,decodeURIComponent(u.pathname.replace(/^\/static\//,'/').slice(1))+(u.pathname.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
  const ext=path.extname(file),mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.json':'application/json'};
  if(u.pathname.startsWith('/uploads/')&&!u.pathname.startsWith('/uploads/admin/background/'))return route.fulfill({body:svg,contentType:'image/svg+xml'});
  return route.fulfill({body:fs.readFileSync(file),contentType:mime[ext]||'application/octet-stream'});
 });
 await context.addInitScript(theme=>{
  localStorage.setItem('songline-theme',theme);localStorage.setItem('songline-toc-state','expanded');
  localStorage.setItem('songline-privacy-v1',JSON.stringify({version:1,statistics:false,expires:Date.now()+86400000}));
  sessionStorage.setItem('songline-home-boot-v21.4','1');
 },theme);
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 return {context,page,errors,requests,hold(p){blockedPath=p;gate=new Promise(r=>release=r);},release(){const done=release;gate=null;blockedPath=null;done();}};
}
async function ready(page,route){
 await page.waitForFunction(route=>location.pathname===route&&!document.documentElement.classList.contains('is-scene-preparing')&&!document.documentElement.classList.contains('songline-page-transitioning'),route);
 await page.evaluate(()=>SonglinePageModules.ready(document));
 await page.locator('#songline-scene-entry-loader').waitFor({state:'detached'});
}
async function navigate(page,route){const origin=await page.evaluate(()=>performance.timeOrigin);await page.evaluate(href=>SonglinePageTransition.navigateLink(href),base+route);await ready(page,route);assert.equal(await page.evaluate(()=>performance.timeOrigin),origin);}
async function file(page,name,text,type='text/markdown'){
 await page.locator('[data-md-file]').setInputFiles({name,mimeType:type,buffer:Buffer.from(text)});
 await page.waitForFunction(name=>document.querySelector('[data-md-name]').textContent===name,name);
}
async function design(page){return page.locator('.article-reader').evaluate(e=>{const c=getComputedStyle(e);return Object.fromEntries(['fontSize','lineHeight','fontFamily','paddingLeft','paddingRight','color','backgroundImage','backgroundColor','borderRadius','backdropFilter','borderColor','boxShadow'].map(k=>[k,c[k]]));});}
async function readingGeometry(page){const result={};for(const selector of ['main.container','.article-reader','.article-toc-rail']){const box=await page.locator(selector).boundingBox();if(box)result[selector]={x:box.x,width:box.width};}return result;}
async function scene(page){await page.locator('body').evaluate(e=>Promise.all(e.getAnimations().filter(a=>a instanceof CSSTransition).map(a=>a.finished.catch(()=>{}))));return page.evaluate(()=>{const c=getComputedStyle(document.body);return Object.fromEntries(['backgroundImage','backgroundSize','backgroundRepeat','backgroundPosition','backgroundColor'].map(k=>[k,c[k]]));});}
async function whiteIcon(icon){await icon.evaluate(e=>new Promise((resolve,reject)=>{const start=performance.now();function check(){if(getComputedStyle(e).color==='rgb(255, 255, 255)')return resolve();if(performance.now()-start>1500)return reject(new Error('Header icon did not settle to white'));requestAnimationFrame(check);}check();}));}
async function bareBack(page){
 const back=page.locator('[data-back-icon]').first();await back.waitFor();
 assert.equal(await back.locator('[data-ui-icon="chevron-left"] svg path').count(),1);
 let normal;
 for(const interaction of ['normal','hover','focus']){
  if(interaction==='hover')await back.hover();if(interaction==='focus'){await page.keyboard.press('Tab');await back.focus();}
  await back.evaluate(e=>Promise.all([e,e.querySelector('.ui-icon')].flatMap(n=>n.getAnimations().filter(a=>a instanceof CSSTransition).map(a=>a.finished.catch(()=>{})))));
  const c=await back.evaluate(e=>{const s=getComputedStyle(e),b=e.getBoundingClientRect();return {background:s.backgroundColor,image:s.backgroundImage,border:s.borderTopWidth,shadow:s.boxShadow,filter:s.backdropFilter,width:b.width,height:b.height,outline:s.outlineStyle,color:s.color,x:b.x,y:b.y,glyphTransform:getComputedStyle(e.querySelector('.ui-icon')).transform};});
  assert.equal(c.background,'rgba(0, 0, 0, 0)');assert.equal(c.image,'none');assert.equal(c.border,'0px');assert.equal(c.shadow,'none');assert.equal(c.filter,'none');assert.equal(c.width,44);assert.equal(c.height,44);if(interaction==='focus')assert.equal(c.outline,'solid');
  if(interaction==='normal')normal=c;
  else{assert.equal(c.x,normal.x,'Hover cannot move the hit area');assert.equal(c.y,normal.y,'Hover cannot move the hit area');if(await page.evaluate(()=>matchMedia('(prefers-reduced-motion:reduce)').matches))assert.equal(c.glyphTransform,normal.glyphTransform);else assert.notEqual(c.glyphTransform,normal.glyphTransform,'The chevron has real hover/focus motion');}
 }
 await back.evaluate(e=>e.blur());await page.mouse.move(0,0);
 await back.evaluate(e=>Promise.all([e,e.querySelector('.ui-icon')].flatMap(n=>n.getAnimations().filter(a=>a instanceof CSSTransition).map(a=>a.finished.catch(()=>{})))));
}
async function settledScroll(page){
 await page.waitForFunction(()=>{
  const now=performance.now(),old=window.testScrollSample;
  if(!old||old.y!==scrollY){window.testScrollSample={y:scrollY,at:now};return false;}
  return now-old.at>200;
 });
 await page.evaluate(()=>delete window.testScrollSample);
}
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  for(const [width,theme] of (process.env.BLOG_UI_BACK_ONLY?[]:[[1440,'dark'],[1440,'light'],[1024,'dark'],[390,'dark'],[390,'light']])){
   const f=await fixture(browser,width,theme),p=f.page;
   await p.goto(base+'/tools/markdown-previewer/');await ready(p,'/tools/markdown-previewer/');
   const previewScene=await scene(p);assert(previewScene.backgroundImage.includes(theme==='dark'?'under-ground-black.png':'under-ground.png'));assert(!previewScene.backgroundImage.includes('ground-background.png'));assert.equal(await p.locator('.site-bg-layer').isVisible(),false);
   await bareBack(p);
   // body is the scrolling container and reserves its own scrollbar gutter;
   // html.clientWidth includes that reserved area even when overflow is clipped.
   const frame=await p.locator('main.container').boundingBox(),layoutWidth=await p.evaluate(()=>document.body.clientWidth);
   assert(Math.abs(frame.x+frame.width/2-layoutWidth/2)<1,'Preview frame is centered: '+JSON.stringify({width,layoutWidth,frame}));
   assert.equal(await p.locator('.md-tool-meta').isVisible(),false,'No empty status/helper line');
   assert(frame.width<=740&&frame.height<500,'Empty import is a compact card, not a blank reader');
   assert.equal(await p.locator('.article-shell').isVisible(),false);
   assert.equal(await p.locator('[data-md-reading-action]:not([hidden])').count(),0);
   assert.equal(await p.locator('#songline-mobile-toc-fab').count(),0,'No unused directory control before import');
   assert(await p.locator('.md-upload-copy p').isVisible(),'Visible file import guidance');
   assert.equal(await p.locator('[data-md-tool]').textContent().then(text=>text.includes('仅在本机预览')),false);
   await p.screenshot({path:path.join(out,`preview-empty-${width}-${theme}.png`)});
   // Keyboard-accessible file picker, not a label around a hidden input.
   const chooser=p.waitForEvent('filechooser');await p.locator('[data-md-choose]').focus();await p.keyboard.press('Enter');
   await (await chooser).setFiles({name:'test.md',mimeType:'text/markdown',buffer:Buffer.from(sample)});
   await p.waitForFunction(()=>document.querySelector('[data-md-name]').textContent==='test.md');
   const previewGeometry=await readingGeometry(p);
   if(width>980){const rail=await p.locator('.article-toc-rail').boundingBox(),loadedFrame=await p.locator('main.container').boundingBox();assert(rail.x>=loadedFrame.x+loadedFrame.width,'Directory is outside the main glass panel');assert(rail.x+rail.width<=width+2,'External directory remains inside the viewport');}
   await p.locator('.md-code-copy').waitFor();
   assert.equal(await p.locator('.toc-tree a').count(),47,'Every heading level including h5/h6 is included');
   assert.equal(await p.locator('.toc-tree [data-toc-level="6"]').count(),1);
   const ids=await p.locator('[data-md-preview] :is(h1,h2,h3,h4,h5,h6)').evaluateAll(es=>es.map(e=>e.id));
   assert.equal(new Set(ids).size,ids.length,'Duplicate labels have distinct anchors');
   assert(await p.locator('.toc-tree li > ul').count()>0,'Directory uses the shared nested tree');
   assert(await p.locator('.toc-tree li').evaluateAll(es=>es.every(e=>getComputedStyle(e).marginLeft==='0px')),'Tree nesting cannot inherit old flat-directory indentation');
   assert.equal(await p.locator('.toc-tree a').nth(3).textContent(),await p.locator('[data-md-preview] h4').textContent(),'Directory labels preserve the rendered heading text');
   assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'Preview cannot enlarge the viewport');
   const previewDesign=await design(p);
   await p.screenshot({path:path.join(out,`preview-loaded-${width}-${theme}.png`)});
   const shellTop=await p.locator('.article-shell').evaluate(e=>e.getBoundingClientRect().top+scrollY);
   if(width>980){
    for(const offset of [300,1300]){
     await p.evaluate(y=>scrollTo({top:y,behavior:'instant'}),shellTop+offset);
     const toc=await p.locator('.article-toc').boundingBox();assert(Math.abs(toc.y-96)<2,'Preview TOC follows the viewport');assert(toc.y+toc.height<=innerHeightForTest(900));
    }
    await p.locator('.article-toc .toc-body').evaluate(e=>e.scrollTop=300);assert(await p.locator('.article-toc .toc-body').evaluate(e=>e.scrollTop)>0);
    await p.locator('.toc-head').click();assert.equal(await p.locator('.article-shell').getAttribute('data-toc-state'),'collapsed');
    await p.locator('.toc-head').click();
    await p.locator('.toc-tree a').nth(20).click();
   }else{
    await p.locator('#songline-mobile-toc-fab').click();assert.equal(await p.locator('.mobile-toc-item').count(),47);
    await p.locator('[data-mobile-toc-search]').fill('六级');assert.equal(await p.locator('.mobile-toc-item').count(),1);
    await p.locator('.mobile-toc-item').click();assert.equal(await p.locator('#songline-mobile-toc-drawer').getAttribute('aria-hidden'),'true');
   }
   await settledScroll(p);assert(new URL(p.url()).hash,'Shared directory updates the current fragment');
   await p.screenshot({path:path.join(out,`preview-${width}-${theme}.png`)});
   await file(p,'second.md','###### 只有六级\n\n正文');assert.equal(await p.locator('.toc-tree a').count(),1);assert.equal(new URL(p.url()).hash,'','Replacing a local file clears its old fragment');
   await p.evaluate(()=>{const data=new DataTransfer();data.items.add(new File(['## 拖入文件\n\n正文'],'dropped.md',{type:'text/markdown'}));const drop=document.querySelector('[data-md-drop]');drop.dispatchEvent(new DragEvent('dragenter',{bubbles:true,dataTransfer:data}));if(!drop.classList.contains('dragging'))throw new Error('No drag feedback');drop.dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:data}));});
   await p.waitForFunction(()=>document.querySelector('[data-md-name]').textContent==='dropped.md');assert.equal(await p.locator('.toc-tree a').count(),1);assert.equal(await p.locator('.dragging').count(),0);
   await file(p,'empty.md','');assert.equal(await p.locator('.toc-tree a').count(),0);assert.equal(await p.locator('[data-md-preview]').getAttribute('aria-busy'),null);
   assert.equal(await p.locator('.article-shell').isVisible(),false);assert.equal(await p.locator('[data-md-reading-action]:not([hidden])').count(),0);assert(await p.locator('.md-upload-copy').isVisible());assert(await p.locator('[data-md-message]').textContent().then(text=>text.includes('为空')));
   assert.equal(await p.locator('#songline-mobile-toc-fab').count(),0,'Empty file clears stale mobile directory');
   await p.locator('[data-md-file]').setInputFiles({name:'image.png',mimeType:'image/png',buffer:Buffer.from('not Markdown')});
   await p.waitForFunction(()=>document.querySelector('[data-md-name]').textContent==='文件类型不支持');
   await file(p,'third.md','## 再次选择\n\n正文');assert.equal(await p.locator('.toc-tree a').count(),1);
   await navigate(p,'/posts/linux-note/');assert.deepEqual(await design(p),previewDesign,'Preview and article share the exact reading design');
   assert.equal(await p.locator('body').getAttribute('data-page-scene'),null,'Tools background marker is removed on article navigation');await bareBack(p);
   assert.deepEqual(await readingGeometry(p),previewGeometry,'Preview and article have the same main frame, reading card and external rail geometry');
   for(const route of ['/','/posts/']){
    await navigate(p,route);
    if(route==='/'){
     const icons=p.locator('.header-icons .icon-btn');assert.equal(await icons.count(),3);
     for(const icon of await icons.all()){await whiteIcon(icon);await icon.hover();await whiteIcon(icon);assert.equal(await icon.locator('svg').evaluate(e=>getComputedStyle(e).color),'rgb(255, 255, 255)');await icon.focus();await whiteIcon(icon);await icon.evaluate(e=>e.blur());}
    }
    const header=await p.locator('.modern-site-header').evaluate(e=>{const c=getComputedStyle(e);return {border:c.borderBottomWidth,filter:c.backdropFilter};});
    assert.equal(header.border,'0px','No leftover full-width white HUD border');if(width>980)assert.equal(header.filter,'none');
   }
   await navigate(p,'/tools/');assert.deepEqual(await scene(p),previewScene,'Markdown uses exactly the tools scene, in both themes');
   await navigate(p,'/tools/markdown-previewer/');await file(p,'return.md','## 返回后仍能读取');assert.equal(await p.locator('.toc-tree a').count(),1);
   assert.deepEqual(await scene(p),previewScene,'Background is restored on AJAX reentry');
   await p.locator('[data-back-icon]').click();await ready(p,'/tools/');assert.equal(new URL(p.url()).pathname,'/tools/','Bare chevron still returns to the previous page');assert.equal(await p.locator('body').getAttribute('data-page-scene'),null);
   assert.deepEqual(f.errors,[]);assert(!f.requests.some(r=>r.method==='POST'),'No uploads or production writes');
   console.log('PASS shared preview / file replacement / border / AJAX reentry',width,theme);await f.context.close();
  }
  for(const [width,theme] of [[1440,'dark'],[1440,'light'],[390,'dark'],[390,'light']]){
   const f=await fixture(browser,width,theme,false),p=f.page;
   for(const route of ['/tags/site-notice/','/friends/memories/','/friends/songline/','/tools/focus-timer/','/tools/audio-visualizer/','/tools/2048/','/tools/snake/','/tools/gacha/','/tools/random-number/','/tools/reaction-test/','/tools/flappy-bird/','/tools/typing-practice/']){
    await p.goto(base+route);await ready(p,route);await bareBack(p);
    if(route.startsWith('/tools/')){
     const panel=p.locator('[data-tool-back-surface]'),back=p.locator('[data-back-icon]');assert.equal(await panel.count(),1);assert.equal(await panel.locator(':scope > [data-back-icon]').count(),1);
     const surface=await panel.boundingBox(),button=await back.boundingBox();assert(button.x>=surface.x&&button.y>=surface.y&&button.x+button.width<=surface.x+surface.width&&button.y+button.height<=surface.y+surface.height,'Return stays inside the actual tool surface: '+route);
     const color=await back.evaluate(e=>getComputedStyle(e).color);assert.equal(color,await back.evaluate(e=>{const sample=document.createElement('span');sample.style.color=getComputedStyle(e).getPropertyValue('--back-ink');e.appendChild(sample);const color=getComputedStyle(sample).color;sample.remove();return color;}),'Return ink follows its surface');
     if(['/tools/random-number/','/tools/audio-visualizer/','/tools/focus-timer/'].includes(route))await p.screenshot({path:path.join(out,`back-${width}-${theme}-${route.split('/')[2]}.png`)});
    }
    console.log('PASS bare chevron / hit area / hover / focus',width,theme,route);
   }
   // Backend control styles are checked without logging in or uploading.
   await p.goto(base+'/backend-style-test/');
   await p.setContent(`<!doctype html><html data-admin-theme="${theme}"><head><link rel="stylesheet" href="/static/style.css"></head><body class="${theme==='dark'?'admin-dark':''}"><a class="admin-back-icon" data-admin-back href="#" aria-label="返回"><svg class="ui-line-icon" viewBox="0 0 24 24" fill="none"><path d="m15 5-7 7 7 7"/></svg></a></body></html>`,{waitUntil:'load'});
   const adminBack=p.locator('[data-admin-back]');for(const mode of ['normal','hover','focus']){if(mode==='hover')await adminBack.hover();if(mode==='focus'){await p.keyboard.press('Tab');await adminBack.focus();}await adminBack.evaluate(e=>Promise.all(e.getAnimations().filter(a=>a instanceof CSSTransition).map(a=>a.finished.catch(()=>{}))));assert.deepEqual(await adminBack.evaluate(e=>{const s=getComputedStyle(e);return [s.backgroundColor,s.borderTopWidth,s.boxShadow,s.borderRadius,e.getBoundingClientRect().width,e.getBoundingClientRect().height];}),['rgba(0, 0, 0, 0)','0px','none','0px',44,44]);}
   assert.deepEqual(f.errors,[]);assert(!f.requests.some(r=>r.method==='POST'));await f.context.close();
  }
  for(const route of (process.env.BLOG_UI_BACK_ONLY?[]:['/','/posts/'])){
   const f=await fixture(browser,1440,'dark',false),p=f.page;await p.goto(base+route);await ready(p,route);
   await p.evaluate(()=>sessionStorage.removeItem('songline-home-boot-v21.4'));
   f.hold('backgrounds');await p.reload({waitUntil:'domcontentloaded'});
   await p.waitForFunction(()=>document.documentElement.classList.contains('is-scene-preparing'));
   assert.equal(await p.locator('.site-boot-overlay').count(),0,'A refresh does not replay the home introduction');
   assert.equal(await p.locator('#songline-scene-entry-loader .songline-transition-orbit').count(),3);
   const refreshed=await p.locator('#songline-scene-entry-loader .songline-page-transition-loader').innerHTML();
   const motion=await p.locator('#songline-scene-entry-loader circle').first().evaluate(e=>getComputedStyle(e).animationName);
   assert.equal(motion,'songlineTransitionSceneOrbit');
   f.release();await ready(p,route);
   const next=route==='/'?'/posts/':'/';f.hold(next);
   await p.evaluate(href=>{window.pendingNavigation=SonglinePageTransition.navigateLink(href);},base+next);
   await p.locator('.songline-page-transition-overlay.is-loader-visible').waitFor();
   assert.equal(await p.locator('.songline-page-transition-overlay .songline-page-transition-loader').innerHTML(),refreshed,'Refresh and page switch render the same loader');
   f.release();await p.evaluate(()=>pendingNavigation);await ready(p,next);assert.deepEqual(f.errors,[]);
   console.log('PASS native refresh shares switch animation and waits for scene',route);await f.context.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
function innerHeightForTest(h){return h-20;}
