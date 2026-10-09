// Real partial image responses: intrinsic dimensions arrive before load/decode.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const sharp = require('sharp');
const {launch} = require('./helpers/interaction-fixture.cjs');

(async () => {
  const image = await sharp({create:{width:640, height:400, channels:3, background:'#486080'}})
    .jpeg({progressive:true}).toBuffer();
  const pending = new Map();
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/failed')) { res.writeHead(503); return res.end(); }
    res.writeHead(200, {'Content-Type':'image/jpeg', 'Content-Length':image.length, 'Cache-Control':'no-store'});
    if (req.url.startsWith('/ready')) return res.end(image);
    // Leave the end-of-image marker pending, or send no bytes at all.
    if (req.url.startsWith('/partial')) res.write(image.subarray(0, -2));
    pending.set(req.url, res);
    res.on('close', () => pending.delete(req.url));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const dialog = fs.readFileSync('layouts/friends/memories.html', 'utf8').match(/<dialog\b[\s\S]*?<\/dialog>/)[0];
  let browser;
  try {
    browser = await launch();
    for (const width of [1440, 390]) {
      const page = await browser.newPage({viewport:{width, height:844}, hasTouch:width === 390, isMobile:width === 390});
      page.setDefaultTimeout(3000);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="${origin}/"></head>
        <body data-page-section="friends"><section class="memory-room" data-memory-room>
        <div class="memory-room__viewport" data-memory-viewport><div class="memory-room__track" data-memory-track data-memory-count="1">
        <article class="memory-room__memory" data-memory-card data-memory-month-index="0" data-memory-title="慢加载回忆" data-memory-date="2026-10" data-memory-description="测试详情">
        <button class="memory-room__image-button" data-memory-open>打开回忆</button></article>
        </div></div></section>${dialog}</body></html>`);
      await page.addStyleTag({path:path.resolve('static/css/pages/friends/memories.css')});
      await page.addStyleTag({path:path.resolve('static/css/touch-layout.css')});
      await page.addScriptTag({path:path.resolve('web/static/resource-readiness.js')});
      await page.addScriptTag({path:path.resolve('static/js/pages/friends/memories.js')});
      await page.evaluate(() => SonglineInitMemoryRoom(document));
      const opener = page.locator('[data-memory-open]');
      const modal = page.locator('[data-memory-lightbox]');
      const photo = page.locator('[data-memory-lightbox-image]');
      let sequence = 0;
      async function open(kind) {
        const url = `/${kind}-${width}-${++sequence}.jpg`;
        await opener.evaluate((button, url) => { button.closest('[data-memory-card]').dataset.memoryImage = url; }, url);
        await opener.click();
        await modal.waitFor({state:'visible'});
        await page.waitForFunction(() => {
          const img = document.querySelector('[data-memory-lightbox-image]');
          return img.dataset.imageState === 'pending' && !img.complete;
        });
        if (kind === 'partial') await page.waitForFunction(() => document.querySelector('[data-memory-lightbox-image]').naturalWidth > 0);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        return url;
      }
      async function closed() {
        await modal.waitFor({state:'hidden'});
        assert(await opener.evaluate(button => document.activeElement === button), 'Closing restores photo focus');
        assert.equal(await page.locator('dialog:modal').count(), 0);
        assert(!await page.evaluate(() => document.documentElement.classList.contains('is-memory-lightbox-open')));
      }
      for (const kind of ['empty', 'partial']) {
        for (const method of ['button', 'escape', 'backdrop']) {
          await open(kind);
          if (method === 'button') {
            assert(await page.locator('[data-memory-close]').evaluate(button => {
              const r = button.getBoundingClientRect();
              return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === button;
            }), 'Pending image must not intercept the close button');
            await page.locator('[data-memory-close]').click({timeout:1500});
          } else if (method === 'escape') await page.keyboard.press('Escape');
          else await page.mouse.click(2, 2);
          await closed();
        }
      }
      // A late old response must not close or change a newly opened photo.
      const oldURL = await open('partial');
      await page.locator('[data-memory-close]').click();
      await closed();
      const currentURL = await open('partial');
      pending.get(oldURL)?.end(image.subarray(-2));
      assert.equal(await photo.getAttribute('src'), currentURL);
      assert(await modal.evaluate(el => el.open));
      pending.get(currentURL).end(image.subarray(-2));
      await page.waitForFunction(() => document.querySelector('[data-memory-lightbox-image]').dataset.imageState === 'ready');
      await page.locator('[data-memory-close]').click();
      await closed();
      await opener.evaluate(button => { button.closest('[data-memory-card]').dataset.memoryImage = '/failed.jpg'; });
      await opener.click();
      await page.waitForFunction(() => document.querySelector('[data-memory-lightbox-image]').dataset.imageState === 'error');
      await page.locator('[data-memory-close]').click();
      await closed();
      await opener.evaluate(button => { button.closest('[data-memory-card]').dataset.memoryImage = '/ready.jpg'; });
      await opener.click();
      await page.waitForFunction(() => document.querySelector('[data-memory-lightbox-image]').dataset.imageState === 'ready');
      await page.locator('[data-memory-close]').click();
      await closed();
      assert.deepEqual(errors, []);
      await page.close();
      console.log(`PASS ${width}px: hung/partial/failed/ready image, button/Escape/backdrop, focus and reopen`);
    }
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
