(function(){
  'use strict';

  function createNavigation(){
    function links(){ return Array.prototype.slice.call(document.querySelectorAll('[data-elevator-nav] a[data-page-key]')); }
    function setNavActiveByURL(url){
      if(!url || !window.SonglinePagePriority) return;
      var key = window.SonglinePagePriority.getPageKey(url.pathname || url);
      links().forEach(function(link){
        var active = link.dataset.pageKey === key;
        link.classList.toggle('active', active);
        if(active) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      });
    }
    function setNavActiveNow(link){
      if(!link) return;
      links().forEach(function(item){
        var active = item === link;
        item.classList.toggle('active', active);
        if(active) item.setAttribute('aria-current', 'page');
        else item.removeAttribute('aria-current');
      });
    }
    function updateNavIndicator(){ setNavActiveByURL(new URL(window.location.href)); }
    function bindNavIndicatorHover(){
      var nav = document.querySelector('[data-elevator-nav]');
      if(!nav || nav.dataset.elevatorReady === '1') return;
      nav.dataset.elevatorReady = '1';
      function setHoveredLink(link){
        links().forEach(function(item){ item.classList.toggle('is-elevator-hovered', item === link); });
      }
      function clearHoveredLink(){
        nav.classList.remove('is-elevator-hovering');
        setHoveredLink(null);
      }
      var yieldingLink = null;
      var interactiveSelector = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[role="button"],[tabindex]:not([tabindex="-1"])';
      function isInside(rect, x, y){
        return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
      }
      function setYieldingLink(link){
        if(yieldingLink === link) return;
        if(yieldingLink) yieldingLink.classList.remove('is-elevator-yielding');
        yieldingLink = link || null;
        if(yieldingLink) yieldingLink.classList.add('is-elevator-yielding');
      }
      function yieldsToUnderlyingControl(event){
        if(!event || typeof document.elementFromPoint !== 'function') return false;
        var coveredLink = links().find(function(link){ return isInside(link.getBoundingClientRect(), event.clientX, event.clientY); });
        var target;
        if(coveredLink){
          // 命中导航链接时先暂时穿透它，检查同一点是否有星图节点等真实控件。
          coveredLink.style.pointerEvents = 'none';
          target = document.elementFromPoint(event.clientX, event.clientY);
          coveredLink.style.removeProperty('pointer-events');
          if(target && !nav.contains(target) && target.closest && target.closest(interactiveSelector)){
            setYieldingLink(coveredLink);
            return true;
          }
        }
        setYieldingLink(null);
        target = document.elementFromPoint(event.clientX, event.clientY);
        return !!(target && !nav.contains(target) && target.closest && target.closest(interactiveSelector));
      }
      nav.addEventListener('pointerenter', function(){ nav.classList.add('is-elevator-hovering'); });
      nav.addEventListener('pointerover', function(event){
        var link = event.target.closest && event.target.closest('a[data-page-key]');
        if(link && nav.contains(link)) setHoveredLink(link);
      });
      nav.addEventListener('pointerleave', clearHoveredLink);
      // 电梯暗幕只是视觉提示。其下方存在真实可交互控件时，优先让控件接管 hover。
      document.addEventListener('pointermove', function(event){
        if(yieldsToUnderlyingControl(event)) clearHoveredLink();
      }, { passive:true });
      nav.addEventListener('focusin', function(event){
        var link = event.target.closest && event.target.closest('a[data-page-key]');
        if(link){
          nav.classList.add('is-elevator-focused', 'is-elevator-hovering');
          setHoveredLink(link);
        }
      });
      nav.addEventListener('focusout', function(){
        window.setTimeout(function(){
          if(!nav.contains(document.activeElement)){
            nav.classList.remove('is-elevator-focused');
            if(!nav.matches(':hover')) clearHoveredLink();
          }
        }, 0);
      });
    }
    function navIndex(pathname){
      return window.SonglinePagePriority ? window.SonglinePagePriority.getPagePriority(pathname) : -1;
    }
    return {
      ensureNavSlider:function(){ return null; },
      moveNavSliderTo:function(){},
      updateNavIndicator:updateNavIndicator,
      setNavActiveNow:setNavActiveNow,
      setNavActiveByURL:setNavActiveByURL,
      bindNavIndicatorHover:bindNavIndicatorHover,
      navIndex:navIndex
    };
  }
  window.SonglineCreatePageNavigation = createNavigation;
})();
