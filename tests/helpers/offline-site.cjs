// Shared responses for intercepted browser fixtures. Every request is fulfilled
// locally, including APIs and third-party/media URLs; nothing reaches a server.
const fs = require('node:fs');
const path = require('node:path');
const {adminStaticRoot} = require('./source-paths.cjs');
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100"><rect width="160" height="100" fill="#607d8b"/></svg>';
const types = {'.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml'};
function offlineSite({base, build, source = path.resolve(__dirname, '../..'), media = svg, api = {views:83, items:[], messages:[], scores:[]}}) {
  build = path.resolve(build);
  return route => {
    const url = new URL(route.request().url());
    if (url.origin !== base || url.pathname.startsWith('/uploads/')) return route.fulfill({body:media, contentType:'image/svg+xml'});
    if (url.pathname.includes('/api/')) return route.fulfill({json:api});
    let pathname;
    try { pathname = decodeURIComponent(url.pathname); }
    catch { return route.fulfill({status:400, body:''}); }
    const admin = pathname.startsWith('/static/');
    const root = admin ? adminStaticRoot(pathname, source) : build;
    const relative = (admin ? pathname.slice('/static/'.length) : pathname.slice(1)) + (pathname.endsWith('/') ? 'index.html' : '');
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({status:404, body:''});
    return route.fulfill({body:fs.readFileSync(file), contentType:types[path.extname(file)] || 'application/octet-stream'});
  };
}
module.exports = {offlineSite};
