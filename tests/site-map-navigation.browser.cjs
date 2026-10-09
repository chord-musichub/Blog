const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {fixture, ready, launch} = require('./helpers/interaction-fixture.cjs');
const source = process.env.BLOG_MAP_BUILD || 'local-only/map-only-2026-10-09/build';
const out = 'local-only/map-only-2026-10-09/screenshots';

(async () => {
  fs.mkdirSync(out, {recursive:true});
  const browser = await launch();
  try {
    for (const [width, theme, reduced] of [[1440,'dark',false], [1440,'light',true], [1024,'dark',false], [820,'light',false], [390,'dark',false], [390,'light',true], [360,'dark',false]]) {
      const f = await fixture(browser, source, {width, theme, reduced});
      try {
        const {page} = f;
        page.setDefaultTimeout(15000);
        await ready(page, f.origin, '/tools/');
        const map = page.locator('[data-site-map]');
        const toggle = map.locator('[data-site-map-toggle]');
        const home = map.locator('a[data-page-key="home"]');
        assert.equal(await page.locator('[data-elevator-nav], [data-elevator-toggle], .nav-links').count(), 0);
        assert.equal(await map.count(), 1);
        assert.equal(await map.getAttribute('data-site-map-ready'), '1', 'Map binds independently of the retired elevator');
        assert.equal(await map.locator('a[data-page-key]').count(), 5, 'All five public page entrances remain');
        async function openMap() {
          if (page.viewportSize().width < 981) {
            if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
          } else await home.focus();
          await home.waitFor({state:'visible'});
          // The floating map finishes its existing expansion before hit tests.
          await page.waitForTimeout(reduced ? 30 : 300);
        }
        async function arrived(route, key) {
          await page.waitForFunction(route => location.pathname === route && !document.documentElement.classList.contains('songline-page-transitioning'), route);
          assert.equal(await page.locator('[data-elevator-nav]').count(), 0);
          assert.equal(await map.count(), 1);
          assert.equal(await map.locator(`a[data-page-key="${key}"]`).getAttribute('aria-current'), 'page');
          if (page.viewportSize().width < 981) assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
        }
        if (width < 981) {
          assert(await toggle.isVisible());
          const r = await toggle.boundingBox();
          assert(r.width >= 44 && r.height >= 44);
          assert(await map.evaluate(el => el.parentElement === document.body), 'Map stays outside the transformed header');
          await toggle.focus();await page.keyboard.press('Enter');
          assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
          await page.keyboard.press('Escape');
          assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
          await openMap();
          await page.mouse.click(width / 2, 140);
          assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
        }
        await openMap();
        const box = await map.locator('.songline-site-map__regions').boundingBox();
        assert(box.x >= 0 && box.x + box.width <= width + 1, 'Map fits the viewport');
        await page.screenshot({path:path.join(out, `${width}-${theme}-map.png`)});
        // Rebinding cannot multiply click handlers (one toggle must open once).
        await page.evaluate(() => {const navigation=SonglineCreatePageNavigation();for(let i=0;i<10;i++)navigation.bindSiteMap();});
        if (width < 981) {
          await toggle.tap();assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
          await toggle.tap();assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
        }
        // Returning a drag to its starting map region must never navigate.
        let r = await home.boundingBox(), x = r.x + r.width / 2, y = r.y + r.height / 2;
        await page.mouse.move(x,y);await page.mouse.down();
        await page.mouse.move(x+25,y+15,{steps:5});await page.mouse.move(x,y,{steps:5});await page.mouse.up();
        assert.equal(new URL(page.url()).pathname, '/tools/');
        // A cancelled pointer cannot activate the eventual click either.
        await page.mouse.move(x,y);await page.mouse.down();
        await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', {pointerId:1})));
        await page.mouse.up();
        assert.equal(new URL(page.url()).pathname, '/tools/');
        await home.focus();await page.keyboard.press('Enter');
        await arrived('/', 'home');
        for (const [key, route] of [['friends','/friends/'], ['memories','/friends/memories/'], ['posts','/posts/'], ['tools','/tools/']]) {
          await openMap();
          const region = map.locator(`a[data-page-key="${key}"]`);
          if (width < 981) await region.tap();else await region.click();
          await arrived(route,key);
        }
        await page.goBack();await arrived('/posts/','posts');
        await page.goForward();await arrived('/tools/','tools');
        // The retired left-hand hit band must not retain document click handlers.
        await page.evaluate(() => {
          const probe=document.createElement('div');probe.id='retired-nav-probe';
          probe.style.cssText='position:fixed;left:45px;top:420px;width:30px;height:30px;z-index:500';
          document.body.appendChild(probe);
          window.mapTestTransitions=0;window.addEventListener('songline:page-transition-start',()=>mapTestTransitions++);
        });
        await page.mouse.click(60,435);
        assert.equal(await page.evaluate(() => mapTestTransitions), 0);
        await page.evaluate(() => document.getElementById('retired-nav-probe').remove());
        const newWidth = width < 981 ? 1440 : 390;
        await page.setViewportSize({width:newWidth,height:900});
        await page.waitForFunction(() => !!document.querySelector('[data-site-map]').dataset.mobileBottomDock === (innerWidth <= 980));
        await openMap();
        await map.locator('a[data-page-key="posts"]').click();await arrived('/posts/','posts');
        // Audio owns a separate scene, then returns to the same map instance.
        await page.evaluate(() => SonglinePageTransition.navigateLink('/tools/audio-visualizer/'));
        assert(!await map.isVisible());
        await page.evaluate(() => SonglinePageTransition.navigateLink('/tools/'));
        await arrived('/tools/','tools');
        assert(await map.isVisible());
        assert.deepEqual(f.errors, []);
        console.log(`PASS ${width}px ${theme} reduce=${reduced}: map-only, keyboard/touch/drag/cancel, all routes, history, rebind/resize/audio`);
      } catch(error) {console.error('Failed scenario', {width,theme,url:f.page.url(),errors:f.errors});throw error;}
      finally {await f.close();}
    }
  } finally {await browser.close();}
})().catch(error => {console.error(error);process.exitCode=1;});
