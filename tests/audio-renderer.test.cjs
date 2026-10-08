const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function fixture(){
 let now=0,id=0,reads=0,budgets=0,powers=0,resizes=0,draws=0,cost=0;
 const frames=new Map(),observers=[],classes=new Set(),cover={style:{}},body={};
 const root={classList:{contains:k=>classes.has(k)},querySelector:()=>cover};
 const canvas={getBoundingClientRect(){reads++;return {width:620,height:260};},set width(v){resizes++;},set height(v){resizes++;}};
 const ctx={setTransform(){},createLinearGradient:()=>({addColorStop(){}}),clearRect(){draws++;now+=cost;},fillRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){}};
 class Observer{constructor(fn){this.fn=fn;observers.push(this);}observe(target){this.target=target;}disconnect(){this.target=null;}}
 const query={matches:false,addEventListener(){},removeEventListener(){}};
 const document={body,hidden:false};
 const window={devicePixelRatio:1,matchMedia:()=>query,ResizeObserver:Observer};
 const math=Object.create(Math);math.pow=(...args)=>{powers++;return Math.pow(...args);};
 const freq=new Uint8Array(1024),wave=new Uint8Array(2048);
 const data={sampleRate:48000,freqData:freq,waveData:wave,analyser:{getByteFrequencyData:f=>f.fill(110),getByteTimeDomainData:w=>w.fill(144)}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../static/js/tools/audio-visualizer-renderer.js'),'utf8'),{
  window,document,MutationObserver:Observer,ResizeObserver:Observer,Math:math,
  getComputedStyle:()=>({getPropertyValue:()=>''}),performance:{now:()=>now},
  requestAnimationFrame:fn=>{frames.set(++id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id)
 });
 const renderer=window.SonglineCreateAudioVisualizerRenderer({root,canvas,ctx,perfBudget(){budgets++;return {low:false,dpr:1.5,interval:1000/60};},getAudioData:()=>data,updateLocalAudioMeta(){}});
 function tick(t){now=t;const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn(t));}
 function state(on){on?classes.add('is-playing'):classes.delete('is-playing');observers.find(o=>o.target===root).fn();}
 return {renderer,tick,state,document,frames,query,classes,cover,stats:()=>({reads,budgets,powers,resizes,draws}),cost:v=>{cost=v;}};
}
test('empty and paused studio park frames; playback and resize can wake them',()=>{
 const f=fixture();f.renderer.start();f.tick(17);assert.equal(f.frames.size,0);
 f.state(true);for(let i=2;i<32;i++)f.tick(i*1000/60);assert.equal(f.frames.size,1);
 f.state(false);for(let i=32;i<70;i++)f.tick(i*1000/60);assert.equal(f.frames.size,0);
 assert.equal(f.cover.style.transform,'scale(1.0000)');
 const idle=f.stats().draws;f.tick(2000);assert.equal(f.stats().draws,idle);
 f.renderer.invalidate();assert.equal(f.frames.size,1);f.tick(2100);assert.equal(f.frames.size,0);
 f.state(true);f.tick(2200);assert.equal(f.frames.size,1);f.renderer.stop();assert.equal(f.frames.size,0);
 f.renderer.invalidate();assert.equal(f.frames.size,0,'Disposed renderer never starts a new frame');
});
test('live draws reuse logarithmic bands, canvas buffers and layout reads',()=>{
 const f=fixture();f.renderer.start();f.tick(17);f.state(true);f.tick(34);
 const before=f.stats();for(let i=3;i<120;i++)f.tick(i*1000/60);
 const after=f.stats();
 for(const key of ['reads','budgets','powers','resizes'])assert.equal(after[key],before[key],key+' stays cached');
 assert(after.draws-before.draws>105,'Light drawing pipeline targets display cadence rather than 20 fps');
 f.document.hidden=true;f.renderer.handleVisibility(true);assert.equal(f.frames.size,0);
 f.document.hidden=false;f.renderer.handleVisibility(false);assert.equal(f.frames.size,1);
 f.renderer.stop();
});
test('expensive frames adapt down and recover with hysteresis',()=>{
 const f=fixture();f.cost(8);f.renderer.start();f.state(true);
 for(let i=1;i<=100;i++)f.tick(i*1000/60);
 let before=f.stats().draws;for(let i=101;i<=160;i++)f.tick(i*1000/60);
 assert(f.stats().draws-before<=32,'Sustained drawing cost reduces cadence');
 f.cost(0);for(let i=161;i<=620;i++)f.tick(i*1000/60);
 before=f.stats().draws;for(let i=621;i<=680;i++)f.tick(i*1000/60);
 assert(f.stats().draws-before>55,'Fast frames eventually restore smooth cadence');
 f.renderer.stop();
});
test('reduced motion lowers drawing cadence without losing playback wakeups',()=>{
 const f=fixture();f.query.matches=true;f.renderer.start();f.state(true);
 for(let i=1;i<=60;i++)f.tick(i*1000/60);
 assert(f.stats().draws<=9);assert.equal(f.cover.style.transform,undefined);
 f.state(false);for(let i=61;i<=110;i++)f.tick(i*1000/60);assert.equal(f.frames.size,0);
 f.renderer.stop();
});
