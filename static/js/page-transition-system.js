(function(){
  'use strict';

  var root = document.documentElement;
  var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var priority = window.SonglinePagePriority;
  var navigation = window.SonglineCreatePageNavigation && window.SonglineCreatePageNavigation();
  var locked = false;
  var queuedPopState = null;
  var queuedNavigation = null;
  var activeURL = '';
  var activePath = window.location.pathname || '/';
  var overlay = null;

  var TIMELINE = { coverDuration:480, revealDuration:480 };

  if(!priority) return;

  function wait(ms){
    return new Promise(function(resolve){ window.setTimeout(resolve, reducedMotion ? 0 : ms); });
  }


  function mainContainer(){
    return document.querySelector('main.container');
  }

  function ensureOverlay(){
    if(overlay && overlay.isConnected) return overlay;
    overlay = document.createElement('div');
    overlay.className = 'songline-page-transition-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = window.SonglineTransitionLoaderMarkup || '';
    document.body.appendChild(overlay);
    return overlay;
  }

  function showOverlay(direction){
    var node = ensureOverlay();
    node.className = 'songline-page-transition-overlay is-visible is-' + direction;
    // 先提交屏幕外的起始位置；否则低帧率或刚恢复的页面会把两次 class
    // 变更合并，黑幕便直接以全屏黑色出现而没有纵向推进。
    node.getBoundingClientRect();
    return new Promise(function(resolve){
      var started = false;
      var fallback;
      function start(){
        if(started) return;
        started = true;
        clearTimeout(fallback);
        if(node.classList.contains('is-visible')) node.classList.add('is-covering');
        resolve();
      }
      fallback = setTimeout(start, 100);
      window.requestAnimationFrame(function(){ window.requestAnimationFrame(start); });
    }).then(function(){ return wait(TIMELINE.coverDuration); });
  }

  function startLoader(){
    if(!overlay) return;
    overlay.classList.remove('is-loader-closing');
    overlay.classList.add('is-loader-visible');
  }


  function closeLoader(){
    if(!overlay) return;
    overlay.classList.remove('is-loader-visible');
    overlay.classList.add('is-loader-closing');
  }

  function sweepOverlayOut(direction){
    if(!overlay) return;
    overlay.classList.remove('is-covering');
    overlay.classList.add('is-leaving', 'is-' + direction);
  }

  function hideOverlay(){
    if(!overlay) return;
    // 收尾直接移除节点，不把旧遮罩的消失交给合成层，避免下一帧重新盖回页面。
    if(overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null;
  }

  function settleMain(main){
    if(!main) return;
    main.classList.remove(
      'songline-page-exit-forward', 'songline-page-exit-backward', 'songline-page-exit-right', 'songline-page-exit-left', 'songline-page-exit-same',
      'songline-page-enter-forward', 'songline-page-enter-backward', 'songline-page-enter-right', 'songline-page-enter-left', 'songline-page-enter-same',
      'songline-page-enter-active'
    );
    // 明确提交最终合成状态，再在下一帧交还给常规页面样式。
    main.style.setProperty('opacity', '1', 'important');
    main.style.setProperty('transform', 'translate3d(0, 0, 0)', 'important');
    window.requestAnimationFrame(function(){
      main.style.removeProperty('opacity');
      main.style.removeProperty('transform');
    });
  }

  function clearLegacyBootLayer(){
    // 首页开机层挂在 <html> 下，不会被 main 的 AJAX 替换带走；
    // 统一过场开始后应由本模块唯一接管全屏遮罩。
    root.classList.remove('is-booting', 'boot-opening', 'is-boot-preparing', 'is-boot-interactive', 'boot-frame-settling');
    document.querySelectorAll('.site-boot-overlay').forEach(function(node){
      if(node.parentNode) node.parentNode.removeChild(node);
    });
  }

  function lockNavigation(){
    clearLegacyBootLayer();
    locked = true;
    root.classList.add('songline-page-transitioning');
    document.body.setAttribute('aria-busy', 'true');
  }

  function unlockNavigation(){
    locked = false;
    root.classList.remove('songline-page-transitioning');
    document.body.removeAttribute('aria-busy');
  }

  function isPlainLeftClick(event){
    // 键盘激活、触屏合成 click 与部分浏览器的辅助点击不会稳定提供 button=0。
    // 这里仅排除明确的非左键和带修饰键导航，保证楼层链接不会绕过过场。
    return (event.type === 'click' || event.button === 0) &&
      event.button !== 1 && event.button !== 2 &&
      !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
  }

  function shouldHandleLink(link){
    if(window.SonglineDocumentTransition && window.SonglineDocumentTransition.handles(link)) return false;
    if(!link || link.closest('[data-no-page-transition], [data-no-page-loading]')) return false;
    if(link.target && link.target !== '_self') return false;
    if(link.hasAttribute('download') || link.getAttribute('rel') === 'external') return false;
    var href = link.getAttribute('href') || '';
    if(!href || href.charAt(0) === '#' || /^(mailto:|tel:|javascript:)/i.test(href)) return false;
    try{
      var url = new URL(link.href, window.location.href);
      if(url.origin !== window.location.origin) return false;
      if(url.pathname === window.location.pathname && url.search === window.location.search) return locked && !url.hash;
      return true;
    }catch(e){
      return false;
    }
  }

  function saveCurrentHistoryState(){
    var current = history.state || {};
    history.replaceState(Object.assign({}, current, {
      songlineTransition:true,
      path:activePath,
      priority:priority.getPagePriority(activePath),
      scrollY:window.scrollY || window.pageYOffset || 0,
      previous:current.songlineTransition ? undefined : current
    }), '', window.location.href);
  }

  function seedHistoryState(){
    var current = history.state || {};
    if(current.songlineTransition) return;
    // Only at a new document's first initialization is referrer useful. Never
    // consult it after AJAX swaps, and never send a fresh tab to another site.
    var localArrival = false;
    try{
      var arrival = performance.getEntriesByType('navigation')[0];
      localArrival = history.length > 1 && arrival && arrival.type === 'navigate' &&
        new URL(document.referrer).origin === window.location.origin;
    }catch(error){}
    history.replaceState({
      songlineTransition:true,
      songlineCanGoBack:!!localArrival,
      path:activePath,
      priority:priority.getPagePriority(activePath),
      scrollY:window.scrollY || 0,
      previous:current
    }, '', window.location.href);
  }

  function preloadPageStyles(doc, url, hints){
    var known = new Set();
    document.head.querySelectorAll('link[rel="stylesheet"], link[rel="preload"][as="style"]').forEach(function(link){ known.add(link.href); });
    doc.head.querySelectorAll('link[rel="stylesheet"]').forEach(function(style){
      var href = style.getAttribute('href');
      if(!href) return;
      var target = new URL(href, url.href);
      if(target.origin !== window.location.origin || known.has(target.href)) return;
      if(style.media && !window.matchMedia(style.media).matches) return;
      var hint = style.cloneNode(false);
      hint.removeAttribute('id');
      hint.rel = 'preload';
      hint.as = 'style';
      hint.href = target.href;
      hint.dataset.songlineTransitionPreload = 'true';
      known.add(target.href);
      hints.push(hint);
      document.head.appendChild(hint);
    });
  }

  function syncPageStyles(doc){
    var nextStyles = Array.from(doc.head.querySelectorAll('link[rel="stylesheet"]'));
    var pendingStyles = [];
    var currentStyles = Array.from(document.head.querySelectorAll('link[rel="stylesheet"]'));
    var currentByKey = new Map();
    function styleKey(link){
      if(link.id) return '#' + link.id;
      var url = new URL(link.getAttribute('href'), window.location.href);
      return url.origin + url.pathname;
    }
    currentStyles.forEach(function(current){ currentByKey.set(styleKey(current), current); });
    var nextKeys = new Set(nextStyles.map(styleKey));
    // Keep the SAME cascade order as a direct visit, including the shared
    // unnumbered styles. Appending a page stylesheet after touch/theme patches
    // changes its priority and makes repeated navigation visually inconsistent.
    var anchor = document.createComment('page stylesheet order');
    document.head.insertBefore(anchor, currentStyles[0] || null);
    currentStyles.forEach(function(current){
      var url = new URL(current.getAttribute('href'), window.location.href);
      var owned = current.id.indexOf('songline-') === 0 || (url.origin === window.location.origin && url.pathname.indexOf('/css/') === 0);
      if(owned && !nextKeys.has(styleKey(current))) current.remove();
    });
    nextStyles.forEach(function(next){
      var current = currentByKey.get(styleKey(next));
      // A newly built asset version must not reuse an old stylesheet by id.
      if(!current || current.getAttribute('href') !== next.getAttribute('href') || current.media !== next.media){
        var clone = next.cloneNode(true);
        clone.dataset.songlineTransitionStyle = 'true';
        if(current) current.remove();
        current = clone;
        pendingStyles.push(current);
      }
      // Move only links that are out of order. Removing/reinserting every
      // shared link would reprocess CSS unnecessarily on each navigation.
      if(current !== anchor.nextSibling) document.head.insertBefore(current, anchor.nextSibling);
      document.head.insertBefore(anchor, current.nextSibling);
    });
    anchor.remove();

    // 页面专属 CSS 是下一页场景的一部分。等它们至少完成加载（或明确失败）
    // 后再揭幕，避免工具土层、星图等在入场后才补上一帧。
    if(!pendingStyles.length) return Promise.resolve();
    return Promise.all(pendingStyles.map(function(style){
      if(style.sheet) return Promise.resolve();
      return new Promise(function(resolve, reject){
        var done = false;
        var timer;
        function finish(event){
          if(done) return;
          done = true;
          clearTimeout(timer);
          style.removeEventListener('load', finish);
          style.removeEventListener('error', finish);
          if(event && event.type === 'load') resolve();
          else reject(new Error('Page stylesheet unavailable: ' + style.href));
        }
        style.addEventListener('load', finish, { once:true });
        style.addEventListener('error', finish, { once:true });
        timer = window.setTimeout(finish, 8000);
      });
    }));
  }

  async function syncDocumentShell(doc, url, pushState){
    if(doc.title) document.title = doc.title;
    var nextBody = doc.body;
    var nextScene = doc.getElementById('songline-scene-resources');
    if(nextBody){
      var dark = document.body.classList.contains('dark');
      // Friends forces a local night scene. Resolve the destination preference
      // before applying its CSS, or the browser downloads an unused night/day
      // background during the later theme initializer's correction.
      if(nextScene){
        try{ dark = JSON.parse(nextScene.textContent).forceDark || (localStorage.getItem('songline-theme') || 'dark') === 'dark'; }
        catch(error){ dark = true; }
      }
      root.setAttribute('data-theme', dark ? 'dark' : 'light');
      document.body.className = nextBody.className || '';
      if(dark) document.body.classList.add('dark');
      ['pageKind', 'pageSection', 'pageLayout', 'pageScene', 'bootWelcome'].forEach(function(name){
        if(nextBody.dataset && nextBody.dataset[name]) document.body.dataset[name] = nextBody.dataset[name];
        else delete document.body.dataset[name];
        if(name !== 'bootWelcome'){
          if(nextBody.dataset && nextBody.dataset[name]) root.dataset[name] = nextBody.dataset[name];
          else delete root.dataset[name];
        }
      });
    }
    var nextDescription = doc.querySelector('meta[name="description"]');
    var description = document.querySelector('meta[name="description"]');
    if(nextDescription && description) description.setAttribute('content', nextDescription.getAttribute('content') || '');
    var currentScene = document.getElementById('songline-scene-resources');
    if(nextScene && currentScene) currentScene.textContent = nextScene.textContent;
    await syncPageStyles(doc);
    // 过场只替换 main；同步可选页脚，避免从首页切出后残留备案栏。
    var currentFooter = document.querySelector('footer.site-footer-clean');
    var nextFooter = doc.querySelector('footer.site-footer-clean');
    if(nextFooter){
      var footerClone = nextFooter.cloneNode(true);
      if(currentFooter) currentFooter.replaceWith(footerClone);
      else {
        var currentMain = mainContainer();
        if(currentMain) currentMain.insertAdjacentElement('afterend', footerClone);
      }
    }else if(currentFooter){
      currentFooter.remove();
    }
    if(navigation){
      navigation.bindSiteMap();
      navigation.setNavActiveByURL(url);
    }
    // A browser Back/Forward may already have moved the cursor while the
    // request/styles were loading. Do not push over that traversed entry.
    if(pushState && !queuedPopState){
      history.pushState({
        songlineTransition:true,
        songlineCanGoBack:true,
        path:url.pathname,
        priority:priority.getPagePriority(url.pathname),
        scrollY:0
      }, '', url.href);
    }
  }

  async function hydrateDynamicBits(scope){
    var pending = [];
    scope.querySelectorAll('script').forEach(function(oldScript){
      if(oldScript.type && !/^(text|application)\/javascript$/.test(oldScript.type)) return;
      var script = document.createElement('script');
      Array.prototype.slice.call(oldScript.attributes).forEach(function(attr){ script.setAttribute(attr.name, attr.value); });
      if(oldScript.src){
        script.async = false;
        pending.push(new Promise(function(resolve, reject){
          script.onload = resolve;
          script.onerror = function(){ reject(new Error('Page script failed: ' + script.src)); };
        }));
      }else script.textContent = oldScript.textContent || '';
      oldScript.replaceWith(script);
    });
    await Promise.all(pending);
    window.dispatchEvent(new CustomEvent('songline:page-swap', {detail:{root:scope, modulesManaged:true}}));
    if(window.SonglinePageModules) await window.SonglinePageModules.ready(scope);
  }

  function setEnterState(main, direction){
    main.classList.remove('songline-page-exit-forward', 'songline-page-exit-backward', 'songline-page-exit-right', 'songline-page-exit-left', 'songline-page-exit-same');
    main.classList.add('songline-page-enter-' + direction);
    window.requestAnimationFrame(function(){
      window.requestAnimationFrame(function(){ main.classList.add('songline-page-enter-active'); });
    });
  }

  async function navigate(url, options){
    options = options || {};
    if(locked){
      // Keep the latest deliberate destination without interrupting the curtain
      // or falling through to a native document reload. History traversal wins.
      if(queuedPopState || (!queuedNavigation && activeURL === url.href)) return;
      return new Promise(function(resolve){
        if(!queuedNavigation) queuedNavigation = {waiters:[]};
        queuedNavigation.url = url;
        queuedNavigation.options = options;
        queuedNavigation.waiters.push(resolve);
      });
    }
    var main = mainContainer();
    if(!main){ window.location.assign(url.href); return; }
    if(options.pushState === true) saveCurrentHistoryState();
    activeURL = url.href;

    var fromPath = activePath;
    var direction = priority.getTransitionDirection(fromPath, url.pathname);
    var startedAt = Date.now();
    var loaderTimer = 0;
    var failed = false;
    var doc = null;
    var styleHints = [];
    var controller = new AbortController();
    var requestTimer = setTimeout(function(){ controller.abort(); }, 15000);
    // Prepare the inert response while the original cover animation runs.
    // Preloads fetch bytes only; shell/CSS application and hydration stay below.
    async function preparePage(){
      async function readPage(target){
        var response = await fetch(target.href, {
          signal:controller.signal, credentials:'same-origin',
          headers:{ 'X-Requested-With':'songline-page-transition' }
        });
        if(!response.ok) throw new Error('request failed: ' + response.status);
        return new DOMParser().parseFromString(await response.text(), 'text/html');
      }
      doc = await readPage(url);
      var archiveTarget = doc.head.querySelector('meta[name="songline-archive-target"]');
      if(archiveTarget){
        var target = new URL(archiveTarget.content, url.href);
        if(target.origin !== window.location.origin || target.pathname !== '/posts/') throw new Error('invalid archive redirect');
        url = target;
        doc = await readPage(url);
      }
      var nextMain = doc.querySelector('main.container');
      if(!nextMain) throw new Error('next page main container missing');
      if(controller.signal.aborted) throw new Error('Navigation preparation cancelled');
      if(window.SonglineResources) window.SonglineResources.preloadScene(doc);
      preloadPageStyles(doc, url, styleHints);
      return nextMain;
    }
    var request = preparePage();

    request.catch(function(){});
    lockNavigation();
    try{
      window.dispatchEvent(new CustomEvent('songline:page-transition-start', { detail:{ from:fromPath, to:url.pathname, direction:direction } }));
      main.classList.add('songline-page-exit-' + direction);
      await showOverlay(direction);
      // Cached pages need no flashing spinner; show it only for a genuine wait.
      loaderTimer = setTimeout(startLoader, 180);

      var nextMain = await request;

      // 幕布下先切换页面壳与专属样式，并预热首屏图片；此前在这里直接替换
      // main，慢网速时会先露出无背景/未定位的页面，再陆续加载场景资源。
      await syncDocumentShell(doc, url, options.pushState === true);
      main.innerHTML = nextMain.innerHTML;
      // Measure the next scene in its final position, not the old exit transform.
      settleMain(main);
      window.scrollTo({ top:0, behavior:'instant' });
      var hydration = hydrateDynamicBits(main);
      if(window.SonglineResources){
        var hydrated = await window.SonglineResources.bounded(hydration, 12000);
        if(hydrated && (hydrated.timedOut || hydrated.failed)) throw new Error('Page initialization unavailable');
      }else await hydration;
      activePath = url.pathname;

      var targetY = typeof options.scrollY === 'number' ? options.scrollY : 0;
      // A linked heading may be produced asynchronously from Markdown. Wait
      // only for deep links; ordinary article entry retains its current budget.
      var reader = main.querySelector('[data-article-renderer]');
      if(url.hash && options.pushState && reader && reader.songlineRenderReady && window.SonglineResources){
        await window.SonglineResources.bounded(reader.songlineRenderReady, 3000);
      }
      window.scrollTo({ top:targetY, behavior:'instant' });
      function restorePosition(){
        if(url.hash && options.pushState === true){
          var id;
          try{ id = decodeURIComponent(url.hash.slice(1)); }catch(error){ return; }
          var target = document.getElementById(id);
          if(target && main.contains(target)){
            if(window.SonglineReading && window.SonglineReading.scrollToHeading(url.hash, true)) return;
            target.scrollIntoView({block:'start', behavior:'instant'});
            return;
          }
        }
        window.scrollTo({top:targetY, behavior:'instant'});
      }
      restorePosition();
      if(window.SonglineResources) await window.SonglineResources.prepare(document, {modules:false});
      // Decoded images/fonts above the destination can change its final offset.
      restorePosition();
      clearTimeout(loaderTimer);
      closeLoader();
      setEnterState(main, direction);
      // 不依赖下一帧回调：幕布开始离场时内容必须已经可见，避免低帧率设备露出黑底。
      main.classList.add('songline-page-enter-active');
      sweepOverlayOut(direction);
      // 请求慢于既定节奏时，仍完整播放黑幕离场与内容进入，不能提前清理成黑屏。
      await wait(TIMELINE.revealDuration);
      settleMain(main);
      window.dispatchEvent(new CustomEvent('songline:page-transition-end', { detail:{ path:activePath, direction:direction, duration:Date.now() - startedAt } }));
    }catch(error){
      failed = true;
      // A failed module/style must not silently expose an unusable partial page.
      // Native navigation retries the complete document without another AJAX loop.
      console.warn('[page-transition] document fallback', error);
      window.location.assign(queuedPopState ? queuedPopState.url.href : url.href);
    }finally{
      controller.abort();
      styleHints.forEach(function(hint){ hint.remove(); });
      // These are unused media copies in the parsed response, not the live
      // player inserted into main. Native RemotePlayback activity can retain
      // their entire temporary document after every visit to the home page.
      if(doc) doc.querySelectorAll('audio,video').forEach(function(media){
        try{
          media.remove();
          media.pause();
          media.removeAttribute('src');
          media.querySelectorAll('source').forEach(function(source){ source.remove(); });
          // Detach the unused element from the inert document's execution
          // context as well; clearing src alone does not release that context.
          document.adoptNode(media);
          media.load();
          // The API rejects cancellation once disableRemotePlayback is set.
          // Cancel first, then disable only this discarded copy.
          if(!media.disableRemotePlayback && media.remote && media.remote.cancelWatchAvailability){
            media.remote.cancelWatchAvailability().catch(function(){}).then(function(){ media.disableRemotePlayback = true; });
          }else media.disableRemotePlayback = true;
        }catch(error){}
      });
      clearTimeout(requestTimer);
      clearTimeout(loaderTimer);
      if(!locked) return;
      hideOverlay();
      settleMain(main);
      unlockNavigation();
      activeURL = '';
      var next = queuedNavigation;
      queuedNavigation = null;
      if(failed){
        queuedPopState = null;
        if(next) next.waiters.forEach(function(resolve){ resolve(); });
      }else if(queuedPopState){
        var pending = queuedPopState;
        queuedPopState = null;
        if(next) next.waiters.forEach(function(resolve){ resolve(); });
        window.setTimeout(function(){ navigate(pending.url, pending.options); }, 0);
      }else if(next){
        if(next.options.pushState && next.url.href === window.location.href){
          next.waiters.forEach(function(resolve){ resolve(); });
        }else navigate(next.url, next.options).then(function(){ next.waiters.forEach(function(resolve){ resolve(); }); });
      }
    }
  }

  function previousPageDelta(){
    // Navigation API entries describe this tab's real history, unlike referrer
    // (which stays stale during AJAX navigation) or history.length alone.
    try{
      var api = window.navigation;
      if(api && api.currentEntry && typeof api.entries === 'function'){
        var entries = api.entries();
        var current = entries.findIndex(function(entry){ return entry.key === api.currentEntry.key; });
        for(var i = current - 1; i >= 0; i--){
          var url = new URL(entries[i].url);
          if(url.origin !== window.location.origin) return 0;
          if(url.pathname !== window.location.pathname || url.search !== window.location.search) return i - current;
        }
        if(current >= 0) return 0;
      }
    }catch(error){}
    // Older browsers: only traverse an entry we ourselves pushed from a
    // same-origin page. A fresh tab / external arrival keeps the HTML fallback.
    return history.state && history.state.songlineCanGoBack ? -1 : 0;
  }

  function handleClick(event){
    if(event.defaultPrevented || !isPlainLeftClick(event)) return;
    var link = event.target && event.target.closest ? event.target.closest('a[href]') : null;
    if(link && link.hasAttribute('data-back-icon') && (!link.target || link.target === '_self') && !link.hasAttribute('download')){
      if(locked){ event.preventDefault(); event.stopImmediatePropagation(); return; }
      var delta = previousPageDelta();
      if(delta){
        event.preventDefault(); event.stopImmediatePropagation();
        saveCurrentHistoryState();
        history.go(delta);
        return;
      }
    }
    if(!shouldHandleLink(link)) return;
    var url;
    try{ url = new URL(link.href, window.location.href); }catch(e){ return; }
    event.preventDefault();
    event.stopImmediatePropagation();
    navigate(url, { pushState:true });
  }

  function handlePopState(event){
    var url = new URL(window.location.href);
    var state = event.state || {};
    var options = { pushState:false, scrollY:typeof state.scrollY === 'number' ? state.scrollY : 0 };
    if(locked){
      queuedPopState = { url:url, options:options };
      return;
    }
    navigate(url, options);
  }

  function initialize(){
    seedHistoryState();
    if(navigation){
      navigation.bindSiteMap();
      navigation.updateNavIndicator(true);
    }
    document.addEventListener('click', handleClick, true);
    window.addEventListener('popstate', handlePopState);
    root.classList.add('songline-page-transition-ready');
  }

  window.SonglinePageTransition = {
    navigate:navigate,
    navigateLink:function(href){
      var url = new URL(href, window.location.href);
      if(url.origin !== window.location.origin){
        window.location.assign(url.href);
        return;
      }
      if(!locked && url.href === window.location.href) return Promise.resolve();
      return navigate(url, { pushState:true });
    },
    lockNavigation:lockNavigation,
    unlockNavigation:unlockNavigation,
    getCurrentPagePriority:function(){ return priority.getPagePriority(activePath); },
    getTargetPagePriority:function(path){ return priority.getPagePriority(path); },
    getTransitionDirection:function(path){ return priority.getTransitionDirection(activePath, path); }
  };

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once:true });
  else initialize();
})();
