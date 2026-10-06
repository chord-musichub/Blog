// Shared directory tree and anchor navigation for articles and local previews.
(function(){
  if(window.SonglineReading) return;
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

  function buildToc(reader, tocBody){
    if(!tocBody) return;
    const headings = Array.from(reader.querySelectorAll('h1,h2,h3,h4,h5,h6'));
    if(!headings.length){
      tocBody.innerHTML = '<nav><ul><li><span class="meta">暂无目录</span></li></ul></nav>';
      return;
    }
    const used = Object.create(null);
    const levels = headings.map(function(heading){ return Number(heading.tagName.slice(1)); }).filter(Boolean);
    const baseLevel = levels.length ? Math.min.apply(null, levels) : 1;
    const root = {level:0, children:[]};
    const stack = [root];
    headings.forEach(function(heading){
      if(!heading.id || used[heading.id]) heading.id = slugify(heading.textContent, used);
      else used[heading.id] = true;
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
      // Directory jumps are positions within this article, not a new page.
      try{ history.replaceState(history.state, '', window.location.pathname + window.location.search + hash); }catch(error){}
    }, true);
  }

  window.SonglineReading = {buildToc:buildToc, scrollToHeading:scrollToArticleHeading};
  window.dispatchEvent(new Event('songline:reading-ready'));
})();
