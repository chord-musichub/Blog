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
      var page = (window.SonglinePagePriority.config || []).find(function(item){ return item.key === key; });
      var label = /^\/tags\/site-notice\/?$/.test(url.pathname || url) ? '公告' : (page && page.label) || '地图';
      var current = document.querySelector('[data-site-map-current]');
      var toggle = document.querySelector('[data-site-map-toggle]');
      if(current && current.textContent !== label) current.textContent = label;
      if(toggle) toggle.setAttribute('aria-label', '当前页面：' + label + '，' + (toggle.getAttribute('aria-expanded') === 'true' ? '关闭' : '打开') + '站点地图');
    }
    function updateNavIndicator(){ setNavActiveByURL(new URL(window.location.href)); }
    function bindSiteMap(){
      var siteMap = document.querySelector('[data-site-map]');
      if(!siteMap || siteMap.dataset.siteMapReady === '1') return;
      siteMap.dataset.siteMapReady = '1';
      var mapToggle = siteMap.querySelector('[data-site-map-toggle]');
      var mapPanel = siteMap.querySelector('.songline-site-map__regions');
      // Activation needs the same target at press and release. Distance alone
      // misses short drags crossing a map region boundary.
      var press = null;
      var keyboardTarget = null;
      function navigationTarget(event){
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
        if(!target) return;
        if(event.detail===0 && (event.isTrusted || keyboardTarget===target)){ keyboardTarget=null; return; }
        var intentional = press && press.released && !press.moved && !press.cancelled && press.target===target && performance.now()-press.releasedAt<1000;
        if(!intentional){ event.preventDefault(); event.stopImmediatePropagation(); }
      }, true);
      function setMapOpen(open){
        if(!open && mapPanel && mapPanel.contains(document.activeElement) && mapToggle) mapToggle.focus();
        siteMap.classList.toggle('is-map-open', open);
        if(mapPanel) mapPanel.hidden = !open;
        if(mapToggle){
          mapToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
          mapToggle.title = (open ? '关闭' : '打开') + '站点地图';
          var current = siteMap.querySelector('[data-site-map-current]');
          mapToggle.setAttribute('aria-label', '当前页面：' + (current ? current.textContent : '地图') + '，' + (open ? '关闭' : '打开') + '站点地图');
        }
      }
      if(mapToggle) mapToggle.addEventListener('click', function(){ setMapOpen(!siteMap.classList.contains('is-map-open')); });
      siteMap.addEventListener('click', function(event){
        var region = event.target.closest && event.target.closest('[data-site-map] a[data-page-key]');
        if(region) setMapOpen(false);
      });
      siteMap.addEventListener('focusout', function(event){ if(event.relatedTarget && !siteMap.contains(event.relatedTarget)) setMapOpen(false); });
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
