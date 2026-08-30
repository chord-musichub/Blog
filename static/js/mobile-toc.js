(function(){
  'use strict';

  var mq = window.matchMedia ? window.matchMedia('(max-width: 820px)') : null;
  var drawerId = 'songline-mobile-toc-drawer';
  var fabId = 'songline-mobile-toc-fab';
  var backdropId = 'songline-mobile-toc-backdrop';
  var state = {
    links: [],
    source: null,
    readyForPath: ''
  };

  function isMobile(){
    return !mq || mq.matches;
  }

  function articleRoot(root){
    root = root || document;
    return root.querySelector('.article-shell, .article-layout, .post-single, .post-layout, .single-post, article') || root;
  }

  function findTocSource(root){
    root = root || document;
    var candidates = [
      '.toc-card',
      '.article-toc',
      '.post-toc',
      '.reading-toc',
      'aside.toc',
      'nav#TableOfContents',
      '#TableOfContents',
      '.table-of-contents'
    ];

    for(var i = 0; i < candidates.length; i++){
      var nodes = root.querySelectorAll(candidates[i]);
      for(var j = 0; j < nodes.length; j++){
        var node = nodes[j];
        if(node.dataset && node.dataset.mobileTocUi === '1') continue;
        if(node.querySelector && node.querySelector('a[href^="#"]')) return node;
      }
    }
    return null;
  }

  function collectLinks(source){
    if(!source) return [];
    return Array.from(source.querySelectorAll('a[href^="#"]')).map(function(a){
      var href = a.getAttribute('href') || '';
      var text = (a.textContent || '').replace(/\s+/g, ' ').trim();
      return {
        href: href,
        text: text || href.replace(/^#/, ''),
        depth: getDepth(a)
      };
    }).filter(function(item){
      return item.href && item.href.length > 1;
    });
  }

  function getDepth(link){
    var depth = 1;
    var li = link.closest ? link.closest('li') : null;
    if(!li) return depth;
    var parent = li.parentElement;
    while(parent){
      if(parent.matches && (parent.matches('ul') || parent.matches('ol'))) depth++;
      parent = parent.parentElement;
      if(parent && parent.matches && parent.matches('.toc-card, .article-toc, .post-toc, .reading-toc, aside.toc, #TableOfContents')) break;
    }
    return Math.max(1, Math.min(depth, 4));
  }

  function removeUi(){
    [drawerId, fabId, backdropId].forEach(function(id){
      var node = document.getElementById(id);
      if(node) node.remove();
    });
    document.documentElement.classList.remove('mobile-toc-open');
  }

  function cleanupLegacyToc(root){
    root = root || document;
    root.querySelectorAll('[data-mobile-toc-toggle], .mobile-toc-toggle').forEach(function(node){
      // 上一版正文流折叠目录按钮，手机端已经由悬浮按钮替代，直接移除避免重复。
      if(node && node.parentNode) node.parentNode.removeChild(node);
    });
    root.querySelectorAll('.mobile-reading-toc').forEach(function(node){
      node.classList.remove('mobile-reading-toc', 'is-open');
    });
    root.querySelectorAll('.mobile-toc-content').forEach(function(node){
      node.hidden = false;
      node.classList.remove('mobile-toc-content');
    });
  }

  function ensureUi(){
    var fab = document.getElementById(fabId);
    var drawer = document.getElementById(drawerId);
    var backdrop = document.getElementById(backdropId);

    if(fab && drawer && backdrop) return { fab:fab, drawer:drawer, backdrop:backdrop };

    removeUi();

    backdrop = document.createElement('div');
    backdrop.id = backdropId;
    backdrop.className = 'mobile-toc-backdrop';
    backdrop.dataset.mobileTocUi = '1';

    fab = document.createElement('button');
    fab.id = fabId;
    fab.className = 'mobile-toc-fab';
    fab.type = 'button';
    fab.dataset.mobileTocUi = '1';
    fab.setAttribute('aria-controls', drawerId);
    fab.setAttribute('aria-expanded', 'false');
    fab.title = '打开目录';
    fab.innerHTML = '<span class="ui-icon" data-ui-icon="menu" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7h14M5 12h14M5 17h14"/></svg></span>';

    drawer = document.createElement('section');
    drawer.id = drawerId;
    drawer.className = 'mobile-toc-drawer';
    drawer.dataset.mobileTocUi = '1';
    drawer.setAttribute('aria-label', '文章目录');
    drawer.setAttribute('aria-hidden', 'true');
    drawer.innerHTML = [
      '<div class="mobile-toc-drawer-head">',
      '  <div>',
      '    <strong>文章目录</strong>',
      '    <small data-mobile-toc-count></small>',
      '  </div>',
      '  <button type="button" class="mobile-toc-close" data-mobile-toc-close aria-label="关闭目录">×</button>',
      '</div>',
      '<label class="mobile-toc-search">',
      '  <span>搜索目录</span>',
      '  <input type="search" data-mobile-toc-search placeholder="搜索标题..." autocomplete="off">',
      '</label>',
      '<nav class="mobile-toc-list" data-mobile-toc-list></nav>'
    ].join('');

    document.body.appendChild(backdrop);
    document.body.appendChild(fab);
    document.body.appendChild(drawer);

    fab.addEventListener('click', function(){ openDrawer(); });
    backdrop.addEventListener('click', closeDrawer);
    drawer.querySelector('[data-mobile-toc-close]').addEventListener('click', closeDrawer);
    drawer.querySelector('[data-mobile-toc-search]').addEventListener('input', function(){
      renderLinks(this.value || '');
    });

    document.addEventListener('keydown', function(event){
      if(event.key === 'Escape') closeDrawer();
    });

    return { fab:fab, drawer:drawer, backdrop:backdrop };
  }

  function markReadingTools(){
    document.documentElement.classList.add('has-mobile-reading-tools');
  }

  function unmarkReadingTools(){
    document.documentElement.classList.remove('has-mobile-reading-tools');
  }

  function openDrawer(){
    if(!isMobile()) return;
    var ui = ensureUi();
    document.documentElement.classList.add('mobile-toc-open');
    ui.drawer.setAttribute('aria-hidden', 'false');
    ui.fab.setAttribute('aria-expanded', 'true');
    var input = ui.drawer.querySelector('[data-mobile-toc-search]');
    if(input){
      input.value = '';
      renderLinks('');
      window.setTimeout(function(){ input.focus({preventScroll:true}); }, 80);
    }
  }

  function closeDrawer(){
    var fab = document.getElementById(fabId);
    var drawer = document.getElementById(drawerId);
    document.documentElement.classList.remove('mobile-toc-open');
    if(drawer) drawer.setAttribute('aria-hidden', 'true');
    if(fab) fab.setAttribute('aria-expanded', 'false');
  }

  function renderLinks(query){
    var drawer = document.getElementById(drawerId);
    if(!drawer) return;
    var list = drawer.querySelector('[data-mobile-toc-list]');
    var count = drawer.querySelector('[data-mobile-toc-count]');
    var q = (query || '').trim().toLowerCase();
    var links = state.links.filter(function(item){
      return !q || item.text.toLowerCase().indexOf(q) !== -1;
    });

    if(count) count.textContent = state.links.length ? (state.links.length + ' 个标题') : '暂无目录';

    if(!links.length){
      list.innerHTML = '<p class="mobile-toc-empty">没有匹配的标题</p>';
      return;
    }

    list.innerHTML = links.map(function(item){
      var safeText = escapeHtml(item.text);
      var safeHref = escapeAttr(item.href);
      return '<a href="' + safeHref + '" class="mobile-toc-item depth-' + item.depth + '">' + safeText + '</a>';
    }).join('');

    list.querySelectorAll('a[href^="#"]').forEach(function(a){
      a.addEventListener('click', function(event){
        var href = a.getAttribute('href');
        var target = href && document.querySelector(cssEscapeHash(href));
        if(target){
          event.preventDefault();
          closeDrawer();
          window.setTimeout(function(){
            target.scrollIntoView({behavior:'smooth', block:'start'});
            history.replaceState(null, '', href);
          }, 80);
        }else{
          closeDrawer();
        }
      });
    });
  }

  function cssEscapeHash(hash){
    if(!hash || hash.charAt(0) !== '#') return hash;
    var id = decodeURIComponent(hash.slice(1));
    if(window.CSS && CSS.escape) return '#' + CSS.escape(id);
    return '#' + id.replace(/([ #;?%&,.+*~\':"!^$[\]()=>|/@])/g, '\\$1');
  }

  function escapeHtml(str){
    return String(str || '').replace(/[&<>"']/g, function(ch){
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch];
    });
  }

  function escapeAttr(str){
    return escapeHtml(str).replace(/`/g, '&#96;');
  }

  function hideSource(source){
    if(!source) return;
    source.classList.add('mobile-toc-source-hidden');
    source.setAttribute('aria-hidden', 'true');
    source.dataset.mobileTocSource = '1';
    var parentAside = source.closest && source.closest('.article-toc, .toc-card, .post-toc, .reading-toc, aside.toc');
    if(parentAside && parentAside !== source){
      parentAside.classList.add('mobile-toc-source-hidden');
      parentAside.setAttribute('aria-hidden', 'true');
      parentAside.dataset.mobileTocSource = '1';
    }
  }

  function showSource(source){
    if(!source) return;
    source.classList.remove('mobile-toc-source-hidden');
    source.removeAttribute('aria-hidden');
    delete source.dataset.mobileTocSource;
    var hidden = document.querySelectorAll('[data-mobile-toc-source="1"]');
    hidden.forEach(function(node){
      node.classList.remove('mobile-toc-source-hidden');
      node.removeAttribute('aria-hidden');
      delete node.dataset.mobileTocSource;
    });
  }

  function init(root){
    root = root || document;
    cleanupLegacyToc(document);

    if(!isMobile()){
      if(state.source) showSource(state.source);
      unmarkReadingTools();
      removeUi();
      return;
    }

    var container = articleRoot(root);
    var source = findTocSource(container) || findTocSource(document);
    var links = collectLinks(source);

    if(!source || links.length === 0){
      unmarkReadingTools();
      removeUi();
      return;
    }

    if(state.source && state.source !== source) showSource(state.source);
    state.source = source;
    state.links = links;
    state.readyForPath = location.pathname;

    hideSource(source);
    markReadingTools();
    ensureUi();
    renderLinks('');
  }

  function boot(root){
    removeUi();
    init(root || document);
  }
  window.SonglineInitMobileToc = boot;

  if(mq && mq.addEventListener){
    mq.addEventListener('change', function(){ init(document); });
  }
})();
