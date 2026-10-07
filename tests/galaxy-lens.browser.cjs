const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
fs.mkdirSync('local-only/galaxy-lens',{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  for(const width of [1440,390]){
   const context=await browser.newContext({viewport:{width,height:900},isMobile:width<981,hasTouch:width<981});
   await context.addInitScript(()=>{
    localStorage.setItem('songline-privacy-v1',JSON.stringify({version:1,statistics:false,expires:Date.now()+86400000}));
    sessionStorage.setItem('songline-home-boot-v21.4','1');
   });
   if(process.env.BLOG_UI_BUILD){
    const build=path.resolve(process.env.BLOG_UI_BUILD);
    const origin=new URL(process.env.BLOG_TEST_URL||'http://127.0.0.1:8080').origin;
    await context.route('**/*',route=>{
     const u=new URL(route.request().url());
     if(u.origin!==origin||u.pathname.startsWith('/uploads/'))return route.fulfill({body:'<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="#607d8b"/></svg>',contentType:'image/svg+xml'});
     if(u.pathname.startsWith('/api/'))return route.fulfill({json:{items:[],views:83}});
     const root=u.pathname.startsWith('/static/')?path.resolve('web/static'):build;
     const file=path.resolve(root,decodeURIComponent(u.pathname.replace(/^\/static\//,'/').slice(1))+(u.pathname.endsWith('/')?'index.html':''));
     if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
     return route.fulfill({body:fs.readFileSync(file),contentType:({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream'});
    });
   }
   const page=await context.newPage();
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto((process.env.BLOG_TEST_URL||'http://127.0.0.1:8080')+'/friends/');await page.waitForTimeout(2200);
   const inspect=()=>page.evaluate(()=>{
    const world=document.querySelector('[data-galaxy-world]'),wr=world.getBoundingClientRect();
    const centers={};const core=world.querySelector('.friends-constellation__core img').getBoundingClientRect();
    const nodes=[...world.querySelectorAll('[data-friend-id]')];
    nodes.forEach(node=>{const r=node.querySelector('img').getBoundingClientRect();centers[node.dataset.friendId]={x:r.x+r.width/2,y:r.y+r.height/2};});
    let maxError=0;
    for(const line of world.querySelectorAll('[data-edge]')){
     const ids=line.dataset.edge.split(':');
     const ends=['1','2'].map(end=>({
      x:wr.x+Number(line.getAttribute('x'+end))*wr.width/world.clientWidth,
      y:wr.y+Number(line.getAttribute('y'+end))*wr.height/world.clientHeight
     }));
     const targetA=centers[ids[0]]||{x:core.x+core.width/2,y:core.y+core.height/2};
     const targetB=centers[ids[1]]||{x:core.x+core.width/2,y:core.y+core.height/2};
     // edgeFor() sorts ids, while the SVG line preserves the configured
     // direction.  Accept either endpoint orientation.
     const direct=Math.hypot(ends[0].x-targetA.x,ends[0].y-targetA.y)+Math.hypot(ends[1].x-targetB.x,ends[1].y-targetB.y);
     const reverse=Math.hypot(ends[0].x-targetB.x,ends[0].y-targetB.y)+Math.hypot(ends[1].x-targetA.x,ends[1].y-targetA.y);
     maxError=Math.max(maxError,Math.min(direct,reverse)/2);
    }
    return {maxError,coreScale:Number(world.querySelector('.friends-constellation__core').style.getPropertyValue('--lens-scale')),scales:nodes.map(n=>Number(n.style.getPropertyValue('--lens-scale'))),blur:getComputedStyle(document.querySelector('.friends-constellation__edge-vignette'),'::before').backdropFilter};
   });
   const initial=await inspect(); console.log(width,'initial',initial);
   assert.ok(initial.coreScale > 1.4,`${width}: center magnification remains visible`);
   const starAnimations=await page.locator('.songline-starstream-layer animate').count();
   assert.ok(width<981 ? starAnimations===0 : starAnimations>0,`${width}: mobile trails are static; desktop planetary trails animate`);
   assert.equal(await page.locator('.songline-starstream-layer').count(),1,'Keep the planetary-trail layer on mobile and desktop');
   assert.ok(initial.maxError < 2.5,`${width}: initial SVG endpoints drift ${initial.maxError}px`);
   await page.screenshot({path:`local-only/galaxy-lens/${width}-still.png`});
   const count=await page.locator('[data-friend-id]').count();
   const touch=width<981?await context.newCDPSession(page):null;
   if(touch){
    await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:width*.57,y:240}]});
    for(let step=1;step<=15;step++)await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:width*(.57+.18*step/15),y:240+130*step/15}]});
   }else{
    await page.mouse.move(width*.57,240);await page.mouse.down();
    await page.mouse.move(width*.75,370,{steps:15});
   }
   await page.waitForTimeout(80);
   const dragging=await inspect(); console.log(width,'dragging',dragging);
   assert.notDeepEqual(dragging.scales,initial.scales,`${width}: lens must update while dragging, not freeze for mobile performance`);
   assert.ok(dragging.maxError < 2.5,`${width}: dragging SVG endpoints drift ${dragging.maxError}px`);
   assert.equal(dragging.blur,initial.blur,`${width}: backdrop blur must stay stable during motion`);
   await page.screenshot({path:`local-only/galaxy-lens/${width}-drag.png`});
   if(touch)await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await page.mouse.up();
   await page.waitForTimeout(1600);
   assert.equal(await page.locator('[data-friend-id]').count(),count,'no duplicate scene nodes');
   const settled=await inspect(); console.log(width,'settled',settled);
   assert.ok(settled.maxError < 2.5,`${width}: settled SVG endpoints drift ${settled.maxError}px`);
   const zoom=await page.evaluate(()=>new Promise(resolve=>{
    const world=document.querySelector('[data-galaxy-world]');
    const scale=()=>new DOMMatrixReadOnly(getComputedStyle(world).transform).a;
    const initial=scale();document.querySelector('[data-galaxy-zoom="in"]').click();
    const immediate=scale(),samples=[],start=performance.now();
    function sample(now){samples.push(scale());if(now-start<450)requestAnimationFrame(sample);else resolve({initial,immediate,samples});}
    requestAnimationFrame(sample);
   }));
   assert.equal(zoom.immediate,zoom.initial,'Zoom retains the rendered starting scale');
   assert(new Set(zoom.samples).size>=5,'Zoom interpolates over multiple frames');
   assert(zoom.samples.at(-1)>zoom.initial,'Zoom reaches a larger scale');
   assert((await inspect()).maxError<2.5,'Avatar lines remain attached after zoom');
   await page.setViewportSize({width:width<981?1440:390,height:900});
   await page.waitForTimeout(600);
   const resizedAnimations=await page.locator('.songline-starstream-layer animate').count();
   assert.ok(width<981 ? resizedAnimations>0 : resizedAnimations===0,'Planetary trail mode follows the viewport breakpoint');
   assert.deepEqual(errors,[]);await context.close();
  }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
