/* v14.3：整卡点击统一事件委托，兜底 related-card */
(function(){
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
    return target && target.closest && target.closest('[data-card-link], .related-card');
  }

  document.querySelectorAll('[data-card-link], .related-card').forEach(function(card){
    if(getHref(card)){
      card.classList.add('clickable-card');
      if(!card.hasAttribute('tabindex')) card.setAttribute('tabindex', '0');
      if(!card.hasAttribute('role')) card.setAttribute('role', 'link');
    }
  });

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



/* v16.9：返回按钮改为固定返回对应上级页面，不再 history.back，避免像撤回上一动作 */


