// Offline actual-tool regression. All scores, images and writes are fixtures.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const repo=path.resolve(__dirname,'..'),base='http://tool-reuse.test';
const builds={before:path.resolve(process.env.BLOG_UI_BASELINE||''),after:path.resolve(process.env.BLOG_UI_BUILD||'')};
for(const build of Object.values(builds))assert(fs.existsSync(path.join(build,'index.html')),'Provide both Hugo builds');
const out=path.join(repo,'local-only/cleanup-batch-2-2026-10-09');fs.mkdirSync(out,{recursive:true});const results=[];
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100"><rect width="160" height="100" fill="#607d8b"/></svg>';
async function fixture(browser,mode,width=1440,theme='dark',behavior='normal'){
 const context=await browser.newContext({viewport:{width,height:1000},isMobile:width<981,hasTouch:width<981,reducedMotion:'reduce'}),scoreRequests=[];
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(u.origin!==base||u.pathname.startsWith('/uploads/'))return route.fulfill({body:svg,contentType:'image/svg+xml'});
  if(u.pathname.includes('/api/')||u.pathname.startsWith('/api/')){
   if(u.pathname.endsWith('/reaction-scores')){
    const entry={url:u.pathname,method:route.request().method(),route};scoreRequests.push(entry);
    if(behavior==='pending'||entry.method==='POST'&&behavior==='sync')return;
    if(behavior==='sync'&&u.pathname.startsWith('/write/'))return route.fulfill({status:404,body:''});
   }
   return route.fulfill({json:{items:[],messages:[],views:83,scores:[{score:180}]}});
  }
  const root=u.pathname.startsWith('/static/')?path.join(repo,'web/static'):builds[mode];
  const file=path.resolve(root,decodeURIComponent(u.pathname.replace(/^\/static\//,'/').slice(1))+(u.pathname.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
  return route.fulfill({body:fs.readFileSync(file),contentType:({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json'})[path.extname(file)]||'application/octet-stream'});
 });
 await context.addInitScript(theme=>{
  localStorage.setItem('songline-theme',theme);sessionStorage.setItem('songline-home-boot-v21.4','1');localStorage.setItem('songline-privacy-v1',JSON.stringify({version:1,statistics:false,expires:Date.now()+86400000}));
  localStorage.setItem('songline-reaction-sound-enabled-v1','0');localStorage.setItem('songline-reaction-best-v1','180');
  window.toolAudit={cacheWrites:0};const set=Storage.prototype.setItem;Storage.prototype.setItem=function(key,...args){if(key==='songline-reaction-server-top3-cache')toolAudit.cacheWrites++;return set.call(this,key,...args);};
 },theme);
 const page=await context.newPage(),errors=[],failed=[];page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>{if(r.url().endsWith('/reaction-scores'))failed.push(r.url());});
 async function ready(route){await page.goto(base+route);await page.evaluate(()=>SonglinePageModules.ready(document));await page.waitForTimeout(80);}
 async function waitRequests(n){for(let i=0;i<100&&scoreRequests.length<n;i++)await page.waitForTimeout(20);assert.equal(scoreRequests.length,n);}
 return {context,page,errors,failed,scoreRequests,ready,waitRequests};
}
async function gacha(browser){
 for(const [width,theme] of [[1440,'dark'],[1440,'light'],[390,'dark'],[390,'light']]){
  const pair={kind:'gacha',width,theme};
  for(const mode of ['before','after']){
   const f=await fixture(browser,mode,width,theme);await f.ready('/tools/gacha/');
   await f.page.evaluate(()=>{let seed=42;Math.random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);});
   for(let i=0;i<8;i++)await f.page.locator('[data-gacha-pull-ten]').click();
   await f.page.evaluate(()=>{
    const list=document.querySelector('[data-gacha-results]'),help=document.querySelector('[data-gacha-rules]');toolAudit.old=[...list.children];toolAudit.added=toolAudit.removed=toolAudit.helpChanges=0;
    toolAudit.observer=new MutationObserver(records=>records.forEach(r=>{if(r.target===list){toolAudit.added+=r.addedNodes.length;toolAudit.removed+=r.removedNodes.length;}else toolAudit.helpChanges++;}));
    toolAudit.observer.observe(list,{childList:true});toolAudit.observer.observe(help,{childList:true,subtree:true});
   });
   await f.page.locator('[data-gacha-pull-one]').click();
   pair[mode]=await f.page.evaluate(()=>{
    toolAudit.observer.disconnect();const list=document.querySelector('[data-gacha-results]');
    return {added:toolAudit.added,removed:toolAudit.removed,helpChanges:toolAudit.helpChanges,retained:toolAudit.old.filter(card=>list.contains(card)).length,html:list.innerHTML,summary:document.querySelector('[data-gacha-summary]').textContent,stats:['total','pity','hard-pity','guarantee','spark','spark-target'].map(h=>document.querySelector('[data-gacha-'+h+']').textContent)};
   });
   assert.equal(await f.page.locator('.gacha-card').count(),80);
   await f.page.locator('[data-tool-help-open]').click();assert(await f.page.locator('[data-gacha-rules]').isVisible());await f.page.locator('[data-tool-help-close]').click();
   for(const selected of ['blueArchiveLike','wutheringLike','arknightsLike','starRailLike']){
    await f.page.locator('[data-gacha-mode]').selectOption(selected);assert.equal(await f.page.locator('[data-gacha-total]').textContent(),'0');assert.equal(await f.page.locator('.gacha-card').count(),0);
    await f.page.locator('[data-gacha-pull-ten]').click();assert.equal(await f.page.locator('.gacha-card').count(),10);
   }
   await f.page.locator('[data-gacha-banner]').selectOption('standard');await f.page.locator('[data-gacha-pull-ten]').click();assert.equal(await f.page.locator('.gacha-up').count(),0);assert.equal(await f.page.locator('[data-gacha-guarantee]').textContent(),'常驻池');
   await f.page.locator('[data-gacha-reset]').click();assert.equal(await f.page.locator('.gacha-empty').count(),1);assert.deepEqual(f.errors,[]);await f.context.close();
  }
  assert.equal(pair.after.html,pair.before.html);assert.equal(pair.after.summary,pair.before.summary);assert.deepEqual(pair.after.stats,pair.before.stats);
  assert.equal(pair.after.retained,79);assert.equal(pair.before.retained,0);assert.equal(pair.after.added,1);assert.equal(pair.after.removed,1);assert.equal(pair.after.helpChanges,0);
  delete pair.before.html;delete pair.after.html;results.push(pair);console.log('PASS',JSON.stringify(pair));
 }
}
async function reaction(browser){
 for(const width of [1440,390]){
  const pair={kind:'reaction-departure',width};
  for(const mode of ['before','after']){
   const f=await fixture(browser,mode,width,'dark','pending');await f.ready('/tools/reaction-test/');await f.waitRequests(1);
   await f.page.evaluate(()=>{toolAudit.oldPanel=document.querySelector('[data-reaction-test]');toolAudit.oldMarkup=toolAudit.oldPanel.querySelector('[data-reaction-top-scores]').innerHTML;});
   await f.page.evaluate(()=>SonglinePageTransition.navigateLink('/tools/'));await f.page.waitForFunction(()=>location.pathname==='/tools/'&&!!document.querySelector('.tools-excavation'));
   await f.scoreRequests[0].route.fulfill({json:{scores:[{score:99}]}}).catch(()=>{});await f.page.waitForTimeout(450);
   pair[mode]=await f.page.evaluate(()=>({cacheWrites:toolAudit.cacheWrites,changedOldPanel:toolAudit.oldPanel.querySelector('[data-reaction-top-scores]').innerHTML!==toolAudit.oldMarkup}));
   pair[mode].aborted=f.failed.length>0;if(mode==='after'){assert.equal(pair[mode].cacheWrites,0);assert(!pair[mode].changedOldPanel);assert(pair[mode].aborted);}
   assert.deepEqual(f.errors,[]);await f.context.close();
  }
  results.push(pair);console.log('PASS',JSON.stringify(pair));
  const f=await fixture(browser,'after',width,'light','sync');await f.ready('/tools/reaction-test/');await f.waitRequests(3);assert.equal(f.scoreRequests[2].url,'/static/api/reaction-scores');
  await f.page.evaluate(()=>{for(let i=0;i<20;i++)dispatchEvent(new Event('online'));});await f.page.waitForTimeout(100);assert.equal(f.scoreRequests.length,3);
  await f.scoreRequests[2].route.fulfill({status:503,body:''});await f.page.waitForTimeout(100);assert.equal(f.scoreRequests.length,3,'Ambiguous POST failure must not fan out');
  await f.page.evaluate(()=>dispatchEvent(new Event('online')));await f.waitRequests(4);await f.scoreRequests[3].route.fulfill({json:{scores:[{score:180}]}});await f.page.waitForTimeout(100);
  await f.page.evaluate(()=>{for(let i=0;i<20;i++)dispatchEvent(new Event('online'));for(let i=0;i<3;i++){dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));}});await f.page.waitForTimeout(100);assert.equal(f.scoreRequests.length,4);
  await f.page.locator('[data-reaction-stage]').click();assert.equal(await f.page.locator('[data-reaction-title]').textContent(),'等变绿');await f.page.locator('[data-tool-help-open]').click();assert.equal(await f.page.locator('[data-reaction-title]').textContent(),'点击开始');await f.page.locator('[data-tool-help-close]').click();
  await f.page.evaluate(()=>localStorage.setItem('songline-reaction-best-v1','170'));await f.page.evaluate(()=>dispatchEvent(new Event('online')));await f.waitRequests(5);await f.scoreRequests[4].route.fulfill({json:{scores:[{score:170}]}});await f.page.waitForTimeout(100);assert((await f.page.locator('[data-reaction-top-scores]').textContent()).includes('170 ms'));
  await f.page.evaluate(()=>SonglinePageModules.ready(document));await f.page.locator('[data-reaction-stage]').click();await f.page.waitForFunction(()=>document.querySelector('[data-reaction-stage]').classList.contains('is-ready'),null,{timeout:8000});await f.page.waitForTimeout(40);await f.page.locator('[data-reaction-stage]').click();await f.waitRequests(6);
  const measured=JSON.parse(f.scoreRequests[5].route.request().postData()).score;assert(measured>=1&&measured<=5000);assert.equal(await f.page.locator('[data-reaction-current]').textContent(),measured+' ms');await f.scoreRequests[5].route.fulfill({json:{scores:[{score:measured}]}});await f.page.waitForTimeout(100);assert((await f.page.locator('[data-reaction-top-scores]').textContent()).includes(measured+' ms'));
  assert.deepEqual(f.errors,[]);results.push({kind:'reaction-sync',width,requests:f.scoreRequests.map(({url,method})=>({url,method})),persistedCycles:3});console.log('PASS reaction sync / help / cache',width);await f.context.close();
 }
 const f=await fixture(browser,'after',390,'dark','pending');await f.ready('/tools/reaction-test/');await f.waitRequests(1);await f.page.evaluate(()=>dispatchEvent(new Event('online')));await f.waitRequests(2);
 await f.scoreRequests[1].route.fulfill({json:{scores:[{score:100}]}});await f.page.waitForTimeout(100);await f.scoreRequests[0].route.fulfill({json:{scores:[{score:300}]}});await f.page.waitForTimeout(450);
 assert((await f.page.locator('[data-reaction-top-scores]').textContent()).includes('100 ms'));assert.equal(await f.page.evaluate(()=>JSON.parse(localStorage.getItem('songline-reaction-server-top3-cache'))[0].score),100);assert.deepEqual(f.errors,[]);await f.context.close();results.push({kind:'reaction-order',newerScore:100});console.log('PASS delayed GET / newer POST order');
}
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true,args:['--mute-audio']});try{await gacha(browser);await reaction(browser);}finally{fs.writeFileSync(path.join(out,'tool-reuse-report.json'),JSON.stringify(results,null,2));await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
