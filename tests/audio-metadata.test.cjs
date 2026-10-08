const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function sync(n){return Buffer.from([(n>>21)&127,(n>>14)&127,(n>>7)&127,n&127]);}
function frame(id,data){const h=Buffer.alloc(10);h.write(id);h.writeUInt32BE(data.length,4);return Buffer.concat([h,data]);}
function fixture(){
 const text=s=>Buffer.concat([Buffer.from([3]),Buffer.from(s)]);
 const frames=Buffer.concat([frame('TIT2',text('潮汐之间')),frame('TPE1',text('Songline')),frame('TALB',text('远岸')),
  frame('APIC',Buffer.concat([Buffer.from([3]),Buffer.from('image/png\0'),Buffer.from([3,0]),Buffer.from([137,80,78,71,13,10,26,10])]))]);
 return Buffer.concat([Buffer.from([73,68,51,3,0,0]),sync(frames.length),frames,Buffer.alloc(40)]);
}
function module(){
 let serial=0;const revoked=[],created=[];
 const ctx={window:{},TextDecoder,Uint8Array,Blob,console,URL:{createObjectURL:()=>{const u='blob:test-'+(++serial);created.push(u);return u;},revokeObjectURL:u=>revoked.push(u)}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../static/js/tools/audio-metadata.js'),'utf8'),ctx);
 return {api:ctx.window.SonglineAudioMetadata,revoked,created};
}
test('independent MP3 metadata covers do not revoke each other or the default consumer',async()=>{
 const m=module(),file=new Blob([fixture()]);
 const a=await m.api.read(file),b=await m.api.read(file,{independent:true}),c=await m.api.read(file,{independent:true});
 assert.equal(b.title,'潮汐之间');assert.equal(b.artist,'Songline');assert.equal(b.album,'远岸');
 assert.notEqual(a.cover,b.cover);assert.notEqual(b.cover,c.cover);assert.deepEqual(m.revoked,[]);
 m.api.revokeLastCover();assert.deepEqual(m.revoked,[a.cover]);
});
test('text-only metadata does not allocate artwork; the reader bounds file IO',async()=>{
 const m=module(),b=new Blob([fixture()]),reads=[];
 const file={slice:(start,end)=>{reads.push([start,end]);return b.slice(start,end);},arrayBuffer:()=>{throw Error('whole-file read');}};
 const info=await m.api.read(file,{cover:false});
 assert.equal(info.title,'潮汐之间');assert.equal(info.cover,'');assert.equal(m.created.length,0);
 assert.deepEqual(reads,[[0,16*1024*1024]]);
});
test('missing and truncated tags return an empty safe result',async()=>{
 const m=module();
 for(const buffer of [Buffer.alloc(64),fixture().subarray(0,14)]){
  const result=await m.api.read(new Blob([buffer]),{independent:true});
  assert.equal(result.cover,'');assert.equal(result.title,'');
 }
});
const text=s=>Buffer.concat([Buffer.from([3]),Buffer.from(s)]);
function id3(frames,version=3,flags=0){return Buffer.concat([Buffer.from([73,68,51,version,0,flags]),sync(frames.length),frames,Buffer.from([255,251,144,0]),Buffer.alloc(24)]);}
test('legacy ID3 and extended headers preserve the actual artist before album artist',async()=>{
 const m=module();
 function legacy(id,value){const data=text(value),h=Buffer.alloc(6);h.write(id);h.writeUIntBE(data.length,3,3);return Buffer.concat([h,data]);}
 const v2=await m.api.read(new Blob([id3(Buffer.concat([legacy('TT2','Legacy'),legacy('TP2','Band'),legacy('TP1','Singer')]),2)]));
 assert.equal(v2.title,'Legacy');assert.equal(v2.artist,'Singer');assert.equal(v2.sampleRate,44100);
 const ext=Buffer.alloc(10);ext.writeUInt32BE(6);
 const v3=await m.api.read(new Blob([id3(Buffer.concat([ext,frame('TPE2',text('Band')),frame('TPE1',text('Singer'))]),3,64)]));
 assert.equal(v3.artist,'Singer');assert.equal(v3.sampleRate,44100);
 const v4frame=frame('TPE1',text('Artist'));sync(text('Artist').length).copy(v4frame,4);
 const v4=await m.api.read(new Blob([id3(Buffer.concat([sync(6),Buffer.from([1,0]),v4frame]),4,64)]));
 assert.equal(v4.artist,'Artist');
 const fallback=await m.api.read(new Blob([id3(frame('TPE2',text('Band')))]));assert.equal(fallback.artist,'Band');
});
test('ID3v1 tail fallback is bounded and does not replace newer tags',async()=>{
 const tail=Buffer.alloc(128);tail.write('TAG');tail.write('Tail title',3);tail.write('Tail artist',33);
 const m=module(),result=await m.api.read(new Blob([id3(frame('TIT2',text('New title'))),tail]));
 assert.equal(result.title,'New title');assert.equal(result.artist,'Tail artist');
});
function riffChunk(id,data){const h=Buffer.alloc(8);h.write(id);h.writeUInt32LE(data.length,4);return Buffer.concat([h,data,Buffer.alloc(data.length&1)]);}
test('WAV INFO author and file sample rate survive odd chunk padding',async()=>{
 const fmt=Buffer.alloc(16);fmt.writeUInt32LE(16000,4);
 const data=Buffer.concat([Buffer.from('WAVE'),riffChunk('JUNK',Buffer.from('x')),riffChunk('fmt ',fmt),
  riffChunk('LIST',Buffer.concat([Buffer.from('INFO'),riffChunk('INAM',Buffer.from('标题\0')),riffChunk('IART',Buffer.from('作者\0'))]))]);
 const h=Buffer.alloc(8);h.write('RIFF');h.writeUInt32LE(data.length,4);
 const result=await module().api.read(new Blob([h,data]));
 assert.equal(result.title,'标题');assert.equal(result.artist,'作者');assert.equal(result.sampleRate,16000);
});
test('FLAC STREAMINFO rate and ARTIST take precedence over ALBUMARTIST',async()=>{
 const info=Buffer.alloc(34),rate=96000;info[10]=rate>>12;info[11]=(rate>>4)&255;info[12]=(rate&15)<<4;
 const le=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
 const fields=['ALBUMARTIST=Band','ARTIST=Singer','TITLE=High resolution'];
 const comments=Buffer.concat([le(0),le(fields.length),...fields.flatMap(s=>[le(Buffer.byteLength(s)),Buffer.from(s)])]);
 const block=(type,data)=>{const h=Buffer.alloc(4);h[0]=type;h.writeUIntBE(data.length,1,3);return Buffer.concat([h,data]);};
 const result=await module().api.read(new Blob([Buffer.from('fLaC'),block(0,info),block(132,comments)]));
 assert.equal(result.sampleRate,96000);assert.equal(result.artist,'Singer');assert.equal(result.title,'High resolution');
});
function atom(id,...data){const body=Buffer.concat(data),h=Buffer.alloc(8);h.writeUInt32BE(body.length+8);h.write(id,4,4,'latin1');return Buffer.concat([h,body]);}
test('M4A trailing moov is sought directly, with artist, cover and sample-entry rate',async()=>{
 const entry=Buffer.alloc(28);entry.writeUInt32BE(48000*65536,24);
 const tag=(id,value)=>atom(id,atom('data',Buffer.alloc(8),Buffer.from(value)));
 const png=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
 const moov=atom('moov',atom('udta',atom('meta',Buffer.alloc(4),atom('ilst',tag('©nam','M4A title'),tag('aART','Band'),tag('©ART','Singer'),atom('covr',atom('data',Buffer.alloc(8),png))))),
  atom('trak',atom('mdia',atom('minf',atom('stbl',atom('stsd',Buffer.alloc(8),atom('mp4a',entry)))))));
 const b=new Blob([atom('ftyp',Buffer.from('M4A \0\0\0\0')),atom('mdat',Buffer.alloc(17*1024*1024)),moov]),reads=[];
 const file={size:b.size,slice:(start,end)=>{reads.push([start,end]);return b.slice(start,end);}};
 const m=module(),result=await m.api.read(file,{independent:true});
 assert.equal(result.title,'M4A title');assert.equal(result.artist,'Singer');assert.equal(result.sampleRate,48000);assert(result.cover);
 assert(reads.length<=3);assert(reads.every(([s,e])=>e-s<=16*1024*1024),'No whole-audio read');
 assert.equal(reads.at(-1)[1]-reads.at(-1)[0],moov.length);
 const noCover=await m.api.read(b,{cover:false});assert.equal(noCover.cover,'');assert.equal(m.created.length,1);
});
test('MPEG header sample-rate families and malformed containers are safe',async()=>{
 const m=module();
 for(const [version,rateIndex,expected] of [[3,0,44100],[3,1,48000],[2,2,16000],[0,0,11025]]){
  const result=await m.api.read(new Blob([Buffer.from([255,224|(version<<3)|3,144|(rateIndex<<2),0]),Buffer.alloc(24)]));
  assert.equal(result.sampleRate,expected);
 }
 const huge=Buffer.alloc(8);huge.writeUInt32BE(0xffffffff);huge.write('moov',4);
 const result=await m.api.read(new Blob([atom('ftyp',Buffer.alloc(8)),huge]));assert.equal(result.artist,'');assert.equal(result.sampleRate,0);
});
