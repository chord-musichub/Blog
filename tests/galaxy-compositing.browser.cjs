// Hardware-rendered visual regression. Source overrides, if desired, must be
// supplied by the runner; normal runs check the actual built website.
const {chromium}=require('playwright');
const sharp=require('sharp');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const base=process.env.BLOG_TEST_URL||'http://127.0.0.1:8080';
const out='local-only/galaxy-compositing';fs.mkdirSync(out,{recursive:true});
const oldCompositingCSS=`
 .friends-constellation__world{isolation:auto!important;contain:none!important}
 .friends-constellation__world :is(.friends-constellation__node,.friends-constellation__core){will-change:transform!important;backface-visibility:hidden!important}
 .friends-constellation__edge-vignette{contain:none!important;transform:translateZ(0)!important;backface-visibility:hidden!important}`;

(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge',args:['--enable-gpu']});
 try{
  const cdp=await browser.newBrowserCDPSession();const info=await cdp.send('SystemInfo.getInfo');
  assert.equal(info.gpu.featureStatus.gpu_compositing,'enabled','GPU compositing is required: software-only runs cannot validate this regression');
  console.log('Hardware compositing enabled');
  for(const [width,theme] of [[1440,'dark'],[390,'dark'],[1440,'light'],[390,'light']]){
   const name=`${width}-${theme}`;
   const context=await browser.newContext({viewport:{width,height:900},isMobile:width<980,hasTouch:width<980,recordVideo:{dir:out,size:{width,height:900}}});
   await context.addInitScript(theme=>localStorage.setItem('songline-theme',theme),theme);
   const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base+'/friends/');await page.waitForTimeout(1800);
   await page.evaluate(()=>{
    const world=document.querySelector('[data-galaxy-world]'),veil=document.querySelector('.friends-constellation__edge-vignette');
    const nodes=[...world.querySelectorAll('.friends-constellation__node,.friends-constellation__core,[data-edge]')];
    window.compositingChecks={frames:0,errors:[],running:true};
    const initial=getComputedStyle(veil,'::before'),blur=initial.backdropFilter,mask=initial.maskImage;
    function sample(){
     const checks=window.compositingChecks;if(!checks.running)return;checks.frames++;
     for(const n of nodes){const s=getComputedStyle(n);if(!n.isConnected||s.display==='none'||s.visibility==='hidden'||s.opacity==='0')checks.errors.push('node hidden or replaced');}
     const s=getComputedStyle(veil,'::before');if(s.backdropFilter!==blur||s.maskImage!==mask)checks.errors.push('blur/mask changed during motion');
     requestAnimationFrame(sample);
    }requestAnimationFrame(sample);
   });
   await page.mouse.move(width*.5,300);await page.mouse.down();
   await page.mouse.move(width*.69,405,{steps:20});await page.mouse.up();await page.waitForTimeout(900);
   await page.mouse.move(width*.5,360);
   for(const delta of [-100,-100,120,100]){await page.mouse.wheel(0,delta);await page.waitForTimeout(320);}
   await page.locator('[data-galaxy-zoom="reset"]').evaluate(b=>b.click());await page.waitForTimeout(600);
   const motion=await page.evaluate(()=>{compositingChecks.running=false;return compositingChecks;});
   assert(motion.frames>=30,'sample motion and settling, not just the first frame');assert.deepEqual(motion.errors,[]);
   // Freeze decorative motion only after recording the real drag/zoom path.
   await page.evaluate(()=>{
    window.requestAnimationFrame=()=>0;
    document.getAnimations().forEach(a=>a.pause());
    document.querySelectorAll('svg').forEach(s=>{if(s.pauseAnimations)s.pauseAnimations()});
   });await page.waitForTimeout(150);
   const rects=()=>page.locator('.friends-constellation__node,.friends-constellation__core').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return [r.x,r.y,r.width,r.height];}));
   const newRects=await rects();
   const candidate=await page.screenshot({path:`${out}/${name}-new.png`});
   const oldStyle=await page.addStyleTag({content:oldCompositingCSS});
   assert.deepEqual(await rects(),newRects,'compositing changes must not move or resize portraits');
   const baseline=await page.screenshot({path:`${out}/${name}-reference.png`});
   await oldStyle.evaluate(s=>s.remove());
   const a=await sharp(candidate).removeAlpha().raw().toBuffer(),b=await sharp(baseline).removeAlpha().raw().toBuffer();
   let total=0,changed=0;
   for(let i=0;i<a.length;i+=3){let delta=0;for(let c=0;c<3;c++)delta+=Math.abs(a[i+c]-b[i+c]);total+=delta;if(delta>15)changed++;}
   const mean=total/a.length,ratio=changed/(a.length/3);
   assert(mean<1&&ratio<.03,`visual design changed: mean ${mean}, pixel ratio ${ratio}`);
   assert.deepEqual(errors,[]);
   const video=page.video();await context.close();await video.saveAs(`${out}/${name}.webm`);
   console.log(`PASS ${name}: ${motion.frames} sampled frames, identical geometry, mean pixel delta ${mean.toFixed(3)}/255, ${(ratio*100).toFixed(2)}% pixels above threshold`);
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1)});
