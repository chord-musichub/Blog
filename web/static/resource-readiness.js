/* One readiness contract for boot, page swaps and document handoffs. */
(function(){
  'use strict';
  var pendingImages = new WeakMap();
  var backgrounds = new Map();
  var observer = null;
  var POLICY = Object.freeze({ revealBudget:1200, moduleBudget:8000, nearbyMargin:320 });
  var style = document.createElement('style');
  style.textContent = 'img[data-image-state="pending"],img[data-image-state="error"]{opacity:0}img[data-image-state="ready"]{transition:opacity .18s ease}@media(prefers-reduced-motion:reduce){img[data-image-state="ready"]{transition:none}}';
  document.head.appendChild(style);

  function bounded(task, milliseconds){
    return new Promise(function(resolve){
      var timer = setTimeout(function(){ resolve({timedOut:true}); }, milliseconds);
      Promise.resolve(task).then(function(value){ clearTimeout(timer); resolve(value); }, function(){ clearTimeout(timer); resolve({failed:true}); });
    });
  }
  function visible(node, margin){
    if(node.closest('[hidden], [aria-hidden="true"]')) return false;
    var rect = node.getBoundingClientRect();
    margin = margin || 0;
    // Markdown images may have no intrinsic size before their first response.
    var hasBox = (rect.width > 0 && rect.height > 0) || (node.tagName === 'IMG' && node.getClientRects().length > 0);
    return hasBox && rect.bottom >= -margin && rect.right >= -margin && rect.top < innerHeight + margin && rect.left < innerWidth + margin;
  }
  function imageSource(img){
    // currentSrc can still describe the previous bitmap just after assigning src.
    var source = img.getAttribute('src') || img.currentSrc;
    return source ? source + '|' + (img.getAttribute('srcset') || '') + '|' + (img.getAttribute('sizes') || '') : '';
  }
  function imageReady(img){
    var source = imageSource(img);
    if(!source) return Promise.resolve();
    var previous = pendingImages.get(img);
    if(previous && previous.source === source) return previous.promise;
    img.setAttribute('data-image-state', 'pending');
    img.loading = 'eager';
    img.decoding = 'async';
    var task = new Promise(function(resolve){
      var settled = false;
      var decoding = false;
      function finish(ok){
        if(settled) return;
        settled = true;
        clearTimeout(timer);
        img.removeEventListener('load', loaded);
        img.removeEventListener('error', failed);
        if(imageSource(img) !== source){
          pendingImages.delete(img);
          resolve(imageReady(img));
          return;
        }
        img.setAttribute('data-image-state', ok ? 'ready' : 'error');
        resolve({failed:!ok});
      }
      function failed(){ finish(false); }
      function loaded(){
        if(decoding || settled) return;
        decoding = true;
        if(img.decode) img.decode().then(function(){ finish(true); }, function(){ finish(img.naturalWidth > 0); });
        else finish(img.naturalWidth > 0);
      }
      var timer = setTimeout(function(){
        finish(false);
        // Settle the navigation promise without permanently hiding a very late response.
        img.addEventListener('load', function recover(){
          pendingImages.delete(img);
          imageReady(img);
        }, {once:true});
      }, 30000);
      img.addEventListener('load', loaded);
      img.addEventListener('error', failed);
      if(img.complete) { if(img.naturalWidth > 0) loaded(); else failed(); }
    });
    pendingImages.set(img, {source:source, promise:task});
    return task;
  }
  function warm(url){
    try{ url = new URL(url, location.href).href; }catch(e){ return Promise.resolve(); }
    if(backgrounds.has(url)) return backgrounds.get(url);
    var img = new Image();
    img.src = url;
    var task = imageReady(img).then(function(result){
      // The browser retains the bytes; don't retain decoded bitmaps indefinitely.
      if(result && result.failed) backgrounds.delete(url);
      return result;
    });
    backgrounds.set(url, task);
    if(backgrounds.size > 96) backgrounds.delete(backgrounds.keys().next().value);
    return task;
  }
  function cssURLs(value){
    var urls = [];
    String(value || '').replace(/url\((['"]?)(.*?)\1\)/g, function(_, quote, url){ urls.push(url); return _; });
    return urls;
  }
  function loadBackground(node){
    var url = node.getAttribute('data-bg');
    if(!url || node.dataset.bgLoaded === '1') return Promise.resolve();
    return warm(url).then(function(result){
      if(node.getAttribute('data-bg') !== url || (result && result.failed)) return;
      node.style.backgroundImage = 'url(' + JSON.stringify(url) + ')';
      node.dataset.bgLoaded = '1';
      node.classList.add('lazy-bg-loaded');
    });
  }
  function observe(scope){
    if(observer) observer.disconnect();
    if('IntersectionObserver' in window){
      observer = new IntersectionObserver(function(entries){
        entries.forEach(function(entry){
          if(!entry.isIntersecting) return;
          observer.unobserve(entry.target);
          if(entry.target.tagName === 'IMG') imageReady(entry.target);
          else loadBackground(entry.target);
        });
      }, {rootMargin:POLICY.nearbyMargin + 'px'});
    }
    (scope || document).querySelectorAll('img[src], .lazy-bg[data-bg]').forEach(function(node){
      if(node.tagName === 'IMG' && node.closest('[aria-hidden="true"], [hidden]')) return;
      if(observer) observer.observe(node);
      else if(node.tagName === 'IMG') imageReady(node);
      else loadBackground(node);
    });
  }
  async function prepare(scope, options){
    scope = scope || document;
    options = options || {};
    var started = performance.now();
    // Geometry must reflect initialized modules, including the selected memory month.
    if(options.modules !== false && window.SonglinePageModules && window.SonglinePageModules.ready){
      await bounded(window.SonglinePageModules.ready(scope), POLICY.moduleBudget);
    }
    // Scene initializers schedule geometry in animation frames, not image load events.
    await bounded(new Promise(function(resolve){ requestAnimationFrame(function(){ requestAnimationFrame(resolve); }); }), 150);
    var tasks = [], urls = new Set();
    // Batch geometry reads before any image/attribute writes.
    var images = Array.from(scope.querySelectorAll('img[src]')).filter(function(img){ return visible(img); });
    var lazyScenes = Array.from(scope.querySelectorAll('.lazy-bg[data-bg]')).filter(function(node){ return visible(node); });
    // Backgrounds defined in CSS and pseudo elements are part of the scene too.
    var nodes = [document.body];
    document.querySelectorAll('.site-bg-layer, .admin-site-bg-layer').forEach(function(node){ nodes.push(node); });
    scope.querySelectorAll('main, section, [style], [class*="background"], [class*="scene"], [class*="stage"]').forEach(function(node){ if(visible(node)) nodes.push(node); });
    nodes.forEach(function(node){
      [null, '::before', '::after'].forEach(function(pseudo){
        var computed = getComputedStyle(node, pseudo);
        if(computed.display !== 'none') cssURLs(computed.backgroundImage).forEach(function(url){ urls.add(url); });
      });
    });
    images.forEach(function(img){ tasks.push(imageReady(img)); });
    lazyScenes.forEach(function(node){ tasks.push(loadBackground(node)); });
    urls.forEach(function(url){ tasks.push(warm(url)); });
    if(document.fonts) tasks.push(bounded(document.fonts.ready, 1800));
    var completed = 0;
    tasks = tasks.map(function(task){ return Promise.resolve(task).then(function(value){ completed++; return value; }); });
    var outcome = await bounded(Promise.all(tasks), options.timeout === undefined ? POLICY.revealBudget : options.timeout);
    observe(scope);
    var report = {duration:Math.round(performance.now() - started), resources:tasks.length, pending:tasks.length - completed, timedOut:!!(outcome && outcome.timedOut)};
    window.SonglineResources.lastReport = report;
    window.dispatchEvent(new CustomEvent('songline:resources-ready', {detail:report}));
    return report;
  }
  window.SonglineResources = {prepare:prepare, image:imageReady, warm:warm, observe:observe, bounded:bounded, policy:POLICY};
  function initialize(){ observe(document); }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, {once:true});
  else initialize();
  window.addEventListener('pagehide', function(){ if(observer) observer.disconnect(); });
  window.addEventListener('pageshow', function(event){ if(event.persisted) observe(document); });
})();
