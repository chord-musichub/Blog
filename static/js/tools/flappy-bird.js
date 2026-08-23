(function(){
  'use strict';

  var VERSION = '20.20.6';
  var BEST_KEY = 'songline-flappy-best-v1';
  var SOUND_KEY = 'songline-flappy-sound-enabled-v1';
  var CACHE_KEY = 'songline-flappy-server-top3-cache';
  var PLAYER_KEY = 'songline-flappy-player-id-v1';
  var SOUND_MASTER_GAIN = 1.15;

  function init(root){
    if(!root || root.dataset.flappyBooted === VERSION) return;
    root.dataset.flappyBooted = VERSION;

    var canvas = root.querySelector('[data-flappy-canvas]');
    var overlay = root.querySelector('[data-flappy-overlay]');
    var stateEl = root.querySelector('[data-flappy-state]');
    var titleEl = root.querySelector('[data-flappy-title]');
    var textEl = root.querySelector('[data-flappy-text]');
    var scoreEl = root.querySelector('[data-flappy-score]');
    var bestEl = root.querySelector('[data-flappy-best]');
    var startBtn = root.querySelector('[data-flappy-start]');
    var syncBestBtn = root.querySelector('[data-flappy-sync-best]');
    var soundToggle = root.querySelector('[data-flappy-sound-toggle]');
    var soundLabel = root.querySelector('[data-flappy-sound-label]');
    var topScoresEl = root.querySelector('[data-flappy-top-scores]');

    if(!canvas) return;
    var ctx = canvas.getContext('2d');

    var width = 900;
    var height = 520;
    var dpr = 1;
    var running = false;
    var ended = false;
    var raf = 0;
    var lastTime = 0;
    var spawnTimer = 0;
    var score = 0;
    var best = Number(localStorage.getItem(BEST_KEY) || 0) || 0;
    var scoreRecorded = false;
    var topScores = [];
    var audioCtx = null;
    var soundEnabled = localStorage.getItem(SOUND_KEY) !== '0';
    var submittedScores = {};
    var autoSyncedLocalBest = false;
    var spaceHeld = false;

    var bird = {x:160, y:240, vy:0, r:18, rot:0};
    var pipes = [];
    var particles = [];

    var gravity = 1500;
    var flapPower = -470;
    var pipeSpeed = 245;
    var pipeGap = 156;
    var pipeWidth = 76;
    var groundH = 58;


    function getPlayerID(){
      try{
        var id = localStorage.getItem(PLAYER_KEY);
        if(!id){
          id = 'flappy-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
          localStorage.setItem(PLAYER_KEY, id);
        }
        return id;
      }catch(e){ return 'flappy-guest'; }
    }

    function setSyncButtonText(text, delay){
      if(!syncBestBtn) return;
      syncBestBtn.textContent = text;
      if(delay){
        window.setTimeout(function(){ syncBestBtn.textContent = '同步本地最佳'; }, delay);
      }
    }

    function resize(){
      var rect = canvas.getBoundingClientRect();
      width = Math.max(320, Math.floor(rect.width || 900));
      height = Math.max(280, Math.floor(rect.height || 520));
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    }

    function setOverlay(show, state, title, text){
      if(overlay) overlay.hidden = !show;
      if(stateEl) stateEl.textContent = state || '';
      if(titleEl) titleEl.textContent = title || '';
      if(textEl) textEl.textContent = text || '';
    }

    function updateStats(){
      if(scoreEl) scoreEl.textContent = String(score);
      if(bestEl) bestEl.textContent = String(best);
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
      var ac = ensureAudio();
      if(!ac) return;
      var start = ac.currentTime + (delay || 0);
      var osc = ac.createOscillator();
      var gain = ac.createGain();
      var peak = Math.min(0.72, Math.max(0.0001, (gainValue || 0.12) * SOUND_MASTER_GAIN));
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(peak, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + Math.max(0.04, duration || 0.12));
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start(start);
      osc.stop(start + Math.max(0.04, duration || 0.12) + 0.04);
    }

    function noise(duration, gainValue, delay){
      var ac = ensureAudio();
      if(!ac) return;
      var start = ac.currentTime + (delay || 0);
      var len = Math.max(1, Math.floor(ac.sampleRate * (duration || 0.08)));
      var buffer = ac.createBuffer(1, len, ac.sampleRate);
      var data = buffer.getChannelData(0);
      for(var i=0;i<len;i++){
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
      }
      var src = ac.createBufferSource();
      var filter = ac.createBiquadFilter();
      var gain = ac.createGain();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(760, start);
      gain.gain.setValueAtTime(Math.min(0.42, (gainValue || 0.12) * SOUND_MASTER_GAIN), start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + (duration || 0.08));
      src.buffer = buffer;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(ac.destination);
      src.start(start);
      src.stop(start + (duration || 0.08) + 0.03);
    }

    function play(kind){
      if(!soundEnabled) return;
      if(kind === 'flap'){
        tone(520, 0.08, 'triangle', 0.18, 0);
        tone(760, 0.06, 'sine', 0.1, 0.035);
        return;
      }
      if(kind === 'score'){
        tone(660, 0.10, 'sine', 0.2, 0);
        tone(990, 0.12, 'triangle', 0.14, 0.07);
        return;
      }
      if(kind === 'hit'){
        noise(0.13, 0.24, 0);
        tone(140, 0.18, 'sawtooth', 0.20, 0);
        return;
      }
      if(kind === 'start'){
        tone(420, 0.08, 'sine', 0.12, 0);
        tone(620, 0.08, 'triangle', 0.1, 0.07);
        return;
      }
      if(kind === 'button'){
        tone(580, 0.055, 'sine', 0.1, 0);
      }
    }

    function endpoints(){
      var list = [
        '/write/api/tools/flappy-scores',
        '/static/api/flappy-scores',
        '/api/tools/flappy-scores',
        '/api/flappy-scores'
      ];
      try{
        var apiBase = String((window.BlogRuntimeConfig || {}).publicApiUrl || '').replace(/\/+$/, '');
        if(apiBase) list.push(apiBase + '/api/tools/flappy-scores');
      }catch(e){}
      return Array.from(new Set(list));
    }

    function normalizeScores(raw){
      if(!Array.isArray(raw)) return [];
      return raw.map(function(item){
        if(typeof item === 'number') return {score:item, created_at:''};
        return item || {};
      }).map(function(item){
        return {score:Number(item.score || 0), created_at:item.created_at || ''};
      }).filter(function(item){
        return Number.isFinite(item.score) && item.score > 0;
      }).sort(function(a,b){
        if(b.score === a.score) return String(a.created_at).localeCompare(String(b.created_at));
        return b.score - a.score;
      }).slice(0, 3);
    }

    function renderTopScores(){
      if(!topScoresEl) return;
      if(!topScores.length){
        topScoresEl.innerHTML = '<li>暂无记录</li>';
        return;
      }
      topScoresEl.innerHTML = topScores.map(function(item, index){
        return '<li><span>第 ' + (index + 1) + ' 名</span><b>' + item.score + '</b></li>';
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
        window.SonglineFlappyScoresDebug = {endpoint:url, data:data, time:new Date().toISOString()};
        return data;
      });
    }

    function requestAny(options){
      var list = endpoints();
      var index = 0;
      var lastError = null;
      function next(){
        if(index >= list.length){
          throw lastError || new Error('all flappy score endpoints failed');
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

    function recordScore(value, reason){
      var finalScore = Number(value || score || 0);
      if(scoreRecorded && reason !== 'local-best') return;
      if(!Number.isFinite(finalScore) || finalScore <= 0) return;
      var submitKey = String(finalScore) + ':' + (reason || 'score');
      if(submittedScores[submitKey]) return;
      if(reason !== 'local-best') scoreRecorded = true;
      return requestAny({
        method:'POST',
        headers:{'Content-Type':'application/json'},
        credentials:'same-origin',
        body:JSON.stringify({score:finalScore, player_id:getPlayerID()})
      }).then(function(data){
        submittedScores[submitKey] = true;
        topScores = normalizeScores(data.scores);
        saveCache();
        renderTopScores();
        if(reason === 'local-best') setSyncButtonText('已同步本地最佳', 1500);
      }).catch(function(){
        renderTopScores();
        if(reason === 'local-best') setSyncButtonText('同步失败，重试', 1700);
      });
    }

    function syncLocalBest(manual){
      var localBest = Number(localStorage.getItem(BEST_KEY) || best || 0) || 0;
      if(!manual && autoSyncedLocalBest) return;
      autoSyncedLocalBest = true;
      if(localBest > 0) return recordScore(localBest, 'local-best');
      if(manual) setSyncButtonText('暂无本地最佳', 1300);
    }

    function resetGame(){
      bird.x = Math.max(120, width * 0.23);
      bird.y = height * 0.45;
      bird.vy = 0;
      bird.rot = 0;
      pipes = [];
      particles = [];
      spawnTimer = 0;
      score = 0;
      ended = false;
      scoreRecorded = false;
      updateStats();
      setOverlay(false);
      spawnPipe(width + 190);
    }

    function startGame(){
      ensureAudio();
      resetGame();
      running = true;
      lastTime = performance.now();
      play('start');
      if(raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(loop);
    }

    function flap(){
      ensureAudio();
      if(!running || ended){
        startGame();
      }
      bird.vy = flapPower;
      particles.push({x:bird.x - 18, y:bird.y + 8, life:0.35, ttl:0.35, vx:-120, vy:40});
      play('flap');
    }

    function spawnPipe(x){
      var palettes = [
        {a:'#16a34a', b:'#22c55e', c:'#15803d', glow:'rgba(34,197,94,.22)'},
        {a:'#0ea5e9', b:'#38bdf8', c:'#0369a1', glow:'rgba(14,165,233,.22)'},
        {a:'#7c3aed', b:'#a78bfa', c:'#5b21b6', glow:'rgba(124,58,237,.2)'},
        {a:'#ea580c', b:'#fb923c', c:'#9a3412', glow:'rgba(249,115,22,.2)'}
      ];
      var palette = palettes[Math.floor(Math.random() * palettes.length)];
      var localGap = Math.round(pipeGap + (Math.random() * 44 - 18));
      localGap = Math.max(132, Math.min(184, localGap));
      var localWidth = Math.round(pipeWidth + (Math.random() * 34 - 14));
      localWidth = Math.max(62, Math.min(96, localWidth));

      var minTop = 62;
      var maxTop = Math.max(minTop + 40, height - groundH - localGap - 78);
      var topH = minTop + Math.random() * (maxTop - minTop);
      var style = Math.floor(Math.random() * 4);

      pipes.push({
        x:x || width + 80,
        top:topH,
        gap:localGap,
        width:localWidth,
        passed:false,
        palette:palette,
        style:style,
        cap:18 + Math.random() * 12,
        bandOffset:Math.random() * 20,
        seed:Math.random() * 1000
      });
    }

    function endGame(){
      if(ended) return;
      ended = true;
      running = false;
      play('hit');
      if(score > best){
        best = score;
        localStorage.setItem(BEST_KEY, String(best));
      }
      updateStats();
      recordScore(score, 'gameover');
      setOverlay(true, '飞行结束', '得分 ' + score, '点击重新开始，或者按空格再飞一次。');
    }

    function collidePipe(pipe){
      var bx = bird.x;
      var by = bird.y;
      var r = bird.r * 0.82;
      var withinX = bx + r > pipe.x && bx - r < pipe.x + pipe.width;
      if(!withinX) return false;
      if(by - r < pipe.top) return true;
      if(by + r > pipe.top + pipe.gap) return true;
      return false;
    }

    function update(dt){
      bird.vy += gravity * dt;
      bird.y += bird.vy * dt;
      bird.rot = Math.max(-0.45, Math.min(0.9, bird.vy / 620));

      spawnTimer -= dt;
      if(spawnTimer <= 0){
        spawnPipe(width + 80);
        spawnTimer = 1.18 + Math.random() * 0.36;
      }

      pipes.forEach(function(pipe){
        pipe.x -= pipeSpeed * dt;
        if(!pipe.passed && pipe.x + pipe.width < bird.x - bird.r){
          pipe.passed = true;
          score += 1;
          updateStats();
          play('score');
        }
      });
      pipes = pipes.filter(function(pipe){ return pipe.x + pipe.width > -90; });

      particles.forEach(function(p){
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      });
      particles = particles.filter(function(p){ return p.life > 0; });

      if(bird.y - bird.r < 0 || bird.y + bird.r > height - groundH){
        endGame();
        return;
      }

      for(var i=0;i<pipes.length;i++){
        if(collidePipe(pipes[i])){
          endGame();
          return;
        }
      }
    }

    function drawBackground(){
      var sky = ctx.createLinearGradient(0, 0, 0, height);
      sky.addColorStop(0, '#dff7ff');
      sky.addColorStop(0.56, '#eaf7ff');
      sky.addColorStop(1, '#f8fafc');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, width, height);

      ctx.save();
      ctx.globalAlpha = 0.34;
      for(var i=0;i<7;i++){
        var x = (i * 170 + (performance.now() * 0.018)) % (width + 220) - 120;
        var y = 54 + (i % 3) * 52;
        ctx.fillStyle = '#ffffff';
        roundedRect(x, y, 96, 28, 18);
        ctx.fill();
        roundedRect(x + 38, y - 14, 72, 34, 20);
        ctx.fill();
      }
      ctx.restore();

      ctx.fillStyle = 'rgba(15,23,42,.08)';
      ctx.fillRect(0, height - groundH, width, groundH);

      ctx.fillStyle = 'rgba(34,197,94,.36)';
      ctx.fillRect(0, height - groundH, width, 8);
    }

    function roundedRect(x, y, w, h, r){
      r = Math.max(0, Math.min(r || 0, Math.abs(w)/2, Math.abs(h)/2));
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    }

    function drawPipe(pipe){
      var bottomY = pipe.top + pipe.gap;
      var pal = pipe.palette || {a:'#16a34a', b:'#22c55e', c:'#15803d', glow:'rgba(34,197,94,.2)'};
      var grad = ctx.createLinearGradient(pipe.x, 0, pipe.x + pipe.width, 0);
      grad.addColorStop(0, pal.a);
      grad.addColorStop(0.5, pal.b);
      grad.addColorStop(1, pal.c);

      ctx.save();
      ctx.shadowColor = pal.glow || 'rgba(34,197,94,.2)';
      ctx.shadowBlur = pipe.style === 1 ? 16 : 8;

      ctx.fillStyle = grad;
      roundedRect(pipe.x, -12, pipe.width, pipe.top + 12, 14);
      ctx.fill();

      roundedRect(pipe.x, bottomY, pipe.width, height - groundH - bottomY + 12, 14);
      ctx.fill();

      // 管口不再完全一样：宽度、厚度、偏移都有轻微变化。
      var capH = pipe.cap || 24;
      var capPad = pipe.style === 2 ? 14 : 8;
      roundedRect(pipe.x - capPad, pipe.top - capH, pipe.width + capPad * 2, capH, 12);
      ctx.fill();

      roundedRect(pipe.x - capPad, bottomY, pipe.width + capPad * 2, capH, 12);
      ctx.fill();

      ctx.shadowBlur = 0;

      // 装饰：高光线 / 横向箍 / 小铆钉，随机样式。
      ctx.strokeStyle = 'rgba(255,255,255,.42)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      var highlightX = pipe.x + Math.max(12, pipe.width * 0.24);
      ctx.moveTo(highlightX, 0);
      ctx.lineTo(highlightX, Math.max(0, pipe.top - capH - 4));
      ctx.moveTo(highlightX, bottomY + capH + 4);
      ctx.lineTo(highlightX, height - groundH);
      ctx.stroke();

      if(pipe.style === 1 || pipe.style === 3){
        ctx.strokeStyle = 'rgba(15,23,42,.16)';
        ctx.lineWidth = 3;
        var step = 42;
        var off = pipe.bandOffset || 0;
        for(var y = -off; y < pipe.top - capH; y += step){
          ctx.beginPath();
          ctx.moveTo(pipe.x + 5, y);
          ctx.lineTo(pipe.x + pipe.width - 5, y);
          ctx.stroke();
        }
        for(var by = bottomY + capH + off; by < height - groundH; by += step){
          ctx.beginPath();
          ctx.moveTo(pipe.x + 5, by);
          ctx.lineTo(pipe.x + pipe.width - 5, by);
          ctx.stroke();
        }
      }

      if(pipe.style === 2 || pipe.style === 3){
        ctx.fillStyle = 'rgba(255,255,255,.36)';
        var dots = Math.max(2, Math.floor(pipe.width / 24));
        for(var i = 0; i < dots; i++){
          var dx = pipe.x + 16 + i * ((pipe.width - 32) / Math.max(1, dots - 1));
          ctx.beginPath();
          ctx.arc(dx, pipe.top - capH * .52, 3.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(dx, bottomY + capH * .52, 3.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.restore();
    }

    function drawBird(){
      ctx.save();
      ctx.translate(bird.x, bird.y);
      ctx.rotate(bird.rot);

      ctx.fillStyle = 'rgba(15,23,42,.16)';
      ctx.beginPath();
      ctx.ellipse(4, 8, bird.r * 1.18, bird.r * 0.9, 0, 0, Math.PI * 2);
      ctx.fill();

      var body = ctx.createLinearGradient(-bird.r, -bird.r, bird.r, bird.r);
      body.addColorStop(0, '#fde68a');
      body.addColorStop(1, '#f59e0b');
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.ellipse(0, 0, bird.r * 1.08, bird.r * 0.92, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.moveTo(bird.r * 0.88, -3);
      ctx.lineTo(bird.r * 1.5, 2);
      ctx.lineTo(bird.r * 0.88, 8);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(bird.r * 0.34, -bird.r * 0.28, bird.r * 0.28, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(bird.r * 0.42, -bird.r * 0.28, bird.r * 0.1, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255,255,255,.62)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(-bird.r * 0.12, bird.r * 0.08, bird.r * 0.42, -0.8, 1.4);
      ctx.stroke();

      ctx.restore();
    }

    function drawParticles(){
      particles.forEach(function(p){
        var alpha = Math.max(0, p.life / p.ttl);
        ctx.globalAlpha = alpha * 0.55;
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5 * alpha + 1, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      });
    }

    function draw(){
      if(!ctx) return;
      drawBackground();
      pipes.forEach(drawPipe);
      drawParticles();
      drawBird();

      ctx.fillStyle = 'rgba(15,23,42,.78)';
      ctx.font = '900 44px system-ui, -apple-system, Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(score), width / 2, 72);
    }

    function loop(now){
      if(!running) return;
      var dt = Math.min(0.033, (now - lastTime) / 1000 || 0.016);
      lastTime = now;
      update(dt);
      draw();
      if(running){
        raf = requestAnimationFrame(loop);
      }
    }

    function handleAction(event){
      if(event){
        event.preventDefault();
      }
      flap();
    }

    canvas.addEventListener('click', handleAction);
    if(overlay){
      overlay.addEventListener('click', handleAction);
    }

    if(startBtn){
      startBtn.addEventListener('click', function(){
        ensureAudio();
        play('button');
        startGame();
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

    function onKey(event){
      if(event.code !== 'Space' && event.key !== ' ') return;
      if(!document.documentElement.contains(root)){
        window.removeEventListener('keydown', onKey);
        window.removeEventListener('keyup', onKeyUp);
        window.removeEventListener('resize', resize);
        return;
      }
      event.preventDefault();
      if(event.repeat || spaceHeld) return;
      spaceHeld = true;
      flap();
    }

    function onKeyUp(event){
      if(event.code === 'Space' || event.key === ' '){
        spaceHeld = false;
      }
    }

    window.addEventListener('keydown', onKey, {passive:false});
    window.addEventListener('keyup', onKeyUp, {passive:true});
    window.addEventListener('resize', resize, {passive:true});

    setOverlay(true, '准备起飞', '点击开始', '点击屏幕 / 按空格：向上飞一下。');
    updateStats();
    updateSoundToggle();
    resize();
    fetchScores().then(function(){ window.setTimeout(function(){ syncLocalBest(false); }, 320); });
  }

  function boot(target){
    var root = target && target.querySelector ? target : document;
    root.querySelectorAll('[data-flappy-game]').forEach(init);
  }

  window.SonglineInitFlappyBird = boot;

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
