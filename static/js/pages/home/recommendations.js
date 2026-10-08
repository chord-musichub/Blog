(function(){
  'use strict';

  function initialize(root){
    root = root || document;
    var panel = root.querySelector('[data-home-recommendations]');
    if(!panel || panel.dataset.recommendationsReady === '1') return;
    // 首页通过过场离开时不会触发 pagehide；主动撤销旧轮播的全局监听和定时器。
    if(typeof window.__songlineHomeRecommendationsCleanup === 'function') window.__songlineHomeRecommendationsCleanup();

    // Keep the newest story, then sample older stories without replacement.
    var poolNode = panel.querySelector('[data-home-recommendation-pool]');
    var fallbackCards = Array.from(panel.querySelectorAll('[data-home-recommendation-card]'));
    try{
      var pool = poolNode ? JSON.parse(poolNode.textContent) : [];
      var remaining = pool.slice(1);
      for(var i = remaining.length - 1; i > 0; i--){
        var j = Math.floor(Math.random() * (i + 1));
        var swap = remaining[i]; remaining[i] = remaining[j]; remaining[j] = swap;
      }
      var choices = pool.length ? [pool[0]].concat(remaining.slice(0, 4)) : [];
      fallbackCards.forEach(function(card, index){
        var item = choices[index];
        if(!item) return;
        card.href = item.url;
        card.querySelector('strong').textContent = item.title;
        var date = card.querySelector('time');
        date.dateTime = item.date; date.textContent = item.displayDate;
        var image = card.querySelector('img');
        image.src = item.cover;
      });
    }catch(error){ console.warn('[recommendations] using server selection', error); }
    var cards = Array.prototype.slice.call(panel.querySelectorAll('[data-home-recommendation-card]'));
    var indicators = Array.prototype.slice.call(panel.querySelectorAll('[data-home-recommend-indicator]'));
    var previous = panel.querySelector('[data-home-recommend-previous]');
    var next = panel.querySelector('[data-home-recommend-next]');
    var copyButton = root.querySelector('[data-home-copy-email]');
    var copyTip = root.querySelector('[data-home-copy-tip]');
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var current = 0;
    var timer = 0;
    var releaseTimer = 0;
    var leavingTimer = 0;
    var paused = false;
    var copyTipTimer = 0;
    var switchRequest = 0;
    var disposed = false, suspended = false;
    var readyFrame = 0, directFrame = 0, focusTimer = 0;
    var bindings = [];

    function bind(target, type, handler){
      if(!target) return;
      target.addEventListener(type, handler);
      bindings.push([target, type, handler]);
    }

    if(!cards.length) return;
    panel.dataset.recommendationsReady = '1';

    function updateControls(){
      cards.forEach(function(card, index){
        var active = index === current;
        if(active) card.classList.remove('is-leaving');
        card.classList.toggle('is-active', active);
        card.setAttribute('aria-hidden', active ? 'false' : 'true');
        card.tabIndex = active ? 0 : -1;
      });
      indicators.forEach(function(indicator, index){
        var active = index === current;
        indicator.classList.toggle('is-active', active);
        if(active) indicator.setAttribute('aria-current', 'true');
        else indicator.removeAttribute('aria-current');
      });
    }

    function clearTimer(){
      if(timer){ window.clearTimeout(timer); timer = 0; }
    }

    function schedule(delay){
      clearTimer();
      if(disposed || suspended || paused || cards.length < 2 || document.visibilityState === 'hidden') return;
      timer = window.setTimeout(function(){
        show((current + 1) % cards.length);
        schedule(5200);
      }, delay || 5200);
    }

    async function show(next, immediate){
      if(disposed || suspended) return;
      next = Number(next);
      if(next === current || next < 0 || next >= cards.length) return;
      var request = ++switchRequest;
      var img = cards[next].querySelector('img');
      if(img && window.SonglineResources){
        var result = await window.SonglineResources.image(img);
        if(result && result.failed) return;
      }
      if(disposed || suspended || request !== switchRequest || !panel.isConnected) return;
      var previous = cards[current];
      if(immediate) panel.classList.add('is-direct-switch');
      if(leavingTimer) window.clearTimeout(leavingTimer);
      previous.classList.remove('is-active');
      previous.classList.add('is-leaving');
      current = next;
      updateControls();
      if(immediate){
        window.cancelAnimationFrame(directFrame);
        directFrame = window.requestAnimationFrame(function(){ directFrame = 0; panel.classList.remove('is-direct-switch'); });
      }
      leavingTimer = window.setTimeout(function(){ previous.classList.remove('is-leaving'); }, reduced ? 120 : 680);
    }

    function pause(){
      if(disposed || suspended) return;
      paused = true;
      if(releaseTimer){ window.clearTimeout(releaseTimer); releaseTimer = 0; }
      clearTimer();
    }

    function resume(){
      if(disposed || suspended) return;
      if(releaseTimer) window.clearTimeout(releaseTimer);
      releaseTimer = window.setTimeout(function(){
        paused = false;
        schedule(1500);
      }, 1400);
    }

    function onPanelState(event){
      var state = event.detail && event.detail.state;
      if(state === 'system') resume();
      else pause();
    }

    function showCopyTip(message, failed){
      if(disposed || suspended || !panel.isConnected || !copyTip) return;
      if(copyTipTimer) window.clearTimeout(copyTipTimer);
      copyTip.textContent = message;
      copyTip.classList.toggle('is-error', !!failed);
      copyTip.classList.add('is-visible');
      copyTipTimer = window.setTimeout(function(){
        copyTip.classList.remove('is-visible', 'is-error');
      }, 1800);
    }

    function fallbackCopy(text){
      var field = document.createElement('textarea');
      field.value = text;
      field.setAttribute('readonly', '');
      field.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
      document.body.appendChild(field);
      field.select();
      var copied = false;
      try{ copied = document.execCommand('copy'); }catch(error){}
      field.remove();
      return copied;
    }

    bind(panel, 'mouseenter', pause);
    bind(panel, 'mouseleave', resume);
    bind(panel, 'focusin', pause);
    bind(panel, 'focusout', function(){
      window.clearTimeout(focusTimer);
      focusTimer = window.setTimeout(function(){ focusTimer = 0; if(!panel.contains(document.activeElement)) resume(); }, 0);
    });
    indicators.forEach(function(indicator){
      bind(indicator, 'click', function(){
        show(indicator.dataset.homeRecommendIndex, true);
        schedule(5200);
      });
    });
    if(previous){
      bind(previous, 'click', function(){
        show((current - 1 + cards.length) % cards.length, true);
        schedule(5200);
      });
    }
    if(next){
      bind(next, 'click', function(){
        show((current + 1) % cards.length, true);
        schedule(5200);
      });
    }
    if(copyButton){
      bind(copyButton, 'click', function(){
        var email = copyButton.dataset.homeCopyEmail || '';
        if(!email) return;
        var copy = navigator.clipboard && window.isSecureContext
          ? navigator.clipboard.writeText(email)
          : Promise.reject(new Error('Clipboard unavailable'));
        Promise.resolve(copy).then(function(){
          showCopyTip('邮箱已复制');
        }).catch(function(){
          if(disposed || suspended || !panel.isConnected) return;
          if(fallbackCopy(email)) showCopyTip('邮箱已复制');
          else showCopyTip('复制失败，请重试', true);
        });
      });
    }
    function onVisibilityChange(){
      if(document.visibilityState === 'hidden') clearTimer();
      else if(!paused) schedule(1400);
    }
    function cancelWork(){
      switchRequest++;
      clearTimer();
      if(releaseTimer) window.clearTimeout(releaseTimer);
      if(leavingTimer) window.clearTimeout(leavingTimer);
      if(copyTipTimer) window.clearTimeout(copyTipTimer);
      window.clearTimeout(focusTimer);
      window.cancelAnimationFrame(readyFrame);
      window.cancelAnimationFrame(directFrame);
      releaseTimer = leavingTimer = copyTipTimer = focusTimer = readyFrame = directFrame = 0;
    }
    function cleanup(){
      if(disposed) return;
      disposed = true;
      cancelWork();
      bindings.forEach(function(binding){ binding[0].removeEventListener(binding[1], binding[2]); });
      bindings = [];
      delete panel.dataset.recommendationsReady;
      if(window.__songlineHomeRecommendationsCleanup === cleanup) window.__songlineHomeRecommendationsCleanup = null;
    }
    function onPageHide(event){
      if(event.persisted){ suspended = true; cancelWork(); }
      else cleanup();
    }
    function onPageShow(event){
      if(!event.persisted || disposed || !suspended) return;
      suspended = false;
      panel.classList.add('is-ready');
      panel.classList.remove('is-direct-switch');
      cards.forEach(function(card){ card.classList.remove('is-leaving'); });
      if(copyTip) copyTip.classList.remove('is-visible', 'is-error');
      paused = panel.matches(':hover, :focus-within') || !!(homePanel && homePanel.dataset.homePanelState !== 'system');
      schedule(1400);
    }
    function onTransitionStart(event){ if((event.detail && event.detail.from) === '/') cleanup(); }
    bind(window, 'songline:home-panel-state', onPanelState);
    bind(document, 'visibilitychange', onVisibilityChange);
    bind(window, 'pagehide', onPageHide);
    bind(window, 'pageshow', onPageShow);
    bind(window, 'songline:page-transition-start', onTransitionStart);
    window.__songlineHomeRecommendationsCleanup = cleanup;

    updateControls();
    var homePanel = panel.closest && panel.closest('[data-home-panel]');
    if(homePanel && homePanel.dataset.homePanelState !== 'system') pause();
    readyFrame = window.requestAnimationFrame(function(){ readyFrame = 0; if(!disposed && !suspended) panel.classList.add('is-ready'); });
    schedule(5200);
  }

  window.SonglineInitHomeRecommendations = initialize;
})();
