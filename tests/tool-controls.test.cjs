const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const repo=path.resolve(__dirname,'..');
for(const [name,script,factory,bestKey,playerKey,cacheKey] of [
  ['2048','game-2048-leaderboard.js','SonglineCreate2048Leaderboard','songline-2048-best-v1','songline-2048-player-id-v1','songline-2048-server-top3-cache'],
  ['snake','snake-leaderboard.js','SonglineCreateSnakeLeaderboard','songline-snake-best','songline-snake-player-id-v1','songline-snake-server-top3-cache']
]){
  test(name+' automatically syncs under a stable player ID, preserves cache and retries failures',async()=>{
    const storage=new Map([[bestKey,'64']]),posts=[];
    let offline=false;
    const window={};
    vm.runInNewContext(fs.readFileSync(path.join(repo,'static/js/tools',script),'utf8'),{
      window,localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
      fetch:async(url,options)=>{
        if(offline)throw new Error('offline');
        if(options.method==='POST')posts.push(JSON.parse(options.body));
        return {ok:true,json:async()=>({scores:[{score:64}]})};
      }
    });
    const board={innerHTML:''};
    const scores=window[factory]({topScoresEl:board,bestKey,cacheKey,playerKey,getBest:()=>64});
    await scores.fetchTopScores();await scores.syncLocalBest();
    assert.equal(posts.length,1);assert.equal(posts[0].score,64);
    assert.equal(posts[0].player_id,storage.get(playerKey));assert(!posts[0].player_id.endsWith('guest'));
    assert(storage.has(cacheKey));assert(!storage.has(undefined));assert(board.innerHTML.includes('64'));
    await scores.recordTopScore(128,'gameover');await scores.recordTopScore(128,'gameover');
    assert.equal(posts.length,2,'Repeated result is deduplicated');assert.equal(posts[1].player_id,posts[0].player_id);
    offline=true;await scores.recordTopScore(256,'gameover');offline=false;
    await scores.recordTopScore(256,'gameover');assert.equal(posts.length,3,'A failed POST does not suppress a later retry');
    assert.equal(storage.get(bestKey),'64','Local best survives network failure');
  });
}
test('2048 renderer and palette use the same actual tile-value classes',()=>{
  const window={};vm.runInNewContext(fs.readFileSync(path.join(repo,'static/js/tools/game-2048-engine.js'),'utf8'),{window});
  const css=fs.readFileSync(path.join(repo,'static/css/tools/game-2048.css'),'utf8');
  for(const value of [2,4,8,16,32,64,128,256,512,1024,2048])assert(css.includes('.game-2048-tile.'+window.Songline2048Engine.tileClass(value)+'{'));
});
test('help close is synchronous, rapid reopen ignores a stale close event, and reconnect syncs only the active page',()=>{
  function element(){
    return {dataset:{},listeners:{},addEventListener(type,fn){(this.listeners[type]||=[]).push(fn);},
      emit(type,event={}){for(const fn of this.listeners[type]||[])fn(event);},dispatchEvent(event){this.emit(event.type,event);}};
  }
  const dialog=element(),bar=element(),trigger=element(),dismiss=element(),states=[],syncs=[];
  dialog.open=false;dialog.showModal=()=>{dialog.open=true;};dialog.close=()=>{dialog.open=false;};
  dialog.querySelector=()=>dismiss;
  bar.closest=()=>({querySelector:()=>dialog});bar.querySelector=()=>trigger;
  dialog.addEventListener('songline:tool-help-change',event=>states.push(event.detail.open));
  bar.addEventListener('songline:tool-sync-best',()=>syncs.push('active'));
  const document={querySelectorAll:selector=>selector==='[data-tool-actionbar]'?[bar]:dialog.open?[dialog]:[]};
  let blurs=0;trigger.blur=()=>{blurs++;document.activeElement=null;};
  const window=element();
  class CustomEvent{constructor(type,options){this.type=type;Object.assign(this,options);}}
  vm.runInNewContext(fs.readFileSync(path.join(repo,'static/js/tool-controls.js'),'utf8'),{window,document,CustomEvent,WeakMap});
  window.SonglineInitToolControls(document);window.SonglineInitToolControls(document);
  assert.equal(trigger.listeners.click.length,1,'Repeated initialization does not duplicate handlers');
  trigger.emit('click');dismiss.emit('click');assert.deepEqual(states,[true,false],'State is restored without waiting for a queued native close event');
  trigger.emit('click');dialog.emit('close');assert.deepEqual(states,[true,false,true]);
  dialog.emit('cancel',{preventDefault(){}});dialog.emit('close');assert.deepEqual(states,[true,false,true,false]);
  window.emit('online');window.emit('pageshow',{persisted:true});assert.equal(syncs.length,2);
  trigger.emit('click');document.activeElement=trigger;dismiss.emit('click',{detail:1});assert.equal(blurs,1);
  trigger.emit('click');window.emit('songline:page-transition-start');assert.equal(dialog.open,false);
});
