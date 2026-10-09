const assert=require('node:assert/strict');
const fs=require('node:fs');
const {launch}=require('./helpers/interaction-fixture.cjs');
const base=process.env.BLOG_DELETE_URL||'http://127.0.0.1:8092';
const out='local-only/content-delete-2026-10-09/screenshots';
(async()=>{
 fs.mkdirSync(out,{recursive:true});const browser=await launch();
 try{
  for(const width of [1440,390])for(const role of (process.env.BLOG_DELETE_ROLES||'user,owner,admin').split(',')){
   const context=await browser.newContext({viewport:{width,height:900},hasTouch:width<981});
   const page=await context.newPage(),errors=[],dialogs=[],posts=[];let cancel=false;
   page.on('pageerror',e=>errors.push(e.message));
   page.on('request',r=>{if(r.method()==='POST')posts.push(r.url())});
   page.on('dialog',async d=>{dialogs.push(d.type());if(cancel)await d.dismiss();else await d.accept()});
   await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
   async function reset(){const r=await context.request.get(base+'/fixture/reset?role='+role);assert.equal(r.status(),200);}
   async function state(){return (await context.request.get(base+'/fixture/state')).json();}
   async function visit(route){await page.goto(base+route);await page.waitForLoadState('networkidle');}
   async function remove(button){const before=posts.length;await button.click();await page.waitForLoadState('networkidle');assert.equal(posts.length,before+1,'one accepted delete sends one POST');}
   await reset();await visit(role==='admin'?'/write/admin':'/write/');
   assert.equal(await page.locator('[data-content-delete]').count(),role==='admin'?5:4,'all article states offer direct deletion');
   const pending=page.locator('[data-content-delete][action$="/pending/delete"] button');
   cancel=true;const before=posts.length;await pending.click();assert.equal(posts.length,before);assert((await state()).articles.some(a=>a.id==='pending'));
   cancel=false;
   await page.screenshot({path:`${out}/${width}-${role}-articles.png`});
   for(const status of ['draft','pending','published','rejected']){
    await remove(page.locator(`[data-content-delete][action$="/${status}/delete"] button`));
    assert(!(await state()).articles.some(a=>a.id===status),status+' removed from persisted backend');
   }
   assert.equal((await state()).articles.length,1,'another author survives member list deletions');
   if(role!=='user'){
    await visit('/write/admin');await remove(page.locator('[data-content-delete][action$="/foreign/delete"] button'));
    assert.equal((await state()).articles.length,0,'owner/admin can delete another author');
   }
   // A dirty, invalid editor must still delete after exactly one confirmation.
   await reset();await visit('/write/articles/published/edit');
   assert.equal(await page.locator('#article-delete-form').count(),1);
   await page.locator('#articleTitle').fill('');await page.locator('#md').fill('');
   const d0=dialogs.length,p0=posts.length;cancel=true;
   await page.getByRole('button',{name:'删除文章',exact:true}).click();assert.equal(posts.length,p0);
   assert((await state()).articles.some(a=>a.id==='published'));
   cancel=false;await remove(page.getByRole('button',{name:'删除文章',exact:true}));
   assert.deepEqual(dialogs.slice(d0),['confirm','confirm'],'cancel then accept; no second unsaved-change prompt');
   assert(!(await state()).articles.some(a=>a.id==='published'));
   if(role==='owner')for(const [kind,title] of [['projects','示例项目'],['memories','示例回忆']]){
    await reset();await visit('/write/compose/'+kind);
    const row=page.locator('.creator-saved-row').filter({has:page.getByText(title,{exact:false})}).first();
    assert.equal(await row.locator('details').getAttribute('open'),null,'saved editor starts collapsed');
    const button=row.locator('[data-content-delete] button');assert(await button.isVisible());
    const box=await button.boundingBox();assert(box.x>=0&&box.x+box.width<=width&&box.width>=36,'direct delete fits viewport');
    const n=posts.length;cancel=true;await button.click();assert.equal(posts.length,n);assert.equal((await state())[kind].length,2);cancel=false;
    // Even invalid required/editor fields and legacy URLs cannot block deletion.
    await row.locator('summary').click();await row.locator('input[name="title"]').fill('');
    await page.screenshot({path:`${out}/${width}-${kind}-delete.png`});
    await remove(button);assert.equal((await state())[kind].length,1);assert.equal((await state())[kind][0].title,kind==='projects'?'保留项目':'保留回忆');
   }
   assert.deepEqual(errors,[]);assert(!dialogs.includes('beforeunload'));
   console.log(`PASS ${width}px ${role}: direct all-state article deletion, cancel/confirm, invalid dirty editor${role==='owner'?', project/memory deletion without edit validation':''}`);
   await context.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
