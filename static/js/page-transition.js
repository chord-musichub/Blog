/* Home boot entry. Public navigation is owned by page-transition-system.js. */
(function(){
  'use strict';
  function initialize(){
    var root = document.documentElement;
    var isHome = document.body.dataset.pageKind === 'home';
    var key = 'songline-home-boot-v21.4';
    var played = false;
    try{ played = sessionStorage.getItem(key) === '1'; }catch(e){}
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var shouldBoot = isHome && !played && !reduced && !window.__songlineDocumentArrival;
    if(shouldBoot && window.SonglineHomeBoot){
      window.SonglineHomeBoot.run({shouldBoot:true, bootKey:key});
    }else{
      clearTimeout(window.__songlineBootPrepFallback);
      root.classList.remove('is-boot-preparing', 'is-booting');
      if(!window.__songlineDocumentArrival && window.SonglineResources) window.SonglineResources.prepare(document);
    }
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, {once:true});
  else initialize();
})();
