// Offline visual / interaction regression for the non-Markdown tool layouts.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const repo=path.resolve(__dirname,'..'),build=path.resolve(process.env.BLOG_UI_BUILD||'');
assert(fs.existsSync(path.join(build,'index.html')),'Provide a fresh BLOG_UI_BUILD');
const base='http://tool-layout.test',out=path.join(repo,'local-only/tool-detail-layout');
fs.mkdirSync(out,{recursive:true});
const names=['random-number','2048','snake','reaction-test','flappy-bird','typing-practice','gacha','focus-timer','audio-visualizer'];
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100"><rect width="160" height="100" fill="#607d8b"/></svg>';
async function ready(page,route){
  await page.waitForFunction(route=>location.pathname===route&&!document.documentElement.classList.contains('is-scene-preparing')&&!document.documentElement.classList.contains('songline-page-transitioning'),route);
  await page.evaluate(()=>SonglinePageModules.ready(document));
  await page.locator('#songline-scene-entry-loader').waitFor({state:'detached'});
}
async function navigate(page,route){
  const origin=await page.evaluate(()=>performance.timeOrigin);
  await page.evaluate(href=>SonglinePageTransition.navigateLink(href),base+route);
  await ready(page,route);assert.equal(await page.evaluate(()=>performance.timeOrigin),origin,'Real AJAX navigation, not a reload');
}
async function glass(locator){return locator.evaluate(e=>{
  const c=getComputedStyle(e);return Object.fromEntries(['backgroundImage','backgroundColor','backdropFilter','borderRadius'].map(k=>[k,c[k]]));
});}
async function soundControl(p,name){
  const control=p.locator('[data-tool-sound-control]');
  if(!await control.count())return;
  assert.equal(await control.count(),1,'One sound control: '+name);
  assert.equal(await control.textContent().then(s=>s.trim()),'','No visible sound label');
  assert.equal(await control.locator('.ui-icon:visible').count(),1,'Exactly one visible icon');
  assert.equal(await control.evaluate(e=>getComputedStyle(e,'::before').content),'none','No old music glyph');
  const box=await control.boundingBox();assert.equal(box.width,44);assert.equal(box.height,44);
  const checkbox=control.locator('input');
  const enabled=await checkbox.count()?await checkbox.isChecked():(await control.getAttribute('aria-pressed'))==='true';
  await (await checkbox.count()?checkbox:control).focus();await p.keyboard.press('Space');
  assert.equal(await checkbox.count()?await checkbox.isChecked():(await control.getAttribute('aria-pressed'))==='true',!enabled);
  assert.equal(await control.locator('.ui-icon:visible').getAttribute('data-ui-icon'),enabled?'volume-off':'volume');
  await (await checkbox.count()?checkbox:control).focus();
  await p.keyboard.press('Space');
  assert.equal(await control.locator('.ui-icon:visible').getAttribute('data-ui-icon'),enabled?'volume':'volume-off');
  await (await checkbox.count()?checkbox:control).evaluate(e=>e.blur());
}
function wav(){
  const rate=8000,length=rate*10,buffer=Buffer.alloc(44+length*2);
  buffer.write('RIFF');buffer.writeUInt32LE(buffer.length-8,4);buffer.write('WAVEfmt ',8);buffer.writeUInt32LE(16,16);
  buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);buffer.writeUInt32LE(rate,24);buffer.writeUInt32LE(rate*2,28);
  buffer.writeUInt16LE(2,32);buffer.writeUInt16LE(16,34);buffer.write('data',36);buffer.writeUInt32LE(length*2,40);
  for(let i=0;i<length;i++)buffer.writeInt16LE(Math.round(1000*Math.sin(i*2*Math.PI*220/rate)),44+i*2);
  return buffer;
}
async function useTool(p,name){
  if(name==='random-number'){
    await p.locator('[data-random-min]').fill('10');await p.locator('[data-random-max]').fill('10');
    await p.locator('[data-random-generate]').click();await p.waitForFunction(()=>document.querySelector('[data-random-result]').textContent==='10');
  }else if(name==='2048'){
    const tiles=p.locator('.game-2048-tile:not(.is-empty)');assert(await tiles.count()>=2);
    for(const dir of ['left','down','right','up'])await p.locator(`[data-2048-move="${dir}"]`).click();
    await p.locator('[data-2048-new]').click();assert.equal(await p.locator('[data-2048-score]').textContent(),'0');
  }else if(name==='snake'){
    await p.locator('[data-snake-overlay]').click();
    await p.waitForFunction(()=>!document.querySelector('[data-snake-state]').textContent.includes('准备'));
    await p.keyboard.press('Space');
  }else if(name==='reaction-test'){
    await p.locator('[data-reaction-start]').click();
    assert(await p.locator('[data-reaction-stage]').evaluate(e=>e.classList.contains('is-waiting')));
    await p.locator('[data-reaction-stage]').click();
    assert(await p.locator('[data-reaction-stage]').evaluate(e=>e.classList.contains('is-too-soon')));
  }else if(name==='flappy-bird'){
    await p.locator('[data-flappy-overlay]').click();
    assert.equal(await p.locator('[data-flappy-overlay]').isVisible(),false);
  }else if(name==='typing-practice'){
    const char=await p.locator('[data-typing-text] span').first().textContent();
    await p.locator('[data-typing-input]').fill(char.replace(/\u00a0/g,' '));
    assert.equal(await p.locator('[data-typing-errors]').textContent(),'0');
    assert.equal(await p.locator('[data-typing-text] .is-correct').count(),1);
    await p.locator('[data-typing-mode="mixed"]').click();
    assert((await p.locator('[data-typing-rank-title]').textContent()).includes('中文'));
  }else if(name==='gacha'){
    for(const mode of ['starRailLike','wutheringLike','arknightsLike','blueArchiveLike']){
      await p.locator('[data-gacha-mode]').selectOption(mode);await p.locator('[data-gacha-pull-ten]').click();
      assert.equal(await p.locator('[data-gacha-total]').textContent(),'10');
      assert.equal(await p.locator('[data-gacha-results]').evaluate(e=>e.children.length),10);
    }
    await p.locator('.gacha-rules > summary').click();assert(await p.locator('[data-gacha-guarantee-note]').isVisible());
    await p.locator('[data-gacha-banner]').selectOption('standard');assert.equal(await p.locator('[data-gacha-guarantee]').textContent(),'常驻池');
  }else if(name==='focus-timer'){
    assert(await p.locator('[data-focus-toggle]').evaluate(e=>{
      const c=getComputedStyle(e),probe=document.createElement('span');probe.style.color=c.getPropertyValue('--focus-accent');e.append(probe);
      const accent=getComputedStyle(probe).color;probe.remove();return c.backgroundColor===accent;
    }),'Primary timer action uses the accent fill rather than the generic button background');
    for(const key of ['volume','minutes'])assert.equal(await p.locator(`[data-focus-${key}]`).evaluate(e=>getComputedStyle(e).backgroundColor),'rgba(0, 0, 0, 0)','Timer inputs do not inherit the raw dark form background');
    assert.equal(await p.locator('[data-focus-preset="25"]').getAttribute('aria-pressed'),'true');
    await p.locator('[data-focus-preset="5"]').click();assert.equal(await p.locator('[data-focus-time]').textContent(),'05:00');
    assert.equal(await p.locator('[data-focus-preset="5"]').getAttribute('aria-pressed'),'true');
    assert.equal(await p.locator('[data-focus-preset="25"]').getAttribute('aria-pressed'),'false');
    for(const key of ['show-seconds','overlay']){
      const toggle=p.locator(`[data-focus-${key}]`);assert.equal(await toggle.evaluate(e=>getComputedStyle(e).appearance),'none');
      const current=await toggle.isChecked();await toggle.focus();await p.keyboard.press('Space');assert.equal(await toggle.isChecked(),!current);
      await p.keyboard.press('Space');assert.equal(await toggle.isChecked(),current);
    }
    await p.locator('[data-focus-minutes]').fill('1440');await p.locator('[data-focus-minutes]').blur();
    assert.equal(await p.locator('[data-focus-preset][aria-pressed="true"]').count(),0);
    assert.equal(await p.locator('[data-focus-time]').textContent(),'24:00:00');
    assert(await p.locator('[data-focus-time]').evaluate(e=>e.scrollWidth<=e.parentElement.clientWidth),'Long timer text is not clipped');
    await p.locator('[data-focus-preset="5"]').click();
    await p.locator('[data-focus-toggle]').click();assert.equal(await p.locator('[data-focus-toggle]').textContent(),'暂停');
    await p.locator('[data-focus-toggle]').click();assert(await p.locator('[data-focus-timer]').evaluate(e=>e.classList.contains('is-paused')));
    await p.locator('[data-focus-toggle]').click();
    await p.evaluate(()=>{window.toolTestNow=Date.now;Date.now=()=>window.toolTestNow()+301000;});
    await p.locator('[data-focus-finish]').waitFor({state:'visible'});
    await p.evaluate(()=>{Date.now=window.toolTestNow;delete window.toolTestNow;});
    const dialog=p.locator('.focus-finish-card');assert(await dialog.isVisible());
    assert.equal(await p.locator('[data-focus-today-count]').textContent(),'1');
    assert.equal(await p.locator('[data-focus-today-minutes]').textContent(),'5');
    await p.locator('[data-focus-close]').click();assert.equal(await p.locator('[data-focus-finish]').isVisible(),false);
  }else if(name==='audio-visualizer'){
    assert(await p.locator('[data-av-upload]').isVisible());assert(await p.locator('[data-av-browser-audio]').isVisible());
    assert(await p.locator('[data-av-upload]').evaluate(e=>{const b=e.getBoundingClientRect();return e.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2));}),'Audio source is visible and clickable, not clipped below the canvas');
    await p.locator('[data-av-file]').setInputFiles({name:'layout-test.wav',mimeType:'audio/wav',buffer:wav()});
    await p.waitForFunction(()=>document.querySelector('[data-audio-visualizer]').classList.contains('has-track'));
    assert.equal(await p.locator('[data-av-playlist-list]').evaluate(e=>e.children.length),1,'Local queue remains functional');
    if(await p.evaluate(()=>innerWidth>720))assert(await p.locator('[data-av-playlist]').isVisible());
    const frame=await p.locator('[data-av-stage]').boundingBox(),controls=await p.locator('.av-controls').boundingBox();
    assert(controls.x>=frame.x&&controls.x+controls.width<=frame.x+frame.width+1,'Playback controls stay inside the audio stage');
    await p.screenshot({path:path.join(out,`audio-playing-${await p.evaluate(()=>innerWidth)}-${await p.evaluate(()=>document.body.classList.contains('dark')?'dark':'light')}.png`),fullPage:true});
    if(await p.evaluate(()=>innerWidth>980)){
      await p.locator('[data-av-fullscreen]').click();await p.waitForFunction(()=>!!document.fullscreenElement);
      assert.equal(Math.round((await p.locator('[data-av-stage]').boundingBox()).height),await p.evaluate(()=>innerHeight),'Fullscreen still fills its viewport');
      await p.evaluate(()=>document.exitFullscreen());
    }
  }
}
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    for(const [width,theme] of [[1440,'dark'],[1440,'light'],[390,'dark'],[390,'light'],[820,'dark'],[320,'light']]){
      const context=await browser.newContext({viewport:{width,height:1000},isMobile:width<981,hasTouch:width<981,reducedMotion:'reduce'});
      const errors=[];
      await context.route('**/*',async route=>{
        const u=new URL(route.request().url());
        if(u.origin!==base)return route.fulfill({body:svg,contentType:'image/svg+xml'});
        if(/\/(?:api|static\/api|write\/api)\//.test(u.pathname))return route.fulfill({json:{items:[],messages:[],views:1,scores:[{score:300},{score:200},{score:100}]}});
        const root=u.pathname.startsWith('/static/')?path.join(repo,'web/static'):build;
        const file=path.resolve(root,decodeURIComponent(u.pathname.replace(/^\/static\//,'/').slice(1))+(u.pathname.endsWith('/')?'index.html':''));
        if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
        const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.json':'application/json'};
        if(u.pathname.startsWith('/uploads/')&&!u.pathname.startsWith('/uploads/admin/background/'))return route.fulfill({body:svg,contentType:'image/svg+xml'});
        return route.fulfill({body:fs.readFileSync(file),contentType:mime[path.extname(file)]||'application/octet-stream'});
      });
      await context.addInitScript(theme=>{
        localStorage.setItem('songline-theme',theme);
        localStorage.setItem('songline-privacy-v1',JSON.stringify({version:1,statistics:false,expires:Date.now()+86400000}));
        sessionStorage.setItem('songline-home-boot-v21.4','1');
      },theme);
      const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
      await p.goto(base+'/tools/markdown-previewer/');await ready(p,'/tools/markdown-previewer/');
      const reference=await glass(p.locator('main.container'));
      for(const name of names){
        const route=`/tools/${name}/`;await navigate(p,route);
        const surface=p.locator('.tool-detail-surface');assert.equal(await surface.count(),1);
        assert.deepEqual(await glass(surface),reference,'Same glass treatment as Markdown: '+route);
        assert.equal(await surface.locator(':scope > [data-back-icon]').count(),1);
        const frame=await surface.boundingBox(),back=await p.locator('[data-back-icon]').boundingBox();
        assert(back.x>=frame.x&&back.y>=frame.y&&back.x+back.width<=frame.x+frame.width&&back.y+back.height<=frame.y+frame.height,'Return inside the frame');
        assert.equal(await surface.evaluate(e=>getComputedStyle(e).transform),'none','Surface never shifts on hover');
        assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'No horizontal overflow: '+route);
        const rank=p.locator('.tool-detail-ranking');
        if(await rank.count()){
          assert.equal(await rank.evaluate(e=>e.open),false,'Collapsed by default');
          assert.equal(await rank.evaluate(e=>!!e.closest('.tool-detail-surface')),false,'Ranking outside main glass');
          await rank.locator('summary').focus();await p.keyboard.press('Enter');
          await p.waitForFunction(()=>document.querySelector('.tool-detail-ranking ol').children.length===3);
          const rows=await rank.locator('li').evaluateAll(es=>es.map(e=>{const b=e.getBoundingClientRect();return {x:b.x,y:b.y,height:b.height};}));
          assert(rows.every((b,i)=>!i||b.y>=rows[i-1].y+rows[i-1].height-1),'Ranks stack vertically');
          const rankBox=await rank.boundingBox(),currentFrame=await surface.boundingBox();
          if(width>980){
            assert(rankBox.x>=currentFrame.x+currentFrame.width,'Ranking is in the external right rail');
            assert(Math.abs(rankBox.y-currentFrame.y)<2,'Rail begins at the top of the tool');
          }else{
            assert(rankBox.y<currentFrame.y,'Small screens use a top-right expandable entry, not a lower panel');
            assert(Math.abs(rankBox.x+rankBox.width-currentFrame.x-currentFrame.width)<2,'Mobile ranking is aligned to the right edge');
          }
          assert(rankBox.x+rankBox.width<=width+1,'Expanded ranking is within the screen');
          if(name==='reaction-test'&&(width===1440||width===390)){
            await rank.locator('summary').evaluate(e=>e.blur());
            await p.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
            await p.screenshot({path:path.join(out,`${name}-${width}-${theme}-expanded.png`),fullPage:true});
          }
          await rank.locator('summary').click();assert.equal(await rank.evaluate(e=>e.open),false);
          await rank.locator('summary').evaluate(e=>e.blur());
        }
        await soundControl(p,name);
        if(width===1440||width===390){
          await p.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
          await p.screenshot({path:path.join(out,`${name}-${width}-${theme}.png`),fullPage:true});
        }
        await useTool(p,name);
        console.log('PASS glass / external ranking / tool interaction / AJAX',width,theme,name);
      }
      await navigate(p,'/tools/markdown-previewer/');assert.equal(await p.locator('.tool-detail-surface').count(),0);
      assert.deepEqual(await glass(p.locator('main.container')),reference,'Markdown remains unchanged after all tools');
      await p.locator('[data-md-file]').setInputFiles({name:'reentry.md',mimeType:'text/markdown',buffer:Buffer.from('## 回到预览器\n\n正文')});
      await p.waitForFunction(()=>document.querySelectorAll('.toc-tree a').length===1);
      await navigate(p,'/tools/random-number/');await useTool(p,'random-number');
      assert.deepEqual(errors,[]);await context.close();
    }
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
