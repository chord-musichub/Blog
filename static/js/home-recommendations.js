(function(){
  'use strict';

  function initialize(root){
    root = root || document;
    var panel = root.querySelector('[data-home-recommendations]');
    if(!panel || panel.dataset.recommendationsReady === '1') return;

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
      if(paused || cards.length < 2 || document.visibilityState === 'hidden') return;
      timer = window.setTimeout(function(){
        show((current + 1) % cards.length);
        schedule(5200);
      }, delay || 5200);
    }

    function show(next, immediate){
      next = Number(next);
      if(next === current || next < 0 || next >= cards.length) return;
      var previous = cards[current];
      if(immediate) panel.classList.add('is-direct-switch');
      if(leavingTimer) window.clearTimeout(leavingTimer);
      previous.classList.remove('is-active');
      previous.classList.add('is-leaving');
      current = next;
      updateControls();
      if(immediate){
        window.requestAnimationFrame(function(){ panel.classList.remove('is-direct-switch'); });
      }
      leavingTimer = window.setTimeout(function(){ previous.classList.remove('is-leaving'); }, reduced ? 120 : 680);
    }

    function pause(){
      paused = true;
      if(releaseTimer){ window.clearTimeout(releaseTimer); releaseTimer = 0; }
      clearTimer();
    }

    function resume(){
      if(releaseTimer) window.clearTimeout(releaseTimer);
      releaseTimer = window.setTimeout(function(){
        paused = false;
        schedule(1500);
      }, 1400);
    }

    function showCopyTip(message, failed){
      if(!copyTip) return;
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

    panel.addEventListener('mouseenter', pause);
    panel.addEventListener('mouseleave', resume);
    panel.addEventListener('focusin', pause);
    panel.addEventListener('focusout', function(){
      window.setTimeout(function(){ if(!panel.contains(document.activeElement)) resume(); }, 0);
    });
    indicators.forEach(function(indicator){
      indicator.addEventListener('click', function(){
        show(indicator.dataset.homeRecommendIndex, true);
        schedule(5200);
      });
    });
    if(previous){
      previous.addEventListener('click', function(){
        show((current - 1 + cards.length) % cards.length, true);
        schedule(5200);
      });
    }
    if(next){
      next.addEventListener('click', function(){
        show((current + 1) % cards.length, true);
        schedule(5200);
      });
    }
    if(copyButton){
      copyButton.addEventListener('click', function(){
        var email = copyButton.dataset.homeCopyEmail || '';
        if(!email) return;
        var copy = navigator.clipboard && window.isSecureContext
          ? navigator.clipboard.writeText(email)
          : Promise.reject(new Error('Clipboard unavailable'));
        Promise.resolve(copy).then(function(){
          showCopyTip('邮箱已复制');
        }).catch(function(){
          if(fallbackCopy(email)) showCopyTip('邮箱已复制');
          else showCopyTip('复制失败，请重试', true);
        });
      });
    }
    document.addEventListener('visibilitychange', function(){
      if(document.visibilityState === 'hidden') clearTimer();
      else if(!paused) schedule(1400);
    });
    window.addEventListener('pagehide', function(){
      clearTimer();
      if(releaseTimer) window.clearTimeout(releaseTimer);
      if(leavingTimer) window.clearTimeout(leavingTimer);
      if(copyTipTimer) window.clearTimeout(copyTipTimer);
    }, { once:true });

    updateControls();
    window.requestAnimationFrame(function(){ panel.classList.add('is-ready'); });
    schedule(5200);
  }

  window.SonglineInitHomeRecommendations = initialize;
})();
