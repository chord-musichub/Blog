const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function fixture(){
 const source=fs.readFileSync(path.join(__dirname,'../static/js/tools/audio-visualizer.js'),'utf8');
 const first={file:{name:'first.wav'},title:'First',artist:'File artist',sampleRate:16000};
 const second={file:{name:'second.wav'},title:'Second',artist:'Other artist',sampleRate:32000};
 let renders=0;
 const input=()=>{let value='';return {get value(){return value;},set value(next){value=String(next);},validity:{valid:true}};};
 const context={window:{},uiContent(node,value){node.textContent=value;},uiText(node,value){node.textContent=value;},disposed:false,playlist:[first,second],currentIndex:0,editItem:first,editDraft:{},editInitial:null,
  editTitle:input(),editArtist:input(),editRate:input(),titleEl:{},artistEl:{},
  hasLocalAudioFile:()=>true,updatePlaybackState(){},renderPlaylist(){renders++;}};
 vm.createContext(context);
 vm.runInContext(source.slice(source.indexOf('    function trackFields('),source.indexOf('    function updatePlaybackState(')),context);
 context.fillTrackEditor();
 return {context,first,second,renders:()=>renders};
}
test('closing an unchanged editor does not freeze automatically detected metadata',()=>{
 const f=fixture();f.first.artist='Late artist';f.first.title='Late title';f.first.sampleRate=48000;
 f.context.saveTrackEditor();
 assert.deepEqual(Object.keys(f.first.overrides),[]);assert.equal(f.context.titleEl.textContent,'Late title');
 assert.equal(f.context.artistEl.textContent,'Late artist');assert.equal(f.renders(),1);
});
test('manual fields are owned by one track and outrank subsequent file tags',()=>{
 const f=fixture(),c=f.context;
 c.editTitle.value=' My title ';c.editArtist.value=' My artist ';c.editRate.value='96000';c.currentIndex=1;
 c.saveTrackEditor();
 assert.equal(f.first.overrides.title,'My title');assert.equal(f.first.overrides.artist,'My artist');assert.equal(f.first.overrides.sampleRate,96000);
 assert.equal(f.second.overrides,undefined);assert.equal(c.titleEl.textContent,'Second');
 f.first.artist='Late file artist';f.first.sampleRate=44100;
 assert.equal(c.trackFields(f.first).artist,'My artist');assert.equal(c.trackFields(f.first).sampleRate,96000);
 c.currentIndex=0;c.refreshCurrentTrackText();assert.equal(c.titleEl.textContent,'My title');
});
test('empty manual fields and restore-auto remove overrides without mutating file tags',()=>{
 const f=fixture(),c=f.context;f.first.overrides={title:'Manual',artist:'Manual artist',sampleRate:96000};
 c.editDraft={...f.first.overrides};c.fillTrackEditor();c.editArtist.value='';c.editRate.value='';c.saveTrackEditor();
 assert.equal(f.first.overrides.title,'Manual');assert.equal(f.first.overrides.artist,undefined);assert.equal(f.first.overrides.sampleRate,undefined);
 assert.equal(c.trackFields(f.first).artist,'File artist');assert.equal(c.trackFields(f.first).sampleRate,16000);
 c.editItem=f.first;c.editDraft={};c.fillTrackEditor();c.saveTrackEditor();
 assert.deepEqual(Object.keys(f.first.overrides),[]);assert.equal(c.trackFields(f.first).title,'First');
});
test('disposed or removed tracks cannot be resurrected by a late dialog close',()=>{
 for(const removed of [true,false]){
  const f=fixture(),c=f.context;c.editArtist.value='Late edit';
  if(removed)c.playlist=[f.second];else c.disposed=true;
  c.saveTrackEditor();assert.equal(f.first.overrides,undefined);assert.equal(f.renders(),0);assert.equal(c.editItem,null);
 }
});
test('invalid rates retain the last valid annotation; manual text is bounded',()=>{
 const f=fixture(),c=f.context;f.first.overrides={sampleRate:44100};c.editDraft={...f.first.overrides};c.fillTrackEditor();
 c.editRate.value='-1';c.editRate.validity.valid=false;c.editArtist.value='a'.repeat(200);c.editTitle.value='b'.repeat(300);
 c.saveTrackEditor();assert.equal(f.first.overrides.sampleRate,44100);assert.equal(f.first.overrides.artist.length,160);assert.equal(f.first.overrides.title.length,240);
});
test('playback return resets locally; source-home navigation and modifier clicks stay native',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../static/js/tools/audio-visualizer.js'),'utf8'),calls=[];
 let live=true;
 const context={disposed:false,root:{classList:{contains:()=>live}},returnToSource:()=>calls.push('reset'),
  uploadBtn:{focus:()=>calls.push('focus')},returnBtn:{addEventListener(){},blur:()=>calls.push('blur')}};
 vm.createContext(context);
 vm.runInContext(source.slice(source.indexOf('    function onReturnClick('),source.indexOf('    var renderData =')),context);
 const click=extra=>Object.assign({detail:1,button:0,preventDefault(){this.defaultPrevented=true;}},extra);
 for(const flags of [{ctrlKey:true},{metaKey:true},{shiftKey:true},{altKey:true},{button:1},{button:2},{defaultPrevented:true}])context.onReturnClick(click(flags));
 assert.deepEqual(calls,[]);
 const pointer=click();context.onReturnClick(pointer);assert.equal(pointer.defaultPrevented,true);assert.deepEqual(calls,['reset','blur']);
 calls.length=0;context.onReturnClick(click({detail:0}));assert.deepEqual(calls,['reset','focus']);
 calls.length=0;live=false;const empty=click();context.onReturnClick(empty);assert.deepEqual(calls,[]);assert.equal(empty.defaultPrevented,undefined);
});
test('in-tool return opt-out is synchronized before the capture-phase navigator can run',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../static/js/tools/audio-visualizer.js'),'utf8'),attrs=new Map();let live=false;
 const context={root:{classList:{contains:()=>live}},returnBtn:{setAttribute:(k,v)=>attrs.set(k,v),toggleAttribute:(k,v)=>v?attrs.set(k,''):attrs.delete(k)}};
 vm.createContext(context);vm.runInContext(source.slice(source.indexOf('    function syncReturnButton('),source.indexOf('    function setHasTrack(')),context);
 context.syncReturnButton();assert.equal(attrs.get('aria-label'),'返回工具页');assert(!attrs.has('data-no-page-transition'));
 live=true;context.syncReturnButton();assert.equal(attrs.get('aria-label'),'返回音乐首页');assert(attrs.has('data-no-page-transition'));
 live=false;context.syncReturnButton();assert.equal(context.returnBtn.title,'返回工具页');assert(!attrs.has('data-no-page-transition'));
});
