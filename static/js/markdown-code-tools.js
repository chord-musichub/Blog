/* v13.1：Markdown 代码块增强：语言标识 + 复制按钮 */
(function(){
  if(window.SonglineEnhanceMarkdown) return;
  let copyEpoch = 0;
  const pendingCopies = new WeakMap();
  const feedback = new Map();

  function fallbackCopy(text){
    return new Promise(function(resolve, reject){
      const previousFocus = document.activeElement;
      const input = document.createElement('textarea');
      input.value = text || '';
      input.setAttribute('readonly', '');
      input.style.position = 'fixed';
      input.style.left = '-9999px';
      document.body.appendChild(input);
      input.select();
      let copied = false;
      try{ copied = document.execCommand('copy'); }catch(e){}
      finally{
        input.remove();
        if(previousFocus && previousFocus.isConnected) previousFocus.focus({preventScroll:true});
      }
      if(copied) resolve();
      else reject(new Error('Clipboard unavailable'));
    });
  }

  function copyText(text, current){
    if(!navigator.clipboard || !window.isSecureContext) return fallbackCopy(text);
    let request;
    try{ request = navigator.clipboard.writeText(text); }
    catch(error){ request = Promise.reject(error); }
    return Promise.resolve(request).catch(function(error){
      if(!current()) throw error;
      return fallbackCopy(text);
    });
  }

  function clearFeedback(){
    copyEpoch++;
    feedback.forEach(function(timer, button){
      window.clearTimeout(timer);
      button.textContent = '复制';
      button.classList.remove('copied');
    });
    feedback.clear();
  }

  function onCodeCopy(event){
    const button = event.target && event.target.closest && event.target.closest('.md-code-copy');
    if(!button) return;
    const wrapper = button.closest('.md-code-block');
    const pre = wrapper && wrapper.querySelector('pre');
    if(!pre || !wrapper.closest('.markdown-body, .preview, .md-live-preview')) return;
    const pending = pendingCopies.get(button);
    if(pending && pending.epoch === copyEpoch) return;
    window.clearTimeout(feedback.get(button));
    feedback.delete(button);
    button.textContent = '复制';
    button.classList.remove('copied');
    const operation = {epoch:copyEpoch};
    pendingCopies.set(button, operation);
    function current(){ return operation.epoch === copyEpoch && button.isConnected && pendingCopies.get(button) === operation; }
    function finish(message, copied){
      if(!current()) return;
      button.textContent = message;
      button.classList.toggle('copied', copied);
      const timer = window.setTimeout(function(){
        feedback.delete(button);
        button.textContent = '复制';
        button.classList.remove('copied');
      }, 1400);
      feedback.set(button, timer);
    }
    const code = pre.querySelector('code');
    copyText((code || pre).innerText || '', current).then(function(){ finish('已复制', true); }, function(){ finish('复制失败', false); }).finally(function(){
      if(pendingCopies.get(button) === operation) pendingCopies.delete(button);
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
    });
  }

  window.SonglineEnhanceMarkdown = enhanceMarkdownCodeBlocks;
  document.addEventListener('click', onCodeCopy);
  window.addEventListener('songline:page-transition-start', clearFeedback);
  window.addEventListener('pagehide', clearFeedback);
})();
