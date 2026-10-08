const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../static/js/pages/home/music-player.js'),'utf8');
function functions(names){return names.map(name=>{
 const match=source.match(new RegExp('^    function '+name+'\\([^]*?^    }','m'));
 assert(match,'Real player function '+name);return match[0];
}).join('\n');}
class Node{
 constructor(fragment=false){this.fragment=fragment;this.children=[];this.dataset={};this.values=new Set();this.properties=new Map();this.writes=0;this.replacements=0;this.classList={add:name=>this.values.add(name),remove:name=>this.values.delete(name)};this.style={setProperty:(key,value)=>{this.writes++;this.properties.set(key,value);}};}
 appendChild(node){if(node.fragment){for(const child of node.children)this.appendChild(child);}else{node.parent=this;this.children.push(node);}return node;}
 replaceChildren(node){this.replacements++;this.children.forEach(child=>child.parent=null);this.children=[];if(node)this.appendChild(node);}
 contains(node){return node===this||this.children.some(child=>child.contains(node));}
 closest(){return this.dataset.homeTrackIndex!==undefined?this:this.parent?.closest()||null;}
}
test('switching tracks and resolving metadata reuse all playlist rows and their focus',()=>{
 const list=new Node(),calls=[];
 const f={list,tracks:[],listTracks:null,listRows:[],listCurrent:-1,current:-1,disposed:false,
  document:{createDocumentFragment:()=>new Node(true),createElement:()=>new Node()},
  displayName:file=>file.name,loadTrack:(...args)=>calls.push(args)};
 vm.createContext(f);vm.runInContext(functions(['renderList','onPlaylistClick']),f);
 f.tracks=Array.from({length:300},(_,i)=>({file:{name:'song-'+i},title:'曲目 '+i,artist:'作者 '+i}));
 f.renderList();const rows=[...list.children];assert.equal(list.replacements,1);
 for(const index of [0,1,299,17,0]){f.current=index;f.renderList();f.tracks[index].title='标签 '+index;f.renderList();}
 assert(list.children.every((node,index)=>node===rows[index]));assert.equal(list.replacements,1,'No full list rebuild per track/tag response');
 assert.equal(rows.filter(row=>row.values.has('is-current')).length,1);assert(rows[0].values.has('is-current'));
 assert.equal(rows[0].children[0].textContent,'标签 0');
 f.onPlaylistClick({target:rows[17].children[1]});assert.deepEqual(calls,[[17,true]],'Nested labels use one delegated owner');
 const stale=rows[0];f.tracks=[];f.current=-1;f.renderList();assert.equal(list.children.length,0);assert.equal(list.replacements,2);
 f.onPlaylistClick({target:stale});assert.equal(calls.length,1,'Removed rows cannot choose a track');
 assert(!source.includes("button.addEventListener('click', function(){ loadTrack"),'No per-row listener closures');
});
function spectrum(){
 const frames=new Map();let serial=0,samples=0,level=96;
 const analyser={frequencyBinCount:128,connect(){},disconnect(){},getByteFrequencyData(buffer){samples++;buffer.fill(level);}};
 const audio={paused:false,volume:.88};
 const document={hidden:false,createDocumentFragment:()=>new Node(true),createElement:()=>new Node()};
 const window={matchMedia:()=>({matches:false}),requestAnimationFrame(fn){const id=++serial;frames.set(id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id),AudioContext:class{
  constructor(){this.state='running';this.destination={};}createAnalyser(){return analyser;}createMediaElementSource(){return {connect(){},disconnect(){}};}close(){this.state='closed';return Promise.resolve();}
 }};
 const f={window,document,audio,disposed:false,spectrumBars:new Node(),spectrumFrame:0,spectrumData:null,analyser:null,sourceNode:null,audioContext:null,bars:[],barValues:[],barBands:[],preferredVolume:.88,isMuted:false,cancelVolumeFade(){}};
 vm.createContext(f);vm.runInContext(functions(['setBarScale','resetSpectrum','createBars','ensureAnalyser','stopSpectrum','renderSpectrum','startSpectrum','destroySpectrum','onVisibilityChange']),f);
 const tick=()=>{const [id,fn]=frames.entries().next().value;frames.delete(id);fn();};
 return {f,frames,tick,get samples(){return samples;},level(value){level=value;},writes:()=>f.bars.reduce((sum,bar)=>sum+bar.writes,0)};
}
test('frequency bands are reused and identical samples write no repeated bar styles',()=>{
 const s=spectrum();s.f.startSpectrum();s.tick();const bands=s.f.barBands,first=s.writes();
 for(let i=0;i<20;i++)s.tick();assert.equal(s.writes(),first);assert.equal(s.samples,21,'The FFT remains live; only redundant DOM writes are skipped');
 assert.equal(s.f.barBands,bands,'No per-frame band rebuilding');
 s.level(220);s.tick();assert.equal(s.writes()-first,34,'Changed audio still updates every bar');
 const before=s.writes();s.f.stopSpectrum();const idle=s.writes();s.f.stopSpectrum();assert.equal(s.writes(),idle,'Repeated pause does not rewrite idle scales');assert(idle>before);
 assert.equal(s.frames.size,0);s.f.destroySpectrum();assert.equal(s.f.barBands.length,0);assert.equal(s.f.barValues.length,0);
});
test('hidden pages stop visual work without stopping audio and visible pages resume one chain',()=>{
 const s=spectrum();s.f.startSpectrum();s.tick();s.f.document.hidden=true;s.f.onVisibilityChange();
 assert.equal(s.frames.size,0);assert.equal(s.f.audio.paused,false,'Music is not paused by the visibility optimization');
 const samples=s.samples;s.f.startSpectrum();assert.equal(s.frames.size,0);assert.equal(s.samples,samples);
 s.f.document.hidden=false;s.f.onVisibilityChange();s.f.onVisibilityChange();assert.equal(s.frames.size,1);s.tick();assert.equal(s.samples,samples+1);
 s.f.destroySpectrum();s.f.disposed=true;s.f.onVisibilityChange();assert.equal(s.frames.size,0,'A disposed player cannot reopen');
});
