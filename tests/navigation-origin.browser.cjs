// Short gestures crossing two physical map regions require a matching origin.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  await page.addInitScript(()=>{localStorage.setItem('songline-privacy-v1',JSON.stringify({version:1,statistics:false,expires:Date.now()+86400000}));sessionStorage.setItem('songline-home-boot-v21.4','1');});
  await page.goto((process.env.BLOG_TEST_URL||'http://127.0.0.1:8080')+'/friends/');await page.waitForTimeout(2200);
  await page.locator('[data-site-map-toggle]').click();const home=page.locator('[data-site-map] a[href="/"]');await home.focus();await page.waitForTimeout(600);
  const box=await home.boundingBox();
  await page.evaluate(()=>{window.intentTargets=[];['pointerdown','pointerup'].forEach(type=>window.addEventListener(type,event=>intentTargets.push(event.target.closest('a')?.dataset.pageKey),true));window.intentTransitions=0;window.addEventListener('songline:page-transition-start',()=>window.intentTransitions++);});
  const x=box.x+box.width/2;
  await page.mouse.move(x,box.y-1);await page.mouse.down();
  await page.mouse.move(x,box.y+2,{steps:2});await page.mouse.up();
  await page.waitForTimeout(300);
  assert.deepEqual(await page.evaluate(()=>intentTargets),['memories','home'],'gesture crosses the physical region boundary');
  assert.equal(await page.evaluate(()=>window.intentTransitions),0,'release in a different map region is not a click');
  await home.click();
  await page.waitForFunction(()=>location.pathname === '/',null,{timeout:5000});
  assert.equal(new URL(page.url()).pathname,'/');
  console.log('PASS map navigation requires matching press origin, including small drags');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
