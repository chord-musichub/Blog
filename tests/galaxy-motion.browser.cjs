const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.BLOG_TEST_URL || 'http://127.0.0.1:8080';

(async () => {
 const browser = await chromium.launch({headless:true,channel:'msedge'});
 try {
  for (const [width,reduced] of [[1440,false],[390,false],[1440,true]]) {
   const page = await browser.newPage({viewport:{width,height:900},isMobile:width<981,hasTouch:width<981,reducedMotion:reduced?'reduce':'no-preference'});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base+'/friends/');await page.waitForTimeout(1500);
   await page.evaluate(() => {
    const coreId=document.querySelector('[data-friend-galaxy]').dataset.focusedFriend;
    window.readGalaxyMotion=()=>{
     const world=document.querySelector('[data-galaxy-world]'),rect=world.getBoundingClientRect();
     const matrix=new DOMMatrixReadOnly(getComputedStyle(world).transform);
     const centers={};
     const core=world.querySelector('.friends-constellation__core img').getBoundingClientRect();
     centers[coreId]={x:core.x+core.width/2,y:core.y+core.height/2};
     for(const node of world.querySelectorAll('[data-friend-id]')){
      const r=node.querySelector('img').getBoundingClientRect();centers[node.dataset.friendId]={x:r.x+r.width/2,y:r.y+r.height/2};
     }
     let error=0;
     for(const line of world.querySelectorAll('[data-edge]')){
      const [a,b]=line.dataset.edge.split(':').map(id=>centers[id]);
      const [u,v]=['1','2'].map(end=>({x:rect.x+Number(line.getAttribute('x'+end))*rect.width/world.clientWidth,y:rect.y+Number(line.getAttribute('y'+end))*rect.height/world.clientHeight}));
      const d=(p,q)=>Math.hypot(p.x-q.x,p.y-q.y);
      error=Math.max(error,Math.min(d(a,u)+d(b,v),d(a,v)+d(b,u))/2);
     }
     return {zoom:matrix.a,x:matrix.e,y:matrix.f,error,
      lens:[...world.querySelectorAll('.friends-constellation__node,.friends-constellation__core')].map(n=>['--lens-x','--lens-y','--lens-scale'].map(p=>n.style.getPropertyValue(p))),
      lines:[...world.querySelectorAll('[data-edge]')].map(l=>l.getAttribute('class'))};
    };
   });
   await page.mouse.move(width*.52,260);await page.mouse.down();
   await page.mouse.move(width*.69,360,{steps:9});await page.waitForTimeout(150);
   const held=await page.evaluate(()=>readGalaxyMotion());
   // Crossing avatars during a drag/inertia must not alternate related lines.
   await page.evaluate(()=>{
    for(const node of document.querySelectorAll('[data-friend-id]')){
     node.dispatchEvent(new PointerEvent('pointerenter',{pointerType:'mouse'}));
     node.dispatchEvent(new PointerEvent('pointerleave',{pointerType:'mouse'}));
    }
   });
   assert.deepEqual((await page.evaluate(()=>readGalaxyMotion())).lines,held.lines,'moving over portraits must not flash relationship highlights');
   await page.mouse.up();await page.waitForTimeout(120);
   const released=await page.evaluate(()=>readGalaxyMotion());
   assert.deepEqual(released.lens,held.lens,'holding and releasing at the same position must not snap the lens');
   assert.equal(released.x,held.x);assert.equal(released.y,held.y);

   const zoom=await page.evaluate(()=>new Promise(resolve=>{
    const initial=readGalaxyMotion();document.querySelector('[data-galaxy-zoom="in"]').click();
    const immediate=readGalaxyMotion();const samples=[];const start=performance.now();
    function sample(now){samples.push(readGalaxyMotion());if(now-start<400)requestAnimationFrame(sample);else resolve({initial,immediate,samples});}
    requestAnimationFrame(sample);
   }));
   if(!reduced){
    assert.equal(zoom.immediate.zoom,zoom.initial.zoom,'zoom starts at the rendered scale, not the final scale');
    assert(new Set(zoom.samples.map(s=>s.zoom)).size>=5,'zoom must interpolate through several frames');
   }
   assert(Math.abs(zoom.samples.at(-1).zoom-1.15)<.002,'zoom reaches its requested target');
   assert(zoom.samples.every(s=>s.error<2.5),'lines stay attached throughout zoom');
   for(let i=1;i<zoom.samples.length;i++)assert(zoom.samples[i].zoom>=zoom.samples[i-1].zoom-.001,'zoom progresses without oscillation');
   // Rapid input accumulates targets, while reversing/resetting starts from
   // the currently rendered position, not a stale animation endpoint.
   await page.evaluate(()=>{document.querySelector('[data-galaxy-zoom="in"]').click();document.querySelector('[data-galaxy-zoom="in"]').click();});
   await page.waitForTimeout(350);
   assert(Math.abs((await page.evaluate(()=>readGalaxyMotion())).zoom-1.15**3)<.002);
   // The original desktop design hides touch controls; exercise their handler
   // directly here and use actual taps in the mobile gestures suite.
   await page.locator('[data-galaxy-zoom="reset"]').evaluate(button=>button.click());await page.waitForTimeout(350);
   const reset=await page.evaluate(()=>readGalaxyMotion());assert.equal(reset.zoom,1);assert.equal(reset.x,0);assert.equal(reset.y,0);
   const wheel=await page.evaluate(()=>new Promise(resolve=>{
    const stage=document.querySelector('[data-galaxy-stage]'),r=stage.getBoundingClientRect();
    stage.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:-100,clientX:r.left+r.width*.55,clientY:r.top+r.height*.45}));
    const immediate=readGalaxyMotion();setTimeout(()=>resolve({immediate,final:readGalaxyMotion()}),350);
   }));
   if(!reduced)assert.equal(wheel.immediate.zoom,1,'wheel also eases, not just zoom buttons');
   assert(wheel.final.zoom>1.15&&wheel.final.zoom<1.17);
   await page.evaluate(()=>{
    const stage=document.querySelector('[data-galaxy-stage]'),r=stage.getBoundingClientRect();
    for(const deltaY of [-100,100])stage.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY,clientX:r.left+r.width/2,clientY:r.top+r.height/2}));
   });
   await page.waitForTimeout(350);
   assert.equal((await page.evaluate(()=>readGalaxyMotion())).zoom,wheel.final.zoom,'opposite wheel ticks cancel even before the first animation frame');
   // Resize while zoomed must keep transform-origin in unscaled coordinates.
   await page.setViewportSize({width:width===1440?1300:420,height:850});await page.waitForTimeout(400);
   assert((await page.evaluate(()=>readGalaxyMotion())).error<2.5,'resize after zoom keeps endpoints on avatars');
   await page.evaluate(()=>{document.querySelector('[data-galaxy-zoom="out"]').click();window.dispatchEvent(new Event('blur'));});
   const cancelled=await page.evaluate(()=>readGalaxyMotion());await page.waitForTimeout(350);
   assert.equal((await page.evaluate(()=>readGalaxyMotion())).zoom,cancelled.zoom,'blur cancels pending zoom frames');
   assert.equal(await page.locator('[data-galaxy-stage].is-moving').count(),0);
   assert.deepEqual(errors,[]);
   console.log(`PASS ${width} ${reduced?'reduced motion':'smooth'}: stable lens/highlights, eased buttons/wheel, rapid zoom/reset, zoomed resize and cancellation`);
   await page.close();
  }
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1)});
