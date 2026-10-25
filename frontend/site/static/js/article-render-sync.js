// 用文章保存的 Markdown 源重新渲染正文，并同步生成可点击目录。
(function(){
  const reader = document.querySelector('[data-article-renderer="songline-markdown"]');
  const sourceElement = document.getElementById('article-md-source');
  if(!reader || !sourceElement || reader.dataset.songlineRenderSyncBound === '1') return;
  // 站内过场会动态重新插入 defer 脚本；外链脚本的完成顺序不能假定。
  // 若渲染器晚到，等它发出就绪信号后再执行本初始化，而不是留下 Hugo 的原始正文。
  if(!window.SonglineMarkdown || !window.SonglineReading){
    const syncScriptURL = (document.currentScript && document.currentScript.src) || '/js/article-render-sync.js';
    function clearWait(){
      window.removeEventListener('songline:markdown-ready', retryWhenReady);
      window.removeEventListener('songline:reading-ready', retryWhenReady);
      window.removeEventListener('songline:page-transition-start', clearWait);
    }
    function retryWhenReady(){
      if(!reader.isConnected || reader.dataset.songlineRenderSyncBound === '1'){ clearWait(); return; }
      if(!window.SonglineMarkdown || !window.SonglineReading) return;
      clearWait();
      const retry = document.createElement('script');
      retry.src = syncScriptURL;
      retry.async = false;
      document.body.appendChild(retry);
    }
    window.addEventListener('songline:markdown-ready', retryWhenReady);
    window.addEventListener('songline:reading-ready', retryWhenReady);
    window.addEventListener('songline:page-transition-start', clearWait, {once:true});
    return;
  }
  reader.dataset.songlineRenderSyncBound = '1';

  function decodeBase64Utf8(value){
    let clean = String(value || '').trim();
    // 早期导入的 source_md_b64 有一部分被 JSON 再包了一次；兼容该历史格式。
    if(/^"[\s\S]*"$/.test(clean)){
      try{ clean = JSON.parse(clean); }catch(error){ clean = clean.slice(1, -1); }
    }
    clean = String(clean || '').replace(/\s+/g, '');
    const binary = atob(clean);
    const bytes = new Uint8Array(binary.length);
    for(let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    if(window.TextDecoder) return new TextDecoder('utf-8', {fatal:false}).decode(bytes);
    let encoded = '';
    bytes.forEach(function(byte){ encoded += '%' + byte.toString(16).padStart(2, '0'); });
    return decodeURIComponent(encoded);
  }

  function readInlineMarkdown(){
    try{
      let markdown = JSON.parse(sourceElement.textContent || '""');
      if(sourceElement.dataset.sourceFormat === 'base64') markdown = decodeBase64Utf8(markdown);
      return String(markdown || '');
    }catch(error){
      return '';
    }
  }

  // 反代找不到源文件时可能回退到首页；HTTP 200 但内容其实是完整 HTML。
  function isMarkdownSource(value){
    return !/^\s*<(?:!doctype\s+html|html|head|body)(?:\s|>)/i.test(String(value || ''));
  }

  function rebuildToc(){
    window.SonglineReading.buildToc(reader, document.querySelector('.article-toc .toc-body'));
  }

  async function getMarkdown(){
    const sourceURL = sourceElement.dataset.sourceUrl || '';
    if(sourceURL){
      const controller = new AbortController();
      let timer;
      try{
        // Bound both headers AND body so a stalled source cannot prevent the
        // embedded article and directory from becoming ready indefinitely.
        const timeout = new Promise(function(resolve){
          timer = window.setTimeout(function(){ controller.abort(); resolve(''); }, 2500);
        });
        const download = fetch(sourceURL, {credentials:'same-origin', cache:'no-cache', signal:controller.signal})
          .then(function(response){ return response.ok ? response.text() : ''; });
        const text = await Promise.race([download, timeout]);
        if(text && isMarkdownSource(text)) return text;
      }catch(error){}finally{ window.clearTimeout(timer); }
    }
    return readInlineMarkdown();
  }


  // Capture ownership at initialization: a late source download must not
  // restart a hash jump after AJAX history restoration has already finished.
  const documentEntry = !(document.documentElement && document.documentElement.classList.contains('songline-page-transitioning'));
  reader.songlineRenderReady = getMarkdown().then(function(markdown){
    if(!reader.isConnected || !sourceElement.isConnected) return;
    if(!markdown){ rebuildToc(); window.dispatchEvent(new Event('songline:article-toc-ready')); return; }
    // Parse inertly, then reuse identical images from the server rendering.
    // Recreating them can refetch no-store third-party URLs and decode again.
    const template = document.createElement('template');
    template.innerHTML = window.SonglineMarkdown.render(markdown);
    const images = new Map();
    function imageKey(img){
      return JSON.stringify(Array.from(img.attributes)
        .filter(function(attr){ return !['loading', 'decoding', 'data-image-state'].includes(attr.name); })
        .map(function(attr){ return [attr.name, attr.value]; })
        .sort(function(a,b){ return a[0].localeCompare(b[0]); }));
    }
    reader.querySelectorAll('img').forEach(function(img){
      if(img.closest('picture')) return;
      const key = imageKey(img);
      if(!images.has(key)) images.set(key, []);
      images.get(key).push(img);
    });
    const reused = [];
    template.content.querySelectorAll('img').forEach(function(img){
      if(img.closest('picture')) return;
      const matches = images.get(imageKey(img));
      if(matches && matches.length){
        const placeholder = document.createComment('article image');
        img.replaceWith(placeholder);
        reused.push({placeholder:placeholder, image:matches.shift()});
      }
    });
    reader.replaceChildren(template.content);
    // Keep the reused element in the live document's ownership. Moving it
    // through template.content adopts it into an inert document and refetches.
    reused.forEach(function(item){ item.placeholder.replaceWith(item.image); });
    if(window.SonglineResources) window.SonglineResources.observe(reader);
    if(window.SonglineEnhanceMarkdown) window.SonglineEnhanceMarkdown(reader);
    if(window.SonglinePageModules) window.SonglinePageModules.scan(reader);
    rebuildToc();
    window.dispatchEvent(new Event('songline:article-toc-ready'));
    if(documentEntry && window.location.hash) window.setTimeout(function(){
      if(reader.isConnected) window.SonglineReading.scrollToHeading(window.location.hash, true);
    }, 90);
  });
})();
