const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

for (const [name,upstream] of [['Caddyfile.compose','blog-admin:8080'],['Caddyfile','127.0.0.1:8080']]) {
 test(`${name} routes runtime Markdown and media to Go without stripping paths`, () => {
  const config = fs.readFileSync(path.join(__dirname,'../deploy',name),'utf8');
  for (const [matcher,prefix] of [['markdownSources','md-source'],['uploadedMedia','uploads']]) {
   assert(config.includes(`@${matcher} path /${prefix}/*`),`missing ${prefix} matcher`);
   const handler = config.match(new RegExp(`handle\\s+@${matcher}\\s*\\{([^}]+)\\}`));
   assert(handler,`missing ${prefix} handler preserving the full URL`);
   assert(handler[1].includes(`reverse_proxy ${upstream}`),`incorrect ${prefix} upstream`);
  }
 });
}
