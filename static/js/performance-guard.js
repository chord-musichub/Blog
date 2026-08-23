(function(){
  'use strict';

  var VERSION = '20.20.6';
  var pausedAnimations = [];
  var wasHidden = false;
  var syncTimer = 0;
  var resumeTimer = 0;
  var lastResumeAt = 0;
  var visualClockMs = 0;
  var visualClockLastAt = performance.now();

  var perfProfile = null;

  var idleTasks = Object.create(null);
  var rafTasks = Object.create(null);

  function scheduleIdle(key, fn, timeout){
    key = key || ('idle-' + Math.random());
    if(idleTasks[key]){
      try{ window.clearTimeout(idleTasks[key]); }catch(e){}
    }
    var run = function(){
      idleTasks[key] = 0;
      try{ fn(); }catch(err){ setTimeout(function(){ throw err; }, 0); }
    };
    if(window.requestIdleCallback){
      try{
        idleTasks[key] = window.setTimeout(function(){
          window.requestIdleCallback(run, {timeout: timeout || 260});
        }, 0);
        return idleTasks[key];
      }catch(e){}
    }
    idleTasks[key] = window.setTimeout(run, Math.min(80, timeout || 48));
    return idleTasks[key];
  }

  function scheduleRaf(key, fn){
    key = key || ('raf-' + Math.random());
    if(rafTasks[key]) window.cancelAnimationFrame(rafTasks[key]);
    rafTasks[key] = window.requestAnimationFrame(function(now){
      rafTasks[key] = 0;
      try{ fn(now); }catch(err){ setTimeout(function(){ throw err; }, 0); }
    });
    return rafTasks[key];
  }

  function initOnce(el, key, version, fn){
    if(!el) return null;
    var attr = 'songlineInit' + String(key || 'module').replace(/[^a-zA-Z0-9]+/g, '');
    if(el.dataset && el.dataset[attr] === String(version || VERSION)) return null;
    if(el.dataset) el.dataset[attr] = String(version || VERSION);
    return fn ? fn(el) : el;
  }

  function emitLifecycle(name, detail){
    try{ window.dispatchEvent(new CustomEvent(name, {detail: detail || {}})); }catch(e){}
  }


  function detectPerfProfile(){
    var reduced = false;
    var coarse = false;
    var smallScreen = false;
    try{ reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }catch(e){}
    try{ coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches); }catch(e){}
    try{ smallScreen = Math.min(window.innerWidth || 9999, window.innerHeight || 9999) <= 760; }catch(e){}

    var cores = Number(navigator.hardwareConcurrency || 0);
    var memory = Number(navigator.deviceMemory || 0);
    var dpr = Number(window.devicePixelRatio || 1);
    var saveData = !!(navigator.connection && navigator.connection.saveData);
    var slowNet = false;
    try{
      var type = navigator.connection && navigator.connection.effectiveType;
      slowNet = type === 'slow-2g' || type === '2g';
    }catch(e){}

    var low = reduced || saveData || slowNet || smallScreen || (cores > 0 && cores <= 4) || (memory > 0 && memory <= 4) || (coarse && dpr >= 2.5);
    var mid = !low && ((cores > 0 && cores <= 6) || (memory > 0 && memory <= 6) || dpr >= 2.2);
    var profile = low ? 'low' : mid ? 'mid' : 'high';

    return {
      version: VERSION,
      profile: profile,
      low: profile === 'low',
      mid: profile === 'mid',
      high: profile === 'high',
      reduced: reduced,
      smallScreen: smallScreen,
      coarse: coarse,
      dpr: dpr,
      cores: cores,
      memory: memory,
      saveData: saveData
    };
  }

  function applyPerfProfile(){
    perfProfile = detectPerfProfile();
    var html = document.documentElement;
    html.classList.toggle('songline-low-perf', perfProfile.low);
    html.classList.toggle('songline-mid-perf', perfProfile.mid);
    html.classList.toggle('songline-high-perf', perfProfile.high);
    html.setAttribute('data-songline-perf', perfProfile.profile);
    window.SonglinePerf = perfProfile;
    return perfProfile;
  }


  function updateVisualClock(){
    var now = performance.now();
    if(!document.hidden){
      visualClockMs += Math.max(0, Math.min(50, now - visualClockLastAt));
    }
    visualClockLastAt = now;
    return visualClockMs;
  }

  function resetVisualClockBaseline(){
    visualClockLastAt = performance.now();
  }

  function nowVisualSeconds(){
    return updateVisualClock() / 1000;
  }


  function canUseWaapi(){
    return typeof document.getAnimations === 'function';
  }

  function pauseWaapiAnimations(){
    if(!canUseWaapi()) return;

    pausedAnimations = [];
    try{
      document.getAnimations({subtree:true}).forEach(function(animation){
        if(!animation) return;
        if(animation.playState !== 'running' && animation.playState !== 'pending') return;

        // 只记录被我们暂停的动画，恢复时不影响原本就暂停的动画。
        pausedAnimations.push({
          animation: animation,
          rate: Number(animation.playbackRate || 1) || 1
        });
        try{ animation.pause(); }catch(e){}
      });
    }catch(e){}
  }

  function rampAnimationRate(animation, targetRate){
    if(!animation) return;
    var start = 0.18 * targetRate;
    var startAt = performance.now();
    var duration = 520;
    try{
      if(typeof animation.updatePlaybackRate === 'function') animation.updatePlaybackRate(start);
      else animation.playbackRate = start;
    }catch(e){}

    function step(now){
      var t = Math.max(0, Math.min(1, (now - startAt) / duration));
      var eased = 1 - Math.pow(1 - t, 3);
      var rate = start + (targetRate - start) * eased;
      try{
        if(typeof animation.updatePlaybackRate === 'function') animation.updatePlaybackRate(rate);
        else animation.playbackRate = rate;
      }catch(e){}
      if(t < 1) window.requestAnimationFrame(step);
      else{
        try{
          if(typeof animation.updatePlaybackRate === 'function') animation.updatePlaybackRate(targetRate);
          else animation.playbackRate = targetRate;
        }catch(e){}
      }
    }
    window.requestAnimationFrame(step);
  }

  function resumeWaapiAnimations(){
    if(!pausedAnimations.length) return;

    var list = pausedAnimations.slice();
    pausedAnimations = [];

    list.forEach(function(item){
      var animation = item && item.animation ? item.animation : item;
      var targetRate = item && item.rate ? item.rate : 1;
      if(!animation) return;
      try{
        if(animation.playState === 'paused'){
          rampAnimationRate(animation, targetRate);
          animation.play();
        }
      }catch(e){}
    });
  }


  function notifyAnimationBeforeResume(reason){
    var now = performance.now();
    try{
      window.dispatchEvent(new CustomEvent('songline:animation-before-resume', {
        detail: { reason: reason || 'visible', at: now }
      }));
    }catch(e){}
  }

  function notifyAnimationResume(reason){
    var now = performance.now();
    if(now - lastResumeAt < 180) return;
    lastResumeAt = now;

    var html = document.documentElement;
    html.classList.add('songline-animation-resuming');
    html.setAttribute('data-songline-resume-reason', reason || 'visible');

    window.clearTimeout(resumeTimer);
    resumeTimer = window.setTimeout(function(){
      html.classList.remove('songline-animation-resuming');
      html.removeAttribute('data-songline-resume-reason');
    }, 680);

    try{
      window.dispatchEvent(new CustomEvent('songline:animation-resume', {
        detail: { reason: reason || 'visible', at: now }
      }));
    }catch(e){}
  }

  function setHiddenClass(hidden){
    document.documentElement.classList.toggle('songline-page-hidden', !!hidden);
    document.documentElement.setAttribute('data-songline-page-visible', hidden ? 'hidden' : 'visible');
  }

  function sync(){
    var hidden = !!document.hidden;

    setHiddenClass(hidden);

    if(hidden && !wasHidden){
      pauseWaapiAnimations();
      wasHidden = true;
      return;
    }

    if(!hidden && wasHidden){
      wasHidden = false;
      notifyAnimationBeforeResume('visibility');
      resumeWaapiAnimations();
      notifyAnimationResume('visibility');

      // 页面恢复前先给轨道/漂流带这类动画同步到实时相位，避免先显示旧位置一帧再跳到实时位置。
      // 页面恢复后给页面模块一次轻量扫描，防止浏览器恢复时动画 DOM 已更新但模块没补初始化。
      if(window.SonglinePageModules && typeof window.SonglinePageModules.scan === 'function'){
        window.setTimeout(function(){
          try{ window.SonglinePageModules.scan(document); }catch(e){}
        }, 80);
      }

      if(window.SonglineDesktopFixedNav && typeof window.SonglineDesktopFixedNav.refresh === 'function'){
        window.setTimeout(function(){
          try{ window.SonglineDesktopFixedNav.refresh(); }catch(e){}
        }, 120);
      }
    }
  }

  function scheduleSync(){
    window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(sync, 30);
  }

  applyPerfProfile();

  window.SonglinePerformanceGuard = {
    version: VERSION,
    profile: function(){ return perfProfile || applyPerfProfile(); },
    refreshProfile: applyPerfProfile,
    sync: sync,
    pauseWaapiAnimations: pauseWaapiAnimations,
    resumeWaapiAnimations: resumeWaapiAnimations,
    notifyAnimationResume: notifyAnimationResume,
    notifyAnimationBeforeResume: notifyAnimationBeforeResume,
    visualNow: nowVisualSeconds,
    updateVisualClock: updateVisualClock,
    resetVisualClockBaseline: resetVisualClockBaseline,
    scheduleIdle: scheduleIdle,
    scheduleRaf: scheduleRaf,
    initOnce: initOnce,
    emitLifecycle: emitLifecycle
  };

  window.SonglineRuntime = {
    version: VERSION,
    profile: function(){ return perfProfile || applyPerfProfile(); },
    idle: scheduleIdle,
    raf: scheduleRaf,
    initOnce: initOnce,
    visualNow: nowVisualSeconds,
    resetVisualClockBaseline: resetVisualClockBaseline,
    emit: emitLifecycle
  };

  window.SonglineVisualClock = {
    now: nowVisualSeconds,
    update: updateVisualClock,
    resetBaseline: resetVisualClockBaseline
  };

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', sync);
  }else{
    sync();
  }

  document.addEventListener('visibilitychange', function(){
    resetVisualClockBaseline();
    sync();
  });
  window.addEventListener('pagehide', function(){
    resetVisualClockBaseline();
    sync();
  });
  window.addEventListener('pageshow', function(event){
    resetVisualClockBaseline();
    notifyAnimationBeforeResume(event && event.persisted ? 'pageshow' : 'pageshow-visible');
    sync();
    window.setTimeout(function(){ notifyAnimationResume(event && event.persisted ? 'pageshow' : 'pageshow-visible'); }, 20);
  });
  window.addEventListener('focus', scheduleSync);
  window.addEventListener('blur', scheduleSync);
  window.addEventListener('resize', function(){ window.clearTimeout(syncTimer); syncTimer = window.setTimeout(applyPerfProfile, 220); });
  window.addEventListener('songline:page-swap', function(){
    // AJAX 切页后，新 DOM 在显示前先同步一次动画相位，避免轨道/漂流带显示上一帧位置。
    notifyAnimationBeforeResume('page-swap');
    window.setTimeout(sync, 80);
    window.setTimeout(function(){ notifyAnimationResume('page-swap'); }, 120);
  });
})();
