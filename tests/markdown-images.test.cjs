const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const publicSource=fs.readFileSync(path.join(__dirname,'../static/js/markdown-renderer.js'),'utf8');
const adminSource=fs.readFileSync(path.join(__dirname,'../web/static/markdown-renderer.js'),'utf8');
function render(markdown, source=publicSource){
 const window={dispatchEvent(){}};
 vm.runInNewContext(source,{window,CustomEvent:class{}});
 return window.SonglineMarkdown.render(markdown);
}
test('public reader and creator preview use the same image policy',()=>{
 for(const markdown of ['![diagram](https://images.example.test/chart.png)', '<img src="/local.png" width="400">', '<img src="/hero.png" loading="eager">'])assert.equal(render(markdown),render(markdown,adminSource));
});
test('Markdown image URLs remain original and images load lazily',()=>{
 const html=render('![diagram](https://images.example.test/chart.png?token=abc)');
 assert(html.includes('src="https://images.example.test/chart.png?token=abc"'));
 assert(html.includes('alt="diagram"'));assert(html.includes('loading="lazy"'));assert(html.includes('decoding="async"'));
 assert(!html.includes('preview='));
});
test('raw HTML images receive safe defaults without overriding author attributes',()=>{
 const html=render('<img src="/uploads/chart.png" width="400" height="200" onerror="bad()" />');
 assert(html.includes('width="400"'));assert(html.includes('height="200"'));assert(!html.includes('onerror'));
 assert(html.includes('loading="lazy"'));assert(html.includes('decoding="async"'));
 const explicit=render('<img src="/hero.png" loading="eager" decoding="sync">');
 assert(explicit.includes('loading="eager"'));assert(explicit.includes('decoding="sync"'));assert(!explicit.includes('loading="lazy"'));
});
