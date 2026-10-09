// Local HTTP preserves real browser caching; no route interception or live APIs.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const types = {'.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml', '.json':'application/json'};
async function serve(source, {delays = false, instrument = false, faults = new Map()} = {}) {
  source = path.resolve(source);
  assert(fs.existsSync(path.join(source, 'public/index.html')), 'Provide an isolated Hugo source and build');
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://fixture.test');
    requests.push({url:req.url, method:req.method, at:Date.now()});
    res.setHeader('Content-Security-Policy', "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-src 'none'");
    if (/^\/(?:write\/|static\/)?api\//.test(url.pathname)) {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({views:83, items:[], messages:[], scores:[]}));
    }
    if (url.pathname === '/runtime-config.js') {
      res.setHeader('Content-Type', 'application/javascript');
      return res.end('window.SONGLINE_API_BASE="/api";');
    }
    const root = path.join(source, url.pathname.startsWith('/static/') ? 'web/static' : 'public');
    let relative;
    try { relative = decodeURIComponent(url.pathname.replace(/^\/static\//, '/')).slice(1); }
    catch { res.writeHead(400); return res.end(); }
    const file = path.resolve(root, relative + (url.pathname.endsWith('/') ? 'index.html' : ''));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404); return res.end();
    }
    const ext = path.extname(file);
    if (delays) await new Promise(resolve => setTimeout(resolve, ext === '.css' ? 180 : url.pathname.includes('/background/') ? 300 : ext === '.html' ? 40 : 0));
    if (faults.has(url.pathname)) { res.writeHead(faults.get(url.pathname)); return res.end('fixture failure'); }
    let body = fs.readFileSync(file);
    if (instrument && url.pathname === '/js/page-transition-system.js') {
      body = Buffer.from(body.toString()
        .replace('var startedAt = Date.now();', 'var startedAt = Date.now(); window.__interactionStartAt = performance.now();')
        .replace('await showOverlay(direction);', 'await showOverlay(direction); window.__interactionCoverAt = performance.now();')
        .replace('sweepOverlayOut(direction);', 'window.__interactionRevealAt = performance.now(); sweepOverlayOut(direction);'));
    }
    res.setHeader('Content-Type', types[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', ext === '.html' ? 'no-cache' : 'public, max-age=31536000');
    res.end(body);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {origin:'http://127.0.0.1:' + server.address().port, requests, faults, close:() => new Promise(resolve => {server.closeAllConnections(); server.close(resolve);})};
}
async function launch() {
  return chromium.launch({headless:true, executablePath:process.env.BLOG_BROWSER_PATH || '/opt/google/chrome/chrome', args:['--no-sandbox']});
}
async function fixture(browser, source, options = {}) {
  const server = await serve(source, options);
  const width = options.width || 1440;
  const context = await browser.newContext({viewport:{width, height:900}, hasTouch:width < 981, isMobile:width < 981, reducedMotion:options.reduced ? 'reduce' : 'no-preference'});
  await context.addInitScript(theme => {
    localStorage.setItem('songline-theme', theme);
    localStorage.setItem('songline-privacy-v1', JSON.stringify({version:1, statistics:false, expires:Date.now()+86400000}));
    sessionStorage.setItem('songline-home-boot-v21.4', '1');
    let seed = 42; Math.random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  }, options.theme || 'dark');
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', {rate:options.cpu || 1});
  return {...server, context, page, errors, cdp, close:async () => {await context.close(); await server.close();}};
}
async function ready(page, origin, route) {
  await page.goto(origin + route);
  await page.evaluate(() => SonglinePageModules.ready(document));
  await page.waitForFunction(() => !document.documentElement.classList.contains('is-scene-preparing'));
}
module.exports = {fixture, ready, launch};
