const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../static/js/pages/content/article-comments.js'),'utf8');
test('widget canvas supports transparency independently of browser color preference',()=>{
 const css=fs.readFileSync(path.join(__dirname,'../static/css/pages/content/article-comments.css'),'utf8');
 assert.match(css,/\.article-comments iframe\s*\{[^}]*color-scheme\s*:\s*light dark\s*[;}]/);
 assert.doesNotMatch(css,/color-scheme\s*:\s*normal\b/);
});
function fixture({url='https://blog.test/posts/one/',stored,blocked=false,io=true}={}){
 const listeners=new Map(),timers=new Map(),observers=[],replaces=[],posts=[],storage=new Map();let clock=0;
 if(stored!==undefined)storage.set('giscus-session',stored);
 const status={hidden:false},message={},button={hidden:false,events:new Map(),addEventListener(t,f){this.events.set(t,f);},removeEventListener(t){this.events.delete(t);}};
 const mount={children:[],replaceChildren(...nodes){this.children=nodes;}};
 const panel={id:'article-comments',isConnected:true,dataset:{repo:'chord-musichub/Blog-comments',repoId:'R_kgDOVAXXbA',category:'Announcements',categoryId:'DIC_kwDOVAXXbM4DHTm4',term:'songline:article:stable-1',backlink:'https://blog.test/posts/one/',description:'One'},setAttribute(){},querySelector(s){return ({'[data-comments-mount]':mount,'[data-comments-status]':status,'[data-comments-message]':message,'[data-comments-load]':button})[s];}};
 const html={theme:'dark',transitioning:false,classList:{contains(){return html.transitioning;}},getAttribute(){return this.theme;}};
 const document={documentElement:html,querySelectorAll(){return [panel];},createElement(){
  const frame={style:{},events:new Map(),contentWindow:{postMessage(data,origin){posts.push({data,origin});}},setAttribute(){},addEventListener(t,f){this.events.set(t,f);},removeEventListener(t){this.events.delete(t);},remove(){mount.children=mount.children.filter(n=>n!==this);}};return frame;
 }};
 const window={location:new URL(url),history:{state:{songlineCanGoBack:true,custom:42},replaceState(state,title,next){replaces.push({state,next});window.location=new URL(next);}},setTimeout(f){timers.set(++clock,f);return clock;},clearTimeout(id){timers.delete(id);},addEventListener(t,f){if(!listeners.has(t))listeners.set(t,new Set());listeners.get(t).add(f);},removeEventListener(t,f){listeners.get(t)?.delete(f);}};
 class Observer{constructor(callback){this.callback=callback;this.disconnected=false;observers.push(this);}observe(target){this.target=target;}disconnect(){this.disconnected=true;}}
 if(io)window.IntersectionObserver=Observer;
 const localStorage={getItem(k){if(blocked)throw Error('blocked');return storage.get(k)||null;},setItem(k,v){if(blocked)throw Error('blocked');storage.set(k,v);},removeItem(k){if(blocked)throw Error('blocked');storage.delete(k);}};
 vm.runInNewContext(code,{window,document,localStorage,URL,URLSearchParams,MutationObserver:Observer,IntersectionObserver:Observer});
 const emit=(t,event={})=>[...(listeners.get(t)||[])].forEach(f=>f({type:t,...event}));
 const init=()=>window.SonglineInitArticleComments(document);
 const load=()=>button.events.get('click')();
 const reply=(giscus,options={})=>emit('message',{origin:'https://giscus.app',source:mount.children[0]?.contentWindow,data:{giscus},...options});
 return {window,document,panel,mount,status,message,button,listeners,timers,observers,replaces,posts,storage,emit,init,load,reply};
}
test('lazy init is nonblocking and idempotent; messages validate origin, source and height',()=>{
 const f=fixture();f.init();f.init();assert.equal(f.mount.children.length,0);assert.equal(f.listeners.get('message').size,1);
 f.observers.find(o=>o.target===f.panel).callback([{isIntersecting:true}]);
 assert.equal(f.mount.children.length,1);f.load();assert.equal(f.mount.children.length,1);
 const frame=f.mount.children[0],params=new URL(frame.src).searchParams;
 for(const [k,v] of Object.entries({term:'songline:article:stable-1',strict:'1',inputPosition:'top',emitMetadata:'0',reactionsEnabled:'1',theme:'transparent_dark'}))assert.equal(params.get(k),v);
 f.reply({resizeHeight:400},{origin:'https://evil.test'});f.reply({resizeHeight:400},{source:{}});f.reply({resizeHeight:Infinity});f.reply({resizeHeight:'400'});
 assert.equal(f.panel.dataset.state,'loading');f.reply({resizeHeight:401.2});assert.equal(frame.style.height,'402px');assert.equal(f.panel.dataset.state,'ready');assert.equal(f.timers.size,0);
 f.document.documentElement.theme='light';f.observers[0].callback();assert.equal(f.posts.at(-1).origin,'https://giscus.app');assert.equal(f.posts.at(-1).data.giscus.setConfig.theme,'light');
 f.document.documentElement.transitioning=true;
 f.emit('songline:page-transition-start');assert.equal(f.mount.children.length,0);assert.equal(f.listeners.get('message').size,0);assert(f.observers.every(o=>o.disconnected));assert.equal(f.button.events.size,0);
 f.init();assert.equal(f.listeners.get('message').size,0,'Queued scans cannot revive a departing panel');
 f.document.documentElement.transitioning=false;
 f.init();f.load();assert.equal(f.mount.children.length,1);assert.equal(f.listeners.get('message').size,1);
});
test('OAuth return preserves history/hash/query; session survives page reinit even with denied storage',()=>{
 for(const blocked of [false,true]){
  const f=fixture({url:'https://blog.test/posts/one/?keep=1&giscus=fake-session#article-comments',blocked});f.init();
  assert.equal(f.replaces.length,1);assert.equal(f.replaces[0].state.custom,42);assert.equal(f.window.location.hash,'#article-comments');assert.equal(f.window.location.search,'?keep=1');
  f.load();assert.equal(new URL(f.mount.children[0].src).searchParams.get('session'),'fake-session');
  f.emit('pagehide');f.init();f.load();assert.equal(new URL(f.mount.children[0].src).searchParams.get('session'),'fake-session');
  f.reply({signOut:true});assert.equal(new URL(f.mount.children[0].src).searchParams.get('session'),'');assert.equal(f.storage.has('giscus-session'),false);
 }
});
test('corrupt session, first comment, auth expiry, failure and finite retries',()=>{
 const f=fixture({stored:'not-json',io:false});f.init();assert.equal(f.storage.size,0);f.load();
 f.reply({error:'Discussion not found'});assert.equal(f.panel.dataset.state,'loading');f.reply({resizeHeight:380});assert.equal(f.panel.dataset.state,'ready');
 f.reply({error:'API rate limit exceeded'});assert.equal(f.panel.dataset.state,'error');assert.equal(f.mount.children.length,0);
 f.load();assert.equal(f.panel.dataset.state,'loading');[...f.timers.values()][0]();assert.equal(f.panel.dataset.state,'error');
 const auth=fixture({stored:JSON.stringify('expired')});auth.init();auth.load();auth.reply({error:'Bad credentials'});
 assert.equal(new URL(auth.mount.children[0].src).searchParams.get('session'),'');auth.reply({error:'Bad credentials'});assert.equal(auth.panel.dataset.state,'error');assert.equal(auth.timers.size,0);
});
test('persisted pagehide keeps the widget usable and permanent departure removes every listener',()=>{
 const f=fixture();f.init();f.load();f.reply({resizeHeight:380});const frame=f.mount.children[0];
 for(let i=0;i<3;i++){f.emit('pagehide',{persisted:true});f.emit('pageshow',{persisted:true});assert.equal(f.mount.children[0],frame);assert.equal(f.listeners.get('message').size,1);}
 f.reply({resizeHeight:410});assert.equal(frame.style.height,'410px');assert.equal(f.panel.dataset.state,'ready');
 f.emit('pagehide',{persisted:false});assert.equal(f.mount.children.length,0);assert.equal(f.listeners.get('pageshow').size,0);assert.equal(f.listeners.get('message').size,0);assert(f.observers.every(o=>o.disconnected));
});
test('same-theme observations do not repeat messages; iframe load and retries resynchronize',()=>{
 const f=fixture();f.init();f.load();const observer=f.observers[0],frame=f.mount.children[0];
 observer.callback();for(let i=0;i<20;i++)observer.callback();assert.equal(f.posts.length,1);
 frame.events.get('load')({type:'load'});assert.equal(f.posts.length,2,'Load resends config if an earlier message preceded the iframe listener');
 f.document.documentElement.theme='light';observer.callback();observer.callback();assert.equal(f.posts.length,3);
 f.reply({error:'offline'});f.load();observer.callback();assert.equal(f.posts.length,4,'A fresh iframe owns a fresh theme state');
});

test('comment language follows the interface without replacing the iframe or its draft',()=>{
 const f=fixture();let language='en';
 f.window.SonglineI18n={getLanguage:()=>language,t:text=>text,setText(node,value){node.textContent=value;}};
 f.init();f.load();const frame=f.mount.children[0];assert.equal(new URL(frame.src).pathname,'/en/widget');
 f.observers[0].callback();assert.equal(f.posts.at(-1).data.giscus.setConfig.lang,'en');
 language='zh';f.observers[0].callback();assert.equal(f.posts.at(-1).data.giscus.setConfig.lang,'zh-CN');assert.equal(f.mount.children[0],frame);
 f.emit('pagehide');assert(f.observers.every(o=>o.disconnected));
});
