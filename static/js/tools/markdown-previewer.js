(function(){
  const panel = document.querySelector('[data-md-tool]');
  if(!panel) return;
  const fileInput = panel.querySelector('[data-md-file]');
  const drop = panel.querySelector('[data-md-drop]');
  const preview = panel.querySelector('[data-md-preview]');
  const toc = panel.querySelector('[data-md-toc] .toc-body');
  const nameEl = panel.querySelector('[data-md-name]');
  const sizeEl = panel.querySelector('[data-md-size]');

  const layout = panel;
  const tocCard = panel.querySelector('[data-md-toc]');
  if(layout && tocCard){
    layout.dataset.tocState = localStorage.getItem('songline-md-tool-toc-state') || 'expanded';
    function syncTocAria(){
      tocCard.setAttribute('aria-expanded', layout.dataset.tocState === 'expanded' ? 'true' : 'false');
    }
    function toggleToc(event){
      if(event && event.target && event.target.closest('a')) return;
      layout.dataset.tocState = layout.dataset.tocState === 'expanded' ? 'collapsed' : 'expanded';
      localStorage.setItem('songline-md-tool-toc-state', layout.dataset.tocState);
      syncTocAria();
    }
    tocCard.addEventListener('click', toggleToc);
    tocCard.addEventListener('keydown', function(event){
      if(event.key === 'Enter' || event.key === ' '){
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
      return '<li class="toc-level-' + rawLevel + ' toc-depth-' + relativeLevel + '" data-toc-level="' + rawLevel + '" data-toc-depth="' + relativeLevel + '"><a href="#' + h.id + '">' + h.textContent + '</a></li>';
    }).join('');
    toc.innerHTML = '<nav><ul>' + items + '</ul></nav>';
  }

  function resetPreviewState(){
    nameEl.textContent = '正在读取新文件...';
    sizeEl.textContent = '';
    preview.innerHTML = '<div class="md-empty-state"><h2>正在刷新预览</h2><p>新文件读取中。</p></div>';
    if(toc) toc.innerHTML = '<nav><ul><li><span class="meta">读取中...</span></li></ul></nav>';
    if(window.updateScrollButtons) window.updateScrollButtons();
  }

  function setFile(file){
    if(!file) return;
    resetPreviewState();
    const reader = new FileReader();
    reader.onload = function(){
      const text = String(reader.result || '');
      preview.innerHTML = window.SonglineMarkdown ? window.SonglineMarkdown.render(text) : text;
      if(window.SonglineEnhanceMarkdown) window.SonglineEnhanceMarkdown(preview);
      rebuildToc();
      nameEl.textContent = file.name || '已选择文件';
      sizeEl.textContent = file.size ? Math.max(1, Math.round(file.size / 1024)) + ' KB' : '';
      if(window.updateScrollButtons) window.updateScrollButtons();
    };
    reader.onerror = function(){
      preview.innerHTML = '<div class="md-empty-state"><h2>读取失败</h2><p>换一个文件试试。</p></div>';
      if(toc) toc.innerHTML = '<nav><ul><li><span class="meta">读取失败</span></li></ul></nav>';
      nameEl.textContent = '文件读取失败';
      sizeEl.textContent = '';
      if(window.updateScrollButtons) window.updateScrollButtons();
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
})();

(function(){
  const topBtn = document.querySelector('.tool-page-top-button');
  const bottomBtn = document.querySelector('.tool-page-bottom-button');
  const reader = document.querySelector('[data-md-preview]');
  if(!topBtn && !bottomBtn) return;

  function placeButton(btn, index){
    if(!btn) return;
    const vw = window.innerWidth || document.documentElement.clientWidth;
    const size = btn.offsetWidth || 54;
    const pageGap = 18;
    const sideGap = vw < 1080 ? 24 : 34;

    if(!reader){
      btn.style.removeProperty('left');
      btn.style.setProperty('right', index === 0 ? '82px' : '14px', 'important');
      return;
    }

    // 手机端空间太窄，保留右下角两个按钮；桌面端严格避开预览卡片边框。
    if(vw <= 760){
      btn.style.removeProperty('left');
      btn.style.setProperty('right', index === 0 ? '82px' : '14px', 'important');
      return;
    }

    const rect = reader.getBoundingClientRect();

    // 先放在阅读区域右侧，和边框至少隔一段距离。
    let left = rect.right + sideGap;

    // 如果右侧放不下，改放阅读区域左侧；绝不贴进阅读区域内部。
    if(left + size > vw - pageGap){
      const leftSide = rect.left - sideGap - size;
      if(leftSide >= pageGap){
        left = leftSide;
      }else{
        // 两边都放不下时，贴近视窗边缘，但隐藏按钮，避免压住阅读区边框。
        btn.classList.add('tool-edge-hidden');
        return;
      }
    }

    btn.classList.remove('tool-edge-hidden');
    btn.style.setProperty('left', Math.round(left) + 'px', 'important');
    btn.style.setProperty('right', 'auto', 'important');
  }

  window.updateScrollButtons = function(){
    const y = window.scrollY || document.documentElement.scrollTop || 0;
    const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    if(topBtn) topBtn.classList.toggle('show', y > 520);
    if(bottomBtn) bottomBtn.classList.toggle('show', maxY - y > 520);
    placeButton(topBtn, 0);
    placeButton(bottomBtn, 1);
  };

  if(topBtn){
    topBtn.addEventListener('click', function(){
      window.scrollTo({top:0, behavior:'smooth'});
    });
  }
  if(bottomBtn){
    bottomBtn.addEventListener('click', function(){
      window.scrollTo({top:document.documentElement.scrollHeight, behavior:'smooth'});
    });
  }
  window.addEventListener('scroll', window.updateScrollButtons, {passive:true});
  window.addEventListener('resize', window.updateScrollButtons);
  window.addEventListener('load', window.updateScrollButtons);
  window.updateScrollButtons();
  window.setTimeout(window.updateScrollButtons, 80);
  window.setTimeout(window.updateScrollButtons, 360);
})();
