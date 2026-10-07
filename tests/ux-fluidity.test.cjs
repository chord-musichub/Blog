const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=name=>fs.readFileSync(path.join(__dirname,'../static/js',name),'utf8');
const archive=read('pages/archive/index.js'),transition=read('page-transition-system.js');
test('archive batches input without committing partial IME text or detached DOM',async()=>{
 const code=archive.slice(archive.indexOf('    function scheduleQuery()'),archive.indexOf('    function records('));
 const calls=[],context={composing:false,searchScheduled:false,archive:{isConnected:true},input:{value:'start'},setQuery:value=>calls.push(value)};
 vm.createContext(context);vm.runInContext(code,context);
 for(let i=0;i<20;i++){context.input.value='text '+i;context.scheduleQuery();}
 await Promise.resolve();assert.deepEqual(calls,['text 19']);
 context.composing=true;context.scheduleQuery();await Promise.resolve();assert.equal(calls.length,1);
 context.composing=false;context.scheduleQuery();context.archive.isConnected=false;await Promise.resolve();assert.equal(calls.length,1);
 context.archive.isConnected=true;context.scheduleQuery();context.composing=true;await Promise.resolve();assert.equal(calls.length,1);
});
test('locked same-page clicks are consumed without changing modified/hash/external link policy',()=>{
 const code=transition.slice(transition.indexOf('  function shouldHandleLink('),transition.indexOf('  function saveCurrentHistoryState('));
 const context={locked:true,window:{location:new URL('https://example.test/tools/')},URL};vm.createContext(context);vm.runInContext(code,context);
 const link=(href,attrs={})=>({href:new URL(href,context.window.location).href,target:attrs.target||'',closest:()=>attrs.ignore,getAttribute:name=>name==='href'?href:null,hasAttribute:name=>!!attrs[name]});
 assert.equal(context.shouldHandleLink(link('/tools/')),true);
 assert.equal(context.shouldHandleLink(link('/friends/')),true);
 for(const item of [link('#section'),link('https://external.test/'),link('/friends/',{target:'_blank'}),link('/friends/',{download:true}),link('/friends/',{ignore:true})])assert.equal(context.shouldHandleLink(item),false);
 context.locked=false;assert.equal(context.shouldHandleLink(link('/tools/')),false);
});
test('instant article entry does not inherit global smooth scroll; TOC clicks stay smooth',()=>{
 const source=read('article-reading.js');
 const code=source.slice(source.indexOf('  function articleHeaderOffset('),source.indexOf('  window.SonglineScrollToArticleHeading'));
 const moves=[],target={getBoundingClientRect:()=>({top:400}),classList:{remove(){},add(){}}};
 const context={window:{pageYOffset:200,scrollTo:options=>moves.push(options),requestAnimationFrame(){}},document:{getElementById:()=>target,querySelector:()=>({getBoundingClientRect:()=>({height:72})})},decodeHashId:id=>id};
 vm.createContext(context);vm.runInContext(code,context);
 assert(context.scrollToArticleHeading('chapter',true));assert(context.scrollToArticleHeading('chapter',false));
 assert.deepEqual(moves.map(move=>[move.top,move.behavior]),[[506,'instant'],[506,'smooth']]);
});
