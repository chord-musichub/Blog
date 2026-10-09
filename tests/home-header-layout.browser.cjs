const assert=require('node:assert/strict'),fs=require('node:fs');
const {launch,fixture,ready}=require('./helpers/interaction-fixture.cjs');
const source=process.env.BLOG_HOME_LAYOUT_BUILD||'local-only/header-home-2026-10-09/build';
const out='local-only/header-home-2026-10-09';
const projects=JSON.parse(fs.readFileSync(source+'/assets/data/projects.json','utf8'));
(async()=>{
 fs.mkdirSync(out+'/screenshots',{recursive:true});const browser=await launch(),results=[];
 try{
  for(const width of [1920,1440,1024,820,390])for(const theme of ['dark','light']){
   const f=await fixture(browser,source,{width,theme,reduced:width===820});
   try{
    const {page}=f;let messages=[{name:'访客一',content:'第一条留言',created_at:'2026-10-09T00:00:00Z'},{name:'访客二',content:'第二条留言',created_at:'2026-10-09T01:00:00Z'}],posts=0;
    await page.route('**/api/messages',async route=>{if(route.request().method()==='POST'){posts++;messages.push({...route.request().postDataJSON(),created_at:'2026-10-09T02:00:00Z'});}await route.fulfill({json:{messages}});});
    await ready(page,f.origin,'/');
    await page.waitForTimeout(800);
    const header=page.locator('.modern-site-header');
    async function checkHeader(){
     const values=await header.evaluate(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return {rect:[r.x,r.y,r.width,r.height],background:s.backgroundColor,filter:s.backdropFilter,position:s.position};});
     assert.deepEqual(values.rect,[0,0,width,60]);assert.equal(values.position,'fixed');
     assert.equal(values.background,theme==='dark'?'rgba(10, 22, 38, 0.62)':'rgba(75, 66, 75, 0.48)');assert.equal(values.filter,'blur(14px) saturate(1.04)');
     for(const selector of ['.logo','[data-site-map-toggle]','.header-icons']){const r=await header.locator(selector).boundingBox();assert(r.y>=0&&r.y+r.height<=61,selector+' fits the glass bar: '+JSON.stringify(r));}
     return values;
    }
    const h=await checkHeader();
    const stats=page.locator('.songline-terminal-stat-grid .songline-terminal-stat');
    assert.equal(await stats.count(),4);
    assert.deepEqual(await stats.locator('.songline-terminal-stat-label').allTextContents(),['文章','工具','项目','留言']);
    const project=stats.nth(2),goto=stats.nth(3);
    assert.equal((await project.locator('.songline-terminal-stat-value').innerText()).trim(),String(projects.length));
    await page.waitForFunction(()=>document.querySelector('[data-home-message-stat-count]').textContent==='2');
    assert.equal(await goto.getAttribute('data-home-panel-goto'),'');assert.equal(await page.locator('[data-home-panel-goto]').count(),1);
    assert.equal(await page.locator('.songline-home-message-goto').count(),0);
    await page.screenshot({path:`${out}/screenshots/${width}-${theme}-home.png`});
    const initialHistory=await page.evaluate(()=>history.length);
    await goto.focus();await page.keyboard.press('Enter');
    await page.waitForFunction(()=>document.querySelector('[data-home-panel]').dataset.homePanelState==='message');
    assert.equal(new URL(page.url()).pathname,'/');assert.equal(await page.evaluate(()=>history.length),initialHistory);
    await page.getByRole('button',{name:'写下留言',exact:false}).click();
    await page.locator('[data-home-message-form] input[name="name"]').fill('测试访客');
    await page.locator('[data-home-message-form] textarea').fill('合成留言测试');
    await page.locator('[data-home-message-form] button[type="submit"]').click();
    await page.waitForFunction(()=>document.querySelector('[data-home-message-count]').textContent==='3');assert.equal(posts,1);
    await page.locator('[data-home-panel-return]').click();
    await page.waitForFunction(()=>document.querySelector('[data-home-panel]').dataset.homePanelState==='system'&&document.activeElement.matches('[data-home-panel-goto]'));
    assert.equal(await goto.locator('[data-home-message-stat-count]').innerText(),'3');
    await project.click();
    await page.waitForFunction(()=>location.pathname==='/posts/'&&document.querySelector('[data-archive-mode="projects"]')?.getAttribute('aria-selected')==='true'&&!document.documentElement.classList.contains('songline-page-transitioning'));
    await checkHeader();
    const archive=page.locator('.content-archive');
    async function centered(){const r=await archive.boundingBox();assert(Math.abs(r.x+r.width/2-width/2)<=1,'archive is viewport-centered: '+JSON.stringify(r));assert(r.x>=0&&r.x+r.width<=width);return r;}
    const card=await centered();
    assert.equal(await page.locator('[data-archive-panel="projects"] .archive-record').count(),projects.length);
    await page.screenshot({path:`${out}/screenshots/${width}-${theme}-archive.png`});
    await page.locator('[data-archive-mode="articles"]').click();await centered();
    await page.reload();await page.waitForFunction(()=>!document.documentElement.classList.contains('is-scene-preparing'));await centered();await checkHeader();
    await page.evaluate(()=>SonglinePageTransition.navigateLink('/tools/audio-visualizer/'));assert(!await header.isVisible());
    await page.evaluate(()=>SonglinePageTransition.navigateLink('/'));await checkHeader();
    await page.waitForFunction(()=>document.querySelector('[data-home-message-stat-count]').textContent==='3');
    assert.deepEqual(f.errors,[]);results.push({width,theme,header:h,archive:card});
    console.log(`PASS ${width}px ${theme}: shared glass header, centered archive, project count/tab, message tile/count/post/focus, AJAX/reload/audio return`);
   }catch(error){console.error('Failed layout',{width,theme,url:f.page.url(),errors:f.errors});throw error;}finally{await f.close();}
  }
  fs.writeFileSync(out+'/layout-results.json',JSON.stringify(results,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
