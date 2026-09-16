const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const base=process.env.BLOG_TEST_URL||'http://127.0.0.1:8080';
const out='local-only/mobile-gestures';
fs.mkdirSync(out,{recursive:true});
const touchSessions=new WeakMap();
async function swipe(page,from,to){
  let cdp=touchSessions.get(page);
  if(!cdp){cdp=await page.context().newCDPSession(page);touchSessions.set(page,cdp);}
  const point=(x,y)=>[{x,y,id:1,radiusX:3,radiusY:3}];
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:point(...from)});
  for(let i=1;i<=12;i++){
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:point(from[0]+(to[0]-from[0])*i/12,from[1]+(to[1]-from[1])*i/12)});
    await page.waitForTimeout(18);
  }
  // Finish a deliberate drag, not a fling still moving the next tap target.
  await page.waitForTimeout(120);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForTimeout(450);
}
async function fits(page,label){
  const size=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
  assert(size.scroll<=size.width+1,`${label}: overflow ${JSON.stringify(size)}`);
}
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  for(const [width,height] of (process.env.MOBILE_SIZES||'360x640,390x844,820x720').split(',').map(size=>size.split('x').map(Number))){
   const page=await browser.newPage({viewport:{width,height},isMobile:true,hasTouch:true});
   const errors=[];page.on('pageerror',error=>errors.push(error.message));
   if(process.env.UI_SOURCE_CSS) await page.route('**/css/**',route=>{
    const path='static'+new URL(route.request().url()).pathname;
    return fs.existsSync(path)?route.fulfill({contentType:'text/css',body:fs.readFileSync(path)}):route.continue();
   });
   await page.route('**/api/messages',route=>route.fulfill({json:{messages:Array.from({length:12},(_,i)=>({id:String(i),name:'测试访客',content:'这是一条用来测试手机滚动的留言。',created_at:'2026-09-15T10:00:00Z'}))}}));
   await page.addInitScript(()=>localStorage.setItem('songline-theme','dark'));
   async function go(path){await page.goto(base+path);await page.waitForTimeout(1800);await fits(page,path);}
   await go('/');
   await page.screenshot({path:`${out}/${width}-home.png`,fullPage:true});
   await swipe(page,[width/2,height-125],[width/2,150]);
   assert(await page.evaluate(()=>scrollY)>30,'home swipes scroll the document');
   await page.locator('[data-home-panel-goto]').tap();
   await page.waitForTimeout(500);
   assert.equal(await page.locator('[data-home-panel]').getAttribute('data-home-panel-state'),'message','tap opens the board');
   await fits(page,'message board');
   const messageLayout=await page.locator('.songline-home-message-scroll').evaluate(e=>({overflow:getComputedStyle(e).overflowY,width:innerWidth,compact:matchMedia('(max-width:980px) and (hover:none)').matches,inline:e.getAttribute('style')}));
   assert.equal(messageLayout.overflow,'visible','message list uses document scrolling: '+JSON.stringify(messageLayout));
   await page.evaluate(()=>scrollTo(0,0));
   await swipe(page,[width/2,height-125],[width/2,150]);
   assert(await page.evaluate(()=>scrollY)>30,'swiping message cards scrolls the document');
   assert.equal(await page.locator('[data-home-message-focus]').isVisible(),false,'swipe does not open message focus');
   await page.locator('[data-home-message-compose-open]').tap();await page.waitForTimeout(500);
   await fits(page,'compose');
   await page.screenshot({path:`${out}/${width}-compose.png`,fullPage:true});
   await page.setViewportSize({width,height:420});
   await page.locator('[data-home-message-form] textarea').fill('手机预览测试，**不会发布**。');
   await page.locator('[data-home-message-preview-toggle]').tap();
   assert(await page.locator('[data-home-message-preview]').isVisible());
   const publish=page.locator('.songline-home-message-compose-actions button[type="submit"]');
   await publish.scrollIntoViewIfNeeded();
   const publishBox=await publish.boundingBox();
   assert(publishBox.y>=60 && publishBox.y+publishBox.height<=420-76,'publish remains reachable with a shortened keyboard viewport');
   await page.setViewportSize({width,height});
   await go('/posts/?search=1');
   const terms=page.locator('.content-archive__search-terms');
   assert.equal(await terms.evaluate(e=>getComputedStyle(e).overscrollBehaviorY),'auto');
   await terms.evaluate(e=>e.scrollTop=e.scrollHeight);
   const box=await terms.boundingBox();
   const start=Math.min(height-125,box.y+box.height-8);
   await swipe(page,[width/2,start],[width/2,Math.max(75,start-160)]);
   assert(await page.evaluate(()=>scrollY)>20,'archive term boundary passes scroll to document');
   await go('/tools/');
   await swipe(page,[width/2,height-130],[width/2,130]);
   assert(await page.evaluate(()=>scrollY)>30,'tools scroll from card surface');
   await go('/tools/snake/');
   const snake=await page.locator('.snake-stage-wrap').boundingBox();
   const snakeY=Math.min(height-130,snake.y+snake.height/2);
   await swipe(page,[width/2,snakeY],[width/2,Math.max(90,snakeY-180)]);
   assert(await page.evaluate(()=>scrollY)>25,'swiping snake introduction scrolls instead of trapping touch');
   await go('/posts/c-note/');
   await swipe(page,[width/2,height-130],[width/2,130]);
   assert(await page.evaluate(()=>scrollY)>30,'reader scrolls');
   await go('/friends/');
   const world=page.locator('[data-galaxy-world]');
   const original=await world.evaluate(e=>e.style.transform);
   const core=await page.locator('[data-center-open]').boundingBox();
   await swipe(page,[core.x+core.width/2,core.y+core.height/2],[core.x+core.width/2+65,core.y+core.height/2-60]);
   assert.notEqual(await world.evaluate(e=>e.style.transform),original,'star map drags from avatar');
   assert.equal(new URL(page.url()).pathname,'/friends/','avatar swipe does not navigate');
   const moved=await world.evaluate(e=>e.style.transform);
   await page.locator('[data-galaxy-zoom="in"]').tap();
   assert.notEqual(await world.evaluate(e=>e.style.transform),moved,'touch zoom works');
   await page.locator('[data-galaxy-zoom="reset"]').tap();
   await page.screenshot({path:`${out}/${width}-friends.png`});
   await go('/friends/memories/');
   const viewport=page.locator('[data-memory-viewport]');
   const track=page.locator('[data-memory-track]');
   const images=page.locator('[data-memory-open]');
   let visible;
   for(const image of await images.all()){
    const b=await image.boundingBox();
    if(b && b.x>0 && b.x+b.width<width && b.y>110 && b.y+b.height<height-100){visible=image;break;}
   }
   assert(visible,'at least one memory is fully visible');
   const imageBox=await visible.boundingBox();
   const previous=await track.evaluate(e=>e.style.transform);
   await swipe(page,[imageBox.x+imageBox.width/2,imageBox.y+imageBox.height/2],[imageBox.x+imageBox.width/2+90,imageBox.y+imageBox.height/2]);
   assert.notEqual(await track.evaluate(e=>e.style.transform),previous,'timeline drags from photo');
   assert.equal(await page.locator('[data-memory-lightbox]').isVisible(),false,'photo swipe is not a click');
   await visible.tap();
   assert(await page.locator('[data-memory-lightbox]').isVisible(),'a deliberate photo tap still opens the image');
   await page.locator('[data-memory-close]').tap();
   assert.equal(await page.locator('[data-memory-lightbox]').isVisible(),false);
   const scroll=await viewport.evaluate(e=>({top:e.scrollTop,range:e.scrollHeight-e.clientHeight}));
   if(scroll.range>50){
    await swipe(page,[width/2,170],[width/2,height-160]);
    assert(await viewport.evaluate(e=>e.scrollTop)<scroll.top,'upper stacked memories are reachable by vertical swipe');
   }
   await page.screenshot({path:`${out}/${width}-memories.png`});
   await go('/write/login');
   await fits(page,'login');
   await page.screenshot({path:`${out}/${width}-login.png`,fullPage:true});
   assert.deepEqual(errors,[],'no runtime JS errors');
   console.log(`PASS ${width}x${height}: native scrolling, message flow, archive chaining, avatar/photo drag, zoom, stacked memories, login`);
   await page.close();
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1)});
