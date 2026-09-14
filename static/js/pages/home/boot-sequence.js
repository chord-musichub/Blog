(function(){
  'use strict';

  var CONFIG = Object.freeze({
    minimumDuration:800,
    maximumWait:11000,
    leafCount:12,
    compactLeafCount:8,
    gatherHold:280,
    recedeDelay:100,
    logoDeparture:300,
    revealStart:520,
    revealFinish:1100,
    logoFallback:'/uploads/admin/logo/main_logo.png'
  });
  var root = document.documentElement;
  var active = false;

  function restoreDocumentBackground(){
    root.style.backgroundColor = root.getAttribute('data-theme') === 'dark' ? '#0d1728' : '#fbfaf7';
  }

  function reducedMotion(){
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function clamp(value, min, max){ return Math.max(min, Math.min(max, value)); }
  function easeInOut(value){ return value < .5 ? 2 * value * value : 1 - Math.pow(-2 * value + 2, 2) / 2; }

  function createTracker(){
    var state = {ready:false};
    state.promise = (window.SonglineResources
      ? window.SonglineResources.prepare(document)
      : Promise.resolve()).then(function(){ state.ready = true; });
    state.ratio = function(){ return state.ready ? 1 : .75; };
    return state;
  }

  function createOverlay(count){
    var logo = document.querySelector('.logo-icon');
    var logoSrc = logo && logo.currentSrc ? logo.currentSrc : CONFIG.logoFallback;
    var overlay = document.createElement('div');
    overlay.className = 'site-boot-overlay home-boot-sequence';
    overlay.setAttribute('aria-hidden', 'true');
    var petals = [];
    for(var index = 0; index < count; index++){
      var angle = (360 / count) * index - 90;
      petals.push('<i class="home-boot-petal" data-boot-petal="' + index + '" style="--petal-angle:' + angle + 'deg;--petal-index:' + index + '"></i>');
    }
    overlay.innerHTML = [
      '<div class="home-boot-petal-field">', petals.join(''), '</div>',
      '<i class="home-boot-flare"></i>',
      '<div class="home-boot-core"><img class="home-boot-logo" src="', logoSrc, '" alt=""></div>'
    ].join('');
    document.documentElement.appendChild(overlay);
    return overlay;
  }

  function hydrateHome(){
    try{
      if(window.SonglinePageModules && typeof window.SonglinePageModules.scan === 'function') window.SonglinePageModules.scan(document);
      window.dispatchEvent(new Event('resize'));
    }catch(error){}
  }

  function clear(overlay, bootKey){
    active = false;
    try{ sessionStorage.setItem(bootKey, '1'); }catch(error){}
    root.classList.remove(
      'is-booting', 'is-boot-preparing', 'is-home-boot-revealing', 'is-home-boot-left-scene',
      'is-home-boot-panel-focus', 'is-home-boot-wide', 'boot-frame-settling', 'is-boot-interactive'
    );
    if(overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    restoreDocumentBackground();
    try{ window.dispatchEvent(new Event('resize')); }catch(error){}
  }

  function run(options){
    options = options || {};
    if(active) return;
    if(!options.shouldBoot || reducedMotion()){
      root.classList.remove('is-boot-preparing', 'is-booting');
      return;
    }
    active = true;
    var leafCount = window.matchMedia && window.matchMedia('(max-width:760px)').matches ? CONFIG.compactLeafCount : CONFIG.leafCount;
    var overlay = createOverlay(leafCount);
    var petals = Array.prototype.slice.call(overlay.querySelectorAll('[data-boot-petal]'));
    var tracker = createTracker();
    var start = performance.now();
    var finished = false;
    var lastStage = -1;
    var hardStop = window.setTimeout(function(){ finish(); }, CONFIG.maximumWait);

    root.classList.add('is-booting');
    if(window.__songlineBootPrepFallback) window.clearTimeout(window.__songlineBootPrepFallback);

    function setStage(progress){
      var stage = Math.floor(clamp(progress, 0, 1) * leafCount + .0001);
      if(stage === lastStage) return;
      lastStage = stage;
      petals.forEach(function(petal, index){ petal.classList.toggle('is-gathered', index < stage); });
    }

    function revealHome(){
      root.classList.remove('is-boot-preparing');
      root.classList.add('boot-frame-settling');
      // 黑幕开始退去后立即恢复主题底色，防止边缘露出初始纯黑。
      restoreDocumentBackground();
      hydrateHome();
      overlay.classList.add('is-revealing-home');
    }

    function finish(){
      if(finished) return;
      finished = true;
      window.clearTimeout(hardStop);
      setStage(1);
      overlay.classList.add('is-complete');
      window.setTimeout(function(){ overlay.classList.add('is-receding'); }, CONFIG.recedeDelay);
      window.setTimeout(function(){ overlay.classList.add('is-logo-dissolving'); }, CONFIG.logoDeparture);
      window.setTimeout(revealHome, CONFIG.revealStart);
      window.setTimeout(function(){ clear(overlay, options.bootKey || 'songline-home-boot-v21.4'); }, CONFIG.revealFinish);
    }

    function tick(now){
      if(finished) return;
      var elapsed = now - start;
      var realProgress = tracker.ratio();
      var pacedProgress = .04 + .96 * easeInOut(clamp(elapsed / CONFIG.minimumDuration, 0, 1));
      // 汇聚既不能跑在真实资源之前，也不会因缓存命中而跳过最短观感时长。
      setStage(Math.min(realProgress, pacedProgress));
      if(tracker.ready && elapsed >= CONFIG.minimumDuration) finish();
      else window.requestAnimationFrame(tick);
    }

    tracker.promise.catch(function(){});
    window.requestAnimationFrame(tick);
  }

  window.SonglineHomeBoot = { run:run, config:CONFIG };
})();
