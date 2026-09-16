(function(){
  'use strict';

  // 紧凑视口使用同一套底部导航；避免 CSS 已进入手机布局而脚本仍保留桌面锚点。
  var mobileQuery = '(max-width: 980px)';
  var mq = window.matchMedia ? window.matchMedia(mobileQuery) : null;
  var resizeObserver = null;
  var raf = 0;
  var dockedNodes = [];

  function isMobile(){
    return !mq || mq.matches;
  }

  function header(){
    return document.querySelector('.site-header.modern-site-header, .site-header');
  }

  // 页头在过场、滤镜或变形状态下会成为 fixed 元素的 containing block。
  // 将手机电梯和地图提升到 body，才能始终相对视口底部定位。
  function syncBottomDock(){
    var shouldDock = isMobile();
    var nodes = Array.prototype.slice.call(document.querySelectorAll('.songline-elevator-nav, .songline-site-map'));

    nodes.forEach(function(node){
      if(!node) return;
      var record = dockedNodes.find(function(item){ return item.node === node; });
      if(shouldDock){
        if(!record){
          record = {node:node, parent:node.parentNode, next:node.nextSibling, marker:document.createComment('songline-mobile-dock')};
          record.parent.insertBefore(record.marker, node);
          dockedNodes.push(record);
        }
        if(node.parentNode !== document.body) document.body.appendChild(node);
        node.setAttribute('data-mobile-bottom-dock', 'true');
      }else if(record){
        if(record.next && record.next.parentNode === record.parent) record.parent.insertBefore(node, record.next);
        else record.parent.appendChild(node);
        record.marker.remove();
        dockedNodes = dockedNodes.filter(function(item){ return item !== record; });
        node.removeAttribute('data-mobile-bottom-dock');
      }
    });
  }

  function measure(){
    window.cancelAnimationFrame(raf);
    raf = window.requestAnimationFrame(function(){
      var h = header();
      syncBottomDock();
      if(!h || !isMobile()){
        document.documentElement.classList.remove('has-fixed-mobile-nav');
        document.documentElement.style.removeProperty('--songline-mobile-nav-height');
        return;
      }

      // fixed 后 offsetHeight 依然可读；加一点余量避免内容贴住导航底边。
      var rect = h.getBoundingClientRect();
      var height = Math.max(h.offsetHeight || 0, rect.height || 0, 86);
      document.documentElement.style.setProperty('--songline-mobile-nav-height', Math.ceil(height + 10) + 'px');
      document.documentElement.classList.add('has-fixed-mobile-nav');
    });
  }

  function bindObserver(){
    var h = header();
    if(!h || !window.ResizeObserver) return;
    if(resizeObserver) resizeObserver.disconnect();
    resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(h);
  }

  function init(){
    measure();
    bindObserver();
    window.setTimeout(measure, 60);
    window.setTimeout(measure, 260);
    window.setTimeout(measure, 780);
  }

  window.SonglineMeasureMobileNav = init;

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  }else{
    init();
  }

  window.addEventListener('resize', init, {passive:true});
  window.addEventListener('orientationchange', function(){ window.setTimeout(init, 160); }, {passive:true});
  window.addEventListener('pageshow', init);
  // 新页面挂入时立刻重算，保证黑幕退出前顶栏和底部 Dock 已在最终位置。
  window.addEventListener('songline:page-swap', function(){
    init();
    window.requestAnimationFrame(init);
  });

  if(mq && mq.addEventListener){
    mq.addEventListener('change', init);
  }

  if(document.fonts && document.fonts.ready){
    document.fonts.ready.then(init).catch(function(){});
  }
})();
