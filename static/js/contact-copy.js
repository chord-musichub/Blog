(function(){
  const btn = document.querySelector('[data-theme-toggle]');
  const KEY = 'songline-theme';
  const moon = `<svg class="theme-icon moon-icon" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <path d="M21 14.4A8.7 8.7 0 0 1 9.6 3a7.2 7.2 0 1 0 11.4 11.4Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
  const sun = `<svg class="theme-icon sun-icon" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/>
  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
</svg>`;
  function getTheme(){ return localStorage.getItem(KEY) || 'dark'; }
  function themedIcon(name, fallback){
    return window.SonglineIcons && window.SonglineIcons.svg ? window.SonglineIcons.svg(name) : fallback;
  }
  function apply(theme){
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.backgroundColor = theme === 'dark' ? '#0d1728' : '#fbfaf7';
    if(document.body) document.body.classList.toggle('dark', theme === 'dark');
    if(btn){
      // 显示当前状态：浅色显示太阳，深色显示月亮
      btn.innerHTML = theme === 'dark' ? themedIcon('moon', moon) : themedIcon('sun', sun);
      btn.setAttribute('aria-label', theme === 'dark' ? '当前深色模式，点击切换浅色' : '当前浅色模式，点击切换深色');
      btn.setAttribute('title', theme === 'dark' ? '当前深色模式' : '当前浅色模式');
    }
  }
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){ apply(getTheme()); });
  }else{
    apply(getTheme());
  }
  if(btn){
    btn.addEventListener('click', function(){
      const next = document.body.classList.contains('dark') ? 'light' : 'dark';
      localStorage.setItem(KEY, next);
      apply(next);
    });
  }
})();


(function(){
  function copyText(text){
    if(!text) return;
    if(navigator.clipboard && window.isSecureContext){
      navigator.clipboard.writeText(text).catch(function(){});
      return;
    }
    const input = document.createElement('textarea');
    input.value = text;
    input.setAttribute('readonly', '');
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    document.body.appendChild(input);
    input.select();
    try{ document.execCommand('copy'); }catch(e){}
    document.body.removeChild(input);
  }
  document.querySelectorAll('.email-contact[data-email]').forEach(function(link){
    link.addEventListener('click', function(){
      const email = link.getAttribute('data-email') || '';
      copyText(email);
      link.classList.add('copied');
      window.clearTimeout(link.__copiedTimer);
      link.__copiedTimer = window.setTimeout(function(){
        link.classList.remove('copied');
      }, 1600);
    });
  });
})();


