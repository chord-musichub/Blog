const path = require('node:path');
const repo = path.resolve(__dirname, '../..');
const shared = new Set(['i18n.js', 'i18n-catalog.js', 'markdown-renderer.js', 'resource-readiness.js', 'document-transition.js', 'i18n.css']);
function adminStaticRoot(pathname, source = repo) {
  const name = pathname.slice('/static/'.length);
  return shared.has(name)
    ? path.join(source, 'frontend/shared', name.endsWith('.css') ? 'css' : 'js')
    : path.join(source, 'frontend/admin/static');
}
function readGitSource(file, ref = 'HEAD') {
  const {spawnSync} = require('node:child_process');
  const legacyShared = {
    'frontend/shared/js/resource-readiness.js':'web/static/resource-readiness.js',
    'frontend/shared/js/document-transition.js':'web/static/document-transition.js',
    'frontend/shared/js/i18n.js':'static/js/i18n.js',
    'frontend/shared/js/i18n-catalog.js':'static/js/i18n-catalog.js',
    'frontend/shared/js/markdown-renderer.js':'static/js/markdown-renderer.js',
    'frontend/shared/css/i18n.css':'static/css/i18n.css'
  };
  const legacy = legacyShared[file] || file.replace(/^frontend\/site\//,'').replace(/^frontend\/admin\//,'web/');
  for (const candidate of new Set([file,legacy])) {
    const result = spawnSync('git',['show',ref+':'+candidate],{cwd:repo,encoding:'utf8'});
    if (result.status === 0) return result.stdout;
  }
  throw Error('Missing baseline source: '+ref+':'+file);
}
module.exports = {adminStaticRoot,readGitSource};
