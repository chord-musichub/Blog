(function(){
  const btn = document.querySelector('[data-theme-toggle]');
  const KEY = 'songline-theme';
  const moon = `<svg class="theme-icon moon-icon" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <path d="M21 14.4A8.7 8.7 0 0 1 9.6 3a7.2 7.2 0 1 0 11.4 11.4Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
  const sun = `<svg class="theme-icon sun-icon" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/>
  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
</svg>`;
  function getTheme(){ return localStorage.getItem(KEY) || 'dark'; }
  function themedIcon(name, fallback){
    return window.SonglineIcons && window.SonglineIcons.svg ? window.SonglineIcons.svg(name) : fallback;
  }
  function apply(theme){
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.backgroundColor = theme === 'dark' ? '#0d1728' : '#fbfaf7';
    if(document.body) document.body.classList.toggle('dark', theme === 'dark');
    if(btn){
      // 显示当前状态：浅色显示太阳，深色显示月亮
      btn.innerHTML = theme === 'dark' ? themedIcon('moon', moon) : themedIcon('sun', sun);
      btn.setAttribute('aria-label', theme === 'dark' ? '当前深色模式，点击切换浅色' : '当前浅色模式，点击切换深色');
      btn.setAttribute('title', theme === 'dark' ? '当前深色模式' : '当前浅色模式');
    }
  }
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){ apply(getTheme()); });
  }else{
    apply(getTheme());
  }
  if(btn){
    btn.addEventListener('click', function(){
      const next = document.body.classList.contains('dark') ? 'light' : 'dark';
      localStorage.setItem(KEY, next);
      apply(next);
    });
  }
})();


(function(){
  function copyText(text){
    if(!text) return;
    if(navigator.clipboard && window.isSecureContext){
      navigator.clipboard.writeText(text).catch(function(){});
      return;
    }
    const input = document.createElement('textarea');
    input.value = text;
    input.setAttribute('readonly', '');
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    document.body.appendChild(input);
    input.select();
    try{ document.execCommand('copy'); }catch(e){}
    document.body.removeChild(input);
  }
  document.querySelectorAll('.email-contact[data-email]').forEach(function(link){
    link.addEventListener('click', function(){
      const email = link.getAttribute('data-email') || '';
      copyText(email);
      link.classList.add('copied');
      window.clearTimeout(link.__copiedTimer);
      link.__copiedTimer = window.setTimeout(function(){
        link.classList.remove('copied');
      }, 1600);
    });
  });
})();


(function(){
  function initViews(root){
    root = root || document;
    const counters = Array.from(root.querySelectorAll('.real-views[data-view-path]'));
    if(!counters.length) return;

    const seenThisPage = new Set();
    counters.forEach(function(el){
      const b = el.querySelector('b');
      const path = el.getAttribute('data-view-path') || window.location.pathname;
      const mode = el.getAttribute('data-view-mode') || (el.classList.contains('article-view-counter') ? 'post' : 'get');
      const key = 'songline-viewed:' + path;
      const shouldPost = mode === 'post' && sessionStorage.getItem(key) !== '1' && !seenThisPage.has(path);
      const method = shouldPost ? 'POST' : 'GET';

      if(el.dataset.viewLoading === '1') return;
      if(el.dataset.viewReady === '1' && method === 'POST') return;
      el.dataset.viewLoading = '1';
      el.dataset.viewReady = '1';
      seenThisPage.add(path);

      fetch('/api/views?path=' + encodeURIComponent(path), { method:method, credentials:'same-origin' })
        .then(function(r){ return r.ok ? r.json() : null; })
        .then(function(data){
          if(!data || typeof data.views !== 'number') return;
          if(b) b.textContent = data.views;
          el.dataset.viewLoaded = '1';
          if(shouldPost) sessionStorage.setItem(key, '1');
        })
        .catch(function(){
          if(b && !b.textContent) b.textContent = '0';
        })
        .finally(function(){
          el.dataset.viewLoading = '0';
        });
    });
  }

  window.SonglineInitViews = initViews;
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){ initViews(document); });
  }else{
    initViews(document);
  }
  window.addEventListener('songline:page-swap', function(event){
    initViews(event.detail && event.detail.root ? event.detail.root : document);
  });
})();


/* v13.8：首页文章推荐按阅读量排序 */
(function(){
  function initRecommended(root){
    root = root || document;
    const grid = root.querySelector('[data-recommended-posts]');
    if(!grid || grid.dataset.viewsSorted === '1') return;
    const cards = Array.from(grid.querySelectorAll('[data-recommend-path]'));
    if(cards.length < 2) return;
    grid.dataset.viewsSorted = '1';

    Promise.all(cards.map(function(card){
      const path = card.getAttribute('data-recommend-path') || '';
      return fetch('/api/views?path=' + encodeURIComponent(path), {method:'GET', credentials:'same-origin'})
        .then(function(r){ return r.ok ? r.json() : null; })
        .then(function(data){
          const views = data && typeof data.views === 'number' ? data.views : 0;
          card.dataset.views = String(views);
          const b = card.querySelector('.real-views b');
          if(b) b.textContent = views;
          return card;
        })
        .catch(function(){
          card.dataset.views = '0';
          return card;
        });
    })).then(function(){
      cards
        .sort(function(a,b){ return Number(b.dataset.views || 0) - Number(a.dataset.views || 0); })
        .forEach(function(card){ grid.appendChild(card); });
    });
  }

  window.SonglineInitRecommendedViews = initRecommended;
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){ initRecommended(document); });
  }else{
    initRecommended(document);
  }
  window.addEventListener('songline:page-swap', function(event){
    initRecommended(event.detail && event.detail.root ? event.detail.root : document);
  });
})();


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



/* v14.3：整卡点击统一事件委托，兜底 related-card */
(function(){
  const interactiveSelector = 'a, button, input, textarea, select, label, summary, [role="button"], [data-no-card-link]';

  function getHref(card){
    if(!card) return '';
    const direct = card.getAttribute('data-card-link');
    if(direct) return direct;
    const inner = card.querySelector('a[href]');
    return inner ? inner.getAttribute('href') : '';
  }

  function openHref(href, event){
    if(!href) return;
    if(event && (event.metaKey || event.ctrlKey)){
      window.open(href, '_blank', 'noopener');
      return;
    }
    window.location.href = href;
  }

  function findCard(target){
    return target && target.closest && target.closest('[data-card-link], .related-card');
  }

  document.querySelectorAll('[data-card-link], .related-card').forEach(function(card){
    if(getHref(card)){
      card.classList.add('clickable-card');
      if(!card.hasAttribute('tabindex')) card.setAttribute('tabindex', '0');
      if(!card.hasAttribute('role')) card.setAttribute('role', 'link');
    }
  });

  document.addEventListener('click', function(event){
    const card = findCard(event.target);
    if(!card) return;
    if(event.target.closest(interactiveSelector)) return;
    const href = getHref(card);
    if(!href) return;
    event.preventDefault();
    openHref(href, event);
  });

  document.addEventListener('keydown', function(event){
    if(event.key !== 'Enter' && event.key !== ' ') return;
    const card = findCard(event.target);
    if(!card) return;
    if(event.target.closest(interactiveSelector)) return;
    const href = getHref(card);
    if(!href) return;
    event.preventDefault();
    openHref(href, event);
  });
})();



/* v16.9：返回按钮改为固定返回对应上级页面，不再 history.back，避免像撤回上一动作 */



/* v14.3：背景图懒加载，减少首屏等待 */
(function(){
  const items = Array.from(document.querySelectorAll('.lazy-bg[data-bg]'));
  if(!items.length) return;

  function load(el){
    const bg = el.getAttribute('data-bg');
    if(!bg || el.dataset.bgLoaded === '1') return;
    el.dataset.bgLoaded = '1';
    const img = new Image();
    img.decoding = 'async';
    img.onload = function(){
      el.style.backgroundImage = "url('" + bg.replace(/'/g, "\\'") + "')";
      el.classList.add('lazy-bg-loaded');
    };
    img.onerror = function(){
      el.style.backgroundImage = "url('" + bg.replace(/'/g, "\\'") + "')";
      el.classList.add('lazy-bg-loaded');
    };
    img.src = bg;
  }

  if(!('IntersectionObserver' in window)){
    items.forEach(load);
    return;
  }

  const observer = new IntersectionObserver(function(entries){
    entries.forEach(function(entry){
      if(entry.isIntersecting){
        load(entry.target);
        observer.unobserve(entry.target);
      }
    });
  }, {rootMargin:'320px 0px'});

  items.forEach(function(el){ observer.observe(el); });
})();

(function(){
  if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const items = Array.from(document.querySelectorAll('.card, .page-hero, .hero-banner, .section-head'))
    .filter(function(el){
      return !el.closest('.article-shell') &&
        !el.classList.contains('article-reader') &&
        !el.classList.contains('markdown-body') &&
        !el.classList.contains('article-toc');
    });
  if(!items.length) return;
  if(!('IntersectionObserver' in window)){
    items.forEach(function(el){ el.classList.add('is-visible'); });
    return;
  }
  items.forEach(el => el.classList.add('reveal-item'));
  const io = new IntersectionObserver(function(entries){
    entries.forEach(function(entry){
      if(entry.isIntersecting){
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -6% 0px' });
  items.forEach(el => io.observe(el));
})();

/* v20.0.8：首页朋友横向轮播。超过 4 个朋友时用左右箭头查看更多。 */
(function(){
  function ready(fn){
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, {once:true});
    else fn();
  }
  ready(function(){
    const carousel = document.querySelector('[data-home-friend-carousel]');
    const track = document.querySelector('[data-home-friend-track]');
    if(!carousel || !track) return;
    const prev = document.querySelector('[data-home-friend-prev]');
    const next = document.querySelector('[data-home-friend-next]');
    const slides = Array.from(track.querySelectorAll('.home-friend-slide'));
    if(slides.length <= 4){
      if(prev) prev.hidden = true;
      if(next) next.hidden = true;
    }
    function step(){
      const first = slides[0];
      if(!first) return carousel.clientWidth || 320;
      const rect = first.getBoundingClientRect();
      const gap = parseFloat(getComputedStyle(track).gap || '18') || 18;
      return Math.max(180, rect.width + gap) * Math.min(2, Math.max(1, Math.floor(carousel.clientWidth / Math.max(1, rect.width + gap))));
    }
    function update(){
      if(!prev || !next) return;
      const max = track.scrollWidth - track.clientWidth - 2;
      prev.disabled = track.scrollLeft <= 2;
      next.disabled = track.scrollLeft >= max;
      const canScroll = track.scrollWidth > track.clientWidth + 4;
      prev.hidden = !canScroll;
      next.hidden = !canScroll;
    }
    function move(dir){
      track.scrollBy({left: dir * step(), behavior:'smooth'});
      window.setTimeout(update, 360);
    }
    if(prev){
      prev.setAttribute('data-no-page-loading', '');
      prev.addEventListener('click', function(e){ e.preventDefault(); e.stopPropagation(); move(-1); });
    }
    if(next){
      next.setAttribute('data-no-page-loading', '');
      next.addEventListener('click', function(e){ e.preventDefault(); e.stopPropagation(); move(1); });
    }
    track.addEventListener('scroll', update, {passive:true});
    window.addEventListener('resize', update);
    update();
  });
})();


/* v20.18.5-cleanup：已移除旧的阅读按钮 class 标记脚本，保留 body portal 方案。 */
/* v20.18.5：统一清理 Markdown 阅读/预览浮动按钮旧 inline 定位 */
(function(){
  function normalizeButton(btn){
    if(!btn) return;
    btn.style.removeProperty('left');
    btn.style.removeProperty('right');
    btn.style.removeProperty('top');
    btn.style.removeProperty('bottom');
    btn.style.removeProperty('position');
  }

  function normalizeFloatReadingButtons(){
    var topBtn = document.querySelector('.back-to-top-button');
    var bottomBtn = document.querySelector('.scroll-to-bottom-button');
    var hasReader =
      !!document.querySelector('.article-reader, .article-shell, .article-layout, .post-single, .post-layout, .md-tool-layout, .md-tool-preview, [data-article-renderer="songline-markdown"]');

    if(!topBtn && !bottomBtn){
      document.documentElement.classList.remove('has-reading-float-tools');
      document.documentElement.classList.remove('has-mobile-reading-tools');
      return;
    }

    normalizeButton(topBtn);
    normalizeButton(bottomBtn);

    document.documentElement.classList.toggle('has-reading-float-tools', hasReader);
    if(window.matchMedia && window.matchMedia('(max-width: 820px)').matches){
      document.documentElement.classList.toggle('has-mobile-reading-tools', hasReader);
    }
  }

  window.SonglineNormalizeFloatReadingButtons = normalizeFloatReadingButtons;

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', normalizeFloatReadingButtons);
  }else{
    normalizeFloatReadingButtons();
  }

  window.addEventListener('pageshow', normalizeFloatReadingButtons);
  window.addEventListener('resize', normalizeFloatReadingButtons);
  window.addEventListener('orientationchange', normalizeFloatReadingButtons);
  window.addEventListener('songline:page-swap', function(){
    window.setTimeout(normalizeFloatReadingButtons, 40);
    window.setTimeout(normalizeFloatReadingButtons, 180);
  });
})();


/* v20.18.5：把 Markdown 阅读器置顶/置底按钮移到 body，彻底摆脱文章容器定位影响 */
(function(){
  const READER_SELECTOR = [
    '.article-reader',
    '.article-shell',
    '.article-layout',
    '.post-single',
    '.post-layout',
    '.md-tool-layout',
    '.md-tool-preview',
    '[data-article-renderer="songline-markdown"]'
  ].join(',');

  function hasReaderPage(){
    return !!document.querySelector(READER_SELECTOR);
  }

  function cleanInline(btn){
    if(!btn) return;
    ['left','right','top','bottom','position','transform','translate','inset','margin'].forEach(function(prop){
      btn.style.removeProperty(prop);
    });
  }

  function pickButton(selector){
    const nodes = Array.from(document.querySelectorAll(selector));
    if(!nodes.length) return null;

    // 优先保留当前 main/container 里的新按钮；如果没有，再保留已经 portal 到 body 的按钮。
    const fresh = nodes.filter(function(node){
      return node.dataset.songlineFloatPortal !== '1';
    });
    const chosen = fresh.length ? fresh[fresh.length - 1] : nodes[nodes.length - 1];

    nodes.forEach(function(node){
      if(node !== chosen) node.remove();
    });

    return chosen;
  }

  function bindButton(btn, type){
    if(!btn || btn.dataset.songlineFloatBound === '1') return;
    btn.dataset.songlineFloatBound = '1';

    btn.addEventListener('click', function(event){
      event.preventDefault();
      if(type === 'top'){
        window.scrollTo({top:0, behavior:'smooth'});
      }else{
        const target = Math.max(
          document.body.scrollHeight,
          document.documentElement.scrollHeight,
          document.documentElement.offsetHeight
        );
        window.scrollTo({top:target, behavior:'smooth'});
      }
    });
  }

  function portalButton(btn, type){
    if(!btn) return null;

    btn.dataset.songlineFloatPortal = '1';
    btn.dataset.songlineFloatType = type;
    btn.classList.add('songline-reading-float-button');
    cleanInline(btn);
    bindButton(btn, type);

    if(btn.parentNode !== document.body){
      document.body.appendChild(btn);
    }

    return btn;
  }

  function removePortaledButtons(){
    document.querySelectorAll('[data-songline-float-portal="1"], .songline-reading-float-button').forEach(function(node){
      node.remove();
    });
  }

  function updateVisibility(topBtn, bottomBtn){
    const y = window.scrollY || document.documentElement.scrollTop || 0;
    const maxY = Math.max(
      0,
      Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, document.documentElement.offsetHeight) - window.innerHeight
    );

    if(topBtn){
      cleanInline(topBtn);
      topBtn.classList.toggle('show', y > 360);
    }

    if(bottomBtn){
      cleanInline(bottomBtn);
      bottomBtn.classList.toggle('show', maxY - y > 360);
    }
  }

  function normalizeFloatReadingButtons(){
    const isReader = hasReaderPage();

    if(!isReader){
      removePortaledButtons();
      document.documentElement.classList.remove('has-reading-float-tools');
      document.documentElement.classList.remove('has-mobile-reading-tools');
      return;
    }

    const topBtn = portalButton(pickButton('.back-to-top-button'), 'top');
    const bottomBtn = portalButton(pickButton('.scroll-to-bottom-button'), 'bottom');

    if(!topBtn && !bottomBtn){
      document.documentElement.classList.remove('has-reading-float-tools');
      document.documentElement.classList.remove('has-mobile-reading-tools');
      return;
    }

    document.documentElement.classList.add('has-reading-float-tools');
    if(window.matchMedia && window.matchMedia('(max-width: 820px)').matches){
      document.documentElement.classList.add('has-mobile-reading-tools');
    }else{
      document.documentElement.classList.remove('has-mobile-reading-tools');
    }

    updateVisibility(topBtn, bottomBtn);
  }

  window.SonglineNormalizeFloatReadingButtons = normalizeFloatReadingButtons;

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', normalizeFloatReadingButtons);
  }else{
    normalizeFloatReadingButtons();
  }

  window.addEventListener('scroll', function(){
    const topBtn = document.querySelector('.back-to-top-button.songline-reading-float-button');
    const bottomBtn = document.querySelector('.scroll-to-bottom-button.songline-reading-float-button');
    if(topBtn || bottomBtn) updateVisibility(topBtn, bottomBtn);
  }, {passive:true});

  window.addEventListener('resize', normalizeFloatReadingButtons);
  window.addEventListener('orientationchange', normalizeFloatReadingButtons);
  window.addEventListener('pageshow', normalizeFloatReadingButtons);

  window.addEventListener('songline:page-swap', function(){
    // AJAX 切页时 main 会换，但 portal 到 body 的旧按钮不会自动跟着 main 删除；
    // 所以这里分几次归一化，避免旧按钮残留或新按钮还没插入。
    setTimeout(normalizeFloatReadingButtons, 0);
    setTimeout(normalizeFloatReadingButtons, 80);
    setTimeout(normalizeFloatReadingButtons, 260);
  });
})();


/* v20.18.5-cleanup 说明：
   阅读器置顶/置底按钮现在只由 SonglineNormalizeFloatReadingButtons 的 body portal 逻辑接管。
*/
