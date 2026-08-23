const src = document.getElementById('md');
const out = document.getElementById('preview');

function copyText(text){
  if(navigator.clipboard && window.isSecureContext){
    return navigator.clipboard.writeText(text);
  }
  return new Promise(resolve => {
    const input = document.createElement('textarea');
    input.value = text || '';
    input.setAttribute('readonly', '');
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    document.body.appendChild(input);
    input.select();
    try{ document.execCommand('copy'); }catch(e){}
    document.body.removeChild(input);
    resolve();
  });
}

function languageOf(pre, code){
  const raw = [pre && pre.getAttribute('data-lang'), code && code.getAttribute('data-lang'), code && code.className, pre && pre.className].filter(Boolean).join(' ');
  const m = raw.match(/(?:language|lang)-([A-Za-z0-9_+#.-]+)/) || raw.match(/\b([A-Za-z0-9_+#.-]+)\b/);
  let lang = m ? m[1] : '';
  if(!lang || /^(code|pre|preview)$/i.test(lang)) return 'code';
  return lang;
}

function enhanceCodeBlocks(root){
  if(!root) return;
  root.querySelectorAll('pre').forEach(pre => {
    if(pre.closest('.md-code-block')) return;
    const code = pre.querySelector('code');
    const lang = languageOf(pre, code);
    const wrapper = document.createElement('div');
    wrapper.className = 'md-code-block';
    const bar = document.createElement('div');
    bar.className = 'md-code-toolbar';
    const label = document.createElement('span');
    label.className = 'md-code-lang';
    label.textContent = lang;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'md-code-copy';
    btn.textContent = '复制';
    bar.appendChild(label);
    bar.appendChild(btn);
    pre.parentNode.insertBefore(wrapper, pre);
    wrapper.appendChild(bar);
    wrapper.appendChild(pre);
    btn.addEventListener('click', () => {
      copyText((code || pre).innerText || '').then(() => {
        btn.textContent = '已复制';
        btn.classList.add('copied');
        clearTimeout(btn.__copyTimer);
        btn.__copyTimer = setTimeout(() => {
          btn.textContent = '复制';
          btn.classList.remove('copied');
        }, 1400);
      });
    });
  });
}

function update(){
  if(out && src){
    out.innerHTML = window.SonglineMarkdown ? window.SonglineMarkdown.render(src.value) : src.value;
    enhanceCodeBlocks(out);
  }
}

if(src){
  src.addEventListener('input', update);
  update();
}
