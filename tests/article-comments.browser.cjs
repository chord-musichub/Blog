// Real local Hugo build, isolated third-party widget. No GitHub writes/OAuth.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const repo=path.resolve(__dirname,'..'),build=path.resolve(process.env.BLOG_UI_BUILD||'local-only/article-comments/after/public');
const out=path.join(repo,'local-only/article-comments'),base='http://article-comments.test';
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100"><rect width="160" height="100" fill="#607d8b"/></svg>';
const widget=`<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;font:16px sans-serif;color:#e4edf7;background:transparent}body.light{color:#263b50}button{border-radius:8px;padding:12px;background:transparent;border:1px solid #889;color:inherit}section{padding:16px;border:1px solid #889;border-radius:12px}</style></head><body><section><h3>GitHub 留言 · 测试示例</h3><p>交流文章相关的问题与想法</p><button>使用 GitHub 登录</button></section><script>
window.widgetMessages=[];const params=new URLSearchParams(location.search),parentOrigin=new URL(params.get('origin')).origin;
document.body.classList.toggle('light',params.get('theme')==='light');
window.send=data=>parent.postMessage({giscus:data},parentOrigin);
addEventListener('message',e=>{if(e.source!==parent||e.origin!==parentOrigin||!e.data.giscus)return;widgetMessages.push(e.data.giscus);document.body.classList.toggle('light',e.data.giscus.setConfig?.theme==='light');});
if(params.get('session')==='expired')send({error:'Bad credentials'});else {send({error:'Discussion not found'});send({resizeHeight:220});}
</script></body></html>`;
async function fixture(browser,width,theme,{blocked=false,silent=false,disabled=false,live=false,noJS=false}={}){
 // Deliberately oppose the site's theme: matching OS/site preferences missed
 // opaque cross-origin iframe canvases in the original regression matrix.
 const context=await browser.newContext({viewport:{width,height:900},colorScheme:theme==='light'?'dark':'light',hasTouch:width<981,isMobile:width<981,reducedMotion:'reduce',javaScriptEnabled:!noJS});
 const errors=[],requests=[],writes=[];
 await context.addInitScript(({theme,blocked})=>{
  localStorage.setItem('songline-theme',theme);sessionStorage.setItem('songline-home-boot-v21.4','1');
  localStorage.setItem('songline-privacy-v1',JSON.stringify({version:1,statistics:false,expires:Date.now()+86400000}));
  window.commentListeners=new Set();const add=window.addEventListener.bind(window),remove=window.removeEventListener.bind(window);
  window.addEventListener=(t,f,...rest)=>{if(t==='message')commentListeners.add(f);return add(t,f,...rest);};
  window.removeEventListener=(t,f,...rest)=>{if(t==='message')commentListeners.delete(f);return remove(t,f,...rest);};
  if(blocked){for(const name of ['getItem','setItem','removeItem']){const original=Storage.prototype[name];Storage.prototype[name]=function(key,...rest){if(key==='giscus-session')throw Error('Storage disabled');return original.call(this,key,...rest);};}}
 },{theme,blocked});
 await context.route('**/*',async route=>{
  const request=route.request(),u=new URL(request.url());
  if(request.method()!=='GET')writes.push(request.method()+' '+u.origin+u.pathname);
  if(u.origin==='https://giscus.app'){
   if(u.pathname.endsWith('/widget'))requests.push(u);
   if(live)return request.method()==='GET'?route.continue():route.abort();
   return route.fulfill({contentType:'text/html',body:silent?'<!doctype html><html><body></body></html>':widget});
  }
  if(u.origin!==base||u.pathname.startsWith('/uploads/'))return route.fulfill({body:svg,contentType:'image/svg+xml'});
  if(u.pathname.includes('/api/'))return route.fulfill({json:{views:83,items:[],messages:[],scores:[]}});
  const root=u.pathname.startsWith('/static/')?path.join(repo,'web/static'):build;
  const file=path.resolve(root,decodeURIComponent(u.pathname.replace(/^\/static\//,'/').slice(1))+(u.pathname.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
  let body=fs.readFileSync(file);
  if(disabled&&file.endsWith('.html'))body=body.toString().replace(/<section class="card article-comments"[\s\S]*?<\/section>/,'').replace(/<link[^>]*id=songline-article-comments-style[^>]*>/,'');
  return route.fulfill({body,contentType:({'.html':'text/html','.css':'text/css','.js':'application/javascript','.json':'application/json','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream'});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 return {context,page,errors,requests,writes};
}
async function ready(page){
 await page.waitForFunction(()=>window.SonglinePageModules&&!document.documentElement.classList.contains('songline-page-transitioning')&&!document.documentElement.classList.contains('is-scene-preparing'));
 await page.evaluate(()=>SonglinePageModules.ready(document));
}
async function commentsReady(page){await page.waitForFunction(()=>document.querySelector('[data-article-comments]')?.dataset.state==='ready');}
async function navigate(page,url){await page.evaluate(url=>SonglinePageTransition.navigateLink(url),url);await ready(page);}
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'}),report=[];
 try{
  for(const width of (process.env.COMMENTS_TEST_WIDTHS||'320,390,1440').split(',').map(Number))for(const theme of ['dark','light']){
   const f=await fixture(browser,width,theme),{page}=f;
   await page.goto(base+'/posts/c-note/');await ready(page);
   assert.equal(f.requests.length,0,'Reading first screen must not contact giscus');
   const firstTerm=await page.locator('[data-article-comments]').getAttribute('data-term');
   assert.equal(firstTerm,'songline:article:2588cc774d5795c2');
   await page.locator('[data-article-comments]').scrollIntoViewIfNeeded();await commentsReady(page);
   assert.equal(f.requests.length,1);assert.equal(f.requests[0].searchParams.get('term'),firstTerm);
   assert.equal(await page.locator('iframe.giscus-frame').evaluate(el=>getComputedStyle(el).colorScheme),'light dark','Transparent widget supports both browser color schemes');
   assert.equal(await page.evaluate(()=>commentListeners.size),1);
   await page.evaluate(()=>{SonglineInitArticleComments(document);SonglineInitArticleComments(document);});
   assert.equal(f.requests.length,1);assert.equal(await page.locator('iframe.giscus-frame').count(),1);
   if(width===320&&theme==='dark'){
    await page.evaluate(()=>window.cachedCommentFrame=document.querySelector('iframe.giscus-frame'));
    const beforeCacheRequests=f.requests.length;
    await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
    assert.equal(await page.evaluate(()=>commentListeners.size),1);assert.equal(await page.locator('iframe.giscus-frame').count(),1);
    await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));await ready(page);await commentsReady(page);
    assert.equal(await page.evaluate(()=>commentListeners.size),1);assert.equal(await page.locator('iframe.giscus-frame').count(),1);
    assert.equal(await page.evaluate(()=>cachedCommentFrame===document.querySelector('iframe.giscus-frame')),true,'BFCache preserves the widget instead of fetching another iframe');
    assert.equal(f.requests.length,beforeCacheRequests);await page.evaluate(()=>delete window.cachedCommentFrame);
   }
   const geometry=await page.locator('[data-article-comments]').evaluate(node=>({left:node.getBoundingClientRect().left,right:node.getBoundingClientRect().right,width:Math.min(document.documentElement.clientWidth,document.body.clientWidth),overflow:document.documentElement.scrollWidth>innerWidth+2}));
   assert.equal(geometry.overflow,false);assert(Math.abs((geometry.left+geometry.right)/2-geometry.width/2)<2,'Comments stay centered: '+JSON.stringify(geometry));
   await page.screenshot({path:path.join(out,'comments-'+width+'-'+theme+'.png')});
   await page.evaluate(()=>document.documentElement.setAttribute('data-theme',document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark'));
   const giscus=page.frames().find(frame=>frame.url().startsWith('https://giscus.app'));
   await giscus.waitForFunction(()=>widgetMessages.some(m=>m.setConfig?.theme===(new URLSearchParams(location.search).get('theme')==='light'?'transparent_dark':'light')));
   const epoch=await page.evaluate(()=>performance.timeOrigin);
   await page.locator('.article-explore__step').first().click();await ready(page);
   const nextTerm=await page.locator('[data-article-comments]').getAttribute('data-term');assert.notEqual(nextTerm,firstTerm);
   assert.equal(await page.evaluate(()=>commentListeners.size),1,'Switching articles releases old listener');
   await page.locator('[data-article-comments]').scrollIntoViewIfNeeded();await commentsReady(page);
   assert.equal(f.requests.at(-1).searchParams.get('term'),nextTerm);
   await page.goBack();await ready(page);await commentsReady(page);
   assert.equal(await page.locator('[data-article-comments]').getAttribute('data-term'),firstTerm);assert.equal(await page.evaluate(()=>performance.timeOrigin),epoch);
   await navigate(page,'/tools/markdown-previewer/');assert.equal(await page.locator('[data-article-comments]').count(),0);assert.equal(await page.evaluate(()=>commentListeners.size),0);
   assert.equal(await page.locator('#songline-article-comments-style').count(),0);
   const count=f.requests.length;await navigate(page,'/posts/');assert.equal(f.requests.length,count);
   await navigate(page,'/');assert.equal(f.requests.length,count);assert.equal(await page.locator('[data-home-message-board]').count(),1,'Home message board remains separate');
   assert.deepEqual(f.errors,[]);assert.deepEqual(f.writes,[]);
   report.push({width,theme,passed:true});await f.context.close();console.log('PASS lazy/term/theme/history/cleanup/layout',width,theme);
  }
  for(const blocked of [false,true]){
   const f=await fixture(browser,390,'dark',{blocked});await f.page.goto(base+'/posts/c-note/?keep=1&giscus=fake-session#article-comments');await ready(f.page);await commentsReady(f.page);
   assert.equal(new URL(f.page.url()).searchParams.has('giscus'),false);assert.equal(new URL(f.page.url()).searchParams.get('keep'),'1');assert.equal(new URL(f.page.url()).hash,'#article-comments');
   assert.equal(f.requests[0].searchParams.get('session'),'fake-session');
   assert.equal(await f.page.evaluate(()=>history.state.songlineTransition),true);
   await navigate(f.page,'/posts/note-1/#article-comments');await commentsReady(f.page);assert.equal(f.requests.at(-1).searchParams.get('session'),'fake-session');
   const frame=f.page.frames().find(frame=>frame.url().startsWith('https://giscus.app'));await frame.evaluate(()=>send({signOut:true}));
   await f.page.waitForFunction(()=>document.querySelector('iframe.giscus-frame')&&new URL(document.querySelector('iframe.giscus-frame').src).searchParams.get('session')==='');await commentsReady(f.page);
   assert.deepEqual(f.errors,[]);assert.deepEqual(f.writes,[]);await f.context.close();console.log('PASS OAuth callback/session/sign-out, storage blocked:',blocked);
  }
  const expired=await fixture(browser,390,'dark');await expired.page.goto(base+'/posts/c-note/?giscus=expired#article-comments');await ready(expired.page);await commentsReady(expired.page);
  assert.equal(expired.requests.length,2);assert.equal(expired.requests.at(-1).searchParams.get('session'),'');assert.deepEqual(expired.errors,[]);await expired.context.close();
  const silent=await fixture(browser,390,'dark',{silent:true});await silent.page.goto(base+'/posts/c-note/#article-comments');await ready(silent.page);
  assert.equal(await silent.page.locator('.article-reader').isVisible(),true,'Third-party wait does not block reader');
  await silent.page.waitForFunction(()=>document.querySelector('[data-article-comments]')?.dataset.state==='error',{},{timeout:25000});
  assert.equal(await silent.page.locator('iframe.giscus-frame').count(),0);assert.equal(await silent.page.locator('[data-comments-load]').textContent(),'重试');
  await silent.page.locator('[data-comments-load]').click();assert.equal(await silent.page.locator('iframe.giscus-frame').count(),1);
  await navigate(silent.page,'/posts/');assert.equal(await silent.page.evaluate(()=>commentListeners.size),0);assert.deepEqual(silent.errors,[]);await silent.context.close();
  const disabled=await fixture(browser,390,'dark',{disabled:true});await disabled.page.goto(base+'/posts/c-note/');await ready(disabled.page);await disabled.page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
  assert.equal(disabled.requests.length,0);assert.equal(await disabled.page.evaluate(()=>typeof SonglineInitArticleComments),'undefined');await disabled.context.close();
  const noJS=await fixture(browser,390,'dark',{noJS:true});await noJS.page.goto(base+'/posts/c-note/');
  assert.equal(noJS.requests.length,0);assert.equal(await noJS.page.locator('[data-comments-load]').isVisible(),false);
  assert.equal(await noJS.page.locator('.article-comments noscript p').isVisible(),true);assert.equal(await noJS.page.locator('.article-comments a').getAttribute('href'),'https://github.com/chord-musichub/Blog-comments/discussions');await noJS.context.close();
  if(process.env.RUN_GISCUS_LIVE==='1'){
   for(const theme of ['dark','light']){
   const live=await fixture(browser,390,theme,{live:true});await live.page.goto(base+'/posts/c-note/#article-comments');await ready(live.page);await live.page.locator('[data-article-comments]').scrollIntoViewIfNeeded();await commentsReady(live.page);
   const frame=live.page.frames().find(frame=>frame.url().startsWith('https://giscus.app'));
   await frame.waitForFunction(()=>document.body.innerText.includes('GitHub'),{},{timeout:20000}).catch(async error=>{console.error('Live widget text:',await frame.locator('body').innerText());throw error;});
   assert((await frame.locator('body').innerText()).includes('GitHub'));
   assert.equal(await live.page.locator('iframe.giscus-frame').evaluate(el=>getComputedStyle(el).colorScheme),'light dark');
   assert((await frame.locator('#giscus-theme').getAttribute('href')).endsWith('/'+(theme==='dark'?'transparent_dark':'light')+'.css'));
   const panel=live.page.locator('[data-article-comments]'),iframe=live.page.locator('iframe.giscus-frame');
   const panelBox=await panel.boundingBox(),frameBox=await iframe.boundingBox();
   const screenshot=await panel.screenshot({path:path.join(out,'live-comments-390-'+theme+'.png')});
   // Compare the empty corner of the actual third-party canvas to its adjacent
   // glass panel. Computed backgroundColor alone stays transparent even when
   // Chromium paints an opaque black/white cross-origin canvas underneath.
   const png=require('pngjs').PNG.sync.read(screenshot);
   const x=Math.floor(frameBox.x-panelBox.x),y=Math.floor(frameBox.y-panelBox.y)+2;
   const at=(x,y)=>[...png.data.subarray((y*png.width+x)*4,(y*png.width+x)*4+3)];
   const canvas=at(x+2,y),glass=at(x-4,y);
   assert(canvas.every((v,i)=>Math.abs(v-glass[i])<40),'Widget canvas must show the glass panel: '+JSON.stringify({theme,canvas,glass}));
   // Theme changes must update the existing widget without reloading it.
   const target=theme==='light'?'dark':'light';
   await live.page.evaluate(theme=>document.documentElement.setAttribute('data-theme',theme),target);
   await frame.waitForFunction(target=>document.querySelector('#giscus-theme')?.href.endsWith('/'+(target==='dark'?'transparent_dark':'light')+'.css'),target);
   assert.equal(live.requests.length,1);assert.deepEqual(live.errors,[]);assert.deepEqual(live.writes,[]);
   console.log('PASS live public giscus rendering/theme switch, opposite browser preference:',theme);await live.context.close();
   }
  }
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({cases:report,oauth:true,storageDenied:true,expiredSession:true,timeout:true,disabled:true,noJavaScript:true,bfcacheLifecycle:true,liveReadOnly:process.env.RUN_GISCUS_LIVE==='1'},null,2));
  console.log('PASS error/retry/expired session/disabled. No external writes.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
