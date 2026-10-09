(function(){
  'use strict';

  // 紧凑视口与桌面共用顶栏；这里只测量移动布局需要的内容留白。
  var mobileQuery = '(max-width: 980px)';
  var mq = window.matchMedia ? window.matchMedia(mobileQuery) : null;
  var resizeObserver = null;
  var raf = 0;
  var observedHeader = null;

  function isMobile(){
    return !mq || mq.matches;
  }

  function header(){
    return document.querySelector('.site-header.modern-site-header, .site-header');
  }

  function measure(){
    if(raf) return;
    raf = window.requestAnimationFrame(function(){
      raf = 0;
      var h = header();
      if(!h || !isMobile() || document.body.dataset.pageScene === 'audio'){
        document.documentElement.classList.remove('has-fixed-mobile-nav');
        document.documentElement.style.removeProperty('--songline-mobile-nav-height');
        return;
      }

      // fixed 后 offsetHeight 依然可读；加一点余量避免内容贴住导航底边。
      var rect = h.getBoundingClientRect();
      var height = Math.max(h.offsetHeight || 0, rect.height || 0, 86);
      var value = Math.ceil(height + 10) + 'px';
      if(document.documentElement.style.getPropertyValue('--songline-mobile-nav-height') !== value){
        document.documentElement.style.setProperty('--songline-mobile-nav-height', value);
      }
      document.documentElement.classList.add('has-fixed-mobile-nav');
    });
  }

  function bindObserver(){
    var h = header();
    if(!h || !window.ResizeObserver || h === observedHeader) return;
    if(resizeObserver) resizeObserver.disconnect();
    observedHeader = h;
    resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(h);
  }

  function init(){
    measure();
    bindObserver();
  }

  window.SonglineMeasureMobileNav = init;

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  }else{
    init();
  }

  window.addEventListener('resize', measure, {passive:true});
  window.addEventListener('orientationchange', function(){ window.setTimeout(init, 160); }, {passive:true});
  window.addEventListener('pageshow', init);
  // 新页面挂入时立刻重算，保证黑幕退出前顶栏已在最终位置。
  window.addEventListener('songline:page-swap', function(){
    init();
  });

  if(mq && mq.addEventListener){
    mq.addEventListener('change', init);
  }

  if(document.fonts && document.fonts.ready){
    document.fonts.ready.then(init).catch(function(){});
  }
})();
