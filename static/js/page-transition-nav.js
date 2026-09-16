(function(){
  'use strict';

  function createNavigation(){
    function elevatorLinks(){ return Array.prototype.slice.call(document.querySelectorAll('[data-elevator-nav] a[data-page-key]')); }
    function navigationLinks(){ return Array.prototype.slice.call(document.querySelectorAll('[data-elevator-nav] a[data-page-key], [data-site-map] a[data-page-key]')); }
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
    function setNavActiveNow(link){
      if(!link) return;
      navigationLinks().forEach(function(item){
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
      var desktopQuery = window.matchMedia ? window.matchMedia('(min-width: 981px)') : null;
      function setHoveredLink(link){
        elevatorLinks().forEach(function(item){ item.classList.toggle('is-elevator-hovered', item === link); });
      }
      function clearHoveredLink(){
        nav.classList.remove('is-elevator-hovering');
        setHoveredLink(null);
      }
      var yieldingLink = null;
      // 视觉暗幕不建立点击层。扩大的操作范围由 document 上的坐标判断实现，
      // 所以星图节点、卡片按钮等位于同一点时仍然会先收到原生指针事件。
      var interactiveSelector = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[role="button"],[tabindex]:not([tabindex="-1"])';
      function isInside(rect, x, y){
        return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
      }
      function isDesktopElevator(){ return !desktopQuery || desktopQuery.matches; }
      function virtualHitRect(link){
        var rect = link.getBoundingClientRect();
        var navRect = nav.getBoundingClientRect();
        // 直接读取 ::before 的实际右侧外延，避免视觉暗幕改宽后感应带仍停在旧尺寸。
        var veilRight = Math.abs(Number.parseFloat(window.getComputedStyle(nav, '::before').right) || 0);
        // 锚点本身只保留在楼层数字旁；此处是无形的扩展感应带。
        return {
          left:rect.left - 18,
          right:navRect.right + veilRight,
          // 相邻楼层间距很小，纵向仅补 2px，避免两个楼层的感应带重叠。
          top:rect.top - 2,
          bottom:rect.bottom + 2
        };
      }
      function virtualLinkAt(x, y){
        if(!isDesktopElevator()) return null;
        return elevatorLinks().find(function(link){ return isInside(virtualHitRect(link), x, y); }) || null;
      }
      // Activation needs the same target at press and release. Distance alone misses
      // short drags crossing a virtual hit boundary; synthetic click has detail=0.
      var press = null;
      var forwardingClick = false;
      var keyboardTarget = null;
      function navigationTarget(event){
        var actual = event.target.closest && event.target.closest('[data-elevator-nav] a[data-page-key], [data-site-map] a[data-page-key], [data-site-map-toggle]');
        if(actual) return actual;
        if(event.type === 'click' && event.detail === 0) return null;
        var virtual = virtualLinkAt(event.clientX, event.clientY);
        return virtual && !underlyingControlAt(event.clientX, event.clientY) ? virtual : null;
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
      // Window capture runs before all document-level navigation/forwarding handlers.
      window.addEventListener('click', function(event){
        var target = navigationTarget(event);
        if(!target || forwardingClick) return;
        if(event.detail===0 && (event.isTrusted || keyboardTarget===target)){ keyboardTarget=null; return; }
        var intentional = press && press.released && !press.moved && !press.cancelled && press.target===target && performance.now()-press.releasedAt<1000;
        if(!intentional){
          event.preventDefault(); event.stopImmediatePropagation();
        }
      }, true);
      function forwardClick(control){
        forwardingClick=true;
        try{ control.click(); }finally{ forwardingClick=false; }
      }
      function setYieldingLink(link){
        if(yieldingLink === link) return;
        if(yieldingLink) yieldingLink.classList.remove('is-elevator-yielding');
        yieldingLink = link || null;
        if(yieldingLink) yieldingLink.classList.add('is-elevator-yielding');
      }
      function underlyingControlAt(x, y){
        if(typeof document.elementFromPoint !== 'function') return null;
        // 真实锚点偶尔会和星图节点重叠；探测时也短暂穿透锚点。
        nav.classList.add('is-elevator-probing');
        var target = document.elementFromPoint(x, y);
        nav.classList.remove('is-elevator-probing');
        if(!target || nav.contains(target) || !target.closest) return null;
        return target.closest(interactiveSelector);
      }
      function updateVirtualElevator(event){
        if(!event || !isDesktopElevator()){
          setYieldingLink(null);
          clearHoveredLink();
          return;
        }
        var link = virtualLinkAt(event.clientX, event.clientY);
        if(!link){
          setYieldingLink(null);
          clearHoveredLink();
          return;
        }
        var underlying = underlyingControlAt(event.clientX, event.clientY);
        if(underlying){
          setYieldingLink(link);
          clearHoveredLink();
          return;
        }
        setYieldingLink(null);
        nav.classList.add('is-elevator-hovering');
        setHoveredLink(link);
      }
      document.addEventListener('pointermove', updateVirtualElevator, { passive:true });
      // 感应带本身没有元素，因此空白处点击由这里补上；有下层控件时绝不拦截。
      document.addEventListener('click', function(event){
        if(!isDesktopElevator() || event.defaultPrevented) return;
        var link = virtualLinkAt(event.clientX, event.clientY);
        if(!link) return;
        var underlying = underlyingControlAt(event.clientX, event.clientY);
        if(underlying){
          var navLink = event.target.closest && event.target.closest('[data-elevator-nav] a[data-page-key]');
          if(navLink){
            event.preventDefault();
            event.stopImmediatePropagation();
            if(typeof underlying.click === 'function') forwardClick(underlying);
          }
          return;
        }
        // 只有真正命中楼层锚点时保留原生行为；感应带本身落在 nav
        // 容器上，没有子锚点，必须继续由这里转发。
        var actualNavLink = event.target.closest && event.target.closest('[data-elevator-nav] a[data-page-key]');
        if(actualNavLink) return;
        event.preventDefault();
        forwardClick(link);
      }, true);
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
            clearHoveredLink();
          }
        }, 0);
      });

      var siteMap = document.querySelector('[data-site-map]');
      var mapToggle = siteMap && siteMap.querySelector('[data-site-map-toggle]');
      if(siteMap && siteMap.dataset.siteMapReady !== '1'){
        siteMap.dataset.siteMapReady = '1';
        // 站点地图固定在侧侧栏，不应抢走恰好位于其下方的真实页面控件。
        // 与电梯的扩展感应带一致：地图自身可用，但下层按钮和链接优先。
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
        // 桌面端让缩略地图有一圈无形的感应范围：靠近就放大，但不占用下层控件的点击。
        function updateMapProximity(event){
          if(!window.matchMedia || !window.matchMedia('(min-width:981px)').matches) {
            siteMap.classList.remove('is-site-map-expanded');
            return;
          }
          var rect = siteMap.getBoundingClientRect();
          var reach = 28;
          var close = event.clientX >= rect.left - reach && event.clientX <= rect.right + reach && event.clientY >= rect.top - reach && event.clientY <= rect.bottom + reach;
          siteMap.classList.toggle('is-site-map-expanded', close);
        }
        if(mapToggle) mapToggle.addEventListener('click', function(){ setMapOpen(!siteMap.classList.contains('is-map-open')); });
        document.addEventListener('pointermove', updateMapProximity, { passive:true });
        window.addEventListener('resize', function(){ siteMap.classList.remove('is-site-map-expanded'); });
        document.addEventListener('click', function(event){
          var region = event.target.closest && event.target.closest('[data-site-map] a[data-page-key]');
          if(!region) return;
          // 键盘触发的 click 没有可靠坐标，始终保留地图链接的原生可访问性。
          if(event.detail === 0) return;
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
