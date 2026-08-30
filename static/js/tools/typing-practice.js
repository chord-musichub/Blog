(function(){
  'use strict';

  var VERSION = '20.20.6';
  var SOUND_KEY = 'songline-typing-sound-enabled-v1';
  var PLAYER_KEY = 'songline-typing-player-id-v1';
  var CACHE_PREFIX = 'songline-typing-top3-cache-';
  var BEST_PREFIX = 'songline-typing-best-';
  var SOUND_MASTER_GAIN = 1.05;

  var articles = {
    "english": [
        {
            "id": "en-attention-rhythm",
            "title": "Attention and Rhythm",
            "text": "Typing is not only a race between fingers and keys. It is also a quiet conversation between attention and rhythm. When you slow down just enough to read ahead, your hands begin to move with fewer mistakes. A good typist does not attack the keyboard. A good typist listens to the sentence, keeps a steady pace, and lets accuracy pull speed forward."
        },
        {
            "id": "en-small-tools",
            "title": "Small Tools",
            "text": "Every small tool on this site is a tiny room for practice. Some rooms are playful, some are practical, and some are only meant to help you notice your own habits. In programming, writing, and design, the same rule often appears: make the first version simple, then polish the part that actually feels rough. Progress is rarely dramatic, but it becomes visible when you keep returning to the work."
        },
        {
            "id": "en-personal-site",
            "title": "Personal Site",
            "text": "The internet can feel noisy, but a personal website is a small signal that belongs to you. It does not need to be perfect on the first day. It can grow like a notebook, collecting articles, experiments, games, and little ideas that would otherwise disappear. A site becomes meaningful when it carries the trace of real effort, real curiosity, and real time."
        },
        {
            "id": "en-clear-engineering",
            "title": "Clear Engineering",
            "text": "Good engineering is often the art of reducing confusion. A clear name, a smaller function, a helpful log message, or a careful backup can save hours of panic later. The best systems are not only clever; they are understandable. When something breaks, clarity becomes kindness, and every detail you prepared earlier starts to pay you back."
        },
        {
            "id": "en-build-loop",
            "title": "The Build Loop",
            "text": "A useful project rarely arrives as a complete masterpiece. It starts as a rough loop: build, test, notice, repair, and build again. Each loop teaches you something that planning alone could not reveal. The page becomes smoother, the code becomes cleaner, and the idea becomes easier to explain. That is how a small experiment slowly turns into a real product."
        }
    ],
    "mixed": [
        {
            "id": "mix-ime-debug",
            "title": "输入法 Debug",
            "text": "今天的练习是中文和 English 混合输入。真正难的地方不只是速度，而是输入法切换、标点习惯，以及看到英文单词时不要慌。你可以先保持稳定节奏，遇到 code、server、blog 这样的词再稍微放慢一点。Typing practice 的意义不是立刻变快，而是让手指和注意力慢慢对齐。"
        },
        {
            "id": "mix-personal-universe",
            "title": "个人宇宙",
            "text": "一个个人网站可以像一艘小飞船，里面放文章、工具、小游戏，也放一些还没有完全成型的想法。今天你可能只修了一个 button hover，明天可能加一个 leaderboard，后天又突然想做 typing practice。看起来都是小东西，但它们会慢慢变成属于自己的 universe。"
        },
        {
            "id": "mix-real-project",
            "title": "真实项目",
            "text": "学习编程的时候，bug 并不总是坏事。一个 bug 会逼你看清楚 state、event、API、cache 之间的关系。比如 composition 输入法、keydown repeat、localStorage、server scores，这些词分开看都不难，合在一起就像一个真实项目。真正的成长往往藏在这些细碎的修复里。"
        },
        {
            "id": "mix-keep-building",
            "title": "Keep Building",
            "text": "如果你想长期创作，不必一开始就追求 grand design。先做一个能跑的小版本，再一点点加 polish。文章可以先短，工具可以先简陋，页面可以先不完美。重要的是它在生长。Keep building，keep writing，keep testing，然后让作品自己慢慢说话。"
        },
        {
            "id": "mix-typing-focus",
            "title": "专注练习",
            "text": "打字练习不是为了把每个 key 都敲得很用力，而是为了让眼睛、输入法和手指保持同一个 rhythm。中文输入时要等候选词真正 commit，英文输入时要注意 space 和 punctuation。慢一点没有关系，只要每一轮都比上一轮更 steady，速度自然会回来。"
        }
    ]
};

  function escapeHTML(text){
    return String(text).replace(/[&<>"']/g, function(ch){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];
    });
  }

  function fmt(ms){
    if(!ms) return '--';
    return (ms / 1000).toFixed(2) + 's';
  }

  function getPlayerID(){
    try{
      var id = localStorage.getItem(PLAYER_KEY);
      if(!id){
        id = 't-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
        localStorage.setItem(PLAYER_KEY, id);
      }
      return id;
    }catch(e){ return 'typing-guest'; }
  }

  function init(root){
    if(!root || root.dataset.typingBooted === VERSION) return;
    root.dataset.typingBooted = VERSION;

    var input = root.querySelector('[data-typing-input]');
    var textEl = root.querySelector('[data-typing-text]');
    var titleEl = root.querySelector('[data-typing-article-title]');
    var modeLabel = root.querySelector('[data-typing-mode-label]');
    var rankTitle = root.querySelector('[data-typing-rank-title]');
    var timeEl = root.querySelector('[data-typing-time]');
    var progressEl = root.querySelector('[data-typing-progress]');
    var errorsEl = root.querySelector('[data-typing-errors]');
    var bestEl = root.querySelector('[data-typing-best]');
    var topScoresEl = root.querySelector('[data-typing-top-scores]');
    var modeButtons = root.querySelectorAll('[data-typing-mode]');
    var syncBestBtn = root.querySelector('[data-typing-sync-best]');
    var randomBtn = root.querySelector('[data-typing-random]');
    var restartBtn = root.querySelector('[data-typing-restart]');
    var focusBtn = root.querySelector('[data-typing-focus]');
    var soundToggle = root.querySelector('[data-typing-sound-toggle]');
    var soundLabel = root.querySelector('[data-typing-sound-label]');

    if(!input || !textEl) return;

    var mode = 'english';
    var article = null;
    var startedAt = 0;
    var finished = false;
    var timer = 0;
    var errors = 0;
    var lastValue = '';
    var topScores = [];
    var soundEnabled = localStorage.getItem(SOUND_KEY) !== '0';
    var audioCtx = null;
    var isComposingIME = false;
    var autoSyncedModes = {};


    function setSyncButtonText(text, delay){
      if(!syncBestBtn) return;
      syncBestBtn.textContent = text;
      if(delay){
        window.setTimeout(function(){ syncBestBtn.textContent = '同步本地最佳'; }, delay);
      }
    }

    function ensureAudio(){
      if(!soundEnabled) return null;
      var AC = window.AudioContext || window.webkitAudioContext;
      if(!AC) return null;
      if(!audioCtx) audioCtx = new AC();
      if(audioCtx.state === 'suspended') audioCtx.resume().catch(function(){});
      return audioCtx;
    }

    function tone(freq, duration, type, gainValue, delay){
      var ac = ensureAudio();
      if(!ac) return;
      var start = ac.currentTime + (delay || 0);
      var osc = ac.createOscillator();
      var gain = ac.createGain();
      var peak = Math.min(0.48, Math.max(0.0001, (gainValue || 0.08) * SOUND_MASTER_GAIN));
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(peak, start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + Math.max(0.035, duration || 0.07));
      osc.connect(gain); gain.connect(ac.destination);
      osc.start(start); osc.stop(start + Math.max(0.04, duration || 0.07) + 0.02);
    }

    function play(kind){
      if(!soundEnabled) return;
      if(kind === 'key') return tone(620, 0.035, 'triangle', 0.035, 0);
      if(kind === 'wrong') return tone(160, 0.08, 'sawtooth', 0.09, 0);
      if(kind === 'done'){
        tone(523.25, 0.10, 'sine', 0.12, 0);
        tone(659.25, 0.10, 'sine', 0.12, 0.1);
        tone(783.99, 0.16, 'triangle', 0.14, 0.2);
        return;
      }
      if(kind === 'button') return tone(540, 0.055, 'sine', 0.07, 0);
    }

    function updateSoundToggle(){
      if(soundToggle){
        soundToggle.setAttribute('aria-pressed', soundEnabled ? 'true' : 'false');
        soundToggle.classList.toggle('is-muted', !soundEnabled);
      }
      if(soundLabel) soundLabel.textContent = soundEnabled ? '音效开' : '音效关';
    }

    function chooseArticle(){
      var list = articles[mode] || articles.english;
      var next = list[Math.floor(Math.random() * list.length)];
      if(article && list.length > 1){
        var guard = 0;
        while(next.id === article.id && guard++ < 6){
          next = list[Math.floor(Math.random() * list.length)];
        }
      }
      article = next;
    }

    function bestKey(){ return BEST_PREFIX + mode; }
    function cacheKey(){ return CACHE_PREFIX + mode; }
    function modeName(){ return mode === 'mixed' ? '中文/中英混打' : '英文'; }

    function renderArticle(){
      if(titleEl) titleEl.textContent = article.title;
      if(modeLabel) modeLabel.textContent = modeName();
      if(rankTitle) rankTitle.textContent = modeName() + '前三名';
      var value = input.value || '';
      var html = '';
      for(var i = 0; i < article.text.length; i++){
        var ch = article.text[i];
        var cls = '';
        if(i < value.length){
          cls = value[i] === ch ? 'is-correct' : 'is-wrong';
        }else if(i === value.length){
          cls = 'is-current';
        }
        html += '<span class="' + cls + '">' + (ch === ' ' ? '&nbsp;' : escapeHTML(ch)) + '</span>';
      }
      textEl.innerHTML = html;
    }

    function calcErrors(value){
      var count = 0;
      for(var i = 0; i < Math.min(value.length, article.text.length); i++){
        if(value[i] !== article.text[i]) count++;
      }
      if(value.length > article.text.length) count += value.length - article.text.length;
      return count;
    }

    function renderStats(){
      var now = startedAt && !finished ? performance.now() - startedAt : 0;
      if(finished && input.dataset.finalTime) now = Number(input.dataset.finalTime || 0);
      if(timeEl) timeEl.textContent = startedAt ? fmt(now) : '0.00s';
      var pct = Math.min(100, Math.round((input.value.length / article.text.length) * 100));
      if(progressEl) progressEl.textContent = pct + '%';
      if(errorsEl) errorsEl.textContent = String(errors);
      var best = Number(localStorage.getItem(bestKey()) || 0) || 0;
      if(bestEl) bestEl.textContent = best ? fmt(best) : '--';
    }

    function startTimer(){
      if(startedAt) return;
      startedAt = performance.now();
      timer = window.setInterval(renderStats, 80);
    }

    function stopTimer(){
      if(timer){ clearInterval(timer); timer = 0; }
    }

    function endpoints(){
      var q = '?mode=' + encodeURIComponent(mode);
      var list = [
        '/write/api/tools/typing-scores' + q,
        '/static/api/typing-scores' + q,
        '/api/tools/typing-scores' + q,
        '/api/typing-scores' + q
      ];
      try{
        var apiBase = String((window.BlogRuntimeConfig || {}).publicApiUrl || '').replace(/\/+$/, '');
        if(apiBase) list.push(apiBase + '/api/tools/typing-scores' + q);
      }catch(e){}
      return Array.from(new Set(list));
    }

    function normalizeScores(raw){
      if(!Array.isArray(raw)) return [];
      return raw.map(function(item){ return typeof item === 'number' ? {score:item} : (item || {}); })
        .map(function(item){ return {score:Number(item.score || 0), created_at:item.created_at || ''}; })
        .filter(function(item){ return Number.isFinite(item.score) && item.score > 0; })
        .sort(function(a,b){ return a.score === b.score ? String(a.created_at).localeCompare(String(b.created_at)) : a.score - b.score; })
        .slice(0, 3);
    }

    function renderTopScores(){
      if(!topScoresEl) return;
      if(!topScores.length){ topScoresEl.innerHTML = '<li>暂无记录</li>'; return; }
      topScoresEl.innerHTML = topScores.map(function(item, index){
        return '<li><span>第 ' + (index + 1) + ' 名</span><b>' + fmt(item.score) + '</b></li>';
      }).join('');
    }

    function requestScore(url, options){
      var absolute = /^https?:\/\//i.test(url);
      var baseOptions = absolute ? {mode:'cors', credentials:'omit'} : {credentials:'same-origin'};
      return fetch(url, Object.assign(baseOptions, options || {})).then(function(res){
        if(!res.ok) throw new Error('bad status ' + res.status + ' @ ' + url);
        return res.json();
      }).then(function(data){
        window.SonglineTypingScoresDebug = {endpoint:url, data:data, time:new Date().toISOString()};
        return data;
      });
    }

    function requestAny(options){
      var list = endpoints();
      var index = 0;
      var lastError = null;
      function next(){
        if(index >= list.length) throw lastError || new Error('all typing score endpoints failed');
        var url = list[index++];
        return requestScore(url, options).catch(function(err){ lastError = err; return next(); });
      }
      return next();
    }

    function loadCache(){
      try{ topScores = normalizeScores(JSON.parse(localStorage.getItem(cacheKey()) || '[]')); }
      catch(e){ topScores = []; }
    }
    function saveCache(){ try{ localStorage.setItem(cacheKey(), JSON.stringify(topScores)); }catch(e){} }

    function fetchScores(){
      loadCache(); renderTopScores();
      return requestAny().then(function(data){
        topScores = normalizeScores(data.scores);
        saveCache(); renderTopScores();
      }).catch(function(){ renderTopScores(); });
    }

    function recordScore(ms, reason){
      ms = Math.round(Number(ms || 0));
      if(!Number.isFinite(ms) || ms <= 0) return;
      return requestAny({
        method:'POST',
        headers:{'Content-Type':'application/json'},
        credentials:'same-origin',
        body:JSON.stringify({score:ms, mode:mode, article_id:reason === 'local-best' ? 'local-best' : article.id, player_id:getPlayerID()})
      }).then(function(data){
        topScores = normalizeScores(data.scores);
        saveCache(); renderTopScores();
        if(reason === 'local-best') setSyncButtonText('已同步本地最佳', 1500);
      }).catch(function(){
        renderTopScores();
        if(reason === 'local-best') setSyncButtonText('同步失败，重试', 1700);
      });
    }

    function syncLocalBest(manual){
      var localBest = Number(localStorage.getItem(bestKey()) || 0) || 0;
      if(!manual && autoSyncedModes[mode]) return;
      autoSyncedModes[mode] = true;
      if(localBest > 0) return recordScore(localBest, 'local-best');
      if(manual) setSyncButtonText('暂无本地最佳', 1300);
    }

    function reset(keepArticle){
      stopTimer();
      if(!keepArticle) chooseArticle();
      startedAt = 0;
      finished = false;
      errors = 0;
      lastValue = '';
      input.value = '';
      input.dataset.finalTime = '';
      input.disabled = false;
      renderArticle(); renderStats(); fetchScores().then(function(){ window.setTimeout(function(){ syncLocalBest(false); }, 260); });
    }

    function finishIfDone(){
      if(finished) return;
      var value = input.value;
      if(value.length >= article.text.length && value === article.text){
        finished = true;
        var finalTime = performance.now() - startedAt;
        input.dataset.finalTime = String(finalTime);
        stopTimer();
        input.disabled = true;
        var best = Number(localStorage.getItem(bestKey()) || 0) || 0;
        if(!best || finalTime < best) localStorage.setItem(bestKey(), String(Math.round(finalTime)));
        renderStats(); renderArticle(); play('done'); recordScore(finalTime, 'finish');
      }
    }

    function handleTypingInput(){
      ensureAudio();
      if(finished) return;
      if(isComposingIME) return;
      startTimer();
      var value = input.value;
      var prevErrors = errors;
      errors = calcErrors(value);
      if(value.length > lastValue.length){
        if(errors > prevErrors) play('wrong'); else play('key');
      }
      lastValue = value;
      renderArticle(); renderStats(); finishIfDone();
    }

    function blockTypingTransfer(event){
      event.preventDefault();
      play('wrong');
      return false;
    }

    input.addEventListener('compositionstart', function(){
      isComposingIME = true;
    });

    input.addEventListener('compositionend', function(){
      isComposingIME = false;
      handleTypingInput();
    });

    input.addEventListener('beforeinput', function(event){
      var type = event.inputType || '';
      if(type.indexOf('FromPaste') >= 0 || type.indexOf('FromDrop') >= 0){
        blockTypingTransfer(event);
      }
    });

    input.addEventListener('input', handleTypingInput);

    input.addEventListener('keydown', function(event){
      var key = String(event.key || '').toLowerCase();
      if((event.ctrlKey || event.metaKey) && (key === 'v' || key === 'x' || key === 'c')){
        blockTypingTransfer(event);
      }
    });

    ['paste', 'copy', 'cut', 'drop', 'dragover', 'contextmenu'].forEach(function(type){
      input.addEventListener(type, blockTypingTransfer);
    });

    textEl.addEventListener('copy', blockTypingTransfer);
    textEl.addEventListener('contextmenu', blockTypingTransfer);

    modeButtons.forEach(function(btn){
      btn.addEventListener('click', function(){
        var next = btn.getAttribute('data-typing-mode') || 'english';
        if(next === mode) return;
        mode = next === 'mixed' ? 'mixed' : 'english';
        modeButtons.forEach(function(b){ b.classList.toggle('is-active', (b.getAttribute('data-typing-mode') || '') === mode); });
        play('button'); reset(false); input.focus();
      });
    });

    if(syncBestBtn) syncBestBtn.addEventListener('click', function(){ play('button'); syncLocalBest(true); syncBestBtn.blur(); });
    if(randomBtn) randomBtn.addEventListener('click', function(){ play('button'); reset(false); input.focus(); randomBtn.blur(); });
    if(restartBtn) restartBtn.addEventListener('click', function(){ play('button'); reset(true); input.focus(); restartBtn.blur(); });
    if(focusBtn) focusBtn.addEventListener('click', function(){ ensureAudio(); play('button'); input.focus(); focusBtn.blur(); });
    if(soundToggle){
      updateSoundToggle();
      soundToggle.addEventListener('click', function(){
        soundEnabled = !soundEnabled;
        localStorage.setItem(SOUND_KEY, soundEnabled ? '1' : '0');
        updateSoundToggle();
        if(soundEnabled){ ensureAudio(); play('button'); }
        soundToggle.blur();
      });
    }

    chooseArticle();
    renderArticle(); renderStats(); updateSoundToggle(); fetchScores().then(function(){ window.setTimeout(function(){ syncLocalBest(false); }, 320); });
  }

  function boot(target){
    var root = target && target.querySelector ? target : document;
    root.querySelectorAll('[data-typing-practice]').forEach(init);
  }

  window.SonglineInitTypingPractice = boot;
})();
