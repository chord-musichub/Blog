const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function fixture(min,max){
 const input=value=>({value,events:{},addEventListener(type,fn){this.events[type]=fn;}});
 const low=input(min),high=input(max),button=input(''),result={},note={classList:{toggle(){}}};
 const tool={dataset:{},querySelector(selector){return {'[data-random-min]':low,'[data-random-max]':high,'[data-random-generate]':button,'[data-random-result]':result,'[data-random-note]':note}[selector];}};
 const window={};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../static/js/tools/random-number.js'),'utf8'),{window,document:{querySelector:()=>tool},Math:Object.create(Math,{random:{value:()=>.5}})});
 window.SonglineInitRandomNumber();
 return {low,high,result,note,generate:()=>button.events.click()};
}
test('integer ranges are normalized before rounding, not expanded outside their bounds',()=>{
 for(const [low,high,value] of [['1','1','1'],['-3','-1','-2'],['2.6','1.5','2']]){
  const f=fixture(low,high);f.generate();assert.equal(f.result.textContent,value);
 }
 for(const [low,high] of [['','10'],['0.2','0.3'],['9007199254740992','9007199254740994'],['-9007199254740991','9007199254740991']]){
  const f=fixture(low,high);f.generate();assert.equal(f.result.textContent,'?');assert(f.note.textContent);
 }
});
test('IME confirmation does not trigger random-number generation',()=>{
 const f=fixture('1','10');let prevented=false;
 f.low.events.keydown({key:'Enter',isComposing:true,preventDefault(){prevented=true;}});
 assert.equal(f.result.textContent,undefined);assert.equal(prevented,false);
 f.low.events.keydown({key:'Enter',preventDefault(){prevented=true;}});
 assert.equal(f.result.textContent,'6');assert.equal(prevented,true);
});
