(function(){
  'use strict';

  // 980px 以下的桌面分屏仍应保留桌面电梯；无 hover 的触屏设备才使用
  // 底部固定导航。760px 以下则无条件进入移动布局。
  var mobileQuery = '(max-width: 760px), (max-width: 980px) and (hover: none)';
  var mq = window.matchMedia ? window.matchMedia(mobileQuery) : null;
  var resizeObserver = null;
  var raf = 0;

  function isMobile(){
    return !mq || mq.matches;
  }

  function header(){
    return document.querySelector('.site-header.modern-site-header, .site-header');
  }

  function measure(){
    window.cancelAnimationFrame(raf);
    raf = window.requestAnimationFrame(function(){
      var h = header();
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
  window.addEventListener('songline:page-swap', function(){ window.setTimeout(init, 80); });

  if(mq && mq.addEventListener){
    mq.addEventListener('change', init);
  }

  if(document.fonts && document.fonts.ready){
    document.fonts.ready.then(init).catch(function(){});
  }
})();
