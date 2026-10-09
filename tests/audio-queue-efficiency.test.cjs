const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../static/js/tools/audio-visualizer.js'),'utf8');
function functions(names){return names.map(name=>source.match(new RegExp('^    function '+name+'\\([^]*?^    }','m'))[0]).join('\n');}
class Node{
 constructor(){this.children=[];this.dataset={};this.classes=new Set();this.attrs=new Map();this.textContent='';this.mutations=0;this.classList={add:c=>this.classes.add(c),remove:c=>this.classes.delete(c)};}
 set className(value){this.classes=new Set(value.split(/\s+/));}
 appendChild(node){this.insertBefore(node,null);}
 insertBefore(node,before){if(node.parentNode)node.remove();this.children.splice(before?this.children.indexOf(before):this.children.length,0,node);node.parentNode=this;this.mutations++;}
 remove(){if(this.parentNode){const parent=this.parentNode;parent.children.splice(parent.children.indexOf(this),1);parent.mutations++;this.parentNode=null;}}
 setAttribute(k,v){this.attrs.set(k,v);}getAttribute(k){return this.attrs.get(k)||null;}removeAttribute(k){this.attrs.delete(k);}
 contains(node){return this===node||this.children.some(child=>child.contains(node));}
 closest(selector){for(let node=this;node;node=node.parentNode)if(selector.split(',').some(s=>node.classes.has(s.trim().slice(1))))return node;return null;}
}
function fixture(count=300){
 const f={window:{},uiContent(node,value){node.textContent=value;},uiText(node,value){node.textContent=value;},playlist:Array.from({length:count},(_,i)=>({file:{name:'track-'+i+'.wav'},title:'曲目 '+i,artist:''})),playlistRows:new Map(),playlistDirty:true,activePlaylistRow:null,playlistList:new Node(),currentIndex:0,disposed:false,document:{createElement:()=>new Node()},showPlaylist(){},updatePlaybackState(){},played:[],removed:[]};
 f.playPlaylistIndex=i=>f.played.push(i);f.removePlaylistItem=i=>f.removed.push(i);
 vm.createContext(f);vm.runInContext(functions(['trackFields','createPlaylistRow','updatePlaylistRow','renderPlaylist','onPlaylistClick']),f);f.renderPlaylist();return f;
}
test('300-track queue reuses rows for selection and targeted metadata/overrides',()=>{
 const f=fixture(),rows=[...f.playlistList.children],mutations=f.playlistList.mutations;
 for(const index of [1,299,17,0]){f.currentIndex=index;f.renderPlaylist();f.playlist[index].artist='作者 '+index;f.renderPlaylist(f.playlist[index]);}
 assert(f.playlistList.children.every((row,index)=>row===rows[index]));assert.equal(f.playlistList.mutations,mutations);
 assert.equal(rows.filter(row=>row.classes.has('is-active')).length,1);assert.equal(f.playlistRows.get(f.playlist[0]).main.getAttribute('aria-current'),'true');
 const item=f.playlist[17];item.overrides={title:'手动标题',artist:'手动作者'};f.renderPlaylist(item);
 assert.equal(f.playlistRows.get(item).title.textContent,'手动标题');assert.equal(f.playlistRows.get(item).meta.textContent,'手动作者');
 item.overrides.artist='';item.artist='';f.renderPlaylist(item);assert.equal(f.playlistRows.get(item).meta.parentNode,null,'An absent author keeps the original compact DOM');
 assert(!source.includes("main.addEventListener('click'"));assert(!source.includes("remove.addEventListener('click'"));
});
test('queue removal reindexes retained controls; delegated actions reject detached rows',()=>{
 const f=fixture(5),stale=f.playlistRows.get(f.playlist[1]),survivor=f.playlistRows.get(f.playlist[3]);
 f.playlist.splice(1,1);f.playlistDirty=true;f.currentIndex=2;f.renderPlaylist();
 assert.equal(f.playlistRows.size,4);assert.equal(f.playlistList.children[2],survivor.row);assert.equal(survivor.row.dataset.index,'2');
 f.onPlaylistClick({target:survivor.title});assert.deepEqual(f.played,[2]);
 let stopped=0;f.onPlaylistClick({target:survivor.remove,stopPropagation(){stopped++;}});assert.deepEqual(f.removed,[2]);assert.equal(stopped,1);
 f.onPlaylistClick({target:stale.main});assert.deepEqual(f.played,[2]);
 f.playlist=[];f.currentIndex=-1;f.playlistDirty=true;f.renderPlaylist();assert.equal(f.playlistRows.size,0);assert.equal(f.playlistList.children.length,0);assert.equal(f.activePlaylistRow,null);
});
test('empty track names still have accessible labels and retired state classes have no writers',()=>{
 const f=fixture(1);f.playlist[0].title='';f.playlist[0].file.name='.wav';f.renderPlaylist(f.playlist[0]);
 assert.equal(f.playlistRows.get(f.playlist[0]).main.getAttribute('aria-label'),'播放 ');
 for(const marker of ['is-play-mode-single','is-play-mode-list','is-play-mode-shuffle','is-playlist-collapsed'])assert(!source.includes(marker));
 assert.equal((source.match(/    bindSourceCards\(\);/g)||[]).length,1,'Source cards have one binding entry');
 assert(!source.includes('item.parsed')&&!source.includes('parsed:false'),'Metadata readiness is already owned by tagsPromise');
});
