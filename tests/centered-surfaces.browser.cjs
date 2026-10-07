// Offline checks for centered main panels, complete scene coverage and reader chevrons.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const repo=path.resolve(__dirname,'..'),build=path.resolve(process.env.BLOG_UI_BUILD||'');
assert(fs.existsSync(path.join(build,'index.html')),'Provide a fresh BLOG_UI_BUILD');
const base='http://centered-surfaces.test',out=path.join(repo,'local-only/centered-surfaces');
fs.mkdirSync(out,{recursive:true});
const tools=['2048','snake','reaction-test','flappy-bird','typing-practice','random-number','gacha','focus-timer','audio-visualizer'];
const sample=Array.from({length:30},(_,i)=>'## 章节 '+i+'\n\n'+('正文内容。'.repeat(120))+'\n\n#### 四级标题\n\n###### 六级标题较长文字需要正常换行').join('\n\n');
async function ready(p,route){
  await p.waitForFunction(route=>location.pathname===route&&!document.documentElement.classList.contains('is-scene-preparing')&&!document.documentElement.classList.contains('songline-page-transitioning'),route);
  await p.evaluate(()=>SonglinePageModules.ready(document));
  await p.locator('#songline-scene-entry-loader').waitFor({state:'detached'});
}
async function navigate(p,route){const origin=await p.evaluate(()=>performance.timeOrigin);await p.evaluate(href=>SonglinePageTransition.navigateLink(href),base+route);await ready(p,route);assert.equal(await p.evaluate(()=>performance.timeOrigin),origin);}
async function center(p,selector){
  const box=await p.locator(selector).boundingBox(),width=await p.evaluate(()=>document.body.clientWidth);
  assert(Math.abs(box.x+box.width/2-width/2)<1.1,'Main panel is centered, independently of its rail: '+JSON.stringify({selector,box,width}));
  assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No horizontal overflow');return box;
}
async function completeScene(p,theme){
  await p.locator('html').evaluate(e=>Promise.all(e.getAnimations().filter(a=>a instanceof CSSTransition).map(a=>a.finished.catch(()=>{}))));
  await p.evaluate(()=>scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'}));
  const scene=await p.evaluate(()=>{
    const body=document.body,c=getComputedStyle(body),root=getComputedStyle(document.documentElement),box=body.getBoundingClientRect();
    return {display:c.display,bottom:box.bottom,top:box.top+scrollY,height:box.height,viewport:innerHeight,scroll:document.documentElement.scrollHeight,repeat:c.backgroundRepeat,image:c.backgroundImage,root:root.backgroundColor};
  });
  assert.equal(scene.display,'flow-root');assert(Math.abs(scene.top)<1,'No collapsed top margin');
  assert(scene.bottom>=scene.viewport-1,'Body texture covers the bottom of the document: '+JSON.stringify(scene));
  assert(scene.height>=scene.scroll-1,'Panel margins cannot extend below the body background');
  assert.equal(scene.repeat,'no-repeat, no-repeat, repeat-y');
  assert(scene.image.includes(theme==='dark'?'under-ground-black.png':'under-ground.png'));
  assert.equal(scene.root,theme==='dark'?'rgb(19, 9, 6)':'rgb(37, 18, 8)');
  await p.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
}
async function chevrons(p){
  for(const [selector,name] of [['.back-to-top-button','chevron-up'],['.scroll-to-bottom-button','chevron-down']]){
    assert.equal(await p.locator(selector+' [data-ui-icon="'+name+'"] svg path').count(),1,'Single-stroke vertical chevron survives live icon initialization');
  }
  await p.locator('.scroll-to-bottom-button').click();
  await p.waitForFunction(()=>document.documentElement.scrollHeight-innerHeight-scrollY<2);
  await p.locator('.back-to-top-button').click();await p.waitForFunction(()=>scrollY<2);
}
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    for(const [width,theme] of [[1920,'dark'],[1440,'light'],[1024,'dark'],[981,'light'],[390,'dark'],[390,'light']]){
      const context=await browser.newContext({viewport:{width,height:900},isMobile:width<981,hasTouch:width<981,reducedMotion:'reduce'});
      const errors=[];
      await context.route('**/*',route=>{
        const u=new URL(route.request().url());
        if(u.origin!==base)return route.fulfill({body:'<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100"/>',contentType:'image/svg+xml'});
        if(/^\/(?:api|static\/api|write\/api)\//.test(u.pathname))return route.fulfill({json:{items:[],messages:[],views:1,scores:[{score:300},{score:200},{score:100}]}});
        const root=u.pathname.startsWith('/static/')?path.join(repo,'web/static'):build;
        const file=path.resolve(root,decodeURIComponent(u.pathname.replace(/^\/static\//,'/').slice(1))+(u.pathname.endsWith('/')?'index.html':''));
        if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({body:'',status:404});
        const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.json':'application/json'};
        return route.fulfill({body:fs.readFileSync(file),contentType:mime[path.extname(file)]||'application/octet-stream'});
      });
      await context.addInitScript(theme=>{
        localStorage.setItem('songline-theme',theme);localStorage.setItem('songline-toc-state','expanded');
        localStorage.setItem('songline-privacy-v1',JSON.stringify({version:1,statistics:false,expires:Date.now()+86400000}));
        sessionStorage.setItem('songline-home-boot-v21.4','1');
      },theme);
      const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
      await p.goto(base+'/posts/linux-note/');await ready(p,'/posts/linux-note/');
      const frame=await center(p,'main.container');await center(p,'.article-reader');
      if(width>980){
        const rail=await p.locator('.article-toc-rail').boundingBox();assert(rail.x>=frame.x+frame.width);assert(rail.x+rail.width<width);
        await p.locator('.toc-head').click();assert.deepEqual(await center(p,'main.container'),frame,'Collapsing TOC cannot shift the reader');await p.locator('.toc-head').click();
      }
      await chevrons(p);
      await p.screenshot({path:path.join(out,`article-${width}-${theme}.png`)});
      for(const name of tools){
        await navigate(p,'/tools/'+name+'/');const frame=await center(p,'.tool-detail-surface');
        const rank=p.locator('.tool-detail-ranking');
        if(await rank.count()){
          await rank.locator('summary').click();assert.deepEqual(await center(p,'.tool-detail-surface'),frame);
          if(width>980){const b=await rank.boundingBox();assert(b.x>=frame.x+frame.width,'Ranking stays outside on the right');assert(b.x+b.width<=width);}
          await rank.locator('summary').click();
        }
        await completeScene(p,theme);
        if(['reaction-test','focus-timer'].includes(name))await p.screenshot({path:path.join(out,`${name}-${width}-${theme}.png`)});
      }
      await navigate(p,'/tools/markdown-previewer/');await center(p,'main.container');await completeScene(p,theme);
      await p.locator('[data-md-file]').setInputFiles({name:'center.md',mimeType:'text/markdown',buffer:Buffer.from(sample)});
      await p.waitForFunction(()=>document.querySelectorAll('.toc-tree a').length===90);
      await center(p,'main.container');await center(p,'.article-reader');await completeScene(p,theme);await chevrons(p);
      await p.screenshot({path:path.join(out,`markdown-${width}-${theme}.png`)});
      // The short page must also grow its background when the viewport grows.
      await navigate(p,'/tools/random-number/');await p.setViewportSize({width,height:1100});await completeScene(p,theme);
      await navigate(p,'/tools/');await completeScene(p,theme);
      await navigate(p,'/posts/linux-note/');await center(p,'main.container');
      assert.equal(await p.locator('body').getAttribute('data-page-scene'),null);assert.deepEqual(errors,[]);
      console.log('PASS centered article / tools / rails / complete background / chevron actions / AJAX',width,theme);await context.close();
    }
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
