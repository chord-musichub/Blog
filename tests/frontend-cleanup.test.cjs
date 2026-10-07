const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const walk=d=>fs.readdirSync(path.join(root,d),{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
test('retired scripts and the slider stylesheet have no delivery entry',()=>{
  const files=['web/static/admin-control-polish.js','web/static/admin-mobile.js','web/static/space-ribbons.js','static/css/navigation-motion.css'];
  const entry=walk('layouts').concat(walk('web/templates')).map(read).join('\n');
  for(const file of files){assert(!fs.existsSync(path.join(root,file)),file+' is removed');assert(!entry.includes(path.basename(file)),file+' has no template entry');}
  assert(fs.existsSync(path.join(root,'static/js/space-ribbons.js')),'Keep the active planetary-trail background');
});
test('boot foundation is home-only and navigation feedback stays in the existing cascade slot',()=>{
  const styles=read('layouts/partials/assets/page-styles.html');
  assert.match(styles,/{{ if \.IsHome }}\s*<link id="songline-home-runtime-style"[^>]*site-runtime\.css/);
  assert(!styles.includes('navigation-motion.css'));
  const navigation=read('static/css/navigation.css');
  assert(navigation.indexOf('.modern-nav-links{')>navigation.indexOf('has-desktop-fixed-nav'));
  for(const selector of ['.modern-nav-links a:focus-visible','.header-icons .header-submit-link'])assert(navigation.includes(selector));
  assert(!read('static/css/site-runtime.css').includes('.boot-panel'),'Old split-door boot UI is not shipped');
});
test('removed component families do not survive as positive CSS rules',()=>{
  const css=walk('static/css').filter(f=>f.endsWith('.css')).map(read).join('\n').replace(/\/\*[\s\S]*?\*\//g,'');
  for(const name of ['game-2048-sync','leaderboard-sync-btn','recommended-grid','content-area-card','songline-nav-slider','nav-swap-layer','live-page-enter','page-loading-pill','av-bridge-card','snake-help']){
    assert(!new RegExp('\\.'+name+'(?=[\\s:{,.#>+~\\[])').test(css),name+' has no remaining rule');
  }
  for(const name of ['tile-v-2','tile-v-2048','toc-depth-6','md-indent-6','cover-mode-contain'])assert(css.includes('.'+name),'Keep dynamically generated '+name);
});
test('typing uses stable character nodes and only writes changed metrics',()=>{
  const script=read('static/js/tools/typing-practice.js');
  assert(!script.includes('textEl.innerHTML ='));
  for(const code of ['textEl.replaceChildren(fragment)','characterNodes[i].className','element.textContent !== value','textEl.scrollTop = 0'])assert(script.includes(code));
});
test('reveal observer disconnects on departure or once all targets are visible',()=>{
  for(const finish of ['departure','visible']){
    const items=[{classList:{add(){}} ,closest:()=>null},{classList:{add(){}} ,closest:()=>null}];
    items.forEach(e=>e.classList.contains=()=>false);
    const events=new Map();let observer;
    const window={matchMedia:()=>({matches:false}),addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name),IntersectionObserver:true};
    class Observer{constructor(fn){this.callback=fn;this.disconnected=0;observer=this;}observe(){}unobserve(){}disconnect(){this.disconnected++;}}
    vm.runInNewContext(read('static/js/scroll-reveal.js'),{window,document:{querySelectorAll:()=>items},IntersectionObserver:Observer});
    assert(events.has('songline:page-transition-start'));
    if(finish==='departure')events.get('songline:page-transition-start')();else observer.callback(items.map(target=>({target,isIntersecting:true})));
    assert.equal(observer.disconnected,1);assert(!events.has('songline:page-transition-start'));
  }
});
