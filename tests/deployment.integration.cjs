const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync, spawnSync} = require('node:child_process');
const repo = path.resolve(__dirname, '..');
const git = execFileSync('which', ['git'], {encoding:'utf8'}).trim();

// Exercise the real shell flow against a local Git repository. Only the root
// guard is disabled in fixture copies; privileged/service commands are shims.
function fixture(t, extra = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-deploy-test-'));
  t.after(() => fs.rmSync(root, {recursive:true, force:true}));
  const source = path.join(root, 'repository'), bin = path.join(root, 'bin'), app = path.join(root, 'app');
  for (const dir of [path.join(source,'deploy'),bin,path.join(app,'shared/data'),path.join(app,'releases/stable')]) fs.mkdirSync(dir,{recursive:true});
  for (const name of ['server-update.sh','release-deploy.sh','release-promote.sh','release-from-bundle.sh']) {
    let code = fs.readFileSync(path.join(repo,'deploy',name),'utf8');
    const guard = /if \[\[ \$\{EUID(?::[^}]*)?\} -ne 0 \]\]; then/;
    assert(guard.test(code),'fixture must identify the privilege guard: '+name);
    fs.writeFileSync(path.join(source,'deploy',name),code.replace(guard,'if false; then'));
  }
  fs.writeFileSync(path.join(source,'go.mod'),'module fixture\n');
  fs.writeFileSync(path.join(source,'.gitignore'),'.env\n');
  execFileSync(git,['init','-q','-b','main',source]);
  execFileSync(git,['-C',source,'config','user.name','Deployment fixture']);
  execFileSync(git,['-C',source,'config','user.email','fixture@localhost']);
  execFileSync(git,['-C',source,'config','commit.gpgsign','false']);
  execFileSync(git,['-C',source,'config','core.hooksPath',path.join(root,'no-hooks')]);
  execFileSync(git,['-C',source,'add','.']);
  execFileSync(git,['-C',source,'commit','-qm','Fixture']);
  const revision = execFileSync(git,['-C',source,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
  fs.writeFileSync(path.join(app,'shared/blog-admin.env'),'# fixture only\n');
  fs.writeFileSync(path.join(app,'shared/data/keep.json'),'keep existing data');
  fs.writeFileSync(path.join(app,'releases/stable/blog-admin'),'old binary');
  fs.symlinkSync(path.join(app,'releases/stable'),path.join(app,'current'));
  const log = path.join(root,'commands.jsonl');
  const shim = `#!/usr/bin/env python3
import json, os, pathlib, shutil, subprocess, sys
name = pathlib.Path(sys.argv[0]).name
args = sys.argv[1:]
app = pathlib.Path(os.environ['BLOG_APP_ROOT'])
log = pathlib.Path(os.environ['TEST_COMMAND_LOG'])
with log.open('a') as f: f.write(json.dumps([name, args])+'\\n')
if name == 'git':
    result = subprocess.run([os.environ['TEST_REAL_GIT'], *args])
    if args and args[0] == 'clone' and os.environ.get('TEST_ADVANCE_REMOTE') and not (app/'advanced').exists():
        (app/'advanced').touch()
        source = os.environ['BLOG_REPOSITORY_URL']
        pathlib.Path(source, 'go.mod').write_text('module changed-after-fetch\\n')
        subprocess.run([os.environ['TEST_REAL_GIT'], '-C', source, 'commit', '-qam', 'Advance branch'], check=True)
    sys.exit(result.returncode)
elif name == 'date':
    print('20261025000000')
elif name == 'go':
    if os.environ.get('TEST_BUILD_FAIL'): sys.exit(1)
    output = pathlib.Path(args[args.index('-o')+1]); output.write_text('#!/bin/sh\\nexit 0\\n'); output.chmod(0o755)
elif name == 'install':
    files=[]; directory=False; i=0
    while i<len(args):
        if args[i] in ('-o','-g','-m'): i+=2; continue
        if args[i]=='-d': directory=True
        else: files.append(args[i])
        i+=1
    if directory:
        for item in files: pathlib.Path(item).mkdir(parents=True,exist_ok=True)
    else:
        target=files[-1]
        if target=='/usr/local/sbin/songline-blog-update': target=str(app/'installed-entry')
        assert pathlib.Path(target).is_relative_to(app), target
        shutil.copyfile(files[-2],target)
elif name == 'systemctl':
    if args[0]=='is-active': sys.exit(1)
    if args==['restart','blog-admin-next.service']:
        candidate=(app/'next').resolve(); (candidate/'build/public').mkdir(parents=True,exist_ok=True); (candidate/'build/public/index.html').write_text('fixture homepage')
    if args==['restart','blog-admin.service'] and os.environ.get('TEST_PROMOTE_FAIL') and (app/'current').resolve().name!='stable': sys.exit(1)
elif name == 'nginx': sys.exit(1)
`;
  const shimPath = path.join(bin,'shim');fs.writeFileSync(shimPath,shim,{mode:0o755});
  for (const name of ['git','go','hugo','install','chown','systemctl','curl','sleep','nginx','date']) fs.symlinkSync(shimPath,path.join(bin,name));
  const env = {...process.env, PATH:bin+path.delimiter+process.env.PATH, BLOG_APP_ROOT:app, BLOG_REPOSITORY_URL:source, BLOG_HEALTH_WAIT_SECONDS:'1', TEST_REAL_GIT:git, TEST_COMMAND_LOG:log, ...extra};
  const run = (name,args=[],overrides={}) => spawnSync('bash',[path.join(source,'deploy',name),...args],{env:{...env,...overrides},encoding:'utf8',timeout:15000});
  const clones = () => fs.readFileSync(log,'utf8').trim().split('\n').map(JSON.parse).filter(([name,args])=>name==='git'&&args[0]==='clone').length;
  const unchanged = () => assert.equal(fs.readFileSync(path.join(app,'shared/data/keep.json'),'utf8'),'keep existing data');
  return {root,source,app,env,revision,run,clones,unchanged};
}

test('iteration reuses one checkout and leaves stable serving until promotion',t=>{
  const f=fixture(t),result=f.run('server-update.sh');assert.equal(result.status,0,result.stderr+result.stdout);
  assert.equal(f.clones(),1,'one upstream fetch per update');
  assert.equal(path.basename(fs.realpathSync(path.join(f.app,'current'))),'stable');
  const next=fs.realpathSync(path.join(f.app,'next'));
  assert.equal(fs.realpathSync(path.join(next,'published')),path.join(next,'build/public'));
  assert.equal(fs.realpathSync(path.join(next,'runtime/data')),path.join(f.app,'shared/data'));f.unchanged();
});

test('iteration deploys the fetched revision even if the branch advances during fetch',t=>{
  const f=fixture(t,{TEST_ADVANCE_REMOTE:'1'}),result=f.run('server-update.sh');assert.equal(result.status,0,result.stderr+result.stdout);
  const deployed=execFileSync(git,['-C',fs.realpathSync(path.join(f.app,'next')),'rev-parse','HEAD'],{encoding:'utf8'}).trim();
  assert.equal(deployed,f.revision,'deploy code and scripts from the same fetched checkout');f.unchanged();
});

test('promotion updates the entry script after success and rolls back on service failure',t=>{
  for (const fail of [false,true]) {
    const f=fixture(t,fail?{TEST_PROMOTE_FAIL:'1'}:{}),result=f.run('server-update.sh',['--promote']);
    assert.equal(result.status,fail?1:0,result.stderr+result.stdout);
    assert.equal(path.basename(fs.realpathSync(path.join(f.app,'current')))==='stable',fail);
    assert.equal(fs.existsSync(path.join(f.app,'installed-entry')),!fail);f.unchanged();
  }
});

test('direct candidate deployment still fetches once and build failure preserves stable',t=>{
  for (const fail of [false,true]) {
    const f=fixture(t,fail?{TEST_BUILD_FAIL:'1'}:{}),result=f.run('release-deploy.sh',['main']);
    assert.equal(result.status,fail?1:0,result.stderr+result.stdout);assert.equal(f.clones(),1);
    assert.equal(path.basename(fs.realpathSync(path.join(f.app,'current'))),'stable');f.unchanged();
  }
});

test('reused checkout rejects ignored local payloads before touching shared data',t=>{
  const f=fixture(t),checkout=path.join(f.root,'prepared');execFileSync(git,['clone','-q',f.source,checkout]);
  fs.writeFileSync(path.join(checkout,'.env'),'TEST_ONLY=1');
  const result=f.run('release-deploy.sh',['main'],{BLOG_RELEASE_SOURCE:checkout});
  assert.notEqual(result.status,0,'refuse to consume a checkout with local payloads');
  assert(fs.existsSync(path.join(checkout,'.env')));assert(!fs.existsSync(path.join(f.app,'shared/data/build.json')));f.unchanged();
});

test('legacy media import is configured only when needed and preserves explicit settings',t=>{
  for (const existing of [null,'', '/custom/legacy']) {
    const f=fixture(t);
    fs.mkdirSync(path.join(f.app,'shared/static/uploads'),{recursive:true});
    const envFile=path.join(f.app,'shared/blog-admin.env');
    if (existing!==null) fs.appendFileSync(envFile,'RUNTIME_STATIC_DIR='+existing+'\n');
    const releases=[];
    for (let attempt=0;attempt<2;attempt++) {
      const result=f.run('server-update.sh');assert.equal(result.status,0,result.stderr+result.stdout);
      releases.push(fs.realpathSync(path.join(f.app,'next')));
    }
    assert.notEqual(releases[0],releases[1],'same-second updates must keep separate release directories');
    for (const release of releases) assert(fs.existsSync(path.join(release,'.git')),'previous candidate remains intact');
    const entries=fs.readFileSync(envFile,'utf8').split('\n').filter(line=>line.startsWith('RUNTIME_STATIC_DIR='));
    assert.deepEqual(entries,['RUNTIME_STATIC_DIR='+(existing===null?path.join(f.app,'shared/static'):existing)]);
    f.unchanged();
  }
  const fresh=fixture(t),result=fresh.run('server-update.sh');assert.equal(result.status,0,result.stderr+result.stdout);
  assert(!fs.readFileSync(path.join(fresh.app,'shared/blog-admin.env'),'utf8').includes('RUNTIME_STATIC_DIR='));
});


test('same-second bundle imports keep separate candidates and pre-import backups',t=>{
  const f=fixture(t),bundleRoot=path.join(f.root,'bundle'),runtime=path.join(bundleRoot,'runtime');
  fs.mkdirSync(bundleRoot);
  fs.cpSync(f.source,path.join(bundleRoot,'source'),{recursive:true});
  for (const name of ['cmd/server','internal/server','frontend/site']) fs.mkdirSync(path.join(bundleRoot,'source',name),{recursive:true});
  for (const name of ['data/auth/users.json','data/content/articles.json','data/community/friends.json','data/settings/site.json']) {
    const file=path.join(runtime,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'{}');
  }
  for (const name of ['posts','friends','tags']) fs.mkdirSync(path.join(runtime,'content',name),{recursive:true});
  const bundle=path.join(f.root,'bundle.tar.gz');
  execFileSync('tar',['-C',bundleRoot,'-czf',bundle,'source','runtime']);
  const candidates=[],assetVersions=[];
  for (let attempt=0;attempt<2;attempt++) {
    const result=f.run('release-from-bundle.sh',[bundle]);assert.equal(result.status,0,result.stderr+result.stdout);
    candidates.push(fs.realpathSync(path.join(f.app,'next')));
    assetVersions.push(JSON.parse(fs.readFileSync(path.join(f.app,'shared/data/build.json'),'utf8')).asset_version);
    assert.equal(path.basename(fs.realpathSync(path.join(f.app,'current'))),'stable');
  }
  assert.notEqual(candidates[0],candidates[1]);
  assert.notEqual(assetVersions[0],assetVersions[1],'bundle resource versions must also remain unique');
  for (const candidate of candidates) assert.equal(fs.realpathSync(path.join(candidate,'published')),path.join(candidate,'build/public'));
  const backups=fs.readdirSync(path.join(f.app,'backups')).map(name=>path.join(f.app,'backups',name));
  assert.equal(backups.length,2,'keep both pre-import snapshots');
  assert(backups.some(file=>execFileSync('tar',['-tzf',file],{encoding:'utf8'}).includes('data/keep.json')),'the original runtime snapshot was not overwritten');
});
