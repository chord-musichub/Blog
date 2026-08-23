(function(){
  const root = document.documentElement;
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let loader = null;
  let hideTimer = 0;

  function ensureLoader(){
    if(loader) return loader;
    loader = document.createElement('div');
    loader.className = 'page-loading-orb';
    loader.setAttribute('aria-hidden', 'true');
    loader.innerHTML = '<div class="page-loading-pill"><span class="page-loading-ring"></span><span class="page-loading-text">处理中</span></div>';
    document.body.appendChild(loader);
    return loader;
  }

  function show(){
    if(reduceMotion) return;
    window.clearTimeout(hideTimer);
    root.classList.add('is-page-loading');
    if(document.body) ensureLoader();
  }

  function hide(){
    if(reduceMotion) return;
    if(!document.body) return;
    ensureLoader();
    root.classList.add('is-page-loaded');
    root.classList.remove('is-page-loading');
    hideTimer = window.setTimeout(function(){
      root.classList.remove('is-page-loaded');
    }, 520);
  }

  function isPlainLeftClick(event){
    return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
  }

  function shouldHandleLink(link){
    if(!link) return false;
    if(link.target && link.target !== '_self') return false;
    if(link.hasAttribute('download')) return false;
    const href = link.getAttribute('href') || '';
    if(!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) return false;

    try{
      const url = new URL(link.href, window.location.href);
      if(url.origin !== window.location.origin) return false;
      if(url.pathname === window.location.pathname && url.search === window.location.search && url.hash) return false;
      return true;
    }catch(e){
      return false;
    }
  }

  // 新页面进来先轻轻露一下，再上拉收走。
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){
      show();
      window.requestAnimationFrame(function(){
        window.setTimeout(hide, 120);
      });
    }, { once:true });
  }else{
    show();
    window.requestAnimationFrame(function(){
      window.setTimeout(hide, 120);
    });
  }

  window.addEventListener('pageshow', function(){
    window.setTimeout(hide, 80);
  });

  window.addEventListener('beforeunload', function(){
    show();
  });

  document.addEventListener('click', function(event){
    if(!isPlainLeftClick(event)) return;
    const link = event.target && event.target.closest ? event.target.closest('a[href]') : null;
    if(shouldHandleLink(link)) show();
  }, true);

  document.addEventListener('submit', function(event){
    const form = event.target;
    if(!form || form.getAttribute('target')) return;
    show();
  }, true);
})();
