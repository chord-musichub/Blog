// Offline integration: real built pages/assets, synthetic multi-page records.
// All APIs and remote media are read-only fixtures; production is never used.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const repo=path.resolve(__dirname,'..');
const build=path.resolve(process.env.BLOG_UI_BUILD||'local-only/archive-pagination/after/public');
const base='http://archive-pagination.test',out=path.join(repo,'local-only/archive-pagination');
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100"><rect width="160" height="100" fill="#607d8b"/></svg>';
async function sampleHTML(browser,articleCount=23,projectCount=27){
 const parser=await browser.newPage();
 const html=await parser.evaluate(({html,articleCount,projectCount})=>{
  const doc=new DOMParser().parseFromString(html,'text/html');
  const original=doc.querySelector('[data-archive-kind="article"]');
  if(!original)throw new Error('Build must contain an article');
  for(const [mode,kind,count] of [['articles','article',articleCount],['projects','project',projectCount]]){
   const list=doc.querySelector('[data-archive-panel="'+mode+'"] [data-archive-list]');list.replaceChildren();
   for(let i=1;i<=count;i++){
    const record=original.cloneNode(true),title=(kind==='article'?'文章样例 ':'项目样例 ')+String(i).padStart(2,'0');
    record.dataset.archiveKind=kind;record.dataset.title=title;record.dataset.summary='shared';record.dataset.searchText='';record.dataset.tags=i%2?'odd':'even';record.dataset.fixtureIndex=i;
    record.querySelector('.archive-record__title').textContent=title;
    record.querySelector('h2').textContent=title;
    record.querySelector('.archive-record__number').textContent=String(i).padStart(3,'0');
    record.querySelectorAll('[id]').forEach(node=>node.id+='-'+mode+'-'+i);
    record.querySelectorAll('[aria-controls]').forEach(node=>node.setAttribute('aria-controls',node.getAttribute('aria-controls')+'-'+mode+'-'+i));
    list.append(record);
   }
  }
  return '<!doctype html>'+doc.documentElement.outerHTML;
 },{html:fs.readFileSync(path.join(build,'posts/index.html'),'utf8'),articleCount,projectCount});
 await parser.close();return html;
}
async function fixture(browser,html,width,theme,motion='reduce'){
 const context=await browser.newContext({viewport:{width,height:900},hasTouch:width<981,isMobile:width<981,reducedMotion:motion});
 const errors=[],writes=[];
 await context.route('**/*',route=>{
  const u=new URL(route.request().url());
  if(route.request().method()!=='GET')writes.push(route.request().method()+' '+u.pathname);
  if(u.origin!==base||u.pathname.startsWith('/uploads/'))return route.fulfill({body:svg,contentType:'image/svg+xml'});
  if(u.pathname.includes('/api/'))return route.fulfill({json:{views:83,items:[],messages:[],scores:[]}});
  if(u.pathname==='/posts/')return route.fulfill({body:html,contentType:'text/html'});
  const root=u.pathname.startsWith('/static/')?path.join(repo,'web/static'):build;
  const file=path.resolve(root,decodeURIComponent(u.pathname.replace(/^\/static\//,'/').slice(1))+(u.pathname.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
  return route.fulfill({body:fs.readFileSync(file),contentType:({'.html':'text/html','.css':'text/css','.js':'application/javascript','.json':'application/json','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream'});
 });
 await context.addInitScript(theme=>{
  localStorage.setItem('songline-theme',theme);sessionStorage.setItem('songline-home-boot-v21.4','1');
  localStorage.setItem('songline-privacy-v1',JSON.stringify({version:1,statistics:false,expires:Date.now()+86400000}));
 },theme);
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 return {context,page,errors,writes};
}
async function ready(page){
 await page.waitForFunction(()=>window.SonglinePageModules&&!document.documentElement.classList.contains('songline-page-transitioning')&&!document.documentElement.classList.contains('is-scene-preparing'));
 await page.evaluate(()=>SonglinePageModules.ready(document));
}
const pager=(page,mode)=>page.locator('[data-archive-pagination="'+mode+'"]');
async function indices(page,mode){return page.locator('[data-archive-panel="'+mode+'"] [data-archive-record]:not([hidden])').evaluateAll(nodes=>nodes.map(n=>Number(n.dataset.fixtureIndex)));}
async function state(page){return page.evaluate(()=>({history:history.state,url:location.href,overflow:document.documentElement.scrollWidth>innerWidth+2}));}
const range=(first,last)=>Array.from({length:last-first+1},(_,i)=>first+i);
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'}),report=[];
 try{
  const html=await sampleHTML(browser);
  const cases=[...([320,390,1440].flatMap(width=>['dark','light'].map(theme=>[width,theme,'reduce']))),[390,'dark','no-preference'],[1440,'dark','no-preference']];
  for(const [width,theme,motion] of cases){
   const {context,page,errors,writes}=await fixture(browser,html,width,theme,motion);
   await page.goto(base+'/posts/?search=1&article_page=2&project_page=3&mode=projects&keep=yes');await ready(page);
   assert(await page.locator('#archiveProjects').isVisible());
   assert.deepEqual(await indices(page,'articles'),range(11,20));assert.deepEqual(await indices(page,'projects'),range(21,27));
   assert(await pager(page,'projects').locator('[data-archive-page-step="1"]').isDisabled());
   const initial=await state(page),epoch=await page.evaluate(()=>performance.timeOrigin);
   await page.evaluate(()=>{window.paginationFirstRecord=document.querySelector('[data-archive-record]');});
   await pager(page,'projects').locator('[data-archive-page="2"]').focus();await page.keyboard.press('Enter');
   assert.deepEqual(await indices(page,'projects'),range(11,20));
   assert.equal(await page.evaluate(()=>document.activeElement.dataset.archivePage),'2','Keyboard focus survives page-number replacement');
   assert(await page.evaluate(()=>paginationFirstRecord===document.querySelector('[data-archive-record]')),'Paging preserves record DOM');
   await page.locator('[data-archive-mode="articles"]').click();
   assert.deepEqual(await indices(page,'articles'),range(11,20));
   await pager(page,'articles').locator('[data-archive-page-step="1"]').click();
   assert.deepEqual(await indices(page,'articles'),range(21,23));
   assert(await pager(page,'articles').locator('[data-archive-page-step="1"]').isDisabled());
   const record=page.locator('#archiveArticles [data-archive-record]:not([hidden])').first();
   await record.locator('[data-archive-trigger]').click();
   assert(await record.evaluate(n=>n.classList.contains('is-pinned')));
   // Click a real detail link, then Back: no document refresh, same page slice.
   await record.locator('.archive-record__detail').click();await ready(page);
   assert.notEqual(new URL(page.url()).pathname,'/posts/');
   await page.goBack();await ready(page);assert.equal(new URL(page.url()).pathname,'/posts/');
   assert.deepEqual(await indices(page,'articles'),range(21,23));
   assert.equal(await page.evaluate(()=>performance.timeOrigin),epoch);
   await page.locator('[data-archive-mode="projects"]').click();assert.deepEqual(await indices(page,'projects'),range(11,20));
   await page.reload();await ready(page);assert(await page.locator('#archiveProjects').isVisible());assert.deepEqual(await indices(page,'projects'),range(11,20));
   // Search runs across every record, not just the visible page; one URL commit.
   const commits=await page.locator('[data-archive-search-input]').evaluate(input=>{
    const replace=history.replaceState.bind(history);let count=0;history.replaceState=(...args)=>{count++;return replace(...args);};
    input.value='shared';input.dispatchEvent(new InputEvent('input',{bubbles:true}));
    return Promise.resolve().then(()=>{history.replaceState=replace;return count;});
   });assert.equal(commits,1);
   assert.deepEqual(await indices(page,'projects'),range(1,10));assert.deepEqual(await indices(page,'articles'),range(1,10));
   assert.equal(new URL(page.url()).searchParams.get('project_page'),null);assert.equal(new URL(page.url()).searchParams.get('article_page'),null);
   await page.locator('[data-archive-mode="articles"]').click();
   assert.equal(await page.locator('[data-archive-project-hint]').textContent(),'项目 / 27 →','Hint reports all matches');
   assert((await page.locator('[data-archive-status]').textContent()).includes('23 / 23'),'Status reports all matches');
   await pager(page,'articles').locator('[data-archive-page="2"]').click();
   assert.deepEqual(await indices(page,'articles'),range(11,20));
   assert.equal(await page.locator('.archive-record[hidden].is-open,.archive-record.is-pinned').count(),0,'Leaving a page closes its old drawer; a new desktop hover may open another');
   await page.locator('[data-archive-search-input]').fill('23');
   assert.deepEqual(await indices(page,'articles'),[23]);assert(!(await pager(page,'articles').isVisible()));
   await page.locator('[data-archive-search-input]').fill('not-found-xyz');
   assert.deepEqual(await indices(page,'articles'),[]);assert(await page.locator('[data-archive-empty="articles"]').isVisible());
   assert(!(await pager(page,'articles').isVisible()));
   await page.locator('[data-archive-search-clear]').click();assert.deepEqual(await indices(page,'articles'),range(1,10));
   const current=await state(page);assert.equal(new URL(current.url).searchParams.get('keep'),'yes');assert.equal(current.overflow,false);
   assert.equal(current.history.songlineCanGoBack,initial.history.songlineCanGoBack,'Paging does not manufacture Back entries');
   await pager(page,'articles').locator('[data-archive-page="2"]').click();
   await pager(page,'articles').scrollIntoViewIfNeeded();
   await page.screenshot({path:path.join(out,'paging-'+width+'-'+theme+'-'+motion+'.png')});
   // Legacy exact-tag filter, invalid/deep page inputs, IME and reinitialization.
   await page.goto(base+'/posts/?search=1&tag=even&article_page=999');await ready(page);
   assert.deepEqual(await indices(page,'articles'),[22]);assert.equal(new URL(page.url()).searchParams.get('article_page'),'2');
   await page.locator('[data-archive-search-clear]').click();assert.deepEqual(await indices(page,'articles'),range(1,10));
   await page.goto(base+'/posts/?search=1&article_page=-2&project_page=Infinity');await ready(page);
   assert.deepEqual(await indices(page,'articles'),range(1,10));assert.equal(new URL(page.url()).searchParams.get('article_page'),null);
   await pager(page,'articles').locator('[data-archive-page="2"]').click();
   await page.locator('[data-archive-search-input]').evaluate(input=>{
    input.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));input.value='odd';
    input.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true}));
   });assert.deepEqual(await indices(page,'articles'),range(11,20));
   await page.locator('[data-archive-search-input]').evaluate(input=>input.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true})));
   assert.deepEqual(await indices(page,'articles'),[1,3,5,7,9,11,13,15,17,19]);
   await page.locator('[data-archive-search-clear]').click();
   await page.evaluate(()=>{SonglineInitContentArchive(document);SonglineInitContentArchive(document);});
   await pager(page,'articles').locator('[data-archive-page-step="1"]').click();
   assert.equal(new URL(page.url()).searchParams.get('article_page'),'2','Repeated init binds one pager');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true);
   assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
   report.push({width,theme,motion,passed:true});await context.close();
   console.log('PASS paging / filters / focus / history / reload / IME / layout',width,theme,motion);
  }
  const large=await fixture(browser,await sampleHTML(browser,200,200),320,'dark');
  await large.page.goto(base+'/posts/?article_page=10');await ready(large.page);
  assert.deepEqual(await indices(large.page,'articles'),range(91,100));
  assert.equal(await pager(large.page,'articles').locator('[data-archive-page]').count(),5,'Many pages keep a bounded pager');
  await pager(large.page,'articles').scrollIntoViewIfNeeded();
  assert.equal(await large.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true,'Many pages do not overflow a narrow phone');
  const rows=await pager(large.page,'articles').locator('[data-archive-page]').evaluateAll(nodes=>nodes.map(node=>Math.round(node.getBoundingClientRect().top)));
  assert.equal(new Set(rows).size,1,'Compact mobile page numbers stay on one row');
  await large.page.screenshot({path:path.join(out,'many-pages-320.png')});
  assert.deepEqual(large.errors,[]);assert.deepEqual(large.writes,[]);await large.context.close();
  console.log('PASS 20-page compact mobile layout');
  // A fresh no-JS visit still exposes all content, not a trapped first slice.
  const context=await browser.newContext({javaScriptEnabled:false});
  await context.route('**/*',route=>route.fulfill({body:html,contentType:'text/html'}));
  const page=await context.newPage();await page.goto(base+'/posts/');
  assert.equal(await page.locator('#archiveArticles [data-archive-record]:not([hidden])').count(),23);
  assert.equal(await page.locator('[data-archive-pagination]:not([hidden])').count(),0);
  await context.close();console.log('PASS no-JavaScript full-list fallback');
 }finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
