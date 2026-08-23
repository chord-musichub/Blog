(function(){
  'use strict';

  var VERSION = '20.21.20';
  var STORAGE_KEY = 'songline_focus_timer_settings';
  var STATS_KEY = 'songline_focus_timer_stats';

  function ready(fn){
    if(document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', fn, {once:true});
    }else{
      fn();
    }
  }

  function clamp(n, min, max){
    n = Number(n);
    if(!Number.isFinite(n)) n = min;
    return Math.max(min, Math.min(max, n));
  }

  function pad2(n){
    return String(n).padStart(2, '0');
  }

  function formatTime(ms, showSeconds){
    var total = Math.max(0, Math.ceil(ms / 1000));
    var h = Math.floor(total / 3600);
    var m = Math.floor((total % 3600) / 60);
    var s = total % 60;

    if(showSeconds){
      if(h > 0) return h + ':' + pad2(m) + ':' + pad2(s);
      return pad2(m) + ':' + pad2(s);
    }

    if(h > 0) return h + ':' + pad2(m);
    return Math.max(1, Math.ceil(total / 60)) + ' 分钟';
  }

  function todayKey(){
    return new Date().toISOString().slice(0,10);
  }

  function loadJson(key, fallback){
    try{
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    }catch(e){
      return fallback;
    }
  }

  function saveJson(key, value){
    try{
      localStorage.setItem(key, JSON.stringify(value));
    }catch(e){}
  }

  ready(function(){
    var root = document.querySelector('[data-focus-timer]');
    if(!root){
      console.warn('[focus-timer] root not found');
      return;
    }

    if(root.dataset.focusTimerReady === '1'){
      console.info('[focus-timer] already initialized');
      return;
    }
    root.dataset.focusTimerReady = '1';

    var els = {
      time: root.querySelector('[data-focus-time]'),
      state: root.querySelector('[data-focus-state]'),
      progress: root.querySelector('[data-focus-progress]'),
      toggle: root.querySelector('[data-focus-toggle]'),
      reset: root.querySelector('[data-focus-reset]'),
      presets: Array.prototype.slice.call(root.querySelectorAll('[data-focus-preset]')),
      minuteInput: root.querySelector('[data-focus-minutes]'),
      sound: root.querySelector('[data-focus-sound]'),
      volume: root.querySelector('[data-focus-volume]'),
      showSeconds: root.querySelector('[data-focus-show-seconds]'),
      overlay: root.querySelector('[data-focus-overlay]'),
      testSound: root.querySelector('[data-focus-test-sound]'),
      finish: root.querySelector('[data-focus-finish]'),
      close: root.querySelector('[data-focus-close]'),
      next: root.querySelector('[data-focus-next]'),
      todayCount: root.querySelector('[data-focus-today-count]'),
      todayMinutes: root.querySelector('[data-focus-today-minutes]'),
      clearToday: root.querySelector('[data-focus-clear-today]')
    };

    var settings = Object.assign({
      durationMinutes: 25,
      soundEnabled: true,
      volume: 0.78,
      showSeconds: true,
      showOverlay: true
    }, loadJson(STORAGE_KEY, {}));

    settings.durationMinutes = clamp(settings.durationMinutes, 1, 1440);

    var state = {
      status: 'idle',
      durationMs: settings.durationMinutes * 60000,
      remainingMs: settings.durationMinutes * 60000,
      targetAt: 0,
      raf: 0,
      finishedOnce: false
    };

    var circumference = 2 * Math.PI * 112;
    if(els.progress){
      els.progress.style.strokeDasharray = String(circumference);
      els.progress.style.strokeDashoffset = '0';
    }

    function saveSettings(){
      saveJson(STORAGE_KEY, settings);
    }

    function syncControls(){
      if(els.minuteInput){
        els.minuteInput.max = '1440';
        els.minuteInput.value = settings.durationMinutes;
      }
      if(els.sound) els.sound.checked = !!settings.soundEnabled;
      if(els.volume) els.volume.value = String(settings.volume);
      if(els.showSeconds) els.showSeconds.checked = !!settings.showSeconds;
      if(els.overlay) els.overlay.checked = !!settings.showOverlay;
    }

    function setStatus(next){
      state.status = next;
      root.classList.toggle('is-running', next === 'running');
      root.classList.toggle('is-paused', next === 'paused');
      root.classList.toggle('is-finished', next === 'finished');

      if(els.toggle){
        els.toggle.textContent = next === 'running' ? '暂停' : '开始';
      }

      if(els.state){
        if(next === 'running') els.state.textContent = '专注中 · 保持轨道';
        else if(next === 'paused') els.state.textContent = '已暂停 · 可以喘口气';
        else if(next === 'finished') els.state.textContent = '完成 · 这段轨道走完了';
        else els.state.textContent = '准备进入轨道';
      }
    }

    function getRemaining(){
      if(state.status === 'running'){
        return Math.max(0, state.targetAt - Date.now());
      }
      return Math.max(0, state.remainingMs);
    }

    function render(){
      var remain = getRemaining();
      var total = Math.max(1, state.durationMs);
      var ratio = Math.max(0, Math.min(1, remain / total));
      var elapsed = 1 - ratio;

      if(els.time){
        var text = formatTime(remain, settings.showSeconds);
        els.time.textContent = text;
        els.time.classList.toggle('is-long-time', text.length >= 7);
        els.time.classList.toggle('is-very-long-time', text.length >= 8);
      }

      if(els.progress){
        els.progress.style.strokeDashoffset = String(circumference * elapsed);
      }

      if(state.status === 'running'){
        if(remain <= 0){
          finish();
          return;
        }
        state.raf = requestAnimationFrame(render);
      }
    }

    function setDuration(minutes){
      minutes = clamp(minutes, 1, 1440);
      settings.durationMinutes = minutes;
      saveSettings();

      if(state.status !== 'running'){
        state.durationMs = minutes * 60000;
        state.remainingMs = state.durationMs;
      }

      if(els.minuteInput) els.minuteInput.value = minutes;
      render();
    }

    function start(){
      var remain = getRemaining();
      if(remain <= 0) remain = state.durationMs || settings.durationMinutes * 60000;

      state.durationMs = settings.durationMinutes * 60000;
      state.remainingMs = remain;
      state.targetAt = Date.now() + remain;
      state.finishedOnce = false;

      if(state.raf) cancelAnimationFrame(state.raf);
      setStatus('running');
      render();
    }

    function pause(){
      state.remainingMs = getRemaining();
      if(state.raf) cancelAnimationFrame(state.raf);
      setStatus('paused');
      render();
    }

    function reset(){
      if(state.raf) cancelAnimationFrame(state.raf);
      state.durationMs = settings.durationMinutes * 60000;
      state.remainingMs = state.durationMs;
      state.targetAt = 0;
      state.finishedOnce = false;
      setStatus('idle');
      if(els.finish) els.finish.hidden = true;
      document.title = document.title.replace(/^✅\s*/, '');
      render();
    }

    function toggle(){
      if(state.status === 'running') pause();
      else start();
    }

    function addStats(){
      var stats = loadJson(STATS_KEY, {});
      var key = todayKey();
      if(!stats[key]) stats[key] = {count:0, minutes:0};
      stats[key].count += 1;
      stats[key].minutes += settings.durationMinutes;
      saveJson(STATS_KEY, stats);
      renderStats();
    }

    function renderStats(){
      var stats = loadJson(STATS_KEY, {});
      var today = stats[todayKey()] || {count:0, minutes:0};
      if(els.todayCount) els.todayCount.textContent = today.count || 0;
      if(els.todayMinutes) els.todayMinutes.textContent = today.minutes || 0;
    }

    function finish(){
      if(state.finishedOnce) return;
      state.finishedOnce = true;
      state.remainingMs = 0;
      if(state.raf) cancelAnimationFrame(state.raf);
      setStatus('finished');
      render();
      addStats();

      if(settings.soundEnabled) playSound();

      if(settings.showOverlay && els.finish){
        els.finish.hidden = false;
      }

      if(!/^✅/.test(document.title)){
        document.title = '✅ ' + document.title;
      }
    }

    var audioCtx = null;
    function playSound(){
      try{
        var AC = window.AudioContext || window.webkitAudioContext;
        if(!AC) return;
        audioCtx = audioCtx || new AC();
        if(audioCtx.state === 'suspended') audioCtx.resume();

        var now = audioCtx.currentTime;
        [660, 880, 1046].forEach(function(freq, i){
          var osc = audioCtx.createOscillator();
          var gain = audioCtx.createGain();
          osc.type = 'sine';
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(0.0001, now + i * 0.18);
          gain.gain.exponentialRampToValueAtTime(Math.max(0.001, settings.volume * 0.24), now + i * 0.18 + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.18 + 0.16);
          osc.connect(gain).connect(audioCtx.destination);
          osc.start(now + i * 0.18);
          osc.stop(now + i * 0.18 + 0.18);
        });
      }catch(err){
        console.warn('[focus-timer] sound failed', err);
      }
    }

    function bindClick(el, fn){
      if(!el) return;
      el.addEventListener('click', function(e){
        e.preventDefault();
        e.stopPropagation();
        fn(e);
      });
    }

    bindClick(els.toggle, toggle);
    bindClick(els.reset, reset);

    els.presets.forEach(function(btn){
      bindClick(btn, function(){
        setDuration(btn.getAttribute('data-focus-preset'));
      });
    });

    if(els.minuteInput){
      els.minuteInput.addEventListener('change', function(){
        setDuration(els.minuteInput.value);
      });
      els.minuteInput.addEventListener('input', function(){
        var v = clamp(els.minuteInput.value, 1, 1440);
        settings.durationMinutes = v;
        saveSettings();
        if(state.status !== 'running'){
          state.durationMs = v * 60000;
          state.remainingMs = state.durationMs;
          render();
        }
      });
    }

    if(els.sound){
      els.sound.addEventListener('change', function(){
        settings.soundEnabled = els.sound.checked;
        saveSettings();
      });
    }

    if(els.volume){
      els.volume.addEventListener('input', function(){
        settings.volume = clamp(els.volume.value, 0, 1);
        saveSettings();
      });
    }

    if(els.showSeconds){
      els.showSeconds.addEventListener('change', function(){
        settings.showSeconds = els.showSeconds.checked;
        saveSettings();
        render();
      });
    }

    if(els.overlay){
      els.overlay.addEventListener('change', function(){
        settings.showOverlay = els.overlay.checked;
        saveSettings();
      });
    }

    bindClick(els.testSound, playSound);
    bindClick(els.close, function(){
      if(els.finish) els.finish.hidden = true;
    });
    bindClick(els.next, function(){
      if(els.finish) els.finish.hidden = true;
      reset();
      start();
    });
    bindClick(els.clearToday, function(){
      var stats = loadJson(STATS_KEY, {});
      stats[todayKey()] = {count:0, minutes:0};
      saveJson(STATS_KEY, stats);
      renderStats();
    });

    document.addEventListener('visibilitychange', function(){
      if(state.status === 'running') render();
    });

    syncControls();
    setDuration(settings.durationMinutes);
    renderStats();
    setStatus('idle');
    render();

    console.info('[focus-timer] robust ready', VERSION);
  });
})();
