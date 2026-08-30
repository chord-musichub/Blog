(function(){'use strict';
  function createNavigation(){
  let navSliderState = {
    x:0,
    width:0,
    ready:false,
    hoverLink:null
  };

  function ensureNavSlider(){
    const nav = document.querySelector('.modern-nav-links');
    if(!nav) return null;

    // 若旧版本遗留了指示器，先从 DOM 中移除。
    let slider = nav.querySelector('.songline-nav-slider');
    if(!slider){
      slider = document.createElement('span');
      slider.className = 'songline-nav-slider';
      slider.setAttribute('aria-hidden', 'true');
      nav.insertBefore(slider, nav.firstChild);
    }
    return slider;
  }

  function navBoxForLink(link){
    const nav = document.querySelector('.modern-nav-links');
    if(!nav || !link) return null;
    const navRect = nav.getBoundingClientRect();
    const linkRect = link.getBoundingClientRect();
    return {
      x: linkRect.left - navRect.left,
      width: linkRect.width
    };
  }

  function activeNavLink(){
    return document.querySelector('.modern-nav-links a.active') || document.querySelector('.modern-nav-links a[href="/"]');
  }

  function moveNavSliderTo(link, instant){
    const slider = ensureNavSlider();
    const box = navBoxForLink(link);
    if(!slider || !box) return;

    if(instant || !navSliderState.ready){
      slider.classList.add('is-instant');
    }else{
      slider.classList.remove('is-instant');
    }

    slider.style.transform = 'translate3d(' + box.x + 'px,0,0)';
    slider.style.width = box.width + 'px';
    slider.style.opacity = '1';
    slider.style.visibility = 'visible';

    navSliderState.x = box.x;
    navSliderState.width = box.width;
    navSliderState.ready = true;

    if(instant){
      window.setTimeout(function(){ slider.classList.remove('is-instant'); }, 30);
    }
  }

  function updateNavIndicator(instant){
    moveNavSliderTo(activeNavLink(), instant);
  }

  function setNavActiveNow(link){
    const nav = document.querySelector('.modern-nav-links');
    if(!nav || !link) return;
    nav.querySelectorAll('a.active').forEach(function(item){ item.classList.remove('active'); });
    link.classList.add('active');
    nav.classList.add('is-click-sliding');
    moveNavSliderTo(link, false);
    window.setTimeout(function(){ nav.classList.remove('is-click-sliding'); }, 620);
  }

  function setNavActiveByURL(url){
    const nav = document.querySelector('.modern-nav-links');
    if(!nav || !url) return;
    const targetIndex = navIndex(url.pathname);
    let target = null;
    nav.querySelectorAll('a[href]').forEach(function(item){
      let match = false;
      try{
        const itemURL = new URL(item.href, window.location.origin);
        match = navIndex(itemURL.pathname) === targetIndex;
      }catch(e){}
      item.classList.toggle('active', match);
      if(match) target = item;
    });
    if(target) moveNavSliderTo(target, false);
  }

  function bindNavIndicatorHover(){
    const nav = document.querySelector('.modern-nav-links');
    if(!nav || nav.dataset.songlineSliderReady === '1') return;
    nav.dataset.songlineSliderReady = '1';

    nav.addEventListener('pointerover', function(event){
      const link = event.target && event.target.closest ? event.target.closest('a[href]') : null;
      if(!link || !nav.contains(link)) return;
      if(navSliderState.hoverLink === link) return;
      navSliderState.hoverLink = link;
      nav.classList.add('is-hover-sliding');
      moveNavSliderTo(link, false);
    });

    nav.addEventListener('pointerleave', function(){
      navSliderState.hoverLink = null;
      nav.classList.remove('is-hover-sliding');
      updateNavIndicator(false);
    });
  }

  const navOrder = ['/', '/posts/', '/tags/', '/friends/', '/tools/'];

  function normalizePath(pathname){
    if(!pathname) return '/';
    if(pathname !== '/' && !pathname.endsWith('/')) pathname += '/';
    return pathname;
  }

  function navIndex(pathname){
    pathname = normalizePath(pathname);
    if(pathname === '/') return 0;
    if(pathname.startsWith('/posts/')) return 1;
    if(pathname.startsWith('/tags/')) return 2;
    if(pathname.startsWith('/friends/')) return 3;
    if(pathname.startsWith('/tools/')) return 4;
    return -1;
  }

    return {ensureNavSlider:ensureNavSlider,moveNavSliderTo:moveNavSliderTo,updateNavIndicator:updateNavIndicator,setNavActiveNow:setNavActiveNow,setNavActiveByURL:setNavActiveByURL,bindNavIndicatorHover:bindNavIndicatorHover,navIndex:navIndex};
  }
  window.SonglineCreatePageNavigation=createNavigation;
})();
