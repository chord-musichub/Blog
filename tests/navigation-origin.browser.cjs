const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  await page.goto((process.env.BLOG_TEST_URL||'http://127.0.0.1:8080')+'/friends/');await page.waitForTimeout(2200);
  const box=await page.locator('[data-elevator-nav] a[href="/"]').boundingBox();
  const nav=await page.locator('[data-elevator-nav]').boundingBox();
  await page.evaluate(()=>{window.intentTransitions=0;window.addEventListener('songline:page-transition-start',()=>window.intentTransitions++);});
  // Cross into the virtual hit band with a 4px gesture: old distance-only guard missed this.
  await page.mouse.move(nav.x+nav.width-4,box.y-3);await page.mouse.down();
  await page.mouse.move(nav.x+nav.width-4,box.y+1,{steps:4});await page.mouse.up();
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(()=>window.intentTransitions),0,'release in a different hit region is not a click');
  // The same expanded band must still activate on a real click (not a drag).
  await page.mouse.click(nav.x+nav.width-4,box.y+box.height/2);
  await page.waitForFunction(()=>location.pathname === '/',null,{timeout:1500});
  assert.equal(new URL(page.url()).pathname,'/','a deliberate click in the expanded band navigates');
  console.log('PASS navigation requires matching press origin, including small drags');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
