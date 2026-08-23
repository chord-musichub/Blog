
(function(){
  const KEY = "gexian-admin-theme";
  const moon = `<svg class="theme-icon moon-icon" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <path d="M21 14.4A8.7 8.7 0 0 1 9.6 3a7.2 7.2 0 1 0 11.4 11.4Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
  const sun = `<svg class="theme-icon sun-icon" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/>
  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
</svg>`;
  const eye = `<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
  <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/>
</svg>`;
  const eyeOff = `<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <path d="M3 3l18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <path d="M10.6 6.2A9.8 9.8 0 0 1 12 6c6.1 0 9.5 6 9.5 6a16.7 16.7 0 0 1-3 3.6M7.2 7.4C4.2 9.2 2.5 12 2.5 12s3.4 6 9.5 6a9.7 9.7 0 0 0 4.1-.9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

  function getTheme(){
    return localStorage.getItem(KEY) || "dark";
  }

  function ensureButton(){
    if(document.querySelector("[data-admin-theme-toggle]")) return;
    const btn = document.createElement("button");
    btn.className = "admin-theme-icon-button floating-admin-theme-button";
    btn.type = "button";
    btn.setAttribute("data-admin-theme-toggle", "");
    btn.setAttribute("aria-label", "当前深色模式，点击切换浅色");
    btn.setAttribute("title", "当前深色模式");
    btn.innerHTML = moon;
    document.body.appendChild(btn);
  }

  function setTheme(theme){
    localStorage.setItem(KEY, theme);
    document.documentElement.setAttribute("data-admin-theme", theme);
    document.documentElement.classList.toggle("admin-dark-root", theme === "dark");
    document.documentElement.style.backgroundColor = theme === "dark" ? "#0d1728" : "#fbfaf7";
    if(document.body){
      document.body.classList.toggle("admin-dark", theme === "dark");
      document.body.style.backgroundColor = theme === "dark" ? "#0d1728" : "";
      document.body.style.backgroundImage = theme === "dark" ? "none" : "";
    }
    document.querySelectorAll("[data-admin-theme-toggle]").forEach(btn => {
      const isFloating = btn.classList.contains("floating-admin-theme-button");
      btn.className = "admin-theme-icon-button" + (isFloating ? " floating-admin-theme-button" : "");
      // 显示当前状态：浅色显示太阳，深色显示月亮
      btn.setAttribute("aria-label", theme === "dark" ? "当前深色模式，点击切换浅色" : "当前浅色模式，点击切换深色");
      btn.setAttribute("title", theme === "dark" ? "当前深色模式" : "当前浅色模式");
      btn.innerHTML = theme === "dark" ? moon : sun;
    });
  }

  setTheme(getTheme());

  function initPasswordToggles(){
    document.querySelectorAll("[data-password-toggle]").forEach(btn => {
      if(btn.dataset.ready === "1") return;
      btn.dataset.ready = "1";
      const target = document.querySelector(btn.getAttribute("data-password-toggle"));
      if(!target) return;
      function syncIcon(){
        const showing = target.type === "text";
        // 图标表示当前状态：闭眼=当前隐藏，睁眼=当前显示
        btn.innerHTML = showing ? eye : eyeOff;
        btn.setAttribute("aria-label", showing ? "当前显示密码，点击隐藏" : "当前隐藏密码，点击显示");
        btn.setAttribute("title", showing ? "当前显示密码" : "当前隐藏密码");
      }
      syncIcon();
      btn.addEventListener("click", () => {
        const showing = target.type === "text";
        target.type = showing ? "password" : "text";
        syncIcon();
      });
    });
  }

  function init(){
    ensureButton();
    setTheme(getTheme());
    initPasswordToggles();
    document.addEventListener("click", function(e){
      const btn = e.target.closest("[data-admin-theme-toggle]");
      if(!btn) return;
      const next = getTheme() === "dark" ? "light" : "dark";
      setTheme(next);
    });
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", init);
  }else{
    init();
  }
})();



/* v14.4：后台交互增强 */
(function(){
  function closestInteractive(target){
    return target && target.closest && target.closest('a, button, input, textarea, select, label, summary, details, form, [data-no-row-link]');
  }

  function initRowLinks(){
    document.querySelectorAll('.article-row').forEach(function(row){
      if(row.dataset.rowReady === '1') return;
      const link = row.querySelector('h3 a[href]');
      if(!link) return;
      row.dataset.rowReady = '1';
      row.classList.add('clickable-admin-row');
      row.setAttribute('tabindex', '0');
      row.setAttribute('role', 'link');
      row.addEventListener('click', function(event){
        if(closestInteractive(event.target)) return;
        window.location.href = link.href;
      });
      row.addEventListener('keydown', function(event){
        if(event.key !== 'Enter' && event.key !== ' ') return;
        if(closestInteractive(event.target)) return;
        event.preventDefault();
        window.location.href = link.href;
      });
    });
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', initRowLinks);
  }else{
    initRowLinks();
  }
})();



/* v14.6：后台返回图标逻辑 */
(function(){
  function initAdminBack(){
    document.querySelectorAll('[data-admin-back]').forEach(function(link){
      if(link.dataset.backReady === '1') return;
      link.dataset.backReady = '1';
      link.addEventListener('click', function(event){
        if(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const ref = document.referrer || '';
        let sameOrigin = false;
        try{ sameOrigin = ref && new URL(ref, window.location.href).origin === window.location.origin; }catch(e){}
        if(sameOrigin && window.history.length > 1){
          event.preventDefault();
          window.history.back();
        }
      });
    });
  }
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', initAdminBack);
  }else{
    initAdminBack();
  }
})();
