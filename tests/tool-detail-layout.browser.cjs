// Offline visual / interaction regression for shared glass tool layouts.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const repo=path.resolve(__dirname,'..'),build=path.resolve(process.env.BLOG_UI_BUILD||'');
assert(fs.existsSync(path.join(build,'index.html')),'Provide a fresh BLOG_UI_BUILD');
const base='http://tool-layout.test',out=path.join(repo,'local-only/tool-detail-layout');
fs.mkdirSync(out,{recursive:true});
// Audio now owns an independent scene; exercised by audio-redesign.browser.cjs.
const names=['random-number','2048','snake','reaction-test','flappy-bird','typing-practice','gacha','focus-timer'];
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
async function helpControl(p,name){
  const bar=p.locator('[data-tool-actionbar]'),dialog=p.locator('[data-tool-help-dialog]');
  assert.equal(await bar.count(),1);assert.equal(await bar.textContent().then(s=>s.trim()),'','Toolbar contains no visible labels');
  assert.equal(await bar.locator(':scope > *:visible').count(),Number(await bar.getAttribute('data-tool-actions')),'All header actions remain visible, including mobile Snake');
  for(const control of await bar.locator(':scope > *').all()){
    const hit=await control.boundingBox();assert(hit&&hit.width===44&&hit.height===44,'Header action keeps its 44px hit area: '+name);
  }
  assert.equal(await p.locator('[data-2048-sync-best],[data-snake-sync-best],[data-flappy-sync-best],[data-reaction-sync-best],[data-typing-sync-best]').count(),0);
  const frame=await p.locator('.tool-detail-surface').boundingBox(),box=await bar.boundingBox();
  assert(box.x>=frame.x&&box.x+box.width<=frame.x+frame.width+1&&box.y>=frame.y,'Toolbar inside the top-right glass: '+name);
  await bar.locator('[data-tool-help-open]').click();assert(await dialog.evaluate(e=>e.open&&e.matches(':modal')));
  assert(await dialog.locator('.tool-help-content').textContent().then(s=>s.trim().length>20));
  assert((await dialog.evaluate(e=>getComputedStyle(e,'::backdrop').backdropFilter)).includes('blur'));
  assert(await dialog.evaluate(e=>e.contains(document.activeElement)),'Focus is inside the modal');
  if(name==='2048')await p.screenshot({path:path.join(out,`help-${await p.evaluate(()=>innerWidth)}-${await p.evaluate(()=>document.body.classList.contains('dark')?'dark':'light')}.png`),fullPage:true});
  await p.keyboard.press('Tab');assert(await dialog.evaluate(e=>document.activeElement===document.body||e.contains(document.activeElement)),'Tab cannot focus controls behind the modal');
  await dialog.locator('[data-tool-help-close]').click();await dialog.waitFor({state:'hidden'});
  assert(await bar.evaluate(e=>!e.contains(document.activeElement)),'Pointer dismissal releases focus for keyboard play');
  await bar.locator('[data-tool-help-open]').click();await p.mouse.click(5,5);await dialog.waitFor({state:'hidden'});
  await bar.locator('[data-tool-help-open]').click();await p.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  await bar.locator('[data-tool-help-open]').evaluate(e=>e.blur());
}
async function useTool(p,name){
  if(name==='random-number'){
    const min=await p.locator('[data-random-min]').boundingBox(),max=await p.locator('[data-random-max]').boundingBox();
    assert.equal(min.y,max.y,'Range inputs remain paired rather than stacking as a legacy form');
    await p.locator('[data-random-min]').fill('10');await p.locator('[data-random-max]').fill('10');
    await p.locator('[data-random-generate]').click();await p.waitForFunction(()=>document.querySelector('[data-random-result]').textContent==='10');
  }else if(name==='2048'){
    const tiles=p.locator('.game-2048-tile:not(.is-empty)');assert(await tiles.count()>=2);
    const colors=await p.evaluate(()=>[2,4,8,16,32,64,128,256,512,1024,2048].map(value=>{
      const tile=document.createElement('div');tile.className='game-2048-tile '+Songline2048Engine.tileClass(value);
      document.querySelector('.game-2048-tile-layer').append(tile);const color=getComputedStyle(tile).backgroundColor;tile.remove();return color;
    }));assert.equal(new Set(colors).size,11,'All eleven numbers have distinct colors');
    const pause=p.locator('[data-2048-pause]');
    await pause.click();assert.equal(await pause.getAttribute('data-tool-paused'),'true');
    const board=await tiles.evaluateAll(es=>es.map(e=>e.outerHTML));await p.keyboard.press('ArrowLeft');
    assert.deepEqual(await tiles.evaluateAll(es=>es.map(e=>e.outerHTML)),board,'Paused board does not move');
    await p.locator('[data-tool-help-open]').click();await p.locator('[data-tool-help-close]').click();
    assert.equal(await pause.getAttribute('data-tool-paused'),'true','Closing help preserves manual pause');
    await pause.click();await p.locator('[data-tool-help-open]').click();
    assert.equal(await pause.getAttribute('data-tool-paused'),'true','Opening help pauses the board');
    await p.locator('[data-tool-help-close]').click();assert.equal(await pause.getAttribute('data-tool-paused'),'false');
    await p.locator('[data-tool-help-open]').evaluate(e=>e.blur());
    for(const key of ['ArrowLeft','ArrowDown','ArrowRight','ArrowUp']){await p.keyboard.press(key);await p.waitForTimeout(520);}
    if(await p.evaluate(()=>innerWidth<981))await p.evaluate(()=>{
      const board=document.querySelector('[data-2048-board]');
      board.dispatchEvent(new TouchEvent('touchstart',{changedTouches:[new Touch({identifier:1,target:board,clientX:150,clientY:150})]}));
      board.dispatchEvent(new TouchEvent('touchend',{changedTouches:[new Touch({identifier:1,target:board,clientX:50,clientY:150})]}));
    });
    else await p.keyboard.press('ArrowLeft');
    await p.locator('[data-2048-new]').click();await p.waitForTimeout(600);
    assert.equal(await p.locator('[data-2048-score]').textContent(),'0');assert.equal(await tiles.count(),2,'Old animation cannot mutate a restarted round');
  }else if(name==='snake'){
    await p.locator('[data-snake-start]').click();
    await p.waitForFunction(()=>!document.querySelector('[data-snake-state]').textContent.includes('准备'));
    await p.locator('[data-tool-help-open]').click();assert.equal(await p.locator('[data-snake-pause]').getAttribute('data-tool-paused'),'true');
    await p.locator('[data-tool-help-close]').click();assert.equal(await p.locator('[data-snake-pause]').getAttribute('data-tool-paused'),'false');
    await p.locator('[data-tool-help-open]').evaluate(e=>e.blur());
    await p.keyboard.press('Space');
  }else if(name==='reaction-test'){
    await p.locator('[data-reaction-start]').click();
    assert(await p.locator('[data-reaction-stage]').evaluate(e=>e.classList.contains('is-waiting')));
    assert.equal(await p.locator('[data-reaction-stage]').innerText(),'等变绿');
    await p.locator('[data-reaction-stage]').click();
    assert(await p.locator('[data-reaction-stage]').evaluate(e=>e.classList.contains('is-too-soon')));
    await p.locator('[data-reaction-start]').click();await p.locator('[data-tool-help-open]').click();
    assert(await p.locator('[data-reaction-stage]').evaluate(e=>e.classList.contains('is-idle')));
    await p.locator('[data-tool-help-close]').click();
  }else if(name==='flappy-bird'){
    await p.locator('[data-flappy-overlay]').click();
    assert.equal(await p.locator('[data-flappy-overlay]').isVisible(),false);
    await p.locator('[data-flappy-pause]').click();assert.equal(await p.locator('[data-flappy-pause]').getAttribute('data-tool-paused'),'true');
    await p.waitForTimeout(400);assert.equal(await p.locator('[data-flappy-overlay]').innerText(),'点击继续');
    await p.locator('[data-tool-help-open]').click();await p.locator('[data-tool-help-close]').click();
    assert.equal(await p.locator('[data-flappy-pause]').getAttribute('data-tool-paused'),'true');
    await p.locator('[data-flappy-pause]').click();
    await p.locator('[data-tool-help-open]').click();assert.equal(await p.locator('[data-flappy-pause]').getAttribute('data-tool-paused'),'true');
    await p.locator('[data-tool-help-close]').click();assert.equal(await p.locator('[data-flappy-pause]').getAttribute('data-tool-paused'),'false');
  }else if(name==='typing-practice'){
    const char=await p.locator('[data-typing-text] span').first().textContent();
    await p.locator('[data-typing-input]').fill(char.replace(/\u00a0/g,' '));
    assert.equal(await p.locator('[data-typing-errors]').textContent(),'0');
    assert.equal(await p.locator('[data-typing-text] .is-correct').count(),1);
    const text=await p.locator('[data-typing-text] span').allTextContents().then(chars=>chars.join(''));
    await p.locator('[data-typing-input]').fill(text.slice(0,-2));
    assert.equal(await p.locator('[data-typing-errors]').textContent(),'0');
    assert(await p.locator('[data-typing-text]').evaluate(e=>{
      const pane=e.getBoundingClientRect(),cursor=e.querySelector('.is-current').getBoundingClientRect();
      return cursor.top>=pane.top&&cursor.bottom<=pane.bottom;
    }),'Next character remains visible in the bounded reference pane');
    await p.locator('[data-typing-mode="mixed"]').click();
    assert((await p.locator('[data-typing-rank-title]').textContent()).includes('中文'));
  }else if(name==='gacha'){
    const one=await p.locator('[data-gacha-pull-one]').boundingBox(),ten=await p.locator('[data-gacha-pull-ten]').boundingBox();
    assert.equal(one.y,ten.y,'Primary gacha actions remain paired on mobile');
    for(const mode of ['starRailLike','wutheringLike','arknightsLike','blueArchiveLike']){
      await p.locator('[data-gacha-mode]').selectOption(mode);await p.locator('[data-gacha-pull-ten]').click();
      assert.equal(await p.locator('[data-gacha-total]').textContent(),'10');
      assert.equal(await p.locator('[data-gacha-results]').evaluate(e=>e.children.length),10);
    }
    await p.locator('[data-tool-help-open]').click();assert(await p.locator('[data-gacha-guarantee-note]').isVisible());
    await p.locator('[data-tool-help-close]').click();
    await p.locator('[data-gacha-banner]').selectOption('standard');assert.equal(await p.locator('[data-gacha-guarantee]').textContent(),'常驻池');
  }else if(name==='focus-timer'){
    assert.equal(await p.locator('[data-focus-toggle]').getAttribute('data-tool-paused'),'true');
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
    await p.locator('[data-focus-toggle]').click();assert.equal(await p.locator('[data-focus-toggle]').getAttribute('aria-label'),'暂停');
    assert.equal(await p.locator('[data-focus-toggle] .ui-icon:visible').getAttribute('data-ui-icon'),'pause');
    await p.locator('[data-focus-toggle]').click();assert(await p.locator('[data-focus-timer]').evaluate(e=>e.classList.contains('is-paused')));
    await p.locator('[data-focus-toggle]').click();
    await p.evaluate(()=>{window.toolTestNow=Date.now;Date.now=()=>window.toolTestNow()+301000;});
    await p.locator('[data-focus-finish]').waitFor({state:'visible'});
    await p.evaluate(()=>{Date.now=window.toolTestNow;delete window.toolTestNow;});
    const dialog=p.locator('.focus-finish-card');assert(await dialog.isVisible());
    assert.equal(await p.locator('[data-focus-today-count]').textContent(),'1');
    assert.equal(await p.locator('[data-focus-today-minutes]').textContent(),'5');
    await p.locator('[data-focus-close]').click();assert.equal(await p.locator('[data-focus-finish]').isVisible(),false);
  }
}
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const cases=process.env.TOOL_LAYOUT_CASES?JSON.parse(process.env.TOOL_LAYOUT_CASES):[[1440,'dark'],[1440,'light'],[390,'dark'],[390,'light'],[820,'dark'],[320,'light']];
    for(const [width,theme] of cases){
      const context=await browser.newContext({viewport:{width,height:1000},isMobile:width<981,hasTouch:width<981,reducedMotion:'reduce'});
      const errors=[],posts=[];
      await context.route('**/*',async route=>{
        const u=new URL(route.request().url());
        if(u.origin!==base)return route.fulfill({body:svg,contentType:'image/svg+xml'});
        if(/\/(?:api|static\/api|write\/api)\//.test(u.pathname)){
          if(route.request().method()==='POST'&&u.pathname.includes('-scores'))posts.push({path:u.pathname,payload:route.request().postDataJSON()});
          return route.fulfill({json:{items:[],messages:[],views:1,scores:[{score:300},{score:200},{score:100}]}});
        }
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
        for(const key of ['songline-2048-best-v1','songline-snake-best','songline-flappy-best-v1','songline-reaction-best-v1','songline-typing-best-english'])localStorage.setItem(key,'300');
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
        const waiting={snake:'[data-snake-overlay]','flappy-bird':'[data-flappy-overlay]','reaction-test':'[data-reaction-stage]'}[name];
        if(waiting)assert.equal(await p.locator(waiting).innerText(),'点击开始','Only one brief central guide: '+name);
        await helpControl(p,name);
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
      for(const [name,prefix] of [['2048','g2048-'],['snake','snake-'],['flappy','flappy-'],['reaction','r-'],['typing','t-']]){
        const entry=posts.find(item=>item.path.includes('/'+name+'-scores')&&item.payload.score===300);
        assert(entry,'Local best automatically submitted: '+name);
        assert(entry.payload.player_id.startsWith(prefix)&&!entry.payload.player_id.endsWith('guest'),'Stable player ID: '+name);
      }
      assert.deepEqual(errors,[]);await context.close();
    }
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
