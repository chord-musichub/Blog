// Isolated canvas regression: no login, server, or real media mutations needed.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

(async () => {
 const browser = await chromium.launch({headless:true, channel:'msedge'});
 try {
  const page = await browser.newPage({viewport:{width:900,height:800}});
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  let failedImageRoute;
  const failedImageRequested = new Promise(resolve => { failedImageRoute = resolve; });
  await page.route('http://crop.test/**', route => {
   if (route.request().url().endsWith('/broken.png')) { failedImageRoute(route); return; }
   if (route.request().url().endsWith('.png')) return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="navy"/><rect x="160" y="160" width="80" height="80" fill="gold"/></svg>'});
   return route.fulfill({contentType:'text/html',body:`<!doctype html>
    <input id="source" value="/uploads/test/source.png"><input id="target">
    <button id="open" data-crop-source="#source" data-crop-target="#target" data-crop-ratio="1x1">裁剪</button>
    <dialog id="coverCropDialog"><canvas id="coverCropCanvas" style="width:400px;height:400px;touch-action:none"></canvas>
    <input id="coverCropZoom" type="range" min="1" max="3" step="0.01" value="1">
    <button id="coverCropSave">保存</button></dialog>`});
  });
  await page.goto('http://crop.test/');
  await page.evaluate(() => {
   window.cropPaints = [];
   const original = CanvasRenderingContext2D.prototype.drawImage;
   CanvasRenderingContext2D.prototype.drawImage = function(...args) {
    window.cropPaints.push(args.slice(1)); return original.apply(this,args);
   };
  });
  await page.addScriptTag({path:path.resolve('web/static/cover-cropper.js')});
  await page.locator('#open').click();
  await page.waitForSelector('dialog[open]');
  const lastPaint = () => page.evaluate(() => window.cropPaints.at(-1));
  assert.deepEqual(await lastPaint(),[0,0,1200,1200]);
  const slider = page.locator('#coverCropZoom');
  await slider.focus(); await slider.press('End');
  assert.equal(await slider.inputValue(),'3');
  assert.deepEqual(await lastPaint(),[-1200,-1200,3600,3600],'slider repaints and preserves the center');
  await page.locator('canvas').hover(); await page.mouse.wheel(0,100);
  await page.waitForFunction(() => document.querySelector('#coverCropZoom').value !== '3');
  const wheelPaint = await lastPaint();
  assert(Math.abs(wheelPaint[2]-3504)<0.01,'wheel still zooms after range input');
  assert(Math.abs(wheelPaint[0]+1152)<0.01,'wheel keeps the same center');
  await page.mouse.down(); await page.mouse.move(450,300,{steps:5});
  await page.evaluate(() => {
   const canvas = document.querySelector('canvas');
   canvas.dispatchEvent(new PointerEvent('lostpointercapture',{pointerId:1}));
  });
  assert.equal(await page.locator('canvas.is-dragging').count(),0,'lost capture releases crop dragging');
  await page.mouse.up();
  await slider.focus(); await slider.press('Home');
  assert.deepEqual(await lastPaint(),[0,0,1200,1200],'zooming back out clamps the image to cover the canvas');
  await page.evaluate(() => document.querySelector('dialog').close());
  await page.locator('#open').click(); await page.waitForSelector('dialog[open]');
  assert.equal(await slider.inputValue(),'1','opening a new crop resets zoom');
  // A previous slow/failed image must not clear the currently open image.
  await page.evaluate(() => document.querySelector('dialog').close());
  await page.locator('#source').fill('/uploads/test/broken.png');
  await page.locator('#open').click();
  const staleImage = await failedImageRequested;
  await page.locator('#source').fill('/uploads/test/source.png');
  await page.locator('#open').click(); await page.waitForSelector('dialog[open]');
  await staleImage.fulfill({status:404,body:'missing image'});
  await page.waitForTimeout(150);
  await slider.focus(); await slider.press('End');
  assert.deepEqual(await lastPaint(),[-1200,-1200,3600,3600],'a stale image failure cannot disable the current crop');
  assert.deepEqual(errors,[]);
  console.log('PASS crop slider repaint, centered wheel zoom, drag cancellation, crop reset');
 } finally { await browser.close(); }
})().catch(error => {console.error(error);process.exit(1);});
