(function(){
  const root = document.documentElement;
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isHome = window.location.pathname === '/' || (document.body && document.body.dataset && document.body.dataset.pageKind === 'home');
  const bootKey = 'songline-home-boot-v20.20.6';
  const bootWelcomeText = (document.body && document.body.getAttribute('data-boot-welcome')) || '欢迎回来';
  const shouldBoot = !reduceMotion && isHome && !sessionStorage.getItem(bootKey);

  function forceBootReveal(reason){
    try{
      if(window.__songlineBootPrepFallback) window.clearTimeout(window.__songlineBootPrepFallback);
      sessionStorage.setItem(bootKey, '1');
    }catch(e){}
    root.classList.remove('is-booting', 'boot-opening', 'is-boot-preparing', 'is-boot-interactive', 'boot-frame-settling');
    const overlay = document.querySelector('.site-boot-overlay');
    if(overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    try{ window.dispatchEvent(new Event('resize')); }catch(e){}
  }

  // v20.20.6：浏览器刷新时，缓存或延迟脚本竞争可能让内联启动遮罩一直可见。
  // 在用户看到空白页面前移除该遮罩。
  window.setTimeout(function(){
    if(root.classList.contains('is-boot-preparing') && !document.querySelector('.site-boot-overlay')){
      forceBootReveal('early-no-overlay');
    }
  }, 900);

  let loader = null;
  let hideTimer = 0;
  let navSwapping = false;

  function ensureLoader(){
    if(loader) return loader;
    loader = document.createElement('div');
    loader.className = 'page-loading-orb';
    loader.setAttribute('aria-hidden', 'true');
    loader.innerHTML = '<div class="page-loading-pill"><span class="page-loading-ring"></span><span class="page-loading-text">加载中</span></div>';
    document.body.appendChild(loader);
    return loader;
  }

  function show(){
    if(navSwapping || root.classList.contains('is-nav-swapping')) return;
    if(reduceMotion || (shouldBoot && !sessionStorage.getItem(bootKey))) return;
    window.clearTimeout(hideTimer);
    root.classList.add('is-page-loading');
    if(document.body) ensureLoader();
  }

  function hide(){
    if(navSwapping || root.classList.contains('is-nav-swapping')) return;
    if(reduceMotion || (shouldBoot && !sessionStorage.getItem(bootKey))) return;
    if(!document.body) return;
    ensureLoader();
    root.classList.add('is-page-loaded');
    root.classList.remove('is-page-loading');
    hideTimer = window.setTimeout(function(){ root.classList.remove('is-page-loaded'); }, 520);
  }

  function isPlainLeftClick(event){
    return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
  }

  function shouldSkipSearchControl(target){
    return !!(target && target.closest && target.closest('[data-no-page-loading], .search-submit, .searchbox, .friend-search-submit, .tools-searchbox, [data-tools-search], [data-tools-search-submit]'));
  }

  function shouldHandleLink(link){
    if(!link) return false;
    if(link.target && link.target !== '_self') return false;
    if(link.hasAttribute('download')) return false;
    const href = link.getAttribute('href') || '';
    if(!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) return false;
    try{
      const url = new URL(link.href, window.location.href);
      if(url.origin !== window.location.origin) return false;
      if(url.pathname === window.location.pathname && url.search === window.location.search && url.hash) return false;
      return true;
    }catch(e){ return false; }
  }

  function ensureBootOverlay(){
    let overlay = document.querySelector('.site-boot-overlay');
    if(overlay) return overlay;
    overlay = document.createElement('div');
    overlay.className = 'site-boot-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = [
      '<div class="boot-panel left"></div>',
      '<div class="boot-panel right"></div>',
      '<span class="boot-progress-line left"></span>',
      '<span class="boot-progress-line right"></span>',
      '<div class="boot-readout">',
      '  <div class="boot-progress-number">00%</div>',
      '  <div class="boot-welcome"></div>',
      '</div>'
    ].join('');
    document.documentElement.appendChild(overlay);
    window.requestAnimationFrame(function(){
      root.classList.remove('is-boot-preparing');
    });
    return overlay;
  }

  function easeOutCubic(t){ return 1 - Math.pow(1 - t, 3); }

  function normalizeBootAssetUrl(url){
    if(!url) return '';
    url = String(url).trim().replace(/^['"]|['"]$/g, '');
    if(!url || url === 'none' || url.indexOf('data:') === 0 || url.indexOf('blob:') === 0) return '';
    try{
      return new URL(url, window.location.href).href;
    }catch(e){
      return '';
    }
  }

  function extractCssUrls(value){
    const urls = [];
    if(!value) return urls;
    String(value).replace(/url\((['"]?)(.*?)\1\)/g, function(_, quote, raw){
      const normalized = normalizeBootAssetUrl(raw);
      if(normalized) urls.push(normalized);
      return _;
    });
    return urls;
  }

  function addBootAsset(set, url){
    const normalized = normalizeBootAssetUrl(url);
    if(normalized) set.add(normalized);
  }

  function collectBootAssetUrls(){
    const urls = new Set();
    const priorityNodes = [
      '.hero-banner',
      '.hero-banner.hero-banner-image-only',
      '.site-bg-layer',
      '[data-waapi-orbit]',
      '.recommended-card',
      '.notice-item',
      '.home-friend-carousel',
      'img',
      '.lazy-bg[data-bg]',
      '[style*="background-image"]',
      '[style*="--site-bg-image"]'
    ];

    priorityNodes.forEach(function(selector){
      document.querySelectorAll(selector).forEach(function(el){
        if(el.dataset && el.dataset.bg) addBootAsset(urls, el.dataset.bg);
        if(el.currentSrc) addBootAsset(urls, el.currentSrc);
        if(el.getAttribute){
          addBootAsset(urls, el.getAttribute('src'));
          const srcset = el.getAttribute('srcset');
          if(srcset){
            srcset.split(',').forEach(function(item){
              const candidate = item.trim().split(/\s+/)[0];
              addBootAsset(urls, candidate);
            });
          }
          const style = el.getAttribute('style') || '';
          extractCssUrls(style).forEach(function(url){ addBootAsset(urls, url); });
        }
      });
    });

    // 兜底：读取已经计算出的 background-image，避免某些样式不在 inline 中。
    ['.hero-banner', '.site-bg-layer', '.page-hero'].forEach(function(selector){
      document.querySelectorAll(selector).forEach(function(el){
        try{
          extractCssUrls(getComputedStyle(el).backgroundImage).forEach(function(url){ addBootAsset(urls, url); });
        }catch(e){}
      });
    });

    return Array.from(urls).slice(0, 48);
  }

  function pageLoadPromise(){
    if(document.readyState === 'complete') return Promise.resolve();
    return new Promise(function(resolve){
      window.addEventListener('load', resolve, { once:true });
    });
  }

  function preloadBootAssets(){
    const urls = collectBootAssetUrls();
    const state = { total:urls.length, done:0, ready:false };
    function markDone(){ state.done += 1; }

    const imageTasks = urls.map(function(url){
      return new Promise(function(resolve){
        const img = new Image();
        img.decoding = 'async';
        img.onload = function(){ markDone(); resolve(url); };
        img.onerror = function(){ markDone(); resolve(url); };
        img.src = url;
      });
    });

    const fontTask = document.fonts && document.fonts.ready ? document.fonts.ready.catch(function(){}) : Promise.resolve();
    state.promise = Promise.allSettled([Promise.allSettled(imageTasks), fontTask, pageLoadPromise()]).then(function(){
      state.ready = true;
      return state;
    });
    return state;
  }

  function hydratePreloadedLazyBackgrounds(){
    document.querySelectorAll('.lazy-bg[data-bg]').forEach(function(el){
      const bg = el.getAttribute('data-bg');
      if(!bg || el.dataset.bgLoaded === '1') return;
      el.dataset.bgLoaded = '1';
      el.style.backgroundImage = "url('" + bg.replace(/'/g, "\\'") + "')";
      el.classList.add('lazy-bg-loaded');
    });
  }


  function settleBootRevealFrame(){
    root.classList.add('boot-frame-settling');
    root.classList.remove('is-boot-preparing');
    hydratePreloadedLazyBackgrounds();
    try{ window.dispatchEvent(new Event('resize')); }catch(e){}
    try{
      if(window.SonglinePageModules && typeof window.SonglinePageModules.scan === 'function'){
        window.SonglinePageModules.scan(document);
      }
      if(window.SonglineInitHomeOrbit) window.SonglineInitHomeOrbit(document);
      if(window.SonglineInitTagFlow) window.SonglineInitTagFlow(document);
    }catch(e){}
    try{ void document.body.offsetHeight; }catch(e){}
  }

  function runBootSequence(){
    if(!shouldBoot){
      if(window.__songlineBootPrepFallback) window.clearTimeout(window.__songlineBootPrepFallback);
      root.classList.remove('is-boot-preparing');
      return;
    }
    const overlay = ensureBootOverlay();
    if(window.__songlineBootPrepFallback) window.clearTimeout(window.__songlineBootPrepFallback);
    const bootHardTimeout = window.setTimeout(function(){ forceBootReveal('hard-timeout'); }, 6800);
    const numberNode = overlay.querySelector('.boot-progress-number');
    const welcomeNode = overlay.querySelector('.boot-welcome');
    if(welcomeNode) welcomeNode.textContent = bootWelcomeText;
    const bootAssets = preloadBootAssets();
    let loadReady = false;
    let opening = false;
    const startTime = performance.now();
    const minDuration = 1820;
    const maxDuration = 5200;

    bootAssets.promise.then(function(){
      loadReady = true;
      hydratePreloadedLazyBackgrounds();
    }).catch(function(){
      loadReady = true;
      hydratePreloadedLazyBackgrounds();
    });

    function setProgress(value){
      const p = Math.max(0, Math.min(100, value));
      overlay.style.setProperty('--boot-progress', p.toFixed(2));
      if(numberNode) numberNode.textContent = String(Math.round(p)).padStart(2, '0') + '%';
    }

    function complete(){
      if(opening) return;
      opening = true;
      window.clearTimeout(bootHardTimeout);
      loadReady = true;
      hydratePreloadedLazyBackgrounds();
      setProgress(100);
      overlay.classList.add('is-complete');
      window.setTimeout(function(){
        settleBootRevealFrame();
        window.requestAnimationFrame(function(){
          window.requestAnimationFrame(function(){
            overlay.classList.add('is-opening');
            root.classList.add('boot-opening', 'is-boot-interactive');
            // v20.19.3：此时幕布已设为 pointer-events:none，立即恢复滚动和点击，
            // 无需等待清理超时。
            root.classList.remove('is-booting', 'is-boot-preparing', 'boot-frame-settling');
          });
        });
      }, 1180);
      window.setTimeout(function(){
        window.clearTimeout(bootHardTimeout);
        sessionStorage.setItem(bootKey, '1');
        root.classList.remove('is-booting', 'boot-opening', 'is-boot-preparing', 'is-boot-interactive', 'boot-frame-settling');
        if(overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
        try{ window.dispatchEvent(new Event('resize')); }catch(e){}
      }, 1420);
    }

    function tick(now){
      const elapsed = now - startTime;
      const timeBase = Math.min(1, elapsed / minDuration);
      const assetRatio = bootAssets.total ? Math.min(1, bootAssets.done / bootAssets.total) : 1;
      const timeProgress = easeOutCubic(timeBase) * 70;
      const assetProgress = assetRatio * 26;
      let progress = Math.min(98, Math.max(timeProgress, 18 + assetProgress + timeProgress * .28));

      if(!loadReady && elapsed > maxDuration){
        loadReady = true;
        hydratePreloadedLazyBackgrounds();
      }
      if(loadReady && elapsed >= minDuration){
        const finishT = Math.min(1, (elapsed - minDuration) / 520);
        progress = 96 + easeOutCubic(finishT) * 4;
      }
      setProgress(progress);
      if(progress >= 99.9 && loadReady){ complete(); }
      else { window.requestAnimationFrame(tick); }
    }

    root.classList.add('is-booting');
    overlay.setAttribute('data-preload-total', String(bootAssets.total));
    setProgress(0);
    window.requestAnimationFrame(tick);
  }

  let navSliderState = {
    x:0,
    width:0,
    ready:false,
    hoverLink:null
  };

  function ensureNavSlider(){
    const nav = document.querySelector('.modern-nav-links');
    if(!nav) return null;

    // 若旧版本遗留了指示器，先从 DOM 中移除。
    nav.querySelectorAll('.nav-active-indicator').forEach(function(oldIndicator){
      oldIndicator.remove();
    });

    let slider = nav.querySelector('.songline-nav-slider');
    if(!slider){
      slider = document.createElement('span');
      slider.className = 'songline-nav-slider';
      slider.setAttribute('aria-hidden', 'true');
      nav.insertBefore(slider, nav.firstChild);
    }
    return slider;
  }

  function navBoxForLink(link){
    const nav = document.querySelector('.modern-nav-links');
    if(!nav || !link) return null;
    const navRect = nav.getBoundingClientRect();
    const linkRect = link.getBoundingClientRect();
    return {
      x: linkRect.left - navRect.left,
      width: linkRect.width
    };
  }

  function activeNavLink(){
    return document.querySelector('.modern-nav-links a.active') || document.querySelector('.modern-nav-links a[href="/"]');
  }

  function moveNavSliderTo(link, instant){
    const slider = ensureNavSlider();
    const box = navBoxForLink(link);
    if(!slider || !box) return;

    if(instant || !navSliderState.ready){
      slider.classList.add('is-instant');
    }else{
      slider.classList.remove('is-instant');
    }

    slider.style.transform = 'translate3d(' + box.x + 'px,0,0)';
    slider.style.width = box.width + 'px';
    slider.style.opacity = '1';
    slider.style.visibility = 'visible';

    navSliderState.x = box.x;
    navSliderState.width = box.width;
    navSliderState.ready = true;

    if(instant){
      window.setTimeout(function(){ slider.classList.remove('is-instant'); }, 30);
    }
  }

  function updateNavIndicator(instant){
    moveNavSliderTo(activeNavLink(), instant);
  }

  function setNavActiveNow(link){
    const nav = document.querySelector('.modern-nav-links');
    if(!nav || !link) return;
    nav.querySelectorAll('a.active').forEach(function(item){ item.classList.remove('active'); });
    link.classList.add('active');
    nav.classList.add('is-click-sliding');
    moveNavSliderTo(link, false);
    window.setTimeout(function(){ nav.classList.remove('is-click-sliding'); }, 620);
  }

  function setNavActiveByURL(url){
    const nav = document.querySelector('.modern-nav-links');
    if(!nav || !url) return;
    const targetIndex = navIndex(url.pathname);
    let target = null;
    nav.querySelectorAll('a[href]').forEach(function(item){
      let match = false;
      try{
        const itemURL = new URL(item.href, window.location.origin);
        match = navIndex(itemURL.pathname) === targetIndex;
      }catch(e){}
      item.classList.toggle('active', match);
      if(match) target = item;
    });
    if(target) moveNavSliderTo(target, false);
  }

  function bindNavIndicatorHover(){
    const nav = document.querySelector('.modern-nav-links');
    if(!nav || nav.dataset.songlineSliderReady === '1') return;
    nav.dataset.songlineSliderReady = '1';

    nav.addEventListener('pointerover', function(event){
      const link = event.target && event.target.closest ? event.target.closest('a[href]') : null;
      if(!link || !nav.contains(link)) return;
      if(navSliderState.hoverLink === link) return;
      navSliderState.hoverLink = link;
      nav.classList.add('is-hover-sliding');
      moveNavSliderTo(link, false);
    });

    nav.addEventListener('pointerleave', function(){
      navSliderState.hoverLink = null;
      nav.classList.remove('is-hover-sliding');
      updateNavIndicator(false);
    });
  }

  const navOrder = ['/', '/posts/', '/tags/', '/friends/', '/tools/'];

  function normalizePath(pathname){
    if(!pathname) return '/';
    if(pathname !== '/' && !pathname.endsWith('/')) pathname += '/';
    return pathname;
  }

  function navIndex(pathname){
    pathname = normalizePath(pathname);
    if(pathname === '/') return 0;
    if(pathname.startsWith('/posts/')) return 1;
    if(pathname.startsWith('/tags/')) return 2;
    if(pathname.startsWith('/friends/')) return 3;
    if(pathname.startsWith('/tools/')) return 4;
    return -1;
  }

  function hydrateDynamicBits(scope){
    if(!scope) return;
    scope.querySelectorAll('[data-bg]').forEach(function(el){
      const bg = el.getAttribute('data-bg');
      if(bg) el.style.backgroundImage = 'url("' + bg.replace(/"/g, '\\"') + '")';
    });
    scope.querySelectorAll('script').forEach(function(oldScript){
      const script = document.createElement('script');
      Array.prototype.slice.call(oldScript.attributes).forEach(function(attr){
        script.setAttribute(attr.name, attr.value);
      });
      if(!oldScript.src) script.textContent = oldScript.textContent || '';
      oldScript.replaceWith(script);
    });
    window.dispatchEvent(new CustomEvent('songline:page-swap', { detail:{ root:scope } }));
  }

  function syncDocumentShell(doc, url, shouldPush){
    if(doc.title) document.title = doc.title;

    const nextBody = doc.body;
    if(nextBody && document.body){
      const isDark = document.body.classList.contains('dark');
      const currentThemeClass = isDark ? 'dark' : '';
      document.body.className = nextBody.className || '';
      if(currentThemeClass) document.body.classList.add(currentThemeClass);
      // AJAX 换页时同步页面语义，供按页加载的样式与模块判断当前页面。
      ['pageKind', 'pageSection', 'pageLayout', 'bootWelcome'].forEach(function(name){
        if(nextBody.dataset && nextBody.dataset[name]){
          document.body.dataset[name] = nextBody.dataset[name];
        }else{
          delete document.body.dataset[name];
        }
      });
    }

    bindNavIndicatorHover();
    setNavActiveByURL(url);

    const nextLogo = doc.querySelector('.logo');
    const logo = document.querySelector('.logo');
    if(nextLogo && logo) logo.className = nextLogo.className;

    const nextDesc = doc.querySelector('meta[name="description"]');
    const desc = document.querySelector('meta[name="description"]');
    if(nextDesc && desc) desc.setAttribute('content', nextDesc.getAttribute('content') || '');

    if(shouldPush !== false){
      history.pushState({ songlineNav:true }, '', url.href);
    }
  }

  function markLiveEnter(rootNode, direction){
    if(!rootNode) return;
    const selectors = [
      '.page-hero',
      '.hero-banner',
      '.hero-intro-strip',
      '.waapi-orbital-section',
      '.section',
      '.card',
      '.posts-list > *',
      '.article-list > *',
      '.post-list > *',
      '.post-grid > *',
      '.tag-cloud > *',
      '.taxonomy-list > *',
      '.friend-grid > *',
      '.friend-map-wrap',
      '.friend-map-card',
      '.tool-grid > *',
      '.tools-grid > *',
      '.sidebar > *',
      'article',
      '.list-card'
    ].join(',');

    const items = Array.prototype.slice.call(rootNode.querySelectorAll(selectors))
      .filter(function(el){
        return !el.closest('.site-boot-overlay') && !el.closest('.page-loading-orb');
      })
      .slice(0, 42);

    rootNode.classList.add('live-page-enter', direction === 'forward' ? 'live-enter-from-right' : 'live-enter-from-left');

    items.forEach(function(el, index){
      var animationHeavy = false;
      try{
        animationHeavy = !!(el.matches('[data-waapi-orbit], .waapi-orbital-section, .audio-visualizer-page, .friend-map-wrap, .friend-map-card, .friend-galaxy-shell, .tag-river-stage, .tag-flow, .starfield-card') ||
          el.querySelector('[data-waapi-orbit], .waapi-orbit-stage, .av-canvas, .friend-galaxy-stage, canvas, svg'));
      }catch(e){}
      el.classList.add('live-nav-item');
      if(animationHeavy) el.classList.add('live-nav-stable-item');
      el.style.setProperty('--live-nav-delay', Math.min(index * 18, 160) + 'ms');
    });

    window.requestAnimationFrame(function(){
      rootNode.classList.add('is-live-enter-ready');
      window.setTimeout(function(){
        rootNode.classList.remove('live-page-enter', 'live-enter-from-right', 'live-enter-from-left', 'is-live-enter-ready');
        items.forEach(function(el){
          el.classList.remove('live-nav-item');
          el.style.removeProperty('--live-nav-delay');
        });
      }, 620);
    });
  }

  async function swapMainWithFetch(url, direction, pushState){
    const main = document.querySelector('main.container');
    if(!main) { window.location.href = url.href; return; }

    navSwapping = true;
    root.classList.remove('is-page-loading', 'is-page-loaded');
    root.classList.add('is-nav-swapping', 'is-live-nav-swapping');

    try{
      const res = await fetch(url.href, { headers:{ 'X-Requested-With':'songline-nav-swap' } });
      if(!res.ok) throw new Error('fetch failed ' + res.status);
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const nextMain = doc.querySelector('main.container');
      if(!nextMain) throw new Error('next main missing');

      syncDocumentShell(doc, url, pushState !== false);

      main.classList.add(direction === 'forward' ? 'live-leave-to-left' : 'live-leave-to-right');
      await new Promise(function(resolve){ window.setTimeout(resolve, reduceMotion ? 0 : 180); });

      main.classList.add('is-live-swap-cut');
      main.classList.remove('live-leave-to-left', 'live-leave-to-right');
      main.innerHTML = nextMain.innerHTML;
      window.requestAnimationFrame(function(){ main.classList.remove('is-live-swap-cut'); });

      hydrateDynamicBits(main);
      try{ window.dispatchEvent(new CustomEvent('songline:animation-resume', { detail:{ reason:'nav-swap-before-enter', at:performance.now() } })); }catch(e){}
      window.scrollTo({ top:0, behavior:'auto' });
      markLiveEnter(main, direction);
      window.setTimeout(function(){
        try{ window.dispatchEvent(new CustomEvent('songline:animation-resume', { detail:{ reason:'nav-swap-enter-settled', at:performance.now() } })); }catch(e){}
      }, 260);
    }catch(err){
      window.location.href = url.href;
    }finally{
      window.setTimeout(function(){
        navSwapping = false;
        root.classList.remove('is-nav-swapping', 'is-live-nav-swapping');
      }, reduceMotion ? 0 : 680);
    }
  }

  function handleNavSwap(event){
    if(reduceMotion || !isPlainLeftClick(event)) return;
    if(shouldSkipSearchControl(event.target)) return;
    const link = event.target && event.target.closest ? event.target.closest('.modern-nav-links a[href], .logo[href="/"]') : null;
    if(!link || !shouldHandleLink(link)) return;

    let url;
    try{ url = new URL(link.href, window.location.href); }catch(e){ return; }

    const currentIndex = navIndex(window.location.pathname);
    const targetIndex = navIndex(url.pathname);
    if(currentIndex < 0 || targetIndex < 0 || currentIndex === targetIndex) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const direction = targetIndex > currentIndex ? 'forward' : 'backward';
    setNavActiveNow(link);
    moveNavSliderTo(link, false);
    swapMainWithFetch(url, direction, true);
  }

  document.addEventListener('click', handleNavSwap, true);

  window.addEventListener('popstate', function(){
    const currentIndex = navIndex(window.location.pathname);
    const direction = currentIndex >= 0 ? 'backward' : 'forward';
    swapMainWithFetch(new URL(window.location.href), direction, false);
  });

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){
      bindNavIndicatorHover();
      updateNavIndicator(true);
      if(shouldBoot) runBootSequence();
      else { show(); window.requestAnimationFrame(function(){ window.setTimeout(hide, 120); }); }
    }, { once:true });
  }else{
    bindNavIndicatorHover();
    updateNavIndicator(false);
    if(shouldBoot) runBootSequence();
    else { show(); window.requestAnimationFrame(function(){ window.setTimeout(hide, 120); }); }
  }

  window.addEventListener('resize', function(){
    window.requestAnimationFrame(function(){ updateNavIndicator(true); });
  });

  window.addEventListener('orientationchange', function(){
    window.setTimeout(function(){ updateNavIndicator(true); }, 260);
  });


  window.addEventListener('pageshow', function(){
    if(navSwapping || root.classList.contains('is-nav-swapping')) return;
    if(!shouldBoot || sessionStorage.getItem(bootKey)) window.setTimeout(hide, 80);
  });

  window.addEventListener('beforeunload', function(){
    if(navSwapping || root.classList.contains('is-nav-swapping')) return;
    show();
  });

  document.addEventListener('click', function(event){
    if(navSwapping || root.classList.contains('is-nav-swapping')) return;
    if(!isPlainLeftClick(event)) return;
    if(shouldSkipSearchControl(event.target)) return;
    const link = event.target && event.target.closest ? event.target.closest('a[href]') : null;
    if(shouldHandleLink(link)) show();
  }, true);

  document.addEventListener('submit', function(event){
    const form = event.target;
    if(!form || form.getAttribute('target')) return;
    if(form.matches && (form.matches('[data-no-page-loading]') || form.querySelector('.searchbox, [data-tools-search]'))) return;
    show();
  }, true);
})();
