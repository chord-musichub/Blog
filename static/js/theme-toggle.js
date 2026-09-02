(function(){
  var KEY = 'songline-theme';
  var isTransitioning = false;
  var moon = '<svg class="theme-icon moon-icon" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M21 14.4A8.7 8.7 0 0 1 9.6 3a7.2 7.2 0 1 0 11.4 11.4Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var sun = '<svg class="theme-icon sun-icon" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  var sceneMoon = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M47.5 42.8A22.4 22.4 0 0 1 21.2 16.5 21.6 21.6 0 1 0 47.5 42.8Z" transform="translate(3 0)"/></svg>';
  var sceneSun = '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="10"/><path d="M32 7v7M32 50v7M14.3 14.3l4.9 4.9M44.8 44.8l4.9 4.9M7 32h7M50 32h7M14.3 49.7l4.9-4.9M44.8 19.2l4.9-4.9"/></svg>';

  function getTheme(){
    try{ return localStorage.getItem(KEY) || 'dark'; }catch(e){ return 'dark'; }
  }

  function themedIcon(name, fallback){
    return window.SonglineIcons && window.SonglineIcons.svg ? window.SonglineIcons.svg(name) : fallback;
  }

  function apply(theme){
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.backgroundColor = theme === 'dark' ? '#0d1728' : '#fbfaf7';
    if(document.body) document.body.classList.toggle('dark', theme === 'dark');
    document.querySelectorAll('[data-theme-toggle]').forEach(function(button){
      button.innerHTML = theme === 'dark' ? themedIcon('moon', moon) : themedIcon('sun', sun);
      button.setAttribute('aria-label', theme === 'dark' ? '当前深色模式，点击切换浅色' : '当前浅色模式，点击切换深色');
      button.setAttribute('title', theme === 'dark' ? '当前深色模式' : '当前浅色模式');
    });
  }

  function createCurtain(wasDark){
    var curtain = document.createElement('div');
    curtain.className = 'songline-theme-transition';
    curtain.setAttribute('aria-hidden', 'true');
    curtain.innerHTML = '<div class="songline-theme-transition-symbol"><span class="songline-theme-transition-icon is-current">' + (wasDark ? sceneMoon : sceneSun) + '</span><span class="songline-theme-transition-icon is-next">' + (wasDark ? sceneSun : sceneMoon) + '</span></div>';
    document.body.appendChild(curtain);
    return curtain;
  }

  function switchTheme(){
    if(isTransitioning || !document.body || document.documentElement.classList.contains('songline-page-transitioning')) return;
    isTransitioning = true;
    var wasDark = document.documentElement.getAttribute('data-theme') === 'dark';
    var next = wasDark ? 'light' : 'dark';
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var curtain = createCurtain(wasDark);
    requestAnimationFrame(function(){ curtain.classList.add('is-covering'); });
    window.setTimeout(function(){
      try{ localStorage.setItem(KEY, next); }catch(e){}
      apply(next);
      curtain.classList.add('is-swapping');
    }, reduced ? 90 : 420);
    window.setTimeout(function(){ curtain.classList.add('is-leaving'); }, reduced ? 145 : 790);
    window.setTimeout(function(){
      curtain.remove();
      isTransitioning = false;
    }, reduced ? 290 : 1190);
  }

  function playFriendsPlaceholder(){
    if(isTransitioning || !document.body || document.documentElement.classList.contains('songline-page-transitioning')) return;
    isTransitioning = true;
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // 朋友页保留完整的按键过渡反馈，但夜空场景与全站偏好都不发生改变。
    var curtain = createCurtain(true);
    requestAnimationFrame(function(){ curtain.classList.add('is-covering'); });
    window.setTimeout(function(){
      apply('dark');
      curtain.classList.add('is-swapping');
    }, reduced ? 90 : 420);
    window.setTimeout(function(){ curtain.classList.add('is-leaving'); }, reduced ? 145 : 790);
    window.setTimeout(function(){
      curtain.remove();
      isTransitioning = false;
    }, reduced ? 290 : 1190);
  }

  function isFriendsScene(){
    return !!document.querySelector('.friends-constellation');
  }

  function initializeFriendsPlaceholder(){
    // Friends 是独立的夜空场景：只在当前页强制深色，不写入用户全站偏好。
    apply('dark');
    document.querySelectorAll('[data-theme-toggle]').forEach(function(button){
      button.removeAttribute('aria-disabled');
      button.setAttribute('aria-label', '朋友页主题占位按钮');
      button.setAttribute('title', '朋友页主题占位按钮');
      button.classList.add('is-theme-placeholder');
    });
  }

  function syncPageTheme(){
    if(isFriendsScene()){
      initializeFriendsPlaceholder();
      return;
    }
    document.querySelectorAll('[data-theme-toggle]').forEach(function(button){
      button.classList.remove('is-theme-placeholder');
    });
    apply(getTheme());
  }

  function handleThemeClick(event){
    var button = event.target && event.target.closest ? event.target.closest('[data-theme-toggle]') : null;
    if(!button) return;
    // 朋友页的按钮有完整点击反馈，但夜空场景固定深色，不能写入全站主题偏好。
    if(isFriendsScene()){
      event.preventDefault();
      button.classList.add('is-theme-placeholder');
      button.setAttribute('aria-pressed', 'false');
      playFriendsPlaceholder();
      return;
    }
    switchTheme();
  }

  function initialize(){
    syncPageTheme();
    // 使用委托监听：动态换页后页眉按钮不需要重新绑定，也不会遗留朋友页的占位状态。
    document.addEventListener('click', handleThemeClick);
    window.addEventListener('songline:page-swap', syncPageTheme);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
  else initialize();
})();
