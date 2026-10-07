(function(){
  'use strict';
  if(window.SonglineInitMarkdownPreviewer) return;
  function init(root){
    const panel = (root || document).querySelector('[data-md-tool]');
    if(!panel || panel.dataset.mdToolBound === '1') return;
    panel.dataset.mdToolBound = '1';
    let activeReader = null;
    let disposed = false;
    let dragDepth = 0;
    const fileInput = panel.querySelector('[data-md-file]');
    const drop = panel.querySelector('[data-md-drop]');
    const preview = panel.querySelector('[data-md-preview]');
    const shell = panel.querySelector('.article-shell');
    const toc = panel.querySelector('[data-md-toc] .toc-body');
    const nameEl = panel.querySelector('[data-md-name]');
    const messageEl = panel.querySelector('[data-md-message]');
    const chooseButton = panel.querySelector('[data-md-choose]');
    const statusEl = panel.querySelector('.md-tool-meta');
    window.SonglineInitArticleToc(panel);

    function notify(){
      document.querySelectorAll('[data-md-reading-action]').forEach(function(button){ button.hidden = shell.hidden; });
      if(window.SonglineNormalizeFloatReadingButtons) window.SonglineNormalizeFloatReadingButtons();
      window.dispatchEvent(new Event('songline:article-toc-ready'));
    }
    function clearReader(){
      if(!activeReader) return;
      const reader = activeReader;
      activeReader = null;
      reader.onload = reader.onerror = null;
      if(reader.readyState === 1) reader.abort();
    }
    function setState(message, detail){
      preview.replaceChildren();
      preview.removeAttribute('aria-busy');
      shell.hidden = true;
      panel.dataset.mdState = 'empty';
      chooseButton.textContent = '选择文件';
      window.SonglineReading.buildToc(preview, toc);
      nameEl.textContent = message;
      messageEl.textContent = detail;
      statusEl.hidden = !message;
      notify();
    }
    function setFile(file){
      if(!file || disposed) return;
      clearReader();
      if(!/\.(md|markdown|txt)$/i.test(file.name || '') && !/^text\//i.test(file.type || '')){
        setState('文件类型不支持', '请选择 Markdown 或纯文本文件。');
        return;
      }
      setState('正在读取新文件…', '新文件读取中。');
      panel.dataset.mdState = 'loading';
      const reader = new FileReader();
      activeReader = reader;
      reader.onload = function(){
        if(disposed || !panel.isConnected || activeReader !== reader) return;
        activeReader = null;
        const text = String(reader.result || '').replace(/^\uFEFF/, '');
        reader.onload = reader.onerror = null;
        if(!text.trim()){
          setState(file.name || '已选择文件', '这个文件为空，请选择其他文件。');
          if(location.hash) history.replaceState(history.state, '', location.pathname + location.search);
          return;
        }
        preview.innerHTML = window.SonglineMarkdown.render(text);
        shell.hidden = false;
        panel.dataset.mdState = 'ready';
        chooseButton.textContent = '更换文件';
        window.SonglineReading.buildToc(preview, toc);
        if(window.SonglineEnhanceMarkdown) window.SonglineEnhanceMarkdown(preview);
        if(window.SonglineResources) window.SonglineResources.observe(preview);
        if(window.SonglinePageModules) window.SonglinePageModules.scan(panel);
        nameEl.textContent = file.name || '已选择文件';
        messageEl.textContent = '';
        statusEl.hidden = false;
        preview.removeAttribute('aria-busy');
        // New file headings must not inherit the previous file's fragment.
        if(location.hash) history.replaceState(history.state, '', location.pathname + location.search);
        notify();
      };
      reader.onerror = function(){
        if(disposed || !panel.isConnected || activeReader !== reader) return;
        activeReader = null;
        reader.onload = reader.onerror = null;
        setState('文件读取失败', '无法读取这个文件，请重新选择。');
      };
      preview.setAttribute('aria-busy', 'true');
      reader.readAsText(file, 'utf-8');
    }
    chooseButton.addEventListener('click', function(){ fileInput.click(); });
    fileInput.addEventListener('click', function(){ fileInput.value = ''; });
    fileInput.addEventListener('change', function(){ setFile(fileInput.files && fileInput.files[0]); });
    drop.addEventListener('dragenter', function(event){ event.preventDefault(); dragDepth++; drop.classList.add('dragging'); });
    drop.addEventListener('dragover', function(event){ event.preventDefault(); if(event.dataTransfer) event.dataTransfer.dropEffect = 'copy'; });
    drop.addEventListener('dragleave', function(event){ event.preventDefault(); if(--dragDepth <= 0){dragDepth = 0;drop.classList.remove('dragging');} });
    drop.addEventListener('drop', function(event){
      event.preventDefault();dragDepth = 0;drop.classList.remove('dragging');
      setFile(event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]);
    });
    function cleanup(){
      disposed = true;
      clearReader();
      window.removeEventListener('songline:page-transition-start', cleanup);
    }
    window.addEventListener('songline:page-transition-start', cleanup);
  }
  window.SonglineInitMarkdownPreviewer = init;
})();
