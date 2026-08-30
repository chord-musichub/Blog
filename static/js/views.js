(function(){
 function initViews(root){
    root = root || document;
    const counters = Array.from(root.querySelectorAll('.real-views[data-view-path]'));
    if(!counters.length) return;

    const seenThisPage = new Set();
    counters.forEach(function(el){
      const b = el.querySelector('b');
      const path = el.getAttribute('data-view-path') || window.location.pathname;
      const mode = el.getAttribute('data-view-mode') || (el.classList.contains('article-view-counter') ? 'post' : 'get');
      const key = 'songline-viewed:' + path;
      const shouldPost = mode === 'post' && sessionStorage.getItem(key) !== '1' && !seenThisPage.has(path);
      const method = shouldPost ? 'POST' : 'GET';

      if(el.dataset.viewLoading === '1') return;
      if(el.dataset.viewReady === '1' && method === 'POST') return;
      el.dataset.viewLoading = '1';
      el.dataset.viewReady = '1';
      seenThisPage.add(path);

      fetch('/api/views?path=' + encodeURIComponent(path), { method:method, credentials:'same-origin' })
        .then(function(r){ return r.ok ? r.json() : null; })
        .then(function(data){
          if(!data || typeof data.views !== 'number') return;
          if(b) b.textContent = data.views;
          el.dataset.viewLoaded = '1';
          if(shouldPost) sessionStorage.setItem(key, '1');
        })
        .catch(function(){
          if(b && !b.textContent) b.textContent = '0';
        })
        .finally(function(){
          el.dataset.viewLoading = '0';
        });
    });
  }

  window.SonglineInitViews = initViews;
})();

