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
      nav.addEventListener('pointerenter', function(){ nav.classList.add('is-elevator-hovering'); });
      nav.addEventListener('pointerover', function(event){
        var link = event.target.closest && event.target.closest('a[data-page-key]');
        if(link && nav.contains(link)) setHoveredLink(link);
      });
      nav.addEventListener('pointerleave', clearHoveredLink);
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
