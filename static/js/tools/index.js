/* v20.0.8：工具页搜索兜底。主搜索逻辑在 /js/search.js，这里只保留兼容增强。 */
(function(){
  function ready(fn){
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, {once:true});
    else fn();
  }
  ready(function(){
    const search = document.querySelector('[data-tools-search]');
    const cards = Array.from(document.querySelectorAll('.modern-tools-grid .tool-card, .modern-tools-grid .tool-app-card'));
    const grid = document.querySelector('.modern-tools-grid');
    const layers = Array.from(grid ? grid.querySelectorAll('.tools-strata') : []);
    const count = document.querySelector('[data-tools-search-count]');
    if(!search || !cards.length || !grid || search.dataset.toolsArchiveBound === '1') return;
    search.dataset.toolsArchiveBound = '1';

    let empty = grid.querySelector('.tools-empty-state');
    if(!empty){
      empty = document.createElement('div');
      empty.className = 'card tools-empty-state';
      empty.textContent = '这层土里还没有挖到这个工具。';
      grid.appendChild(empty);
    }

    function norm(s){ return String(s || '').toLowerCase().replace(/[\u3000\s]+/g, ' ').trim(); }
    function terms(q){ return norm(q).split(/[\s,，、。;；|/]+/).filter(Boolean); }
    function apply(){
      const qs = terms(search.value);
      let visible = 0;
      cards.forEach(function(card){
        const hay = norm(card.textContent + ' ' + (card.getAttribute('data-tool-keywords') || ''));
        const show = !qs.length || qs.every(q => hay.includes(q));
        card.style.display = show ? '' : 'none';
        if(show) visible++;
      });
      // 搜索时同步收起没有命中节点的整段土层，避免留下空的地下横带。
      layers.forEach(function(layer){
        const hasVisibleNode = Array.from(layer.querySelectorAll('.tool-card, .tool-app-card'))
          .some(function(card){ return card.style.display !== 'none'; });
        layer.hidden = qs.length && !hasVisibleNode;
      });
      empty.style.display = qs.length && !visible ? '' : 'none';
      if(count) count.textContent = qs.length ? ('找到 ' + visible + ' / ' + cards.length + ' 个工具') : ('共 ' + cards.length + ' 个工具');
    }

    const button = document.querySelector('[data-tools-search-submit]');
    if(button) button.addEventListener('click', function(e){ e.preventDefault(); apply(); });
    search.addEventListener('keydown', function(e){
      if(e.key === 'Enter'){
        e.preventDefault();
        apply();
      }else if(e.key === 'Escape'){
        search.value = '';
        apply();
      }
    });
    search.addEventListener('search', function(){ if(!search.value) apply(); });
    search.addEventListener('input', apply);
    apply();
  });
})();
