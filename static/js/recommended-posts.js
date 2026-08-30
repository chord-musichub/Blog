/* v13.8：首页文章推荐按阅读量排序 */
(function(){
  function initRecommended(root){
    root = root || document;
    const grid = root.querySelector('[data-recommended-posts]');
    if(!grid || grid.dataset.viewsSorted === '1') return;
    const cards = Array.from(grid.querySelectorAll('[data-recommend-path]'));
    if(cards.length < 2) return;
    grid.dataset.viewsSorted = '1';

    Promise.all(cards.map(function(card){
      const path = card.getAttribute('data-recommend-path') || '';
      return fetch('/api/views?path=' + encodeURIComponent(path), {method:'GET', credentials:'same-origin'})
        .then(function(r){ return r.ok ? r.json() : null; })
        .then(function(data){
          const views = data && typeof data.views === 'number' ? data.views : 0;
          card.dataset.views = String(views);
          const b = card.querySelector('.real-views b');
          if(b) b.textContent = views;
          return card;
        })
        .catch(function(){
          card.dataset.views = '0';
          return card;
        });
    })).then(function(){
      cards
        .sort(function(a,b){ return Number(b.dataset.views || 0) - Number(a.dataset.views || 0); })
        .forEach(function(card){ grid.appendChild(card); });
    });
  }

  window.SonglineInitRecommendedViews = initRecommended;
})();

