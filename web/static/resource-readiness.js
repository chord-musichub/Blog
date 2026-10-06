/* One readiness contract for boot, page swaps and document handoffs. */
(function(){
  'use strict';
  var pendingImages = new WeakMap();
  var activeImages = new Set();
  var backgrounds = new Map();
  var decodedBackgrounds = new Set();
  var backgroundNodes = new WeakMap();
  var observer = null;
  var observed = new Set();
  var generation = 0;
  var sceneSequence = 0;
  var entryTask = null;
  var sceneStatus = null;
  var POLICY = Object.freeze({ revealBudget:1200, sceneBudget:8000, moduleBudget:8000, nearbyMargin:320 });
  var style = document.createElement('style');
  style.textContent = 'img[data-image-state="pending"],img[data-image-state="error"]{opacity:0}img[data-image-state="ready"]{transition:opacity .18s ease}@media(prefers-reduced-motion:reduce){img[data-image-state="ready"]{transition:none}}';
  style.textContent += '.songline-scene-status{position:fixed;z-index:10050;top:calc(88px + env(safe-area-inset-top,0px));right:16px;display:flex;align-items:center;gap:10px;max-width:calc(100vw - 32px);padding:9px 12px;border:1px solid rgba(221,235,255,.22);border-radius:8px;background:rgba(9,20,37,.9);color:#edf3ff;font:12px/1.4 system-ui,sans-serif;box-shadow:0 4px 18px rgba(0,0,0,.15)}.songline-scene-status[hidden],.songline-scene-status button[hidden],html.is-scene-preparing .songline-scene-status,html.is-booting .songline-scene-status,html.songline-page-transitioning .songline-scene-status{display:none}.songline-scene-status button{border:0;border-radius:4px;background:rgba(184,211,255,.15);color:inherit;padding:3px 8px;font:inherit;cursor:pointer}.songline-scene-status button:hover,.songline-scene-status button:focus-visible{background:rgba(184,211,255,.28)}';
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
    var source = img.getAttribute('src') || img.getAttribute('data-image-src') || img.currentSrc;
    return source ? source + '|' + (img.getAttribute('srcset') || '') + '|' + (img.getAttribute('sizes') || '') : '';
  }
  function imageReady(img, options){
    options = options || {};
    var source = imageSource(img);
    if(!source) return Promise.resolve();
    var previous = pendingImages.get(img);
    var retry = previous && previous.source === source && options.retry && previous.failed && !previous.timedOut && previous.retries < 1;
    if(previous && previous.source === source && !retry) return previous.ready ? Promise.resolve({failed:false}) : previous.promise;
    if(previous) previous.cancel();
    var entry = {source:source, img:img, background:!!options.background, retries:retry ? previous.retries + 1 : 0, failed:false, timedOut:false};
    pendingImages.set(img, entry);
    img.setAttribute('data-image-state', 'pending');
    if(img.loading !== 'eager') img.loading = 'eager';
    if(img.decoding !== 'async') img.decoding = 'async';
    var task = new Promise(function(resolve){
      var settled = false;
      var closed = false;
      var decoding = false;
      function settle(value){
        if(settled) return;
        settled = true;
        resolve(value);
      }
      function cleanup(){
        closed = true;
        clearTimeout(timer);
        img.removeEventListener('load', loaded);
        img.removeEventListener('error', failed);
        activeImages.delete(entry);
      }
      entry.cancel = function(){
        cleanup();
        if(pendingImages.get(img) === entry) pendingImages.delete(img);
        settle({failed:true, cancelled:true});
      };
      function finish(ok){
        if(closed || pendingImages.get(img) !== entry) return;
        if(imageSource(img) !== source){
          cleanup();
          pendingImages.delete(img);
          settle(imageReady(img));
          return;
        }
        cleanup();
        entry.ready = ok;
        entry.failed = !ok;
        entry.timedOut = false;
        img.setAttribute('data-image-state', ok ? 'ready' : 'error');
        settle({failed:!ok});
        if(ok) img.dispatchEvent(new Event('songline:image-ready'));
      }
      function failed(){
        // Tool favicons can name a direct-site alternative. Never add a retry
        // loop or switch sources after a timeout while the original is loading.
        var fallback = img.getAttribute('data-image-fallback');
        if(!closed && pendingImages.get(img) === entry && imageSource(img) === source && fallback && img.getAttribute('src') !== fallback){
          cleanup();
          pendingImages.delete(img);
          img.src = fallback;
          settle(imageReady(img, {freshSource:true}));
          return;
        }
        finish(false);
      }
      function loaded(){
        if(decoding || closed) return;
        if(imageSource(img) !== source){ finish(false); return; }
        decoding = true;
        if(img.decode) img.decode().then(function(){ finish(true); }, function(){ finish(img.naturalWidth > 0); });
        else finish(img.naturalWidth > 0);
      }
      var timer = setTimeout(function(){
        if(closed || pendingImages.get(img) !== entry) return;
        if(imageSource(img) !== source){ finish(false); return; }
        entry.failed = true;
        entry.timedOut = true;
        img.setAttribute('data-image-state', 'error');
        // Keep the same listeners for a late response. A timeout settles the
        // reveal budget, not the network request or its eventual recovery.
        settle({failed:true, timedOut:true});
      }, 30000);
      activeImages.add(entry);
      img.addEventListener('load', loaded);
      img.addEventListener('error', failed);
      if(!img.getAttribute('src') && img.getAttribute('data-image-src')) img.src = img.getAttribute('data-image-src');
      else if(retry) img.src = img.getAttribute('src');
      // Immediately after replacing a failed src, complete can still describe
      // the old request. Wait for the new request's own load/error event.
      if(!options.freshSource && img.complete) { if(img.naturalWidth > 0) loaded(); else failed(); }
    });
    entry.promise = task;
    return task;
  }
  function cacheBackground(url, task){
    backgrounds.set(url, task);
    if(backgrounds.size > 96){
      var oldest = backgrounds.keys().next().value;
      backgrounds.delete(oldest);
      decodedBackgrounds.delete(oldest);
    }
  }
  function applyBackground(node, url){
    if(!node.isConnected || node.getAttribute('data-bg') !== url) return;
    node.style.backgroundImage = 'url(' + JSON.stringify(url) + ')';
    node.dataset.bgLoaded = '1';
    node.classList.add('lazy-bg-loaded');
  }
  function warm(url, priority){
    try{ url = new URL(url, location.href).href; }catch(e){ return Promise.resolve({failed:true}); }
    if(backgrounds.has(url)) return backgrounds.get(url);
    var img = new Image();
    img.fetchPriority = priority || 'auto';
    function ready(){
      decodedBackgrounds.add(url);
      cacheBackground(url, Promise.resolve({failed:false}));
      // A very late warm-up must also reveal backgrounds whose original wait
      // already timed out. Only touch connected nodes that requested this URL.
      document.querySelectorAll('.lazy-bg[data-bg]').forEach(function(node){
        var state = backgroundNodes.get(node);
        try{ if(state && new URL(state.url, location.href).href === url) applyBackground(node, state.url); }catch(error){}
      });
      // A warm image may decode even after its 30s observation timeout settled.
      // Its old promise cannot resolve twice, so recover the current scene's
      // status from the successfully decoded cache, never from an old scene.
      var state = document.documentElement.dataset.sceneState;
      if(state === 'pending' || state === 'error'){
        var urls = Array.from(sceneURLs());
        if(urls.length && urls.every(function(source){ try{ return decodedBackgrounds.has(new URL(source, location.href).href); }catch(error){ return false; } })) setSceneState('ready');
      }
    }
    img.addEventListener('songline:image-ready', ready, {once:true});
    img.src = url;
    var task = imageReady(img, {background:true}).then(function(result){
      // The browser retains the bytes; don't retain decoded bitmaps indefinitely.
      if(result && result.failed){
        if(backgrounds.get(url) === task) backgrounds.delete(url);
        if(!result.timedOut) img.removeEventListener('songline:image-ready', ready);
      }
      return result;
    });
    cacheBackground(url, task);
    return task;
  }
  function cssURLs(value){
    var urls = [];
    String(value || '').replace(/url\((['"]?)(.*?)\1\)/g, function(_, quote, url){ urls.push(url); return _; });
    return urls;
  }
  function preloadScene(doc, theme){
    doc = doc || document;
    var manifest = doc.getElementById('songline-scene-resources');
    if(!manifest) return;
    try{
      var data = JSON.parse(manifest.textContent);
      if(data.forceDark) theme = 'dark';
      else if(!theme){
        if(doc === document) theme = document.documentElement.getAttribute('data-theme');
        else try{ theme = localStorage.getItem('songline-theme'); }catch(error){}
      }
      (data[theme || 'dark'] || []).forEach(function(url){ warm(url, 'high'); });
    }catch(error){}
  }
  function backgroundURLs(node, urls){
    // A pseudo-element on display:none can still report its old image URL.
    // Do not download the hidden global background underneath the tools scene.
    var elementStyle = getComputedStyle(node);
    if(elementStyle.display === 'none') return;
    cssURLs(elementStyle.backgroundImage).forEach(function(url){ urls.add(url); });
    ['::before', '::after'].forEach(function(pseudo){
      var computed = getComputedStyle(node, pseudo);
      if(computed.display === 'none' || computed.content === 'none' || computed.content === 'normal') return;
      cssURLs(computed.backgroundImage).forEach(function(url){ urls.add(url); });
    });
  }
  function sceneURLs(){
    var urls = new Set();
    [document.documentElement, document.body].forEach(function(node){ if(node) backgroundURLs(node, urls); });
    document.querySelectorAll('.site-bg-layer, .admin-site-bg-layer').forEach(function(node){
      var rect = node.getBoundingClientRect();
      if(rect.width > 0 && rect.height > 0) backgroundURLs(node, urls);
    });
    return urls;
  }
  function paintReady(){
    return bounded(new Promise(function(resolve){ requestAnimationFrame(function(){ requestAnimationFrame(resolve); }); }), 150);
  }
  function setSceneState(state){
    document.documentElement.dataset.sceneState = state;
    if(state === 'ready'){
      if(sceneStatus) sceneStatus.hidden = true;
      return;
    }
    if(!document.body) return;
    if(!sceneStatus){
      sceneStatus = document.createElement('div');
      sceneStatus.className = 'songline-scene-status';
      sceneStatus.setAttribute('role', 'status');
      sceneStatus.innerHTML = '<span></span><button type="button">重试</button>';
      sceneStatus.querySelector('button').addEventListener('click', function(){ waitForScene(); });
      document.body.appendChild(sceneStatus);
    }
    sceneStatus.hidden = false;
    sceneStatus.querySelector('span').textContent = state === 'pending' ? '背景仍在加载…' : '背景暂时无法加载';
    sceneStatus.querySelector('button').hidden = state !== 'error';
  }
  async function waitForScene(options){
    options = options || {};
    var currentGeneration = generation;
    var sequence = ++sceneSequence;
    var urls = options.urls || sceneURLs();
    document.documentElement.dataset.sceneState = 'loading';
    if(sceneStatus && !sceneStatus.hidden) setSceneState('pending');
    var completed = 0, failed = 0;
    var tasks = Array.from(urls).map(function(url){
      return warm(url, 'high').then(function(result){
        completed++;
        if(result && result.failed) failed++;
        return result;
      });
    });
    var all = Promise.all(tasks);
    function report(){ return {sceneResources:tasks.length, scenePending:tasks.length - completed, sceneFailed:failed, sceneReady:completed === tasks.length && !failed}; }
    // A timeout releases the curtain with an explicit pending state, not a
    // false "fully loaded" state. A late decoded scene clears the notice.
    all.then(function(){
      if(currentGeneration !== generation || sequence !== sceneSequence) return;
      setSceneState(failed ? 'error' : 'ready');
    });
    var outcome = await bounded(all, options.timeout === undefined ? POLICY.sceneBudget : options.timeout);
    if(currentGeneration !== generation || sequence !== sceneSequence) return {cancelled:true};
    var result = report();
    result.sceneTimedOut = !!(outcome && outcome.timedOut);
    setSceneState(result.scenePending ? 'pending' : (result.sceneFailed ? 'error' : 'ready'));
    if(result.sceneReady) await paintReady();
    return result;
  }
  function loadBackground(node, retry){
    var url = node.getAttribute('data-bg');
    if(!url) return Promise.resolve();
    var previous = backgroundNodes.get(node);
    if(node.dataset.bgLoaded === '1' && (!previous || previous.url === url)) return Promise.resolve();
    if(previous && previous.url !== url) delete node.dataset.bgLoaded;
    if(previous && previous.url === url && !(retry && previous.failed && !previous.timedOut && previous.retries < 1)) return previous.promise;
    var state = {url:url, retries:previous && previous.url === url ? previous.retries + 1 : 0};
    backgroundNodes.set(node, state);
    state.promise = warm(url).then(function(result){
      state.failed = !!(result && result.failed);
      state.timedOut = !!(result && result.timedOut);
      if(!state.failed) applyBackground(node, url);
    });
    return state.promise;
  }
  function observe(scope){
    // Article hydration may replace a subtree without a whole-page swap.
    // Do not leave removed, far-away images retained by the native observer.
    if(observer) observed.forEach(function(node){ if(!node.isConnected){ observer.unobserve(node); observed.delete(node); } });
    if(!observer && 'IntersectionObserver' in window){
      observer = new IntersectionObserver(function(entries){
        entries.forEach(function(entry){
          if(!entry.isIntersecting) return;
          observer.unobserve(entry.target);
          observed.delete(entry.target);
          if(entry.target.tagName === 'IMG') imageReady(entry.target);
          else loadBackground(entry.target);
        });
      }, {rootMargin:POLICY.nearbyMargin + 'px'});
    }
    (scope || document).querySelectorAll('img[src], img[data-image-src], .lazy-bg[data-bg]').forEach(function(node){
      if(node.tagName === 'IMG' && node.closest('[aria-hidden="true"], [hidden]')) return;
      if(observer){ if(!observed.has(node)){ observer.observe(node); observed.add(node); } }
      else if(node.tagName === 'IMG') imageReady(node);
      else loadBackground(node);
    });
  }
  async function prepare(scope, options){
    scope = scope || document;
    options = options || {};
    var started = performance.now();
    var currentGeneration = generation;
    // Start the selected scene while modules initialize, rather than discovering
    // a multi-megabyte background only after every page module has finished.
    preloadScene(document);
    // Geometry must reflect initialized modules, including the selected memory month.
    if(options.modules !== false && window.SonglinePageModules && window.SonglinePageModules.ready){
      await bounded(window.SonglinePageModules.ready(scope), POLICY.moduleBudget);
    }
    // Scene initializers schedule geometry in animation frames, not image load events.
    await paintReady();
    if(currentGeneration !== generation) return {cancelled:true};
    var tasks = [], urls = new Set();
    var criticalURLs = sceneURLs();
    var sceneTask = waitForScene({urls:criticalURLs, timeout:options.sceneTimeout});
    // Batch geometry reads before any image/attribute writes.
    var images = Array.from(scope.querySelectorAll('img[src], img[data-image-src]')).filter(function(img){ return visible(img); });
    var lazyScenes = Array.from(scope.querySelectorAll('.lazy-bg[data-bg]')).filter(function(node){ return visible(node); });
    // Backgrounds defined in CSS and pseudo elements are part of the scene too.
    var nodes = [];
    scope.querySelectorAll('main, section, [style], [class*="background"], [class*="scene"], [class*="stage"]').forEach(function(node){ if(visible(node)) nodes.push(node); });
    nodes.forEach(function(node){ backgroundURLs(node, urls); });
    images.forEach(function(img){ tasks.push(imageReady(img)); });
    lazyScenes.forEach(function(node){ tasks.push(loadBackground(node)); });
    urls.forEach(function(url){ if(!criticalURLs.has(url)) tasks.push(warm(url)); });
    if(document.fonts) tasks.push(bounded(document.fonts.ready, 1800));
    var completed = 0;
    tasks = tasks.map(function(task){ return Promise.resolve(task).then(function(value){ completed++; return value; }); });
    var outcomes = await Promise.all([sceneTask, bounded(Promise.all(tasks), options.timeout === undefined ? POLICY.revealBudget : options.timeout)]);
    if(currentGeneration !== generation) return {cancelled:true};
    observe(scope);
    var scene = outcomes[0];
    if(scene.cancelled) return {cancelled:true};
    var report = Object.assign({duration:Math.round(performance.now() - started), resources:tasks.length + scene.sceneResources, pending:tasks.length - completed + scene.scenePending, timedOut:!!(scene.sceneTimedOut || (outcomes[1] && outcomes[1].timedOut))}, scene);
    window.SonglineResources.lastReport = report;
    window.dispatchEvent(new CustomEvent('songline:resources-ready', {detail:report}));
    return report;
  }
  function finishEntry(){
    if(window.SonglineFinishSceneEntry){ window.SonglineFinishSceneEntry(); return; }
    clearTimeout(window.__songlineSceneEntryFallback);
    document.documentElement.classList.remove('is-scene-preparing');
    document.documentElement.setAttribute('aria-busy', 'false');
  }
  function enter(){
    if(!entryTask) entryTask = prepare(document).finally(finishEntry);
    return entryTask;
  }
  window.SonglineResources = {prepare:prepare, enter:enter, finishEntry:finishEntry, scene:waitForScene, preloadScene:preloadScene, image:imageReady, warm:warm, observe:observe, bounded:bounded, policy:POLICY};
  function initialize(){ observe(document); }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, {once:true});
  else initialize();
  function release(){
    generation++;
    if(observer) observer.disconnect();
    observed.clear();
    backgroundNodes = new WeakMap();
    activeImages.forEach(function(entry){ if(!entry.background) entry.cancel(); });
  }
  window.addEventListener('songline:page-transition-start', release);
  window.addEventListener('pagehide', release);
  window.addEventListener('pageshow', function(event){ if(event.persisted) observe(document); });
  window.addEventListener('online', function(){
    document.querySelectorAll('img[data-image-state="error"]').forEach(function(img){ if(visible(img, POLICY.nearbyMargin)) imageReady(img, {retry:true}); });
    document.querySelectorAll('.lazy-bg[data-bg]').forEach(function(node){ if(visible(node, POLICY.nearbyMargin)) loadBackground(node, true); });
    if(document.documentElement.dataset.sceneState === 'error') waitForScene();
  });
})();
