// Prepare an isolated public source using production Markdown storage and fixed
// vector covers. Run Hugo against the result; never copy runtime user data.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const source=path.resolve(process.argv[2]||'.'),target=path.resolve(process.argv[3]||'');
if(!process.argv[3])throw Error('Usage: node tests/prepare-article-album-build.cjs SOURCE NEW_OUTPUT');
execFileSync(process.execPath,[path.join(__dirname,'prepare-interaction-build.cjs'),source,target],{stdio:'inherit'});
const first=path.join(target,'content/posts/linux-note.md');fs.writeFileSync(first,fs.readFileSync(first,'utf8').replace('summary: "固定公开测试内容"','summary: "'+('在这里记录沿途的风景、日常的灵感与片刻的思考。Keep a small memory of this journey. '.repeat(2))+'"'));
// Production articles fetch their Markdown source asynchronously. Preserve
// that hydration path so subtree scans cannot silently cancel heading effects.
const firstSource=fs.readFileSync(first,'utf8');
fs.writeFileSync(path.join(target,'static','article-source-fixture.md'),Buffer.from(firstSource.match(/source_md_b64: "([^"]*)"/)[1],'base64'));
fs.writeFileSync(first,firstSource.replace('source_md_b64:', 'source_md_url: "/article-source-fixture.md"\nsource_md_b64:'));
for(const [name,w,h] of [['landscape',1200,650],['portrait',560,1000],['panorama',1600,240],['slow',1200,650]]){
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#aecbd6"/><stop offset="1" stop-color="#eff0de"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#sky)"/><circle cx="${w*.73}" cy="${h*.28}" r="${Math.min(w,h)*.09}" fill="#fff1c8"/><path d="M0 ${h*.62} Q${w*.3} ${h*.32} ${w*.56} ${h*.7} T${w} ${h*.52} V${h} H0 Z" fill="#829e94"/><path d="M0 ${h*.87} Q${w*.46} ${h*.51} ${w} ${h*.88} V${h} H0 Z" fill="#526e69"/></svg>`;
 fs.writeFileSync(path.join(target,'static',`album-${name}.svg`),svg);
 if(name==='slow')continue;
 const body='# 走进山间\n\n把平常的日子写下来，也是一件值得认真对待的事。\n\n## 片刻光影\n\n'+'阳光穿过叶片，风景与文字一起留在这里。\n\n'.repeat(25);
 const article=`---\ntitle: "山间札记 · 把日常写成风景"\ndate: 2026-10-10\nauthor_display: "songline"\ncover: "/album-${name}.svg"\ncover_mode: cover\nsummary: "沿着山路慢慢走，记下光线经过树林的样子。在这里记录沿途的风景、日常的灵感与片刻的思考。Keep a small memory of this journey."\ntags: ["随笔", "日常"]\nsource_md_b64: "${Buffer.from(body).toString('base64')}"\n---\n${body}`;
 fs.writeFileSync(path.join(target,'content/posts',`album-${name}.md`),article);
}
console.log('Album fixtures ready:',target);
