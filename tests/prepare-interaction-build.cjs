// Materialize only public source plus fixed fixtures; never copy runtime data.
// node tests/prepare-interaction-build.cjs /source/checkout /isolated/output
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const source=path.resolve(process.argv[2]||'.'),target=path.resolve(process.argv[3]||'');
assert(process.argv[3],'Provide a new isolated output directory');
assert(!fs.existsSync(target),'Refusing to overwrite an existing fixture');
assert(fs.existsSync(path.join(source,'hugo.toml')),'Provide a Blog source checkout');
fs.mkdirSync(target,{recursive:true});
for(const name of ['assets','content','layouts','static','web'])fs.cpSync(path.join(source,name),path.join(target,name),{recursive:true,filter:file=>{
  const relative=path.relative(source,file).split(path.sep).join('/');
  if(/^(content\/(posts|friends|tags)|static\/(md-source|runtime-config\.js))(\/|$)/.test(relative))return false;
  if(relative.startsWith('static/uploads/'))return relative==='static/uploads/admin'||relative.startsWith('static/uploads/admin/');
  return true;
}});
fs.copyFileSync(path.join(source,'hugo.toml'),path.join(target,'hugo.toml'));
fs.mkdirSync(path.join(target,'data'));
for(const name of ['site','theme']){
  const data=JSON.parse(fs.readFileSync(path.join(source,`assets/bootstrap/${name}.json`),'utf8'));
  if(name==='site')data.comments.enabled=false;
  fs.writeFileSync(path.join(target,`data/${name}.json`),JSON.stringify(data));
}
const friends=JSON.parse(fs.readFileSync(path.join(source,'assets/data/friends/friends.json'),'utf8'));
for(const friend of friends){
  if(friend.username)friend.url='/friends/'+friend.username+'/';
  if(friend.avatar?.startsWith('http'))friend.avatar='/uploads/admin/friends/user-null.png';
}
fs.writeFileSync(path.join(target,'data/friends.json'),JSON.stringify(friends));
const posts=path.join(target,'content/posts');fs.mkdirSync(posts,{recursive:true});
for(let i=0;i<16;i++){
  const markdown='# 测试标题\n\n'+'这里是性能回归使用的固定内容。 Linux 测试。\n\n'.repeat(30)+'## 代码\n\n```js\nconsole.log("fixture");\n```\n';
  fs.writeFileSync(path.join(posts,(i===0?'linux-note':`audit-${i}`)+'.md'),`---\ntitle: "Linux 测试文章 ${i}"\ndate: 2026-09-01\nauthor: songline\ntags: ["linux", "性能"]\nsummary: "固定公开测试内容"\nsource_md_b64: "${Buffer.from(markdown).toString('base64')}"\n---\n`+markdown);
}
fs.writeFileSync(path.join(posts,'notice.md'),'---\ntitle: "测试公告"\ndate: 2026-09-02\ntags: ["site-notice"]\nis_notice: true\n---\n这是固定测试公告。\n');
const profiles=path.join(target,'content/friends');fs.mkdirSync(profiles,{recursive:true});
fs.writeFileSync(path.join(profiles,'_index.md'),'---\ntitle: "朋友"\nlayout: "friends-list"\n---\n');
for(const friend of friends){
  if(!friend.username)continue;
  const data={title:friend.display_name||friend.username,layout:'friend-profile',friend_username:friend.username,friend_name:friend.display_name||friend.username,friend_avatar:friend.avatar,friend_cover:friend.cover||'',url:friend.url};
  fs.writeFileSync(path.join(profiles,friend.username+'.md'),'---\n'+Object.entries(data).map(([key,value])=>key+': '+JSON.stringify(value)+'\n').join('')+'---\n');
}
console.log('Prepared public fixture:',target);
