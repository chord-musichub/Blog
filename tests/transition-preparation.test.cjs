const {test}=require('node:test'), assert=require('node:assert/strict'), vm=require('node:vm');
const code=require('node:fs').readFileSync(require('node:path').join(__dirname,'../static/js/page-transition-system.js'),'utf8');
const preload=code.slice(code.indexOf('  function preloadPageStyles('),code.indexOf('  function syncPageStyles('));
const navigate=code.slice(code.indexOf('  async function navigate('),code.indexOf('  function previousPageDelta('));
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function link(href,media='') {
 return {href:new URL(href,'https://blog.test').href,media,rel:'stylesheet',dataset:{},id:'original',getAttribute:name=>name==='href'?href:null,cloneNode(){return link(href,media);},removeAttribute(name){delete this[name];},remove(){this.removed=true;}};
}
function parsed({styles=[],archive=null,main=true}={}) {
 return {head:{querySelector:()=>archive?{content:archive}:null,querySelectorAll:()=>styles},querySelector:()=>main?{innerHTML:'next'}:null,querySelectorAll:()=>[]};
}
function harness({pages=[parsed()],fail=null,bodyFail=false,coverFail=false}={}) {
 const calls=[],hints=[],fallback=[],main={innerHTML:'old',classList:{add(){}},querySelector:()=>null};
 let revealCover;
 const covered=new Promise((resolve,reject)=>{revealCover=coverFail?()=>reject(new Error('cover failed')):resolve;});
 const context={URL,Set,Promise,AbortController,Date,console:{warn(){}},setTimeout,clearTimeout,CustomEvent:function(name){this.type=name;},
  locked:false,queuedNavigation:null,queuedPopState:null,activeURL:'',activePath:'/',TIMELINE:{revealDuration:480},root:{},
  mainContainer:()=>main,saveCurrentHistoryState(){},priority:{getTransitionDirection:()=> 'forward'},
  window:{location:{href:'https://blog.test/',origin:'https://blog.test',assign:url=>fallback.push(url)},matchMedia:media=>({matches:media!=='print'}),setTimeout,scrollTo(){},dispatchEvent:event=>calls.push(event.type),SonglineResources:{preloadScene:()=>calls.push('scene'),bounded:promise=>promise,prepare:async()=>{},}},
  document:{head:{querySelectorAll:()=>[link('/css/shared.css?v=1')],appendChild:hint=>{hints.push(hint);calls.push('preload');}}},
  fetch:async(url,options)=>{calls.push(url);if(fail)throw fail;return {ok:true,text:async()=>{if(bodyFail)throw new Error('body failed');return 'html';}};},
  DOMParser:function(){this.parseFromString=()=>{calls.push('parse');return pages.shift();};},
  lockNavigation(){context.locked=true;},unlockNavigation(){context.locked=false;},showOverlay:()=>covered,
  startLoader(){},closeLoader(){},hideOverlay(){},settleMain(){},setEnterState(){},sweepOverlayOut(){},wait:async()=>{},
  syncDocumentShell:async(doc,url)=>calls.push('apply:'+url.href),hydrateDynamicBits:async()=>calls.push('hydrate')};
 vm.createContext(context);vm.runInContext(preload+navigate+'\nthis.run=navigate;',context);
 return {context,calls,hints,fallback,main,cover:revealCover,run:()=>context.run(new URL('https://blog.test/tools/'),{pushState:true})};
}
test('response parsing and same-origin CSS warming precede cover; application waits',async()=>{
 const style=link('/css/page.css?v=2&tone=1');style.integrity='sha256-fixture';
 const h=harness({pages:[parsed({styles:[link('/css/shared.css?v=1'),style,style,link('https://remote.test/external.css'),link('/css/print.css','print')]})]});
 const done=h.run();await flush();
 assert(h.calls.includes('scene'));assert(h.calls.includes('parse'));assert.equal(h.main.innerHTML,'old');assert(!h.calls.includes('hydrate'));
 assert.equal(h.hints.length,1);assert.equal(h.hints[0].href,'https://blog.test/css/page.css?v=2&tone=1');assert.equal(h.hints[0].rel,'preload');assert.equal(h.hints[0].as,'style');assert.equal(h.hints[0].id,undefined);
 h.cover();await done;assert.equal(h.main.innerHTML,'next');assert(h.hints.every(hint=>hint.removed));assert(h.calls.includes('hydrate'));assert.deepEqual(h.fallback,[]);
});
test('early header/body failures are handled while the cover is still pending',async()=>{
 for(const options of [{fail:new Error('header failed')},{bodyFail:true},{pages:[parsed({main:false})]}]) {
  const h=harness(options),done=h.run();await flush();assert.deepEqual(h.fallback,[]);
  h.cover();await done;assert.deepEqual(h.fallback,['https://blog.test/tools/']);assert.equal(h.context.locked,false);assert.equal(h.main.innerHTML,'old');
 }
});
test('legacy archive targets warm the final page; external targets fail closed',async()=>{
 const h=harness({pages:[parsed({archive:'/posts/?tag=linux'}),parsed({styles:[link('/css/archive.css?v=3')]})]});
 const done=h.run();await flush();assert.equal(h.calls.filter(value=>value.startsWith('https://')).length,2);h.cover();await done;
 assert(h.calls.includes('apply:https://blog.test/posts/?tag=linux'));assert(h.hints[0].removed);
 const rejected=harness({pages:[parsed({archive:'https://other.test/posts/'})]}),failure=rejected.run();await flush();rejected.cover();await failure;assert.equal(rejected.hints.length,0);assert.equal(rejected.fallback.length,1);
});
test('failed coverage cleans already created hints and never applies the page',async()=>{
 const h=harness({coverFail:true,pages:[parsed({styles:[link('/css/page.css')]})]}),done=h.run();await flush();h.cover();await done;
 assert(h.hints.every(hint=>hint.removed));assert.equal(h.main.innerHTML,'old');assert.equal(h.fallback.length,1);
});
