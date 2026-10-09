const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const read=p=>fs.readFileSync(p,'utf8');
function fixture(stored,denied=false){
 const events={},storage=new Map([['songline-language',stored]]),root={lang:'',dataset:{},hasAttribute:()=>false};
 const document={readyState:'loading',documentElement:root,addEventListener:(name,fn)=>events[name]=fn,querySelector:()=>null,querySelectorAll:()=>[],createTreeWalker:()=>({nextNode:()=>false})};
 const window={addEventListener(){},dispatchEvent(){}};
 const context={window,document,location:{pathname:'/'},localStorage:{getItem(k){if(denied)throw Error('denied');return storage.get(k);},setItem(k,v){if(denied)throw Error('denied');storage.set(k,v);}},CustomEvent:class{},NodeFilter:{SHOW_TEXT:4},WeakMap,Set,queueMicrotask};
 vm.runInNewContext(read('static/js/i18n-catalog.js'),context);vm.runInNewContext(read('static/js/i18n.js'),context);
 return {api:window.SonglineI18n,storage,root,context};
}
test('Chinese is the default and invalid or denied storage remains usable',()=>{
 for(const [stored,denied] of [[null,false],['fr',false],['en',true]]){
  const f=fixture(stored,denied);assert.equal(f.api.getLanguage(),'zh');assert.equal(f.api.t('首页'),'首页');
  f.api.setLanguage('en');assert.equal(f.root.lang,'en');assert.equal(f.api.t('首页'),'Home');f.api.setLanguage('zh');assert.equal(f.api.t('首页'),'首页');
 }
});
test('persisted English translates static and formatted UI without translating captured content',()=>{
 const f=fixture('en');
 assert.equal(f.api.t('账号或密码不对'),'Incorrect username or password');
 assert.equal(f.api.t('找到 1 / 37 个工具'),'Found 1 / 37 tools');
 assert.equal(f.api.t('文章 / 10 / 16 / 第 1 页，共 2 页'),'Articles / 10 / 16 / Page 1 of 2');
 assert.equal(f.api.t('已导入「首页.md」，确认后保存或发布即可。'),'Imported “首页.md”. Review, then save or publish.');
 assert.equal(f.api.t('已重命名为：首页.png'),'Renamed to: 首页.png');
 assert.equal(f.api.t('已导入「首页$&.md」，确认后保存或发布即可。'),'Imported “首页$&.md”. Review, then save or publish.');
 assert.equal(f.api.t('朋友自己的中文简介'),'朋友自己的中文简介');
 assert.equal(f.api.english('constructor'),'constructor');
 f.api.setLanguage('zh');assert.equal(f.storage.get('songline-language'),'zh');
});
test('UI setters retain source copy while content setter clears translation ownership',()=>{
 const f=fixture('en'),attrs=new Map(),node={textContent:'',setAttribute:(k,v)=>attrs.set(k,v),removeAttribute:k=>attrs.delete(k)};
 f.api.setText(node,'正在保存…');assert.equal(node.textContent,'Saving…');assert(attrs.has('data-i18n-text'));
 f.api.setContent(node,'首页');assert.equal(node.textContent,'首页');assert(!attrs.has('data-i18n-text'));
});
test('controls follow theme on public, creator, login and password request surfaces',()=>{
 for(const file of ['layouts/partials/header.html','web/templates/admin_shared.html','web/templates/login.html','web/templates/request_password.html']){
  const source=read(file),theme=source.indexOf('data-theme-toggle')>=0?source.indexOf('data-theme-toggle'):source.indexOf('data-admin-theme-toggle');
  assert(theme>=0);assert(source.indexOf('data-language-toggle')>theme,file);
 }
 assert(read('cmd/server/language_assets.go').includes('static/js/i18n.js'));
 assert(read('layouts/_default/baseof.html').includes('/js/i18n.js'));
 assert(read('web/templates/admin_shared.html').includes('/static/i18n.js'));
});

test('template translation scopes cannot encompass user-owned page content',()=>{
 for(const file of ['web/templates/home.html','web/templates/admin.html','web/templates/editor.html','layouts/partials/home/sidebar.html','layouts/_default/single.html']){
  const source=read(file);
  assert(!/<(?:main|form|body)\b[^>]*\bdata-i18n-ui(?:[\s=>])/.test(source),file);
 }
});

test('language controls display the current language while describing the next action',()=>{
 const f=fixture(null),attrs=new Map([['data-language-toggle','']]);
 const button={nodeType:1,textContent:'',title:'',querySelectorAll:()=>[],hasAttribute:k=>attrs.has(k),getAttribute:k=>attrs.get(k),setAttribute:(k,v)=>attrs.set(k,v)};
 for(const [language,text,lang,label] of [['zh','中','zh-CN','切换为英文'],['en','en','en','Switch to Chinese'],['zh','中','zh-CN','切换为英文']]){
  f.api.setLanguage(language);f.api.refresh(button);
  assert.equal(button.textContent,text);assert.equal(attrs.get('lang'),lang);assert.equal(attrs.get('aria-label'),label);assert.equal(button.title,label);
 }
 for(const file of ['layouts/partials/header.html','layouts/tools/audio-visualizer.html','web/templates/admin_shared.html','web/templates/login.html','web/templates/request_password.html','web/templates/upload.html']){
  assert.match(read(file),/<button\b[^>]*data-language-toggle[^>]*>中<\/button>/,file);
 }
});
