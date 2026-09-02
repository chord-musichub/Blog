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
  var loaderStartedAt = 0;

  var TIMELINE = {
    curtainStart: 340,
    loaderStart: 1080,
    loaderRelease: 2220,
    revealStart: 2390,
    revealDuration: 680,
    loaderCycle: 1140,
    loaderClosePhase: 920
  };

  if(!priority) return;

  function wait(ms){
    return new Promise(function(resolve){ window.setTimeout(resolve, reducedMotion ? 0 : ms); });
  }

  function waitUntil(startedAt, targetAt){
    return wait(Math.max(0, targetAt - (Date.now() - startedAt)));
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
    window.requestAnimationFrame(function(){
      window.requestAnimationFrame(function(){
        if(node.classList.contains('is-visible')) node.classList.add('is-covering');
      });
    });
  }

  function startLoader(){
    if(!overlay) return;
    loaderStartedAt = Date.now();
    overlay.classList.remove('is-loader-closing');
    overlay.classList.add('is-loader-visible');
  }

  function waitForLoaderCloseNode(){
    if(reducedMotion || !loaderStartedAt) return Promise.resolve();
    var elapsed = Date.now() - loaderStartedAt;
    var phase = elapsed % TIMELINE.loaderCycle;
    // 接近完整循环的收束点时直接结束；其余情况再等到下一次收束，避免截断弧线。
    var target = phase < 140 || phase > TIMELINE.loaderClosePhase
      ? 0
      : TIMELINE.loaderCycle - phase;
    return wait(target);
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
    loaderStartedAt = 0;
  }

  function settleMain(main){
    if(!main) return;
    main.classList.remove(
      'songline-page-exit-forward', 'songline-page-exit-backward', 'songline-page-exit-same',
      'songline-page-enter-forward', 'songline-page-enter-backward', 'songline-page-enter-same',
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
    doc.querySelectorAll('link[rel="stylesheet"][id^="songline-"]').forEach(function(next){
      var id = next.id;
      var current = document.getElementById(id);
      if(current) return;
      var clone = next.cloneNode(true);
      clone.dataset.songlineTransitionStyle = 'true';
      document.head.appendChild(clone);
    });
  }

  function syncDocumentShell(doc, url, pushState){
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
    syncPageStyles(doc);
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

  function hydrateDynamicBits(scope){
    scope.querySelectorAll('[data-bg]').forEach(function(el){
      var bg = el.getAttribute('data-bg');
      if(bg) el.style.backgroundImage = 'url("' + bg.replace(/"/g, '\\"') + '")';
    });
    scope.querySelectorAll('script').forEach(function(oldScript){
      var script = document.createElement('script');
      Array.prototype.slice.call(oldScript.attributes).forEach(function(attr){ script.setAttribute(attr.name, attr.value); });
      if(!oldScript.src) script.textContent = oldScript.textContent || '';
      oldScript.replaceWith(script);
    });
    bindDirectNavigation(scope);
    window.dispatchEvent(new CustomEvent('songline:page-swap', { detail:{ root:scope } }));
  }

  // 部分浏览器会让楼层导航的原生链接抢在 document 级委托前提交；
  // 对现有和动态插入的链接补一层同一处理函数的直接绑定，确保始终由场景过场接管。
  function bindDirectNavigation(scope){
    var parent = scope || document;
    parent.querySelectorAll('a[href]').forEach(function(link){
      if(link.dataset.songlineTransitionBound === '1') return;
      link.dataset.songlineTransitionBound = '1';
      link.addEventListener('click', handleClick);
    });

    // 楼层导航属于全站主入口。将它设为最终兜底，避免任何旧导航脚本或浏览器
    // 合成 click 绕过 document 级监听后直接整页跳转。
    parent.querySelectorAll('[data-elevator-nav] a[href]').forEach(function(link){
      if(link.dataset.songlineElevatorTransitionBound === '1') return;
      link.dataset.songlineElevatorTransitionBound = '1';
      link.onclick = function(event){
        if(!shouldHandleLink(link)) return true;
        if(event) event.preventDefault();
        if(locked) return false;
        var url = new URL(link.href, window.location.href);
        saveCurrentHistoryState();
        navigate(url, { pushState:true });
        return false;
      };
    });
  }

  function setEnterState(main, direction){
    main.classList.remove('songline-page-exit-forward', 'songline-page-exit-backward', 'songline-page-exit-same');
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
    var didSwapMain = false;
    var startedAt = Date.now();
    var request = fetch(url.href, {
      credentials:'same-origin',
      headers:{ 'X-Requested-With':'songline-page-transition' }
    });

    lockNavigation();
    try{
      window.dispatchEvent(new CustomEvent('songline:page-transition-start', { detail:{ from:fromPath, to:url.pathname, direction:direction } }));
      main.classList.add('songline-page-exit-' + direction);
      await waitUntil(startedAt, TIMELINE.curtainStart);
      showOverlay(direction);
      await waitUntil(startedAt, TIMELINE.loaderStart);
      startLoader();

      var response = await request;
      if(!response.ok) throw new Error('request failed: ' + response.status);
      var html = await response.text();
      var doc = new DOMParser().parseFromString(html, 'text/html');
      var nextMain = doc.querySelector('main.container');
      if(!nextMain) throw new Error('next page main container missing');

      await waitUntil(startedAt, TIMELINE.loaderRelease);
      await waitForLoaderCloseNode();
      closeLoader();
      await wait(160);
      syncDocumentShell(doc, url, options.pushState === true);
      main.innerHTML = nextMain.innerHTML;
      didSwapMain = true;
      hydrateDynamicBits(main);
      activePath = url.pathname;

      var targetY = typeof options.scrollY === 'number' ? options.scrollY : 0;
      window.scrollTo({ top:targetY, behavior:'auto' });
      setEnterState(main, direction);
      await waitUntil(startedAt, TIMELINE.revealStart);
      // 不依赖下一帧回调：幕布开始离场时内容必须已经可见，避免低帧率设备露出黑底。
      main.classList.add('songline-page-enter-active');
      sweepOverlayOut(direction);
      // 请求慢于既定节奏时，仍完整播放黑幕离场与内容进入，不能提前清理成黑屏。
      await wait(TIMELINE.revealDuration);
      settleMain(main);
      window.dispatchEvent(new CustomEvent('songline:page-transition-end', { detail:{ path:activePath, direction:direction } }));
    }catch(error){
      // 仅在内容尚未替换时回退整页导航；替换后继续揭示，避免新页短暂出现后又进入启动黑屏。
      if(!didSwapMain){
        window.location.assign(url.href);
        return;
      }
      console.warn('[page-transition] post-swap recovery', error);
    }finally{
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
    bindDirectNavigation(document);
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
