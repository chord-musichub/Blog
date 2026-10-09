const assert = require('node:assert/strict');
const fs = require('node:fs');
const {launch, fixture, ready} = require('./helpers/interaction-fixture.cjs');
const source = process.env.BLOG_PET_BUILD || 'local-only/pet-spring-2026-10-09/build';
const out = 'local-only/pet-spring-2026-10-09';
async function motionSamples(page, duration) {
  return page.evaluate(duration => new Promise(resolve => {
    const figure=document.querySelector('.songline-desktop-pet__figure'), samples=[], started=performance.now();
    function sample(time){
      const m=new DOMMatrixReadOnly(getComputedStyle(figure).transform);
      samples.push({angle:Math.atan2(m.b,m.a)*180/Math.PI,lift:m.f});
      if(time-started<duration) requestAnimationFrame(sample);else resolve(samples);
    }
    requestAnimationFrame(sample);
  }), duration);
}
(async () => {
  fs.mkdirSync(out,{recursive:true});const browser=await launch(),results=[];
  try {
    for(const [width,theme,reduced] of [[1440,'dark',false],[1440,'light',false],[820,'light',false],[390,'dark',false],[390,'light',false],[1440,'dark',true],[390,'light',true]]) {
      const f=await fixture(browser,source,{width,theme,reduced});
      try {
        const {page}=f;
        await page.addInitScript(()=>{
          const raf=requestAnimationFrame,cancel=cancelAnimationFrame,add=EventTarget.prototype.addEventListener;
          const active=new Set();window.petFrameAudit={max:0,active:()=>active.size,bindings:{}};
          window.requestAnimationFrame=function(callback){
            const tracked=new Error().stack.includes('desktop-pet.js');let id;
            id=raf.call(window,time=>{active.delete(id);callback(time);});
            if(tracked){active.add(id);petFrameAudit.max=Math.max(petFrameAudit.max,active.size);}return id;
          };
          window.cancelAnimationFrame=function(id){active.delete(id);cancel.call(window,id);};
          EventTarget.prototype.addEventListener=function(type,...args){
            if((this===window||this===document)&&new Error().stack.includes('desktop-pet.js'))petFrameAudit.bindings[type]=(petFrameAudit.bindings[type]||0)+1;
            return add.call(this,type,...args);
          };
        });
        await ready(page,f.origin,'/tools/');
        await page.evaluate(()=>SonglinePageTransition.navigateLink('/'));
        const pet=page.locator('[data-desktop-pet]'),figure=pet.locator('.songline-desktop-pet__figure'),wire=pet.locator('[data-pet-spring-wire]');
        assert(await pet.isVisible());assert.equal(await pet.getAttribute('data-desktop-pet-ready'),'1');
        assert.equal(await page.locator('.songline-desktop-pet__stake').count(),0);
        const idle=await motionSamples(page,1100);
        const idleRange=Math.max(...idle.map(s=>s.angle))-Math.min(...idle.map(s=>s.angle));
        if(reduced)assert.equal(idleRange,0);else assert(idleRange>12,'Idle motion visibly sways instead of only breathing');
        const original=await wire.getAttribute('d');
        let r=await pet.boundingBox(),x=r.x+r.width/2,y=r.y+r.height*.35;
        await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+70,y+18,{steps:8});
        assert(await pet.evaluate(el=>el.classList.contains('is-dragging')));
        const dragged=await figure.evaluate(el=>{const m=new DOMMatrixReadOnly(getComputedStyle(el).transform);return {angle:Math.atan2(m.b,m.a)*180/Math.PI,lift:m.f};});
        if(reduced){assert(Math.abs(dragged.angle)<=8.1);assert(Math.abs(dragged.lift)<=3.1);}
        else {assert(dragged.angle>32,'Drag range exceeds the former 25 degrees');assert(dragged.lift>4);}
        assert.notEqual(await wire.getAttribute('d'),original,'The spring deforms with the snowman');
        const base=await wire.evaluate(el=>{const p=el.getPointAtLength(0);return [p.x,p.y];});assert.deepEqual(base,[68,178]);
        const clip={x:Math.max(0,r.x-70),y:Math.max(0,r.y-25),width:Math.min(width-Math.max(0,r.x-70),r.width+90),height:r.height+60};
        await page.screenshot({path:`${out}/${width}-${theme}-${reduced?'reduced':'motion'}-drag.png`,clip});
        await page.mouse.up();
        const returnMotion=await motionSamples(page,1300);
        if(reduced) {assert.equal(await page.evaluate(()=>petFrameAudit.active()),0);assert(returnMotion.every(s=>Math.abs(s.angle)<.01));}
        else {
          assert(returnMotion.some(s=>s.angle < -14),'Release swings strongly past equilibrium');
          assert(returnMotion.some(s=>s.lift < -1),'Compression returns through extension');
          // Regrab during rebound must cancel the previous frame, without a pose jump.
          r=await pet.boundingBox();x=r.x+r.width/2;y=r.y+r.height*.35;
          await page.mouse.move(x,y);await page.mouse.down();
          assert.equal(await page.evaluate(()=>petFrameAudit.active()),0);
          await page.mouse.move(x-65,y-14,{steps:6});await page.mouse.up();
          await page.waitForFunction(()=>!document.querySelector('[data-desktop-pet]').classList.contains('is-returning'));
        }
        // Cancellation must release drag state and all scheduled rebound work.
        r=await pet.boundingBox();x=r.x+r.width/2;y=r.y+r.height*.4;
        await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+25,y+5,{steps:3});
        await pet.evaluate(el=>el.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerId:1})));await page.mouse.up();
        assert(!await pet.evaluate(el=>el.classList.contains('is-dragging')||el.classList.contains('is-returning')));
        assert.equal(await page.evaluate(()=>petFrameAudit.active()),0);
        if(width<981) {
          const cdp=await page.context().newCDPSession(page);r=await pet.boundingBox();const scroll=await page.evaluate(()=>scrollY);
          const points=dx=>[{x:r.x+r.width/2+dx,y:r.y+r.height*.35+Math.abs(dx)*.4,id:1}];
          await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points(0)});
          for(let i=1;i<=4;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:points(i*8)});assert(await pet.evaluate(el=>el.classList.contains('is-dragging')));}
          await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
          assert.equal(await page.evaluate(()=>scrollY),scroll,'Dragging the spring does not scroll the page');
        }
        await pet.focus();await page.keyboard.press('Space');
        assert.equal(await pet.evaluate(el=>el.classList.contains('is-returning')),!reduced);
        await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
        assert.equal(await page.evaluate(()=>petFrameAudit.active()),0);assert(await pet.evaluate(el=>el.classList.contains('is-paused')));
        await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
        assert(!await pet.evaluate(el=>el.classList.contains('is-paused')));
        const bindings=await page.evaluate(()=>({...petFrameAudit.bindings}));
        const rounds=width===1440&&theme==='dark'&&!reduced?10:1;
        for(let i=0;i<rounds;i++){
          await pet.focus();await page.keyboard.press('Enter');
          await page.evaluate(()=>SonglinePageTransition.navigateLink('/posts/'));
          assert.equal(await page.evaluate(()=>petFrameAudit.active()),0);
          assert.equal(await page.locator('[data-desktop-pet]').count(),0);
          await page.evaluate(()=>SonglinePageTransition.navigateLink('/'));
          assert.equal(await pet.getAttribute('data-desktop-pet-ready'),'1');
          assert.deepEqual(await page.evaluate(()=>({...petFrameAudit.bindings})),bindings,'Navigation does not add global pet handlers');
        }
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        assert.equal(await page.evaluate(()=>petFrameAudit.max),reduced?0:1);
        if(width===390&&theme==='light'&&!reduced){
          await pet.focus();await page.keyboard.press('Space');
          await pet.locator('img').evaluate(el=>el.src='/uploads/admin/missing-pet-fixture.png');
          await pet.waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>petFrameAudit.active()),0);
        }
        assert.deepEqual(f.errors,[]);
        results.push({width,theme,reduced,idleRange,dragged,returnMin:Math.min(...returnMotion.map(s=>s.angle)),rounds});
        console.log(`PASS ${width}px ${theme} reduce=${reduced}: coil/idle/drag/rebound/regrab/cancel/touch/keyboard/history/lifecycle`);
      } catch(error){console.error('Failed pet case',{width,theme,reduced,url:f.page.url(),errors:f.errors});throw error;}
      finally {await f.close();}
    }
    fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2));
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
