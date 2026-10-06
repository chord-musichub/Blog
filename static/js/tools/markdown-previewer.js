(function(){
  function init(root){
  const panel = (root || document).querySelector('[data-md-tool]');
  if(!panel || panel.dataset.mdToolBound === '1') return;
  panel.dataset.mdToolBound = '1';
  let activeReader = null;
  let disposed = false;
  const fileInput = panel.querySelector('[data-md-file]');
  const drop = panel.querySelector('[data-md-drop]');
  const preview = panel.querySelector('[data-md-preview]');
  const toc = panel.querySelector('[data-md-toc] .toc-body');
  const nameEl = panel.querySelector('[data-md-name]');
  const sizeEl = panel.querySelector('[data-md-size]');

  const layout = panel;
  const tocCard = panel.querySelector('[data-md-toc]');
  if(layout && tocCard){
    try{ layout.dataset.tocState = localStorage.getItem('songline-md-tool-toc-state') === 'collapsed' ? 'collapsed' : 'expanded'; }
    catch(error){ layout.dataset.tocState = 'expanded'; }
    function syncTocAria(){
      tocCard.setAttribute('aria-expanded', layout.dataset.tocState === 'expanded' ? 'true' : 'false');
    }
    function toggleToc(event){
      if(event && event.target && event.target.closest('a')) return;
      layout.dataset.tocState = layout.dataset.tocState === 'expanded' ? 'collapsed' : 'expanded';
      try{ localStorage.setItem('songline-md-tool-toc-state', layout.dataset.tocState); }catch(error){}
      syncTocAria();
    }
    tocCard.addEventListener('click', toggleToc);
    tocCard.addEventListener('keydown', function(event){
      if(event.target === tocCard && (event.key === 'Enter' || event.key === ' ')){
        event.preventDefault();
        toggleToc(event);
      }
    });
    tocCard.setAttribute('role', 'button');
    tocCard.setAttribute('tabindex', '0');
    tocCard.setAttribute('aria-label', '展开或收起目录');
    syncTocAria();
  }



  function slugifyHeading(text, used){
    let base = String(text || '')
      .replace(/<[^>]*>/g, '')
      .replace(/[^\p{L}\p{N}\s_-]/gu, '')
      .trim()
      .replace(/\s+/g, '-')
      .toLowerCase();
    if(!base) base = 'heading';
    let slug = base;
    let i = 2;
    while(used[slug]){
      slug = base + '-' + i++;
    }
    used[slug] = true;
    return slug;
  }

  function rebuildToc(){
    if(!toc || !preview) return;
    const headings = Array.from(preview.querySelectorAll('h1,h2,h3,h4'));
    if(!headings.length){
      toc.innerHTML = '<nav><ul><li><span class="meta">暂无目录</span></li></ul></nav>';
      return;
    }
    const used = {};
    const levels = headings.map(function(h){ return Number(h.tagName.slice(1)); }).filter(Boolean);
    const baseLevel = levels.length ? Math.min.apply(null, levels) : 1;
    const items = headings.map(function(h){
      if(!h.id) h.id = slugifyHeading(h.textContent, used);
      const rawLevel = Number(h.tagName.slice(1)) || baseLevel;
      const relativeLevel = Math.min(6, Math.max(1, rawLevel - baseLevel + 1));
      const label = h.textContent.replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]);
      return '<li class="toc-level-' + rawLevel + ' toc-depth-' + relativeLevel + '" data-toc-level="' + rawLevel + '" data-toc-depth="' + relativeLevel + '"><a href="#' + encodeURIComponent(h.id) + '">' + label + '</a></li>';
    }).join('');
    toc.innerHTML = '<nav><ul>' + items + '</ul></nav>';
  }

  function resetPreviewState(){
    nameEl.textContent = '正在读取新文件...';
    sizeEl.textContent = '';
    preview.innerHTML = '<div class="md-empty-state"><h2>正在刷新预览</h2><p>新文件读取中。</p></div>';
    if(toc) toc.innerHTML = '<nav><ul><li><span class="meta">读取中...</span></li></ul></nav>';
    if(window.SonglineNormalizeFloatReadingButtons) window.SonglineNormalizeFloatReadingButtons();
  }

  function setFile(file){
    if(!file) return;
    if(activeReader && activeReader.readyState === 1) activeReader.abort();
    resetPreviewState();
    const reader = new FileReader();
    activeReader = reader;
    reader.onload = function(){
      if(disposed || !panel.isConnected || activeReader !== reader) return;
      const text = String(reader.result || '');
      if(window.SonglineMarkdown) preview.innerHTML = window.SonglineMarkdown.render(text);
      else preview.textContent = text;
      if(window.SonglineEnhanceMarkdown) window.SonglineEnhanceMarkdown(preview);
      if(window.SonglinePageModules) window.SonglinePageModules.scan(panel);
      rebuildToc();
      nameEl.textContent = file.name || '已选择文件';
      sizeEl.textContent = file.size ? Math.max(1, Math.round(file.size / 1024)) + ' KB' : '';
      if(window.SonglineNormalizeFloatReadingButtons) window.SonglineNormalizeFloatReadingButtons();
      window.dispatchEvent(new Event('songline:article-toc-ready'));
    };
    reader.onerror = function(){
      if(disposed || !panel.isConnected || activeReader !== reader) return;
      preview.innerHTML = '<div class="md-empty-state"><h2>读取失败</h2><p>换一个文件试试。</p></div>';
      if(toc) toc.innerHTML = '<nav><ul><li><span class="meta">读取失败</span></li></ul></nav>';
      nameEl.textContent = '文件读取失败';
      sizeEl.textContent = '';
      if(window.SonglineNormalizeFloatReadingButtons) window.SonglineNormalizeFloatReadingButtons();
    };
    reader.readAsText(file, 'utf-8');
  }

  fileInput.addEventListener('click', function(){
    // 允许重复选择同一个文件也触发 change，从而达到“重新刷新”的效果。
    fileInput.value = '';
  });

  fileInput.addEventListener('change', function(){
    setFile(fileInput.files && fileInput.files[0]);
  });

  ['dragenter','dragover'].forEach(function(type){
    drop.addEventListener(type, function(e){
      e.preventDefault();
      drop.classList.add('dragging');
    });
  });
  ['dragleave','drop'].forEach(function(type){
    drop.addEventListener(type, function(e){
      e.preventDefault();
      if(type === 'drop'){
        setFile(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]);
      }
      drop.classList.remove('dragging');
    });
  });
  // Floating reading buttons already have one shared owner. A second scroll /
  // resize owner here used to reposition them and keep detached previews alive.
  function cleanup(){
    disposed = true;
    if(activeReader && activeReader.readyState === 1) activeReader.abort();
    window.removeEventListener('songline:page-transition-start', cleanup);
  }
  window.addEventListener('songline:page-transition-start', cleanup);
  }
  window.SonglineInitMarkdownPreviewer = init;
})();
