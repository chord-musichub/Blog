const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=file=>fs.readFileSync(path.join(__dirname,'../static/js',file),'utf8');
function key(extra={}){return Object.assign({key:' ',code:'Space',target:{closest:()=>null},preventDefault(){this.defaultPrevented=true;}},extra);}
function controller(file,name,end){
 const source=read(file),calls=[];
 const root={querySelector:()=>null};
 const context={disposed:false,destroyed:false,root,game:root,spaceHeld:false,displayMode:false,playlistCollapsed:true,nativeQueue:true,
  updatePlaylistCollapse:()=>calls.push('queue'),playlistToggleBtn:{focus:()=>calls.push('focus')},
  document:{documentElement:{contains:()=>true}},window:{removeEventListener(){}},
  togglePause:()=>calls.push('pause'),ensureAudio(){},unlockAudio(){},flap:()=>calls.push('flap'),
  keyToDir:()=> 'left',move:()=>calls.push('move'),turn:()=>calls.push('turn'),
  hasLocalAudioFile:()=>true,isTypingOrControlTarget:target=>!!target.closest('control'),toggleLocalAudioPlayback:()=>calls.push('play'),setDisplayMode:()=>calls.push('display')};
 vm.createContext(context);vm.runInContext(source.slice(source.indexOf('    function '+name+'('),source.indexOf(end,source.indexOf('    function '+name+'('))),context);
 return {context,calls,handle:event=>context[name](event)};
}
test('audio queue owns Escape and Space without toggling playback behind it',()=>{
 const f=controller('tools/audio-visualizer.js','onDocumentKeydown',"    document.addEventListener('keydown'");
 f.context.playlistCollapsed=false;
 f.handle(key());f.handle(key({key:'Escape',code:'Escape'}));assert.deepEqual(f.calls,[],'Native popover handles dismissal');
 f.context.nativeQueue=false;const escape=key({key:'Escape',code:'Escape'});f.handle(escape);
 assert.deepEqual(f.calls,['queue','focus']);assert.equal(escape.defaultPrevented,true);assert.equal(f.context.playlistCollapsed,true);
});
test('audio track editor owns shortcuts so typing cannot pause playback',()=>{
 const f=controller('tools/audio-visualizer.js','onDocumentKeydown',"    document.addEventListener('keydown'");
 f.context.root.querySelector=selector=>selector.includes('[data-av-track-dialog][open]')?{}:null;
 f.handle(key());f.handle(key({key:'Escape',code:'Escape'}));assert.deepEqual(f.calls,[]);
});
for(const [file,name,end,action] of [
 ['tools/game-2048.js','onKeydown','    function onResize(', 'pause'],
 ['tools/snake.js','handleKeydown','    function handleKeyup(', 'pause'],
 ['tools/flappy-bird.js','onKey','    function onKeyUp(', 'flap'],
 ['tools/audio-visualizer.js','onDocumentKeydown',"    document.addEventListener('keydown'", 'play']
]){
 test(file+' respects shortcut/IME ownership and key repeats',()=>{
  const f=controller(file,name,end);
  for(const flags of [{ctrlKey:true},{metaKey:true},{altKey:true},{isComposing:true},{keyCode:229},{defaultPrevented:true}])f.handle(key(flags));
  assert.deepEqual(f.calls,[]);
  f.handle(key());for(let i=0;i<20;i++)f.handle(key({repeat:true}));
  assert.deepEqual(f.calls,[action]);
  f.handle(key({key:'ArrowLeft',code:'ArrowLeft',target:{closest:selector=>selector.startsWith('[data-')?null:({})}}));assert.equal(f.calls.length,1);
  if(name==='onKeydown'||name==='handleKeydown'){
   f.handle(key({key:'ArrowLeft',code:'ArrowLeft',target:{closest:()=>({})}}));assert.equal(f.calls.at(-1),name==='onKeydown'?'move':'turn','Focused restart/resume still accepts game directions');
  }
 });
}
test('2048 single-finger swipes retain touch identity and multi-touch cancels',()=>{
 const source=read('tools/game-2048.js'),start=source.indexOf("    boardEl.addEventListener('touchstart'");
 const handlers={},moves=[],context={boardEl:{addEventListener:(name,fn)=>handlers[name]=fn},paused:false,disposed:false,touchStart:null,ensureAudio(){},move:dir=>moves.push(dir)};
 vm.createContext(context);vm.runInContext(source.slice(start,source.indexOf('\n    newGame();',start)),context);
 const touch=(identifier,x)=>({identifier,clientX:x,clientY:10});
 const one=touch(1,10),two=touch(2,200);
 handlers.touchstart({touches:[one],changedTouches:[one]});
 handlers.touchstart({touches:[one,two],changedTouches:[two]});
 handlers.touchend({changedTouches:[touch(1,100)]});assert.deepEqual(moves,[]);
 handlers.touchstart({touches:[one],changedTouches:[one]});
 handlers.touchend({changedTouches:[touch(2,100)]});assert.deepEqual(moves,[]);
 handlers.touchend({changedTouches:[touch(1,100)]});assert.deepEqual(moves,['right']);
 handlers.touchstart({touches:[one],changedTouches:[one]});handlers.touchcancel();
 handlers.touchend({changedTouches:[touch(1,100)]});assert.equal(moves.length,1);
});
test('mobile directory opens for browsing without summoning search keyboard',()=>{
 const source=read('mobile-toc.js'),start=source.indexOf('  function openDrawer(');
 for(const detail of [0,1]){
  const focuses=[],input={isConnected:true,focus:()=>focuses.push('search')},close={isConnected:true,focus:()=>focuses.push('close')};
  const ui={fab:{setAttribute(){}},drawer:{setAttribute(){},querySelector:s=>s.includes('close')?close:input}};
  const context={focusTimer:0,isMobile:()=>true,ensureUi:()=>ui,renderLinks(){},window:{clearTimeout(){},setTimeout:fn=>{fn();return 1;}},document:{documentElement:{classList:{add(){},contains:()=>true}}}};
  vm.createContext(context);vm.runInContext(source.slice(start,source.indexOf('  function closeDrawer(',start)),context);
  context.openDrawer({detail});assert.deepEqual(focuses,[detail?'close':'search']);
 }
});
test('lost keyup on blur/background cannot leave acceleration or flap held',()=>{
 const snake=read('tools/snake.js');
 const labels=[],context={fast:true,running:true,paused:false,dead:false,setState:label=>labels.push(label)};
 vm.createContext(context);vm.runInContext(snake.slice(snake.indexOf('    function releaseKeys('),snake.indexOf('    function bind(',snake.indexOf('    function releaseKeys('))),context);
 context.releaseKeys();context.releaseKeys();assert.equal(context.fast,false);assert.deepEqual(labels,['游戏中']);
 const flappy=read('tools/flappy-bird.js');
 const bird={spaceHeld:true,document:{hidden:true}};vm.createContext(bird);
 vm.runInContext(flappy.slice(flappy.indexOf('    function releaseKeys('),flappy.indexOf("    window.addEventListener('keydown'",flappy.indexOf('    function releaseKeys('))),bird);
 bird.onVisibility();assert.equal(bird.spaceHeld,false);
 bird.spaceHeld=true;bird.releaseKeys();assert.equal(bird.spaceHeld,false);
});
