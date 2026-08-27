/* v13.1：Markdown 代码块增强：语言标识 + 复制按钮 */
(function(){
  function copyText(text){
    if(navigator.clipboard && window.isSecureContext){
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function(resolve){
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
    const raw = [
      pre && pre.getAttribute('data-lang'),
      code && code.getAttribute('data-lang'),
      code && code.className,
      pre && pre.className
    ].filter(Boolean).join(' ');
    let m = raw.match(/(?:language|lang)-([A-Za-z0-9_+#.-]+)/);
    let lang = m ? m[1] : '';
    if(!lang){
      const classes = raw.split(/\s+/).filter(Boolean);
      lang = classes.find(c => !/^(chroma|highlight|code|pre|line|lines|hl|lntable|lntd|ln|cl|language-.*)$/i.test(c)) || '';
    }
    if(!lang) lang = 'code';
    return lang;
  }

  function enhanceMarkdownCodeBlocks(root){
    root = root || document;
    const blocks = root.querySelectorAll('.markdown-body pre, .preview pre, .md-live-preview pre');
    blocks.forEach(function(pre){
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
      btn.className = 'md-code-copy';
      btn.type = 'button';
      btn.textContent = '复制';
      btn.setAttribute('aria-label', '复制代码块');
      bar.appendChild(label);
      bar.appendChild(btn);
      pre.parentNode.insertBefore(wrapper, pre);
      wrapper.appendChild(bar);
      wrapper.appendChild(pre);
      btn.addEventListener('click', function(){
        const text = (code || pre).innerText || '';
        copyText(text).then(function(){
          btn.textContent = '已复制';
          btn.classList.add('copied');
          window.clearTimeout(btn.__copyTimer);
          btn.__copyTimer = window.setTimeout(function(){
            btn.textContent = '复制';
            btn.classList.remove('copied');
          }, 1400);
        });
      });
    });
  }

  window.SonglineEnhanceMarkdown = enhanceMarkdownCodeBlocks;
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){ enhanceMarkdownCodeBlocks(document); });
  }else{
    enhanceMarkdownCodeBlocks(document);
  }
})();



