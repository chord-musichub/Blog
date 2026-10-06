const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const markup=fs.readFileSync(path.join(__dirname,'../layouts/partials/transition-loader.html'),'utf8');
const source=fs.readFileSync(path.join(__dirname,'../layouts/partials/scene-entry.html'),'utf8').match(/<script>\s*([\s\S]*?)<\/script>/)[1].replace(/{{ partial "transition-loader.html" \. \| jsonify \| safeJS }}/,JSON.stringify(markup));
function entry(theme,forceDark=false,empty=false){
 const classes=new Set(),attrs={},links=[],timers=[];
 const overlays=[];
 const root={appendChild:node=>overlays.push(node),getAttribute:()=>theme,setAttribute:(key,value)=>attrs[key]=value,classList:{add:name=>classes.add(name),remove:name=>classes.delete(name)}};
 const document={documentElement:root,getElementById:()=>({textContent:JSON.stringify({light:empty?[]:['/day.png','/soil-day.png'],dark:empty?[]:['/night.png'],forceDark})}),createElement:()=>({dataset:{},remove(){this.removed=true;},classList:{add(){},remove(){}},setAttribute(key,value){this[key]=value;}}),head:{appendChild:link=>links.push(link)}};
 const window={addEventListener(){},matchMedia:()=>({matches:true})};
 vm.runInNewContext(source,{document,window,clearTimeout(){},setTimeout:(callback,delay)=>{timers.push({callback,delay});return 1;}});
 return {classes,attrs,links,timers,overlays};
}
test('entry preloads only the selected scene before adding its bounded cover',()=>{
 const light=entry('light');assert.deepEqual(light.links.map(link=>link.href),['/day.png','/soil-day.png']);
 for(const link of light.links){assert.equal(link.rel,'preload');assert.equal(link.as,'image');assert.equal(link.fetchpriority,'high');}
 assert(light.classes.has('is-scene-preparing'));assert.equal(light.attrs['aria-busy'],'true');
 assert.equal(light.overlays[0].innerHTML,markup,'Initial entry and navigation share identical loader markup');
 assert.equal(light.timers.length,1);assert.equal(light.timers[0].delay,18000);
 light.timers[0].callback();assert(!light.classes.has('is-scene-preparing'));assert.equal(light.attrs['aria-busy'],'false');
 assert(light.overlays[0].removed);
 assert.deepEqual(entry('dark').links.map(link=>link.href),['/night.png']);
 assert.deepEqual(entry('light',true).links.map(link=>link.href),['/night.png'],'Friends does not inherit the global daylight preference');
});
test('an intentionally image-free scene adds no requests or entry cover',()=>{
 const result=entry('dark',false,true);assert.equal(result.links.length,0);assert.equal(result.classes.size,0);assert.equal(result.timers.length,0);
});
