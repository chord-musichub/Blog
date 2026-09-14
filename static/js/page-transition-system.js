(function(){
  'use strict';

  var root = document.documentElement;
  var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var priority = window.SonglinePagePriority;
  var navigation = window.SonglineCreatePageNavigation && window.SonglineCreatePageNavigation();
  var locked = false;
  var queuedPopState = null;
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
    overlay.innerHTML = [
      '<div class="songline-page-transition-loader">',
      '  <svg viewBox="0 0 76 76" role="presentation" focusable="false">',
      '    <circle class="songline-transition-orbit songline-transition-orbit--primary" cx="38" cy="38" r="33"></circle>',
      '    <circle class="songline-transition-orbit songline-transition-orbit--secondary" cx="38" cy="38" r="28"></circle>',
      '    <circle class="songline-transition-orbit songline-transition-orbit--tertiary" cx="38" cy="38" r="23"></circle>',
      '  </svg>',
      '</div>'
    ].join('');
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
      if(url.pathname === window.location.pathname && url.search === window.location.search) return false;
      return true;
    }catch(e){
      return false;
    }
  }

  function saveCurrentHistoryState(){
    var current = history.state || {};
    history.replaceState({
      songlineTransition:true,
      path:activePath,
      priority:priority.getPagePriority(activePath),
      scrollY:window.scrollY || window.pageYOffset || 0,
      previous:current.songlineTransition ? undefined : current
    }, '', window.location.href);
  }

  function seedHistoryState(){
    var current = history.state || {};
    if(current.songlineTransition) return;
    history.replaceState({
      songlineTransition:true,
      path:activePath,
      priority:priority.getPagePriority(activePath),
      scrollY:window.scrollY || 0,
      previous:current
    }, '', window.location.href);
  }

  function syncPageStyles(doc){
    var nextStyles = Object.create(null);
    var pendingStyles = [];
    doc.querySelectorAll('link[rel="stylesheet"][id^="songline-"]').forEach(function(next){
      nextStyles[next.id] = next;
    });

    // 页面专属样式必须随过场一起离开。此前这里只追加不移除，朋友页、档案页
    // 和工具页会把旧 CSS 带到下一页，缩放后就会出现历史布局互相覆盖的情况。
    document.querySelectorAll('link[rel="stylesheet"][id^="songline-"]').forEach(function(current){
      if(!nextStyles[current.id]) current.remove();
    });

    Object.keys(nextStyles).forEach(function(id){
      if(document.getElementById(id)) return;
      var clone = nextStyles[id].cloneNode(true);
      clone.dataset.songlineTransitionStyle = 'true';
      document.head.appendChild(clone);
      pendingStyles.push(clone);
    });

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
    if(nextBody){
      var dark = document.body.classList.contains('dark');
      document.body.className = nextBody.className || '';
      if(dark) document.body.classList.add('dark');
      ['pageKind', 'pageSection', 'pageLayout', 'bootWelcome'].forEach(function(name){
        if(nextBody.dataset && nextBody.dataset[name]) document.body.dataset[name] = nextBody.dataset[name];
        else delete document.body.dataset[name];
      });
    }
    var nextDescription = doc.querySelector('meta[name="description"]');
    var description = document.querySelector('meta[name="description"]');
    if(nextDescription && description) description.setAttribute('content', nextDescription.getAttribute('content') || '');
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
      navigation.bindNavIndicatorHover();
      navigation.setNavActiveByURL(url);
    }
    if(pushState){
      history.pushState({
        songlineTransition:true,
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
    if(locked) return;
    var main = mainContainer();
    if(!main){ window.location.assign(url.href); return; }

    var fromPath = activePath;
    var direction = priority.getTransitionDirection(fromPath, url.pathname);
    var startedAt = Date.now();
    var loaderTimer = 0;
    var controller = new AbortController();
    var requestTimer = setTimeout(function(){ controller.abort(); }, 15000);
    var request = fetch(url.href, {
      signal:controller.signal,
      credentials:'same-origin',
      headers:{ 'X-Requested-With':'songline-page-transition' }
    });

    request.catch(function(){});
    lockNavigation();
    try{
      window.dispatchEvent(new CustomEvent('songline:page-transition-start', { detail:{ from:fromPath, to:url.pathname, direction:direction } }));
      main.classList.add('songline-page-exit-' + direction);
      await showOverlay(direction);
      // Cached pages need no flashing spinner; show it only for a genuine wait.
      loaderTimer = setTimeout(startLoader, 180);

      var response = await request;
      if(!response.ok) throw new Error('request failed: ' + response.status);
      var html = await response.text();
      var doc = new DOMParser().parseFromString(html, 'text/html');
      var nextMain = doc.querySelector('main.container');
      if(!nextMain) throw new Error('next page main container missing');

      // 幕布下先切换页面壳与专属样式，并预热首屏图片；此前在这里直接替换
      // main，慢网速时会先露出无背景/未定位的页面，再陆续加载场景资源。
      await syncDocumentShell(doc, url, options.pushState === true);
      main.innerHTML = nextMain.innerHTML;
      // Measure the next scene in its final position, not the old exit transform.
      settleMain(main);
      window.scrollTo({ top:0, behavior:'auto' });
      var hydration = hydrateDynamicBits(main);
      if(window.SonglineResources){
        var hydrated = await window.SonglineResources.bounded(hydration, 12000);
        if(hydrated && (hydrated.timedOut || hydrated.failed)) throw new Error('Page initialization unavailable');
      }else await hydration;
      activePath = url.pathname;

      var targetY = typeof options.scrollY === 'number' ? options.scrollY : 0;
      window.scrollTo({ top:targetY, behavior:'auto' });
      if(window.SonglineResources) await window.SonglineResources.prepare(document, {modules:false});
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
      // A failed module/style must not silently expose an unusable partial page.
      // Native navigation retries the complete document without another AJAX loop.
      console.warn('[page-transition] document fallback', error);
      window.location.assign(url.href);
    }finally{
      clearTimeout(requestTimer);
      clearTimeout(loaderTimer);
      if(!locked) return;
      hideOverlay();
      settleMain(main);
      unlockNavigation();
      if(queuedPopState){
        var pending = queuedPopState;
        queuedPopState = null;
        window.setTimeout(function(){ navigate(pending.url, pending.options); }, 0);
      }
    }
  }

  function handleClick(event){
    if(locked || !isPlainLeftClick(event)) return;
    var link = event.target && event.target.closest ? event.target.closest('a[href]') : null;
    if(!shouldHandleLink(link)) return;
    var url;
    try{ url = new URL(link.href, window.location.href); }catch(e){ return; }
    event.preventDefault();
    event.stopImmediatePropagation();
    saveCurrentHistoryState();
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
      navigation.bindNavIndicatorHover();
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
      saveCurrentHistoryState();
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
