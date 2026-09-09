// 用文章保存的 Markdown 源重新渲染正文，并同步生成可点击目录。
(function(){
  const reader = document.querySelector('[data-article-renderer="songline-markdown"]');
  const sourceElement = document.getElementById('article-md-source');
  if(!reader || !sourceElement || reader.dataset.songlineRenderSyncBound === '1') return;
  // 站内过场会动态重新插入 defer 脚本；外链脚本的完成顺序不能假定。
  // 若渲染器晚到，等它发出就绪信号后再执行本初始化，而不是留下 Hugo 的原始正文。
  if(!window.SonglineMarkdown){
    window.addEventListener('songline:markdown-ready', function(){
      if(reader.dataset.songlineRenderSyncBound === '1' || !reader.isConnected) return;
      const retry = document.createElement('script');
      retry.src = '/js/article-render-sync.js';
      retry.async = false;
      document.body.appendChild(retry);
    }, {once:true});
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
    const root = {level:0, children:[]};
    const stack = [root];
    headings.forEach(function(heading){
      if(!heading.id) heading.id = slugify(heading.textContent, used);
      const rawLevel = Number(heading.tagName.slice(1)) || baseLevel;
      const relativeLevel = Math.min(6, Math.max(1, rawLevel - baseLevel + 1));
      while(stack.length > 1 && relativeLevel <= stack[stack.length - 1].level) stack.pop();
      const node = {
        id:heading.id,
        label:heading.textContent || '',
        rawLevel:rawLevel,
        level:relativeLevel,
        children:[]
      };
      stack[stack.length - 1].children.push(node);
      stack.push(node);
    });
    function escapeHtml(value){
      return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function renderBranch(nodes){
      return '<ul>' + nodes.map(function(node){
        const children = node.children.length ? renderBranch(node.children) : '';
        return '<li class="toc-level-' + node.rawLevel + ' toc-depth-' + node.level + '" data-toc-level="' + node.rawLevel + '" data-toc-depth="' + node.level + '"><a href="#' + encodeURIComponent(node.id) + '">' + escapeHtml(node.label) + '</a>' + children + '</li>';
      }).join('') + '</ul>';
    }
    tocBody.innerHTML = '<nav class="toc-tree" aria-label="文章目录">' + renderBranch(root.children) + '</nav>';
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
