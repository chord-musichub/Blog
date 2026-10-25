(function(){
  'use strict';
  const states = new WeakMap();
  const pending = new Map();
  const viewed = new Set();
  function statisticsAllowed(){ return !!(window.SonglinePrivacy && window.SonglinePrivacy.allows('statistics')); }
  function alreadyViewed(path){
    if(viewed.has(path)) return true;
    try { return sessionStorage.getItem('songline-viewed:' + path) === '1'; }
    catch(error){ return false; }
  }
  function requestCount(path, method){
    // A POST also supplies the count for concurrent GET counters.
    const postKey = 'POST:' + path;
    const key = method + ':' + path;
    if(pending.has(postKey)) return pending.get(postKey);
    if(pending.has(key)) return pending.get(key);
    const controller = new AbortController();
    const timer = setTimeout(function(){ controller.abort(); }, 8000);
    const request = Promise.resolve().then(function(){
      // Consent may have been withdrawn between the scan and this microtask.
      if(method === 'POST' && !statisticsAllowed()) method = 'GET';
      return fetch('/api/views?path=' + encodeURIComponent(path), {method:method, credentials:'same-origin', signal:controller.signal});
    }).then(function(response){
      if(!response.ok) throw new Error('View count unavailable');
      return response.json();
    }).then(function(data){
      if(!data || !Number.isFinite(data.views)) throw new Error('Invalid view count');
      if(method === 'POST'){
        viewed.add(path);
        if(statisticsAllowed()){
          try { sessionStorage.setItem('songline-viewed:' + path, '1'); } catch(error){}
        }
      }
      return data.views;
    }).finally(function(){ clearTimeout(timer); pending.delete(key); });
    pending.set(key, request);
    return request;
  }
  function initViews(root){
    const counters = Array.from((root || document).querySelectorAll('.real-views[data-view-path]'));
    function mode(el){ return el.getAttribute('data-view-mode') || (el.classList.contains('article-view-counter') ? 'post' : 'get'); }
    // Start article increments before duplicate GET counters on the same page.
    counters.sort(function(a,b){ return Number(mode(b)==='post')-Number(mode(a)==='post'); });
    counters.forEach(function(el){
      if(el.getAttribute('data-view-deferred') === 'archive'){
        const record = el.closest('[data-archive-record]');
        if(!record || record.hidden || !record.classList.contains('is-open')) return;
      }
      const path = el.getAttribute('data-view-path') || window.location.pathname;
      const allowed = statisticsAllowed();
      const identity = path + ':' + mode(el) + ':' + (mode(el)==='post' && allowed);
      const previous = states.get(el);
      if(previous && previous.identity === identity) return;
      const state = {identity:identity};
      states.set(el, state);
      el.dataset.viewLoading = '1';
      el.dataset.viewLoaded = '0';
      requestCount(path, allowed && mode(el)==='post' && !alreadyViewed(path) ? 'POST' : 'GET').then(function(count){
        if(states.get(el) !== state) return;
        const value = el.querySelector('b');
        if(value) value.textContent = count;
        el.dataset.viewLoaded = '1';
      }).catch(function(){
        if(states.get(el) === state) states.delete(el); // A later scan may retry.
      }).finally(function(){
        if(!states.has(el) || states.get(el) === state) el.dataset.viewLoading = '0';
      });
    });
  }
  window.SonglineInitViews = initViews;
  window.addEventListener('songline:privacy-change',function(){ initViews(document); });
})();
