/* Explicit card links on friend profiles use shared event delegation. */
(function(){
  if(window.SonglineInitCardInteractions){ window.SonglineInitCardInteractions(document); return; }
  const interactiveSelector = 'a, button, input, textarea, select, label, summary, [role="button"], [data-no-card-link]';

  function getHref(card){
    if(!card) return '';
    const direct = card.getAttribute('data-card-link');
    if(direct) return direct;
    const inner = card.querySelector('a[href]');
    return inner ? inner.getAttribute('href') : '';
  }

  function openHref(href, event){
    if(!href) return;
    if(event && (event.metaKey || event.ctrlKey)){
      window.open(href, '_blank', 'noopener');
      return;
    }
    if(window.SonglinePageTransition && typeof window.SonglinePageTransition.navigateLink === 'function'){
      window.SonglinePageTransition.navigateLink(href);
      return;
    }
    window.location.href = href;
  }

  function findCard(target){
    return target && target.closest && target.closest('[data-card-link]');
  }

  function init(root){
  (root || document).querySelectorAll('[data-card-link]').forEach(function(card){
    if(getHref(card)){
      card.classList.add('clickable-card');
      if(!card.hasAttribute('tabindex')) card.setAttribute('tabindex', '0');
      if(!card.hasAttribute('role')) card.setAttribute('role', 'link');
    }
  });
  }
  window.SonglineInitCardInteractions = init;
  init(document);
  window.addEventListener('songline:page-swap', function(event){ init(event.detail && event.detail.root); });

  document.addEventListener('click', function(event){
    const card = findCard(event.target);
    if(!card) return;
    if(event.target.closest(interactiveSelector)) return;
    const href = getHref(card);
    if(!href) return;
    event.preventDefault();
    openHref(href, event);
  });

  document.addEventListener('keydown', function(event){
    if(event.key !== 'Enter' && event.key !== ' ') return;
    const card = findCard(event.target);
    if(!card) return;
    if(event.target.closest(interactiveSelector)) return;
    const href = getHref(card);
    if(!href) return;
    event.preventDefault();
    openHref(href, event);
  });
})();



/* 页面返回统一由 page-transition-system.js 按真实站内历史处理。 */
