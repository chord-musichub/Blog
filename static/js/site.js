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
