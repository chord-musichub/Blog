// 用文章保存的 Markdown 源重新渲染正文，并同步生成可点击目录。
(function(){
  const reader = document.querySelector('[data-article-renderer="songline-markdown"]');
  const sourceElement = document.getElementById('article-md-source');
  if(!reader || !sourceElement || !window.SonglineMarkdown || reader.dataset.songlineRenderSyncBound === '1') return;
  reader.dataset.songlineRenderSyncBound = '1';

  function decodeBase64Utf8(value){
    const clean = String(value || '').replace(/\s+/g, '');
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

  function slugify(text, used){
    let base = String(text || '')
      .replace(/<[^>]*>/g, '')
      .replace(/[^\p{L}\p{N}\s_-]/gu, '')
      .trim()
      .replace(/\s+/g, '-')
      .toLowerCase();
    if(!base) base = 'heading';
    let slug = base;
    let index = 2;
    while(used[slug]) slug = base + '-' + index++;
    used[slug] = true;
    return slug;
  }

  function rebuildToc(){
    const tocBody = document.querySelector('.article-toc .toc-body');
    if(!tocBody) return;
    const headings = Array.from(reader.querySelectorAll('h1,h2,h3,h4'));
    if(!headings.length){
      tocBody.innerHTML = '<nav><ul><li><span class="meta">暂无目录</span></li></ul></nav>';
      return;
    }
    const used = {};
    const levels = headings.map(function(heading){ return Number(heading.tagName.slice(1)); }).filter(Boolean);
    const baseLevel = levels.length ? Math.min.apply(null, levels) : 1;
    const items = headings.map(function(heading){
      if(!heading.id) heading.id = slugify(heading.textContent, used);
      const rawLevel = Number(heading.tagName.slice(1)) || baseLevel;
      const relativeLevel = Math.min(6, Math.max(1, rawLevel - baseLevel + 1));
      return '<li class="toc-level-' + rawLevel + ' toc-depth-' + relativeLevel + '" data-toc-level="' + rawLevel + '" data-toc-depth="' + relativeLevel + '"><a href="#' + heading.id + '">' + heading.textContent + '</a></li>';
    }).join('');
    tocBody.innerHTML = '<nav><ul>' + items + '</ul></nav>';
  }

  async function getMarkdown(){
    const sourceURL = sourceElement.dataset.sourceUrl || '';
    if(sourceURL){
      try{
        const response = await fetch(sourceURL, {credentials:'same-origin', cache:'no-store'});
        if(response.ok){
          const text = await response.text();
          if(text && isMarkdownSource(text)) return text;
        }
      }catch(error){}
    }
    return readInlineMarkdown();
  }

  function decodeHashId(raw){
    let value = String(raw || '').replace(/^#/, '');
    try{ value = decodeURIComponent(value); }catch(error){}
    return value;
  }

  function articleHeaderOffset(){
    const header = document.querySelector('.site-header, .modern-site-header');
    const height = header ? Math.ceil(header.getBoundingClientRect().height) : 0;
    return Math.max(72, height + 22);
  }

  function scrollToArticleHeading(raw, instant){
    const id = decodeHashId(raw);
    if(!id) return false;
    const target = document.getElementById(id);
    if(!target) return false;
    const top = Math.max(0, target.getBoundingClientRect().top + window.pageYOffset - articleHeaderOffset());
    window.scrollTo({top:top, behavior:instant ? 'auto' : 'smooth'});
    target.classList.remove('toc-target-flash');
    window.requestAnimationFrame(function(){
      target.classList.add('toc-target-flash');
      window.setTimeout(function(){ target.classList.remove('toc-target-flash'); }, 1100);
    });
    return true;
  }

  window.SonglineScrollToArticleHeading = scrollToArticleHeading;
  if(!window.SonglineArticleTocLinkBound){
    window.SonglineArticleTocLinkBound = true;
    document.addEventListener('click', function(event){
      const link = event.target && event.target.closest ? event.target.closest('.article-toc .toc-body a[href^="#"]') : null;
      if(!link) return;
      const hash = link.getAttribute('href') || '';
      if(hash.length <= 1 || !window.SonglineScrollToArticleHeading(hash, false)) return;
      event.preventDefault();
      event.stopPropagation();
      try{ history.pushState(null, '', window.location.pathname + window.location.search + hash); }catch(error){}
    }, true);
  }

  getMarkdown().then(function(markdown){
    if(!markdown) return;
    reader.innerHTML = window.SonglineMarkdown.render(markdown);
    if(window.SonglineEnhanceMarkdown) window.SonglineEnhanceMarkdown(reader);
    rebuildToc();
    if(window.location.hash) window.setTimeout(function(){ scrollToArticleHeading(window.location.hash, true); }, 90);
  });
})();
