(function(){
  'use strict';

  var VERSION = '20.20.6';
  var BEST_KEY = 'songline-reaction-best-v1';
  var SOUND_KEY = 'songline-reaction-sound-enabled-v1';
  var CACHE_KEY = 'songline-reaction-server-top3-cache';
  var PLAYER_KEY = 'songline-reaction-player-id-v1';
  var MIN_WAIT = 1300;
  var MAX_WAIT = 4200;
  var SOUND_MASTER_GAIN = 1.25;


  function getPlayerID(){
    try{
      var id = localStorage.getItem(PLAYER_KEY);
      if(!id){
        var rnd = Math.random().toString(36).slice(2, 10);
        id = 'r-' + Date.now().toString(36) + '-' + rnd;
        localStorage.setItem(PLAYER_KEY, id);
      }
      return id;
    }catch(e){
      return 'r-guest';
    }
  }

  function init(root){
    if(!root || root.dataset.reactionBooted === VERSION) return;
    root.dataset.reactionBooted = VERSION;

    var stage = root.querySelector('[data-reaction-stage]');
    var startBtn = root.querySelector('[data-reaction-start]');
    var currentEl = root.querySelector('[data-reaction-current]');
    var bestEl = root.querySelector('[data-reaction-best]');
    var topScoresEl = root.querySelector('[data-reaction-top-scores]');
    var titleEl = root.querySelector('[data-reaction-title]');
    var textEl = root.querySelector('[data-reaction-text]');
    var kickerEl = root.querySelector('[data-reaction-kicker]');
    var soundToggle = root.querySelector('[data-reaction-sound-toggle]');
    var soundLabel = root.querySelector('[data-reaction-sound-label]');
    var syncBestBtn = root.querySelector('[data-reaction-sync-best]');

    if(!stage) return;

    var state = 'idle';
    var readyAt = 0;
    var timer = 0;
    var lastResult = 0;
    var best = Number(localStorage.getItem(BEST_KEY) || 0) || 0;
    var topScores = [];
    var scoreRecorded = false;
    var audioCtx = null;
    var soundEnabled = localStorage.getItem(SOUND_KEY) !== '0';
    var autoSyncedLocalBest = false;


    function setSyncButtonText(text, delay){
      if(!syncBestBtn) return;
      syncBestBtn.textContent = text;
      if(delay){
        window.setTimeout(function(){ syncBestBtn.textContent = '同步本地最佳'; }, delay);
      }
    }

    function setClass(next){
      stage.classList.remove('is-idle', 'is-waiting', 'is-ready', 'is-too-soon', 'is-result');
      stage.classList.add('is-' + next);
    }

    function setMessage(kicker, title, text){
      if(kickerEl) kickerEl.textContent = kicker;
      if(titleEl) titleEl.textContent = title;
      if(textEl) textEl.textContent = text;
    }

    function renderStats(){
      if(currentEl) currentEl.textContent = lastResult ? (lastResult + ' ms') : '-- ms';
      if(bestEl) bestEl.textContent = best ? (best + ' ms') : '-- ms';
    }

    function updateSoundToggle(){
      if(soundToggle){
        soundToggle.setAttribute('aria-pressed', soundEnabled ? 'true' : 'false');
        soundToggle.classList.toggle('is-muted', !soundEnabled);
      }
      if(soundLabel) soundLabel.textContent = soundEnabled ? '音效开' : '音效关';
    }

    function ensureAudio(){
      if(!soundEnabled) return null;
      var AudioContext = window.AudioContext || window.webkitAudioContext;
      if(!AudioContext) return null;
      if(!audioCtx) audioCtx = new AudioContext();
      if(audioCtx.state === 'suspended') audioCtx.resume().catch(function(){});
      return audioCtx;
    }

    function tone(freq, duration, type, gainValue, delay){
      var ctx = ensureAudio();
      if(!ctx) return;
      var start = ctx.currentTime + (delay || 0);
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      var peak = Math.min(0.7, Math.max(0.0001, (gainValue || 0.12) * SOUND_MASTER_GAIN));

      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(peak, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + Math.max(0.04, duration || 0.12));

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + Math.max(0.04, duration || 0.12) + 0.03);
    }

    function noise(duration, gainValue, delay){
      var ctx = ensureAudio();
      if(!ctx) return;
      var start = ctx.currentTime + (delay || 0);
      var length = Math.max(1, Math.floor(ctx.sampleRate * (duration || 0.08)));
      var buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      var data = buffer.getChannelData(0);
      for(var i = 0; i < length; i++){
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
      }
      var source = ctx.createBufferSource();
      var filter = ctx.createBiquadFilter();
      var gain = ctx.createGain();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(520, start);
      gain.gain.setValueAtTime(Math.min(0.38, (gainValue || 0.12) * SOUND_MASTER_GAIN), start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + (duration || 0.08));
      source.buffer = buffer;
      source.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      source.start(start);
      source.stop(start + (duration || 0.08) + 0.02);
    }

    function play(kind){
      if(!soundEnabled) return;
      if(kind === 'start'){
        tone(360, 0.08, 'triangle', 0.09, 0);
        return;
      }
      if(kind === 'ready'){
        tone(820, 0.12, 'sine', 0.18, 0);
        tone(1040, 0.10, 'triangle', 0.14, 0.08);
        return;
      }
      if(kind === 'hit'){
        tone(620, 0.08, 'sine', 0.17, 0);
        tone(930, 0.09, 'triangle', 0.13, 0.05);
        return;
      }
      if(kind === 'early'){
        noise(0.12, 0.18, 0);
        tone(160, 0.14, 'sawtooth', 0.16, 0);
        return;
      }
      if(kind === 'button'){
        tone(540, 0.055, 'sine', 0.09, 0);
      }
    }

    function endpoints(){
      var list = [
        '/write/api/tools/reaction-scores',
        '/static/api/reaction-scores',
        '/api/tools/reaction-scores',
        '/api/reaction-scores'
      ];
      try{
        var apiBase = String((window.BlogRuntimeConfig || {}).publicApiUrl || '').replace(/\/+$/, '');
        if(apiBase) list.push(apiBase + '/api/tools/reaction-scores');
      }catch(e){}
      return Array.from(new Set(list));
    }

    function normalizeScores(raw){
      if(!Array.isArray(raw)) return [];
      return raw.map(function(item){
        if(typeof item === 'number') return {score:item, created_at:''};
        return item || {};
      }).map(function(item){
        return {
          score:Number(item.score || 0),
          created_at:item.created_at || '',
          display_name:item.display_name || item.username || item.player_id || ''
        };
      }).filter(function(item){
        return Number.isFinite(item.score) && item.score >= 1 && item.score <= 5000;
      }).sort(function(a, b){
        if(a.score === b.score) return String(a.created_at).localeCompare(String(b.created_at));
        return a.score - b.score;
      }).slice(0, 3);
    }

    function renderTopScores(){
      if(!topScoresEl) return;
      if(!topScores.length){
        topScoresEl.innerHTML = '<li>暂无记录</li>';
        return;
      }
      topScoresEl.innerHTML = topScores.map(function(item, index){
        return '<li><span>第 ' + (index + 1) + ' 名</span><b>' + item.score + ' ms</b></li>';
      }).join('');
    }

    function loadCache(){
      try{ topScores = normalizeScores(JSON.parse(localStorage.getItem(CACHE_KEY) || '[]')); }
      catch(e){ topScores = []; }
    }

    function saveCache(){
      try{ localStorage.setItem(CACHE_KEY, JSON.stringify(topScores)); }catch(e){}
    }

    function requestScore(url, options){
      var absolute = /^https?:\/\//i.test(url);
      var baseOptions = absolute ? {mode:'cors', credentials:'omit'} : {credentials:'same-origin'};
      return fetch(url, Object.assign(baseOptions, options || {})).then(function(res){
        if(!res.ok) throw new Error('bad status ' + res.status + ' @ ' + url);
        return res.json();
      }).then(function(data){
        window.SonglineReactionScoresDebug = {endpoint:url, data:data, time:new Date().toISOString()};
        return data;
      });
    }

    function requestAny(options){
      var list = endpoints();
      var index = 0;
      var lastError = null;
      function next(){
        if(index >= list.length){
          throw lastError || new Error('all reaction score endpoints failed');
        }
        var url = list[index++];
        return requestScore(url, options).catch(function(err){
          lastError = err;
          return next();
        });
      }
      return next();
    }

    function fetchScores(){
      loadCache();
      renderTopScores();
      return requestAny().then(function(data){
        topScores = normalizeScores(data.scores);
        saveCache();
        renderTopScores();
      }).catch(function(){
        renderTopScores();
      });
    }

    function submitScore(ms, reason){
      if(!Number.isFinite(ms) || ms < 1 || ms > 5000) return;
      return requestAny({
        method:'POST',
        headers:{'Content-Type':'application/json'},
        credentials:'same-origin',
        body:JSON.stringify({score:ms, player_id:getPlayerID()})
      }).then(function(data){
        topScores = normalizeScores(data.scores);
        saveCache();
        renderTopScores();
        if(reason === 'local-best') setSyncButtonText('已同步本地最佳', 1500);
      }).catch(function(){
        renderTopScores();
        if(reason === 'local-best') setSyncButtonText('同步失败，重试', 1700);
      });
    }

    function recordScore(ms){
      if(scoreRecorded) return;
      scoreRecorded = true;
      return submitScore(ms, 'result');
    }

    function syncLocalBest(manual){
      var localBest = Number(localStorage.getItem(BEST_KEY) || best || 0) || 0;
      if(!manual && autoSyncedLocalBest) return;
      autoSyncedLocalBest = true;
      if(localBest > 0) return submitScore(localBest, 'local-best');
      if(manual) setSyncButtonText('暂无本地最佳', 1300);
    }

    function resetTimer(){
      if(timer){
        clearTimeout(timer);
        timer = 0;
      }
    }

    function startTest(){
      ensureAudio();
      resetTimer();
      scoreRecorded = false;
      state = 'waiting';
      readyAt = 0;
      setClass('waiting');
      setMessage('等待中', '别急，等颜色变化', '现在点击会算提前。看到绿色后立刻点。');
      play('start');

      var delay = MIN_WAIT + Math.random() * (MAX_WAIT - MIN_WAIT);
      timer = setTimeout(function(){
        state = 'ready';
        readyAt = performance.now();
        setClass('ready');
        setMessage('现在！', '点！', '越快越好。');
        play('ready');
      }, delay);
    }

    function tooSoon(){
      resetTimer();
      state = 'idle';
      setClass('too-soon');
      setMessage('太早了', '提前点击', '这次不计入成绩。点击重新开始。');
      play('early');
    }

    function finish(){
      if(state !== 'ready') return;
      var ms = Math.max(0, Math.round(performance.now() - readyAt));
      state = 'result';
      lastResult = ms;
      if(!best || ms < best){
        best = ms;
        localStorage.setItem(BEST_KEY, String(best));
      }
      renderStats();
      setClass('result');
      setMessage('完成', ms + ' ms', ms < 180 ? '很快欸，这个反应可以。' : (ms < 260 ? '不错，已经挺稳了。' : '还可以继续压一点。'));
      play('hit');
      recordScore(ms);
    }

    function handleStageClick(){
      ensureAudio();
      if(state === 'idle' || state === 'result') return startTest();
      if(state === 'waiting') return tooSoon();
      if(state === 'ready') return finish();
      startTest();
    }

    stage.addEventListener('click', handleStageClick);

    if(startBtn){
      startBtn.addEventListener('click', function(){
        ensureAudio();
        play('button');
        startTest();
        startBtn.blur();
      });
    }

    if(syncBestBtn){
      syncBestBtn.addEventListener('click', function(){
        ensureAudio();
        play('button');
        syncLocalBest(true);
        syncBestBtn.blur();
      });
    }

    if(soundToggle){
      updateSoundToggle();
      soundToggle.addEventListener('click', function(){
        soundEnabled = !soundEnabled;
        localStorage.setItem(SOUND_KEY, soundEnabled ? '1' : '0');
        updateSoundToggle();
        if(soundEnabled){
          ensureAudio();
          play('button');
        }
        soundToggle.blur();
      });
    }

    setClass('idle');
    setMessage('准备测试', '点击开始', '变色前不要点。变色后越快越好。');
    renderStats();
    updateSoundToggle();
    fetchScores().then(function(){ window.setTimeout(function(){ syncLocalBest(false); }, 320); });
  }

  function boot(target){
    var root = target && target.querySelector ? target : document;
    root.querySelectorAll('[data-reaction-test]').forEach(init);
  }

  window.SonglineInitReactionTest = boot;

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){ boot(document); });
  }else{
    boot(document);
  }

  window.addEventListener('pageshow', function(){ boot(document); });
  window.addEventListener('songline:page-swap', function(event){
    var root = event.detail && event.detail.root ? event.detail.root : document;
    window.setTimeout(function(){ boot(root); }, 30);
    window.setTimeout(function(){ boot(document); }, 120);
  });
})();
