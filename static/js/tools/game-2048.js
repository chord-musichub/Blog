(function(){
  'use strict';

  var VERSION = '20.20.6';
  var SIZE = 4;
  var MAX_TILE_VALUE = 2048;
  var BEST_KEY = 'songline-2048-best-v1';
  var PLAYER_KEY = 'songline-2048-player-id-v1';
  var MOVE_MS = 230;
  var MERGE_MS = 160;
  var tileId = 1;
  var SOUND_MASTER_GAIN = 1.35;

  function emptyGrid(){
    return Array.from({length: SIZE}, function(){ return Array(SIZE).fill(null); });
  }

  function vectorFor(dir){
    if(dir === 'up') return {x:0, y:-1};
    if(dir === 'down') return {x:0, y:1};
    if(dir === 'left') return {x:-1, y:0};
    if(dir === 'right') return {x:1, y:0};
    return {x:0, y:0};
  }

  function traversal(dir){
    var xs = [0, 1, 2, 3];
    var ys = [0, 1, 2, 3];
    if(dir === 'right') xs.reverse();
    if(dir === 'down') ys.reverse();
    return {xs:xs, ys:ys};
  }

  function within(pos){
    return pos.x >= 0 && pos.x < SIZE && pos.y >= 0 && pos.y < SIZE;
  }

  function randomEmptyCell(grid){
    var cells = [];
    for(var y = 0; y < SIZE; y++){
      for(var x = 0; x < SIZE; x++){
        if(!grid[y][x]) cells.push({x:x, y:y});
      }
    }
    if(!cells.length) return null;
    return cells[Math.floor(Math.random() * cells.length)];
  }

  function canMove(grid){
    if(randomEmptyCell(grid)) return true;
    for(var y = 0; y < SIZE; y++){
      for(var x = 0; x < SIZE; x++){
        var tile = grid[y][x];
        if(!tile) continue;
        if(x + 1 < SIZE && grid[y][x + 1] && grid[y][x + 1].value === tile.value && tile.value < MAX_TILE_VALUE) return true;
        if(y + 1 < SIZE && grid[y + 1][x] && grid[y + 1][x].value === tile.value && tile.value < MAX_TILE_VALUE) return true;
      }
    }
    return false;
  }

  function tileClass(value){
    if(!value) return 'is-empty';
    return 'tile-' + Math.max(1, Math.min(13, Math.round(Math.log(value) / Math.log(2))));
  }

  function keyToDir(event){
    var key = event.key;
    if(key === 'ArrowUp' || key === 'w' || key === 'W') return 'up';
    if(key === 'ArrowDown' || key === 's' || key === 'S') return 'down';
    if(key === 'ArrowLeft' || key === 'a' || key === 'A') return 'left';
    if(key === 'ArrowRight' || key === 'd' || key === 'D') return 'right';
    return '';
  }

  function makeTile(value, x, y, flags){
    flags = flags || {};
    return {
      id: tileId++,
      value:value,
      x:x,
      y:y,
      isNew:!!flags.isNew,
      isMerged:!!flags.isMerged
    };
  }

  function initGame(root){
    if(!root || root.dataset.game2048Booted === VERSION) return;
    root.dataset.game2048Booted = VERSION;

    var boardEl = root.querySelector('[data-2048-board]');
    var scoreEl = root.querySelector('[data-2048-score]');
    var bestEl = root.querySelector('[data-2048-best]');
    var overlay = root.querySelector('[data-2048-overlay]');
    var overlayTitle = root.querySelector('[data-2048-overlay-title]');
    var overlayText = root.querySelector('[data-2048-overlay-text]');
    var topScoresEl = root.querySelector('[data-2048-top-scores]');
    var soundToggle = root.querySelector('[data-2048-sound-toggle]');
    var soundLabel = root.querySelector('[data-2048-sound-label]');
    var syncBestBtn = root.querySelector('[data-2048-sync-best]');

    if(!boardEl) return;

    var grid = emptyGrid();
    var tiles = [];
    var tileLayer = null;
    var tileNodes = {};
    var score = 0;
    var best = Number(localStorage.getItem(BEST_KEY) || 0) || 0;
    var won = false;
    var ended = false;
    var animating = false;
    var touchStart = null;
    var resizeTimer = 0;
    var topScores = [];
    var scoresCacheKey = 'songline-2048-server-top3-cache';
    var scoreRecorded = false;
    var submittedScores = {};
    var soundKey = 'songline-2048-sound-enabled-v1';
    var soundEnabled = localStorage.getItem(soundKey) !== '0';
    var audioCtx = null;

    function setOverlay(show, title, text){
      if(!overlay) return;
      overlay.hidden = !show;
      if(overlayTitle) overlayTitle.textContent = title || '2048';
      if(overlayText) overlayText.textContent = text || '';
    }

    function updateScore(){
      if(score > best){
        best = score;
        localStorage.setItem(BEST_KEY, String(best));
      }
      if(scoreEl) scoreEl.textContent = String(score);
      if(bestEl) bestEl.textContent = String(best);
    }


    
    function updateSoundToggle(){
      if(soundToggle){
        soundToggle.setAttribute('aria-pressed', soundEnabled ? 'true' : 'false');
        soundToggle.classList.toggle('is-muted', !soundEnabled);
      }
      if(soundLabel) soundLabel.textContent = soundEnabled ? '音效响' : '音效关';
    }

    function ensureAudio(){
      if(!soundEnabled) return null;
      var AudioContext = window.AudioContext || window.webkitAudioContext;
      if(!AudioContext) return null;
      if(!audioCtx) audioCtx = new AudioContext();
      if(audioCtx.state === 'suspended'){
        audioCtx.resume().catch(function(){});
      }
      return audioCtx;
    }

    function playTone(freq, duration, type, gainValue, delay){
      var ctx = ensureAudio();
      if(!ctx) return;
      var start = ctx.currentTime + (delay || 0);
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.cancelScheduledValues(start);
      gain.gain.setValueAtTime(0.0001, start);

      // v20.18.5：真正应用总音量系数，并把峰值对齐贪吃蛇的 audible 区间。
      var peak = Math.min(0.34, Math.max(0.0001, (gainValue || 0.12) * SOUND_MASTER_GAIN));
      gain.gain.exponentialRampToValueAtTime(peak, start + 0.014);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + Math.max(0.055, duration || 0.12));

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + Math.max(0.06, duration || 0.12) + 0.035);
    }

    function playNoise(duration, gainValue, delay){
      var ctx = ensureAudio();
      if(!ctx) return;
      var start = ctx.currentTime + (delay || 0);
      var length = Math.max(1, Math.floor(ctx.sampleRate * (duration || 0.075)));
      var buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      var data = buffer.getChannelData(0);
      for(var i = 0; i < length; i++){
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
      }
      var source = ctx.createBufferSource();
      var filter = ctx.createBiquadFilter();
      var gain = ctx.createGain();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(560, start);
      var noisePeak = Math.min(0.22, Math.max(0.0001, (gainValue || 0.055) * SOUND_MASTER_GAIN));
      gain.gain.setValueAtTime(noisePeak, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + (duration || 0.075));
      source.buffer = buffer;
      source.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      source.start(start);
      source.stop(start + (duration || 0.075) + 0.025);
    }

    function playSound(kind, value){
      if(!soundEnabled) return;
      if(kind === 'move'){
        playNoise(0.07, 0.065, 0);
        playTone(420, 0.09, 'triangle', 0.12, 0.004);
        return;
      }
      if(kind === 'spawn'){
        playTone(640, 0.085, 'sine', 0.105, 0.018);
        return;
      }
      if(kind === 'merge'){
        var v = Number(value || 4);
        var step = Math.max(0, Math.min(10, Math.log(v) / Math.log(2) - 2));
        var base = 360 + step * 28;
        playTone(base + 160, 0.13, 'sine', 0.17, 0);
        playTone((base + 160) * 1.42, 0.15, 'triangle', 0.13, 0.055);
        return;
      }
      if(kind === 'win'){
        playTone(523.25, 0.18, 'sine', 0.16, 0);
        playTone(659.25, 0.18, 'sine', 0.16, 0.14);
        playTone(783.99, 0.28, 'triangle', 0.18, 0.28);
        return;
      }
      if(kind === 'gameover'){
        playTone(240, 0.22, 'sawtooth', 0.16, 0);
        playTone(132, 0.28, 'triangle', 0.13, 0.16);
      }
    }


    function getPlayerID(){
      try{
        var id = localStorage.getItem(PLAYER_KEY);
        if(!id){
          id = 'g2048-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
          localStorage.setItem(PLAYER_KEY, id);
        }
        return id;
      }catch(e){
        return 'g2048-guest';
      }
    }

function game2048ScoreEndpoints(){
      var list = [
        '/write/api/tools/2048-scores',
        '/static/api/2048-scores',
        '/api/tools/2048-scores',
        '/api/2048-scores'
      ];
      try{
        var apiBase = String((window.BlogRuntimeConfig || {}).publicApiUrl || '').replace(/\/+$/, '');
        if(apiBase) list.push(apiBase + '/api/tools/2048-scores');
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
        return Number.isFinite(item.score) && item.score > 0;
      }).sort(function(a, b){
        if(b.score === a.score) return String(a.created_at).localeCompare(String(b.created_at));
        return b.score - a.score;
      }).slice(0, 3);
    }

    function cacheTopScores(){
      try{ localStorage.setItem(scoresCacheKey, JSON.stringify(topScores)); }catch(e){}
    }

    function loadCachedTopScores(){
      try{ topScores = normalizeScores(JSON.parse(localStorage.getItem(scoresCacheKey) || '[]')); }
      catch(e){ topScores = []; }
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

    function requestScores(url, options){
      var absolute = /^https?:\/\//i.test(url);
      var baseOptions = absolute ? {mode:'cors', credentials:'omit'} : {credentials:'same-origin'};
      return fetch(url, Object.assign(baseOptions, options || {})).then(function(res){
        if(!res.ok) throw new Error('bad status ' + res.status + ' @ ' + url);
        return res.json();
      }).then(function(data){
        window.Songline2048ScoresDebug = {endpoint:url, data:data, time:new Date().toISOString()};
        return data;
      });
    }

    function requestScoresAny(options){
      var endpoints = game2048ScoreEndpoints();
      var index = 0;
      var lastError = null;

      function next(){
        if(index >= endpoints.length){
          throw lastError || new Error('all 2048 score endpoints failed');
        }
        var url = endpoints[index++];
        return requestScores(url, options).catch(function(err){
          lastError = err;
          return next();
        });
      }

      return next();
    }

    function fetchTopScores(){
      loadCachedTopScores();
      renderTopScores();
      return requestScoresAny().then(function(data){
        topScores = normalizeScores(data.scores);
        cacheTopScores();
        renderTopScores();
      }).catch(function(){
        renderTopScores();
      });
    }

    function recordTopScore(value, reason){
      value = Number(value || 0);
      if(!Number.isFinite(value) || value <= 0) return;
      var key = String(value) + ':' + (reason || 'score');
      if(submittedScores[key]) return;
      submittedScores[key] = true;
      scoreRecorded = true;
      return requestScoresAny({
        method:'POST',
        headers:{'Content-Type':'application/json'},
        credentials:'same-origin',
        body:JSON.stringify({score:value, player_id:getPlayerID()})
      }).then(function(data){
        topScores = normalizeScores(data.scores);
        cacheTopScores();
        renderTopScores();
        if(syncBestBtn){
          syncBestBtn.textContent = reason === 'local-best' ? '已同步本地最佳' : '成绩已同步';
          window.setTimeout(function(){ syncBestBtn.textContent = '同步本地最佳'; }, 1600);
        }
      }).catch(function(){
        renderTopScores();
        if(syncBestBtn){
          syncBestBtn.textContent = '同步失败，重试';
          window.setTimeout(function(){ syncBestBtn.textContent = '同步本地最佳'; }, 1800);
        }
      });
    }

    function syncLocalBest(){
      var localBest = Number(localStorage.getItem(BEST_KEY) || best || 0) || 0;
      if(localBest > 0){
        return recordTopScore(localBest, 'local-best');
      }
      if(syncBestBtn){
        syncBestBtn.textContent = '暂无本地最佳';
        window.setTimeout(function(){ syncBestBtn.textContent = '同步本地最佳'; }, 1400);
      }
    }

    function buildShell(){
      boardEl.innerHTML = '';
      boardEl.style.setProperty('--game-2048-size', String(SIZE));

      var cells = document.createElement('div');
      cells.className = 'game-2048-cells';
      for(var i = 0; i < SIZE * SIZE; i++){
        var cell = document.createElement('div');
        cell.className = 'game-2048-cell';
        cells.appendChild(cell);
      }

      tileLayer = document.createElement('div');
      tileLayer.className = 'game-2048-tile-layer';

      boardEl.appendChild(cells);
      boardEl.appendChild(tileLayer);
      tileNodes = {};
    }

    function metrics(){
      var style = window.getComputedStyle(boardEl);
      var gap = parseFloat(style.getPropertyValue('--game-2048-gap')) || 10;
      var width = boardEl.clientWidth || 520;
      var inner = Math.max(0, width - gap * (SIZE + 1));
      var cell = inner / SIZE;
      return {gap:gap, cell:cell};
    }

    function pixelFor(tile){
      var m = metrics();
      return {
        x:m.gap + tile.x * (m.cell + m.gap),
        y:m.gap + tile.y * (m.cell + m.gap),
        size:m.cell
      };
    }

    function placeNode(node, tile, immediate){
      var p = pixelFor(tile);
      node.style.setProperty('width', p.size + 'px', 'important');
      node.style.setProperty('height', p.size + 'px', 'important');

      if(immediate){
        node.classList.add('no-transition');
      }

      node.style.transform = 'translate3d(' + p.x + 'px,' + p.y + 'px,0)';

      if(immediate){
        void node.offsetWidth;
        node.classList.remove('no-transition');
      }
    }

    function createNode(tile){
      var node = document.createElement('div');
      node.className = 'game-2048-tile';
      node.dataset.tileId = String(tile.id);
      node.innerHTML = '<span class="game-2048-tile-inner"></span>';
      tileLayer.appendChild(node);
      return node;
    }

    function syncNode(node, tile){
      node.className = 'game-2048-tile ' + tileClass(tile.value);
      if(tile.isNew) node.classList.add('is-new');
      if(tile.isMerged) node.classList.add('is-merged');
      node.querySelector('span').textContent = String(tile.value);
    }

    function renderTiles(list, options){
      options = options || {};
      var keep = {};

      list.forEach(function(tile){
        keep[tile.id] = true;
        var node = tileNodes[tile.id];
        if(!node){
          node = createNode(tile);
          tileNodes[tile.id] = node;
          placeNode(node, tile, true);
        }
        syncNode(node, tile);
        placeNode(node, tile, !!options.immediate);
      });

      Object.keys(tileNodes).forEach(function(id){
        if(!keep[id]){
          tileNodes[id].remove();
          delete tileNodes[id];
        }
      });
    }

    function clearTransientFlags(){
      tiles.forEach(function(tile){
        tile.isNew = false;
        tile.isMerged = false;
      });
    }

    function addRandomTile(markNew){
      var cell = randomEmptyCell(grid);
      if(!cell) return null;
      var tile = makeTile(Math.random() < 0.9 ? 2 : 4, cell.x, cell.y, {isNew:markNew});
      grid[cell.y][cell.x] = tile;
      tiles.push(tile);
      return tile;
    }

    function collectGridTiles(){
      var list = [];
      for(var y = 0; y < SIZE; y++){
        for(var x = 0; x < SIZE; x++){
          if(grid[y][x]) list.push(grid[y][x]);
        }
      }
      return list;
    }

    function findFarthest(pos, vector){
      var previous;
      var current = {x:pos.x, y:pos.y};

      do{
        previous = current;
        current = {x:previous.x + vector.x, y:previous.y + vector.y};
      }while(within(current) && !grid[current.y][current.x]);

      return {farthest:previous, next:current};
    }

    function removeNodes(ids){
      ids.forEach(function(id){
        var node = tileNodes[id];
        if(node){
          node.remove();
          delete tileNodes[id];
        }
      });
    }

    function checkEndState(){
      var maxTile = 0;
      tiles.forEach(function(tile){ maxTile = Math.max(maxTile, tile.value); });

      if(!won && maxTile >= MAX_TILE_VALUE){
        won = true;
        setOverlay(false);
        playSound('win');
        recordTopScore(score, 'reach-2048');
      }

      if(!canMove(grid)){
        ended = true;
        setOverlay(true, '游戏结束', '棋盘已经没有可移动空间了。');
        playSound('gameover');
        recordTopScore(score, 'gameover');
      }
    }

    function commitAfterMove(finalTiles, consumedIds, gained){
      // 旧块已经滑到目标格；这一刻先清掉被合成吃掉的旧 DOM，
      // 再分帧渲染合成块，避免同一帧内“删除 + 新建 + 变换”导致闪现。
      removeNodes(consumedIds);
      tiles = finalTiles;
      score += gained;
      updateScore();

      window.requestAnimationFrame(function(){
        renderTiles(tiles, {immediate:true});

        window.setTimeout(function(){
          var newTile = addRandomTile(true);
          if(newTile){
            renderTiles(tiles, {immediate:true});
            playSound('spawn');
          }

          checkEndState();

          window.setTimeout(function(){
            clearTransientFlags();
            renderTiles(tiles, {immediate:true});
            animating = false;
          }, MERGE_MS);
        }, 90);
      });
    }

    function move(dir){
      if(animating || ended) return;

      var vector = vectorFor(dir);
      if(!vector.x && !vector.y) return;

      clearTransientFlags();

      var order = traversal(dir);
      var moved = false;
      var gained = 0;
      var consumedIds = [];
      var movingTiles = tiles.slice();
      var mergedAt = {};
      var nextGrid = emptyGrid();

      // 复制当前 grid 到工作区。移动计算仍在 grid 上做，便于 findFarthest。
      order.ys.forEach(function(y){
        order.xs.forEach(function(x){
          var tile = grid[y][x];
          if(!tile) return;

          var oldX = tile.x;
          var oldY = tile.y;
          var positions = findFarthest({x:x, y:y}, vector);
          var next = positions.next;
          var nextTile = within(next) ? grid[next.y][next.x] : null;
          var key = within(next) ? (next.x + ',' + next.y) : '';

          if(nextTile && nextTile.value === tile.value && tile.value < MAX_TILE_VALUE && !mergedAt[key]){
            var merged = makeTile(Math.min(tile.value * 2, MAX_TILE_VALUE), next.x, next.y, {isMerged:true});

            // 参与合成的两个旧块都先保留 DOM，滑到目标格；滑完后再移除。
            grid[oldY][oldX] = null;
            grid[next.y][next.x] = merged;
            mergedAt[key] = true;

            tile.x = next.x;
            tile.y = next.y;
            nextTile.x = next.x;
            nextTile.y = next.y;

            nextGrid[next.y][next.x] = merged;
            consumedIds.push(tile.id, nextTile.id);
            gained += merged.value;
            moved = true;
          }else{
            var far = positions.farthest;
            if(far.x !== oldX || far.y !== oldY){
              grid[oldY][oldX] = null;
              grid[far.y][far.x] = tile;
              tile.x = far.x;
              tile.y = far.y;
              moved = true;
            }
            nextGrid[tile.y][tile.x] = tile;
          }
        });
      });

      if(!moved) return;

      animating = true;
      playSound('move');
      if(gained > 0) playSound('merge', gained);

      // 分帧提交移动位置，避免浏览器把创建/定位/过渡合并到同一帧引起闪现。
      renderTiles(movingTiles, {immediate:false});
      window.requestAnimationFrame(function(){
        window.requestAnimationFrame(function(){
          renderTiles(movingTiles, {immediate:false});
        });
      });

      var finalTiles = collectGridTiles();
      window.setTimeout(function(){
        commitAfterMove(finalTiles, consumedIds, gained);
      }, MOVE_MS + 18);
    }

    function newGame(){
      grid = emptyGrid();
      tiles = [];
      score = 0;
      won = false;
      ended = false;
      animating = false;
      scoreRecorded = false;
      submittedScores = {};
      setOverlay(false);
      buildShell();
      addRandomTile(true);
      addRandomTile(true);
      updateScore();
      updateSoundToggle();
      renderTiles(tiles, {immediate:true});
      window.setTimeout(function(){
        clearTransientFlags();
        renderTiles(tiles, {immediate:true});
      }, 240);
    }

    function onKeydown(event){
      var dir = keyToDir(event);
      if(!dir) return;

      if(!document.documentElement.contains(root)){
        window.removeEventListener('keydown', onKeydown);
        window.removeEventListener('resize', onResize);
        return;
      }

      event.preventDefault();
      ensureAudio();
      move(dir);
    }

    function onResize(){
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(function(){
        if(!document.documentElement.contains(root)){
          window.removeEventListener('resize', onResize);
          return;
        }
        renderTiles(tiles, {immediate:true});
      }, 80);
    }

    window.addEventListener('keydown', onKeydown, {passive:false});
    window.addEventListener('resize', onResize, {passive:true});

    root.querySelectorAll('[data-2048-new], [data-2048-overlay-new]').forEach(function(btn){
      btn.addEventListener('click', function(){ ensureAudio(); newGame(); });
    });

    root.querySelectorAll('[data-2048-move]').forEach(function(btn){
      btn.addEventListener('click', function(){
        ensureAudio();
        move(btn.getAttribute('data-2048-move'));
        btn.blur();
      });
    });



    if(syncBestBtn){
      syncBestBtn.addEventListener('click', function(){
        ensureAudio();
        playSound('move');
        syncLocalBest();
        syncBestBtn.blur();
      });
    }

    if(soundToggle){
      updateSoundToggle();
      soundToggle.addEventListener('click', function(){
        soundEnabled = !soundEnabled;
        try{ localStorage.setItem(soundKey, soundEnabled ? '1' : '0'); }catch(e){}
        updateSoundToggle();
        if(soundEnabled){
          ensureAudio();
          playTone(720, 0.12, 'sine', 0.13, 0);
        }
        soundToggle.blur();
      });
    }

    boardEl.addEventListener('touchstart', function(event){
      var touch = event.changedTouches && event.changedTouches[0];
      if(!touch) return;
      ensureAudio();
      touchStart = {x:touch.clientX, y:touch.clientY};
    }, {passive:true});

    boardEl.addEventListener('touchend', function(event){
      var touch = event.changedTouches && event.changedTouches[0];
      if(!touch || !touchStart) return;

      var dx = touch.clientX - touchStart.x;
      var dy = touch.clientY - touchStart.y;
      touchStart = null;

      if(Math.max(Math.abs(dx), Math.abs(dy)) < 28) return;

      if(Math.abs(dx) > Math.abs(dy)){
        move(dx > 0 ? 'right' : 'left');
      }else{
        move(dy > 0 ? 'down' : 'up');
      }
    }, {passive:true});

    newGame();
    fetchTopScores().then(function(){
      window.setTimeout(syncLocalBest, 300);
    });
  }

  function boot(target){
    var root = target && target.querySelector ? target : document;
    root.querySelectorAll('[data-game-2048]').forEach(initGame);
  }

  window.SonglineInit2048 = boot;

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
