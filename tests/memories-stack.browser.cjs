// Isolated timeline fixture: exercise source CSS/JS without modifying user memories.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function fixture(count) {
 const cards = [];
 for(let month=0; month<3; month++) for(let slot=0; slot<count; slot++) {
  cards.push(`<article class="memory-room__memory" data-memory-card data-memory-month-index="${month}" data-memory-date="2026-0${month+1}" data-memory-title="回忆 ${slot+1}" data-memory-image="" style="--memory-index:${month};--memory-slot:${slot}">
   <span class="memory-room__stem"></span><button class="memory-room__image-button" data-memory-open><img alt="回忆 ${slot+1}"></button>
   <div class="memory-room__caption"><h1>回忆 ${slot+1}</h1><p>测试简介</p></div>
   ${slot===0?'<div class="memory-room__time"><i></i><time>2026</time></div>':''}</article>`);
 }
 return `<!doctype html><html data-theme="dark"><meta name="viewport" content="width=device-width,initial-scale=1"><body data-page-section="friends"><main class="container"><section class="memory-room" data-memory-room><div class="memory-room__viewport" data-memory-viewport><div class="memory-room__track" data-memory-track data-memory-count="3" style="--memory-count:3">${cards.join('')}</div></div></section></main></body></html>`;
}

(async()=>{
 const browser = await chromium.launch({headless:true,channel:'msedge'});
 try {
  for(const [width,height,touch,count] of [[1440,900,false,3],[1920,1080,false,5],[1024,500,false,5],[820,720,false,3],[820,720,true,5],[390,844,true,3],[360,640,true,5]]) {
   const page = await browser.newPage({viewport:{width,height},hasTouch:touch,isMobile:touch});
   const errors=[]; page.on('pageerror',e=>errors.push(e.message));
   await page.setContent(fixture(count));
   await page.addStyleTag({path:path.resolve('static/css/pages/friends/memories.css')});
   await page.addStyleTag({path:path.resolve('static/css/touch-layout.css')});
   await page.addScriptTag({path:path.resolve('static/js/pages/friends/memories.js')});
   const viewport=page.locator('[data-memory-viewport]');
   const bounds=await page.locator('[data-memory-card]').evaluateAll(cards=>cards.map(card=>{
    const image=card.querySelector('button').getBoundingClientRect();
    const title=card.querySelector('h1').getBoundingClientRect();
    return {month:card.dataset.memoryMonthIndex,x:image.x,y:image.y,height:image.height,title:{x:title.x,y:title.y,bottom:title.bottom,right:title.right},right:image.right};
   }));
   for(let month=0;month<3;month++) {
    const group=bounds.filter(b=>b.month===String(month));
    for(let i=1;i<group.length;i++) {
     assert.equal(group[i].x,group[0].x,'same-date pictures share one vertical column');
     assert(group[i-1].y >= group[i].y+group[i].height+20,`overlap ${width}x${height} touch=${touch}: ${JSON.stringify(group)}`);
     assert(group[i].title.bottom <= group[i-1].title.y,'titles remain separate');
    }
   }
   const scroll=await viewport.evaluate(e=>({top:e.scrollTop,max:e.scrollHeight-e.clientHeight}));
   assert(Math.abs(scroll.top-scroll.max)<=1,'initial view stays at the date nodes');
   await viewport.evaluate(e=>e.scrollTop=0);
   const highest=await page.locator('[data-memory-month-index="2"] button').last().boundingBox();
   const view=await viewport.boundingBox();
   assert(highest.y>=view.y && highest.y+highest.height<=view.y+view.height,'upper memories can be reached');
   if(scroll.max>1) {
    await page.mouse.move(width/2,height/2); await page.mouse.wheel(0,140);
    await page.waitForTimeout(180);
    assert(await viewport.evaluate(e=>e.scrollTop)>0,`vertical wheel scrolls tall stacks: ${width}x${height} ${JSON.stringify(scroll)} ${JSON.stringify(await viewport.evaluate(e=>({height:e.clientHeight,scroll:e.scrollHeight,overflow:getComputedStyle(e).overflowY,hit:document.elementFromPoint(innerWidth/2,innerHeight/2)?.outerHTML.slice(0,300)})))}`);
   }
   // A release outside the viewport before capture must not strand the next drag.
   await viewport.dispatchEvent('pointerdown',{pointerId:71,button:0,clientX:200,clientY:200,isPrimary:true});
   await page.evaluate(()=>window.dispatchEvent(new PointerEvent('pointerup',{pointerId:71})));
   await viewport.dispatchEvent('pointerdown',{pointerId:72,button:0,clientX:200,clientY:200,isPrimary:true});
   // Stub capture only for synthetic pointer events (real pointer drags covered elsewhere).
   await viewport.evaluate(e=>{e.setPointerCapture=()=>{};});
   await viewport.dispatchEvent('pointermove',{pointerId:72,clientX:260,clientY:200});
   await page.waitForTimeout(40);
   assert.equal(await viewport.evaluate(e=>e.classList.contains('is-dragging')),true,'next drag works after outside release');
   await viewport.dispatchEvent('lostpointercapture',{pointerId:72});
   assert.equal(await viewport.evaluate(e=>e.classList.contains('is-dragging')),false);
   await page.setViewportSize({width,height:height-100});
   await page.waitForTimeout(50);
   assert.deepEqual(errors,[]);
   if(process.env.BLOG_MEMORY_SCREENSHOTS) {
    fs.mkdirSync('local-only/memory-stacks',{recursive:true});
    await page.screenshot({path:`local-only/memory-stacks/${width}-${touch?'touch':'mouse'}-${count}.png`});
   }
   console.log(`PASS ${width}x${height} ${touch?'touch':'mouse'}: ${count} same-date cards, labels, tall-stack scrolling, drag release`);
   await page.close();
  }
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
