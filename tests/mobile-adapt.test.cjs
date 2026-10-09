const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

test('retired navigation has no resize task; orientation bursts keep one content adaptation task',()=>{
 const listeners={},tasks=new Map();let next=0,scans=0;
 const document={readyState:'complete',querySelector:()=>null,querySelectorAll:()=>{scans++;return [];}};
 const window={matchMedia:()=>({matches:true}),addEventListener:(type,callback)=>listeners[type]=callback,setTimeout:(callback,delay)=>{const id=++next;tasks.set(id,{callback,delay});return id;},clearTimeout:id=>tasks.delete(id)};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../static/js/mobile-adapt.js'),'utf8'),{window,document});
 assert.equal(listeners.resize,undefined,'No retired navigation resize listener');
 for(let i=0;i<30;i++)listeners.orientationchange();
 assert.equal(tasks.size,1);
 assert.deepEqual([...tasks.values()].map(task=>task.delay),[260]);
 const initial=scans;for(const task of tasks.values())task.callback();
 assert.equal(scans-initial,2,'one table/code scan after the orientation burst');
 const scoped={querySelectorAll:()=>{scans++;return [];}};
 listeners['songline:page-swap']({detail:{root:scoped}});
 assert.equal(scans-initial,4,'new page content is still adapted immediately');
});
