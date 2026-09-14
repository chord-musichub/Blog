const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
fs.mkdirSync('local-only/galaxy-lens',{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  for(const width of [1440,390]){
   const page=await browser.newPage({viewport:{width,height:900},isMobile:width<981,hasTouch:width<981});
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
    return {maxError,coreScale:Number(world.querySelector('.friends-constellation__core').style.getPropertyValue('--lens-scale')),scales:nodes.map(n=>Number(n.style.getPropertyValue('--lens-scale'))),blur:document.querySelector('[data-galaxy-stage]').style.getPropertyValue('--galaxy-edge-blur')};
   });
   const initial=await inspect(); console.log(width,'initial',initial);
   assert.ok(initial.maxError < 2.5,`${width}: initial SVG endpoints drift ${initial.maxError}px`);
   await page.screenshot({path:`local-only/galaxy-lens/${width}-still.png`});
   const count=await page.locator('[data-friend-id]').count();
   await page.mouse.move(width*.57,240);await page.mouse.down();
   await page.mouse.move(width*.75,370,{steps:15});await page.waitForTimeout(80);
   const dragging=await inspect(); console.log(width,'dragging',dragging);
   assert.ok(dragging.maxError < 2.5,`${width}: dragging SVG endpoints drift ${dragging.maxError}px`);
   assert.ok(Number.parseFloat(dragging.blur) >= Number.parseFloat(initial.blur),`${width}: lens blur did not react to motion`);
   await page.screenshot({path:`local-only/galaxy-lens/${width}-drag.png`});
   await page.mouse.up();await page.waitForTimeout(1600);
   assert.equal(await page.locator('[data-friend-id]').count(),count,'no duplicate scene nodes');
   const settled=await inspect(); console.log(width,'settled',settled);
   assert.ok(settled.maxError < 2.5,`${width}: settled SVG endpoints drift ${settled.maxError}px`);
   assert.deepEqual(errors,[]);await page.close();
  }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
