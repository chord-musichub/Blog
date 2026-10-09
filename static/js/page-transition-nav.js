(function(){
  'use strict';

  function createNavigation(){
    function navigationLinks(){ return Array.prototype.slice.call(document.querySelectorAll('[data-site-map] a[data-page-key]')); }
    function setNavActiveByURL(url){
      if(!url || !window.SonglinePagePriority) return;
      var key = window.SonglinePagePriority.getPageKey(url.pathname || url);
      navigationLinks().forEach(function(link){
        var active = link.dataset.pageKey === key;
        link.classList.toggle('active', active);
        if(active) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      });
    }
    function updateNavIndicator(){ setNavActiveByURL(new URL(window.location.href)); }
    function bindSiteMap(){
      var siteMap = document.querySelector('[data-site-map]');
      if(!siteMap || siteMap.dataset.siteMapReady === '1') return;
      siteMap.dataset.siteMapReady = '1';
      var mapToggle = siteMap.querySelector('[data-site-map-toggle]');
      var interactiveSelector = 'a[href],button,input,select,textarea,summary,label,audio[controls],video[controls],[role="button"],[tabindex]:not([tabindex="-1"])';
      function pageControl(target){
        var control = target && target.closest && target.closest(interactiveSelector);
        return control && !siteMap.contains(control) ? control : null;
      }
      // Activation needs the same target at press and release. Distance alone
      // misses short drags crossing a map region boundary.
      var press = null;
      var forwardingClick = false;
      var keyboardTarget = null;
      function navigationTarget(event){
        if(pageControl(event.target)) return null;
        return event.target.closest && event.target.closest('[data-site-map] a[data-page-key], [data-site-map-toggle]');
      }
      window.addEventListener('pointerdown', function(event){
        keyboardTarget = null;
        press = {id:event.pointerId,x:event.clientX,y:event.clientY,threshold:event.pointerType==='touch'?8:3,target:navigationTarget(event),moved:false,released:false,cancelled:event.button!==0};
      }, {capture:true,passive:true});
      function trackPress(event){
        if(press && event.pointerId===press.id && !press.released && Math.hypot(event.clientX-press.x,event.clientY-press.y)>press.threshold) press.moved=true;
      }
      window.addEventListener('pointermove', trackPress, {capture:true,passive:true});
      window.addEventListener('pointerup', function(event){
        trackPress(event);
        if(press && event.pointerId===press.id){ press.released=true; press.releasedAt=performance.now(); }
      }, {capture:true,passive:true});
      function cancelPress(){ if(press) press.cancelled=true; }
      window.addEventListener('pointercancel', cancelPress, true);
      window.addEventListener('dragstart', cancelPress, true);
      window.addEventListener('blur', cancelPress);
      window.addEventListener('keydown', function(event){
        if(event.key==='Enter'||event.key===' ') keyboardTarget=event.target;
      }, true);
      // Capture runs before the document-level navigation/forwarding handlers.
      window.addEventListener('click', function(event){
        var target = navigationTarget(event);
        if(!target || forwardingClick) return;
        if(event.detail===0 && (event.isTrusted || keyboardTarget===target)){ keyboardTarget=null; return; }
        var intentional = press && press.released && !press.moved && !press.cancelled && press.target===target && performance.now()-press.releasedAt<1000;
        if(!intentional){ event.preventDefault(); event.stopImmediatePropagation(); }
      }, true);
      function forwardClick(control){
        forwardingClick=true;
        try{ control.click(); }finally{ forwardingClick=false; }
      }
      // The map remains usable while overlapping page controls keep priority.
      function underlyingMapControlAt(x, y){
        if(typeof document.elementFromPoint !== 'function') return null;
        siteMap.classList.add('is-site-map-probing');
        var target = document.elementFromPoint(x, y);
        siteMap.classList.remove('is-site-map-probing');
        if(!target || siteMap.contains(target) || !target.closest) return null;
        return target.closest(interactiveSelector);
      }
      function setMapOpen(open){
        siteMap.classList.toggle('is-map-open', open);
        if(mapToggle) mapToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      }
      var mapRect = null;
      function clearMapRect(){ mapRect = null; }
      window.addEventListener('resize', clearMapRect, {passive:true});
      window.addEventListener('scroll', clearMapRect, {capture:true,passive:true});
      function updateMapProximity(event){
        if(document.body.dataset.pageScene === 'audio' || !window.matchMedia || !window.matchMedia('(min-width:981px)').matches) {
          siteMap.classList.remove('is-site-map-expanded');
          return;
        }
        if(!mapRect){ mapRect = siteMap.getBoundingClientRect(); window.requestAnimationFrame(clearMapRect); }
        var rect = mapRect;
        var reach = 28;
        var close = event.clientX >= rect.left - reach && event.clientX <= rect.right + reach && event.clientY >= rect.top - reach && event.clientY <= rect.bottom + reach;
        siteMap.classList.toggle('is-site-map-expanded', close);
      }
      if(mapToggle) mapToggle.addEventListener('click', function(){ setMapOpen(!siteMap.classList.contains('is-map-open')); });
      document.addEventListener('pointermove', updateMapProximity, {passive:true});
      window.addEventListener('resize', function(){ siteMap.classList.remove('is-site-map-expanded'); });
      document.addEventListener('click', function(event){
        var region = event.target.closest && event.target.closest('[data-site-map] a[data-page-key]');
        // The explicitly opened mobile map owns its panel; only the floating
        // desktop map yields to controls underneath it.
        if(!region || event.detail === 0 || !window.matchMedia || !window.matchMedia('(min-width:981px)').matches) return;
        var underlying = underlyingMapControlAt(event.clientX, event.clientY);
        if(!underlying) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if(typeof underlying.click === 'function') forwardClick(underlying);
      }, true);
      document.addEventListener('pointerdown', function(event){ if(siteMap.classList.contains('is-map-open') && !siteMap.contains(event.target)) setMapOpen(false); });
      document.addEventListener('keydown', function(event){ if(event.key === 'Escape') setMapOpen(false); });
      window.addEventListener('songline:page-transition-start', function(){ setMapOpen(false); });
    }
    return {
      updateNavIndicator:updateNavIndicator,
      setNavActiveByURL:setNavActiveByURL,
      bindSiteMap:bindSiteMap
    };
  }
  window.SonglineCreatePageNavigation = createNavigation;
})();
