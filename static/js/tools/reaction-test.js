(function(){
  'use strict';
  var storage = window.SonglineRuntime.storage;

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
      var id = storage.getItem(PLAYER_KEY);
      if(!id){
        var rnd = Math.random().toString(36).slice(2, 10);
        id = 'r-' + Date.now().toString(36) + '-' + rnd;
        storage.setItem(PLAYER_KEY, id);
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

    if(!stage) return;

    var state = 'idle';
    var readyAt = 0;
    var timer = 0;
    var lastResult = 0;
    var best = Number(storage.getItem(BEST_KEY) || 0) || 0;
    var topScores = [];
    var scoreRecorded = false;
    var audioCtx = null;
    var soundEnabled = storage.getItem(SOUND_KEY) !== '0';
    var lastSyncedBest = 0;
    var pendingSubmissions = new Map();
    var requestControllers = new Set();
    var scoreGeneration = 0, syncTimer = 0;
    var scoreEndpoints = endpoints(), preferredEndpoint = '';
    var bindings = [];
    var disposed = false;
    function bind(target, type, handler){
      target.addEventListener(type, handler);
      bindings.push([target, type, handler]);
    }
    function cleanup(event){
      if(event && event.type === 'pagehide' && event.persisted) return;
      if(disposed) return;
      disposed = true;
      resetTimer();
      window.clearTimeout(syncTimer); syncTimer = 0;
      requestControllers.forEach(function(controller){ controller.abort(); });
      requestControllers.clear(); pendingSubmissions.clear();
      bindings.forEach(function(binding){ binding[0].removeEventListener(binding[1], binding[2]); });
      bindings = [];
      if(audioCtx && audioCtx.state !== 'closed') audioCtx.close().catch(function(){});
      delete root.dataset.reactionBooted;
    }
    bind(window, 'songline:page-transition-start', cleanup);
    bind(window, 'pagehide', cleanup);


    function setClass(next){
      stage.classList.remove('is-idle', 'is-waiting', 'is-ready', 'is-too-soon', 'is-result');
      stage.classList.add('is-' + next);
    }

    function setMessage(kicker, title, text){
      if(kickerEl){ kickerEl.textContent = kicker || ''; kickerEl.hidden = !kicker; }
      if(titleEl) titleEl.textContent = title;
      if(textEl){ textEl.textContent = text || ''; textEl.hidden = !text; }
    }

    function renderStats(){
      if(currentEl) currentEl.textContent = lastResult ? (lastResult + ' ms') : '-- ms';
      if(bestEl) bestEl.textContent = best ? (best + ' ms') : '-- ms';
    }

    function updateSoundToggle(){
      if(soundToggle){
        soundToggle.setAttribute('aria-pressed', soundEnabled ? 'true' : 'false');
        soundToggle.setAttribute('title', soundEnabled ? '关闭音效' : '开启音效');
        soundToggle.classList.toggle('is-muted', !soundEnabled);
      }
    }

    function ensureAudio(){
      if(disposed || !soundEnabled) return null;
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
          created_at:item.created_at || ''
        };
      }).filter(function(item){
        return Number.isFinite(item.score) && item.score >= 1 && item.score <= 5000;
      }).sort(function(a, b){
        if(a.score === b.score) return String(a.created_at).localeCompare(String(b.created_at));
        return a.score - b.score;
      }).slice(0, 3);
    }

    function renderTopScores(){
      if(disposed || !topScoresEl) return;
      var markup = topScores.length ? topScores.map(function(item, index){
        return '<li><span>第 ' + (index + 1) + ' 名</span><b>' + item.score + ' ms</b></li>';
      }).join('') : '<li><!--ui-->暂无记录<!--/ui--></li>';
      if(topScoresEl.innerHTML !== markup) topScoresEl.innerHTML = markup;
    }

    function loadCache(){
      try{ topScores = normalizeScores(JSON.parse(storage.getItem(CACHE_KEY) || '[]')); }
      catch(e){ topScores = []; }
    }

    function saveCache(){
      try{ storage.setItem(CACHE_KEY, JSON.stringify(topScores)); }catch(e){}
    }

    function requestScore(url, options){
      if(disposed) return Promise.reject(new Error('reaction test disposed'));
      var absolute = /^https?:\/\//i.test(url);
      var baseOptions = absolute ? {mode:'cors', credentials:'omit'} : {credentials:'same-origin'};
      var controller = typeof AbortController === 'function' ? new AbortController() : null;
      if(controller){ requestControllers.add(controller); baseOptions.signal = controller.signal; }
      return fetch(url, Object.assign(baseOptions, options || {})).then(function(res){
        if(disposed) throw new Error('reaction test disposed');
        if(!res.ok){
          var error = new Error('bad status ' + res.status + ' @ ' + url);
          error.routeMissing = res.status === 404 || res.status === 405;
          throw error;
        }
        return res.json();
      }).then(function(data){
        if(disposed) throw new Error('reaction test disposed');
        if(!data || !Array.isArray(data.scores)) throw new Error('invalid reaction score response');
        preferredEndpoint = url;
        window.SonglineReactionScoresDebug = {endpoint:url, data:data, time:new Date().toISOString()};
        return data;
      }).finally(function(){
        if(controller) requestControllers.delete(controller);
      });
    }

    function requestAny(options){
      var list = preferredEndpoint ? [preferredEndpoint].concat(scoreEndpoints.filter(function(url){ return url !== preferredEndpoint; })) : scoreEndpoints;
      var posting = options && options.method === 'POST';
      var index = 0;
      var lastError = null;
      function next(){
        if(index >= list.length){
          throw lastError || new Error('all reaction score endpoints failed');
        }
        var url = list[index++];
        return requestScore(url, options).catch(function(err){
          // A failed POST may already have been accepted. Only an explicitly
          // missing route permits another endpoint; GET fallback remains safe.
          if(disposed || err.name === 'AbortError' || (posting && !err.routeMissing)) throw err;
          lastError = err;
          return next();
        });
      }
      return next();
    }

    function fetchScores(){
      loadCache();
      renderTopScores();
      var generation = ++scoreGeneration;
      return requestAny().then(function(data){
        if(disposed || generation !== scoreGeneration) return;
        topScores = normalizeScores(data.scores);
        saveCache();
        renderTopScores();
      }).catch(function(){
        renderTopScores();
      });
    }

    function submitScore(ms){
      if(disposed || !Number.isFinite(ms) || ms < 1 || ms > 5000) return;
      if(pendingSubmissions.has(ms)) return pendingSubmissions.get(ms);
      var generation = ++scoreGeneration;
      var pending = requestAny({
        method:'POST',
        headers:{'Content-Type':'application/json'},
        credentials:'same-origin',
        body:JSON.stringify({score:ms, player_id:getPlayerID()})
      }).then(function(data){
        if(disposed) return;
        if(!lastSyncedBest || ms < lastSyncedBest) lastSyncedBest = ms;
        if(generation !== scoreGeneration) return;
        topScores = normalizeScores(data.scores);
        saveCache();
        renderTopScores();
      }).catch(function(){
        renderTopScores();
      }).finally(function(){
        if(pendingSubmissions.get(ms) === pending) pendingSubmissions.delete(ms);
      });
      pendingSubmissions.set(ms, pending);
      return pending;
    }

    function recordScore(ms){
      if(scoreRecorded) return;
      scoreRecorded = true;
      return submitScore(ms);
    }

    function syncLocalBest(){
      var localBest = Number(storage.getItem(BEST_KEY) || best || 0) || 0;
      if(localBest > 0 && (!lastSyncedBest || localBest < lastSyncedBest)) return submitScore(localBest);
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
      setMessage('', '等变绿', '');
      play('start');

      var delay = MIN_WAIT + Math.random() * (MAX_WAIT - MIN_WAIT);
      timer = setTimeout(function(){
        state = 'ready';
        readyAt = performance.now();
        setClass('ready');
        setMessage('', '点击！', '');
        play('ready');
      }, delay);
    }

    function tooSoon(){
      resetTimer();
      state = 'idle';
      setClass('too-soon');
      setMessage('', '点早了', '点击重试');
      play('early');
    }

    function finish(){
      if(state !== 'ready') return;
      var ms = Math.max(0, Math.round(performance.now() - readyAt));
      state = 'result';
      lastResult = ms;
      if(!best || ms < best){
        best = ms;
        storage.setItem(BEST_KEY, String(best));
      }
      renderStats();
      setClass('result');
      setMessage('', ms + ' ms', '点击再测');
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

    bind(stage, 'click', handleStageClick);
    bind(root, 'songline:tool-sync-best', function(){ if(!disposed) syncLocalBest(); });
    bind(root, 'songline:tool-help-change', function(event){
      if(!event.detail.open || disposed || (state !== 'waiting' && state !== 'ready')) return;
      resetTimer();
      state = 'idle';
      readyAt = 0;
      setClass('idle');
      setMessage('', '点击开始', '');
    });

    if(startBtn){
      bind(startBtn, 'click', function(event){
        ensureAudio();
        play('button');
        startTest();
        if(event.detail > 0) startBtn.blur();
      });
    }

    if(soundToggle){
      updateSoundToggle();
      bind(soundToggle, 'click', function(event){
        soundEnabled = !soundEnabled;
        storage.setItem(SOUND_KEY, soundEnabled ? '1' : '0');
        updateSoundToggle();
        if(soundEnabled){
          ensureAudio();
          play('button');
        }
        if(event.detail > 0) soundToggle.blur();
      });
    }

    setClass('idle');
    setMessage('', '点击开始', '');
    renderStats();
    updateSoundToggle();
    fetchScores().then(function(){
      if(disposed || !root.isConnected) return;
      syncTimer = window.setTimeout(function(){ syncTimer = 0; if(!disposed && root.isConnected) syncLocalBest(); }, 320);
    });
  }

  function boot(target){
    var root = target && target.querySelector ? target : document;
    root.querySelectorAll('[data-reaction-test]').forEach(init);
  }

  window.SonglineInitReactionTest = boot;
})();
