(function(){
  'use strict';

  var VERSION = '20.20.6';
  var headerSelector = [
    '.modern-site-header',
    '.site-header',
    '.topbar',
    'header[role="banner"]',
    'body > header'
  ].join(',');

  function findHeader(){
    var nodes = Array.prototype.slice.call(document.querySelectorAll(headerSelector));
    if(!nodes.length) return null;

    // Prefer the visible top-level site header.
    for(var i = 0; i < nodes.length; i++){
      var node = nodes[i];
      if(!node || node.closest('.mobile-toc-drawer, .modal, .drawer')) continue;
      var style = window.getComputedStyle(node);
      if(style.display === 'none' || style.visibility === 'hidden') continue;
      var rect = node.getBoundingClientRect();
      if(rect.width > 240 && rect.height > 30) return node;
    }
    return nodes[0];
  }

  function isDesktop(){
    return !window.matchMedia || window.matchMedia('(min-width: 821px)').matches;
  }

  function measure(){
    var header = findHeader();
    var root = document.documentElement;

    if(!header || !isDesktop()){
      root.classList.remove('has-desktop-fixed-nav');
      root.style.removeProperty('--desktop-fixed-nav-height');
      if(header) header.removeAttribute('data-desktop-fixed-nav');
      return;
    }

    header.setAttribute('data-desktop-fixed-nav', VERSION);
    root.classList.add('has-desktop-fixed-nav');

    // fixed 之后 rect.top 会是 0，因此高度只取 height。
    var rect = header.getBoundingClientRect();
    var height = Math.max(56, Math.ceil(rect.height || header.offsetHeight || 72));
    root.style.setProperty('--desktop-fixed-nav-height', height + 'px');
  }

  function schedule(){
    window.requestAnimationFrame(function(){
      measure();
      window.setTimeout(measure, 80);
      window.setTimeout(measure, 240);
    });
  }

  window.SonglineDesktopFixedNav = {
    version: VERSION,
    refresh: schedule
  };

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', schedule);
  }else{
    schedule();
  }

  window.addEventListener('load', schedule);
  window.addEventListener('pageshow', schedule);
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', schedule);
  window.addEventListener('songline:page-swap', schedule);
})();
