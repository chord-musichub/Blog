(function(){
  'use strict';

  var VERSION = '20.20.6';
  var core = window.Songline2048Engine;
  if(!core) return;

  var SIZE = core.SIZE;
  var MAX_TILE_VALUE = core.MAX_TILE_VALUE;
  var emptyGrid = core.emptyGrid;
  var vectorFor = core.vectorFor;
  var traversal = core.traversal;
  var within = core.within;
  var randomEmptyCell = core.randomEmptyCell;
  var canMove = core.canMove;
  var tileClass = core.tileClass;
  var keyToDir = core.keyToDir;
  var makeTile = core.makeTile;
  var BEST_KEY = 'songline-2048-best-v1';
  var PLAYER_KEY = 'songline-2048-player-id-v1';
  var MOVE_MS = 230;
  var MERGE_MS = 160;
  var SOUND_MASTER_GAIN = 1.35;
  function initGame(root){
    if(!root || root.dataset.game2048Booted === VERSION) return;
    if(typeof window.__songline2048Cleanup === 'function') window.__songline2048Cleanup();
    root.dataset.game2048Booted = VERSION;

    var boardEl = root.querySelector('[data-2048-board]');
    var scoreEl = root.querySelector('[data-2048-score]');
    var bestEl = root.querySelector('[data-2048-best]');
    var overlay = root.querySelector('[data-2048-overlay]');
    var overlayTitle = root.querySelector('[data-2048-overlay-title]');
    var overlayText = root.querySelector('[data-2048-overlay-text]');
    var topScoresEl = root.querySelector('[data-2048-top-scores]');
    var soundToggle = root.querySelector('[data-2048-sound-toggle]');
    var pauseBtn = root.querySelector('[data-2048-pause]');

    if(!boardEl) return;

    var grid = emptyGrid();
    var tiles = [];
    var score = 0;
    var best = Number(localStorage.getItem(BEST_KEY) || 0) || 0;
    var won = false;
    var ended = false;
    var animating = false;
    var paused = false;
    var helpPaused = false;
    var disposed = false;
    var generation = 0;
    var timers = new Set();
    var frames = new Set();
    var touchStart = null;
    var resizeTimer = 0;
    var scoresCacheKey = 'songline-2048-server-top3-cache';
    var soundKey = 'songline-2048-sound-enabled-v1';
    var soundEnabled = localStorage.getItem(soundKey) !== '0';

    function later(callback, delay){
      var round = generation;
      var id = window.setTimeout(function(){
        timers.delete(id);
        if(!disposed && round === generation) callback();
      }, delay);
      timers.add(id);
    }
    function frame(callback){
      var round = generation;
      var id = window.requestAnimationFrame(function(){
        frames.delete(id);
        if(!disposed && round === generation) callback();
      });
      frames.add(id);
    }
    function clearWork(){
      timers.forEach(function(id){ window.clearTimeout(id); });
      frames.forEach(function(id){ window.cancelAnimationFrame(id); });
      timers.clear();frames.clear();
    }
    function updatePause(){
      if(!pauseBtn) return;
      pauseBtn.disabled = ended;
      pauseBtn.dataset.toolPaused = String(paused);
      pauseBtn.setAttribute('aria-label', paused ? '继续' : '暂停');
      pauseBtn.setAttribute('title', paused ? '继续' : '暂停');
    }
    function togglePause(){
      if(ended || disposed) return;
      paused = !paused;
      touchStart = null;
      setOverlay(paused, '已暂停', '右上角继续');
      updatePause();
    }

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
        soundToggle.setAttribute('title', soundEnabled ? '关闭音效' : '开启音效');
        soundToggle.classList.toggle('is-muted', !soundEnabled);
      }
    }

    var audioEngine=window.SonglineCreate2048Audio&&window.SonglineCreate2048Audio({masterGain:SOUND_MASTER_GAIN,isEnabled:function(){return soundEnabled;}});
    if(!audioEngine) return;
    var ensureAudio=audioEngine.ensureAudio,playTone=audioEngine.playTone,playNoise=audioEngine.playNoise,playSound=audioEngine.playSound;

    var leaderboard=window.SonglineCreate2048Leaderboard&&window.SonglineCreate2048Leaderboard({topScoresEl:topScoresEl,playerKey:PLAYER_KEY,cacheKey:scoresCacheKey,bestKey:BEST_KEY,getBest:function(){return best;}});
    if(!leaderboard) return;
    var renderer = window.SonglineCreate2048Renderer && window.SonglineCreate2048Renderer({
      boardEl: boardEl,
      size: SIZE,
      tileClass: tileClass,
      getTiles: function(){ return tiles; }
    });
    if(!renderer) return;
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

    function checkEndState(){
      var maxTile = 0;
      tiles.forEach(function(tile){ maxTile = Math.max(maxTile, tile.value); });

      if(!won && maxTile >= MAX_TILE_VALUE){
        won = true;
        if(!paused) setOverlay(false);
        playSound('win');
        leaderboard.recordTopScore(score, 'reach-2048');
      }

      if(!canMove(grid)){
        ended = true;
        setOverlay(true, '游戏结束', '棋盘已无法移动，点击右上角重开。');
        playSound('gameover');
        leaderboard.recordTopScore(score, 'gameover');
        updatePause();
      }
    }

    function commitAfterMove(finalTiles, consumedIds, gained){
      // 旧块已经滑到目标格；这一刻先清掉被合成吃掉的旧 DOM，
      // 再分帧渲染合成块，避免同一帧内“删除 + 新建 + 变换”导致闪现。
      renderer.removeNodes(consumedIds);
      tiles = finalTiles;
      score += gained;
      updateScore();

      frame(function(){
        renderer.renderTiles(tiles, {immediate:true});

        later(function(){
          var newTile = addRandomTile(true);
          if(newTile){
            renderer.renderTiles(tiles, {immediate:true});
            playSound('spawn');
          }

          checkEndState();

          later(function(){
            renderer.clearTransientFlags();
            renderer.renderTiles(tiles, {immediate:true});
            animating = false;
          }, MERGE_MS);
        }, 90);
      });
    }

    function move(dir){
      if(animating || ended || paused || disposed) return;

      var vector = vectorFor(dir);
      if(!vector.x && !vector.y) return;

      renderer.clearTransientFlags();

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
      renderer.renderTiles(movingTiles, {immediate:false});
      frame(function(){
        frame(function(){
          renderer.renderTiles(movingTiles, {immediate:false});
        });
      });

      var finalTiles = collectGridTiles();
      later(function(){
        commitAfterMove(finalTiles, consumedIds, gained);
      }, MOVE_MS + 18);
    }

    function newGame(){
      generation++;
      clearWork();
      grid = emptyGrid();
      tiles = [];
      score = 0;
      won = false;
      ended = false;
      animating = false;
      paused = false;
      helpPaused = false;
      touchStart = null;
      updatePause();
      leaderboard.resetSubmission();
      setOverlay(false);
      renderer.buildShell();
      addRandomTile(true);
      addRandomTile(true);
      updateScore();
      updateSoundToggle();
      renderer.renderTiles(tiles, {immediate:true});
      later(function(){
        renderer.clearTransientFlags();
        renderer.renderTiles(tiles, {immediate:true});
      }, 240);
    }

    function onKeydown(event){
      if(event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.ctrlKey || event.metaKey || event.altKey) return;
      if(disposed || root.querySelector('[data-tool-help-dialog][open]')) return;
      if(event.target && event.target.closest && event.target.closest('button, input, textarea, select, a, summary, dialog, [contenteditable]:not([contenteditable="false"])')){
        // Restart/resume can keep native button focus without disabling the
        // next directional move. Space/Enter still belong to that button.
        if(!event.target.closest('[data-2048-new],[data-2048-pause]') || !keyToDir(event)) return;
      }
      if(event.code === 'Space'){
        event.preventDefault();if(!event.repeat) togglePause();return;
      }
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
        renderer.renderTiles(tiles, {immediate:true});
      }, 80);
    }

    window.addEventListener('keydown', onKeydown, {passive:false});
    window.addEventListener('resize', onResize, {passive:true});
    function cleanup(){
      disposed = true;
      generation++;
      clearWork();
      window.clearTimeout(resizeTimer);
      audioEngine.destroy();
      window.removeEventListener('keydown', onKeydown);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('songline:page-transition-start', onTransitionStart);
      if(window.__songline2048Cleanup === cleanup) window.__songline2048Cleanup = null;
    }
    function onTransitionStart(){ cleanup(); }
    window.addEventListener('songline:page-transition-start', onTransitionStart);
    window.__songline2048Cleanup = cleanup;

    root.querySelectorAll('[data-2048-new]').forEach(function(btn){
      btn.addEventListener('click', function(event){ ensureAudio(); newGame(); if(event.detail > 0) btn.blur(); });
    });

    if(pauseBtn) pauseBtn.addEventListener('click', function(event){ togglePause();if(event.detail > 0) pauseBtn.blur(); });
    root.addEventListener('songline:tool-sync-best', function(){ if(!disposed) leaderboard.syncLocalBest(); });
    root.addEventListener('songline:tool-help-change', function(event){
      if(disposed) return;
      if(event.detail.open){
        helpPaused = !paused && !ended;
        if(helpPaused) togglePause();
      }else if(helpPaused){
        helpPaused = false;
        if(paused && !ended) togglePause();
      }
    });

    if(soundToggle){
      updateSoundToggle();
      soundToggle.addEventListener('click', function(event){
        soundEnabled = !soundEnabled;
        try{ localStorage.setItem(soundKey, soundEnabled ? '1' : '0'); }catch(e){}
        updateSoundToggle();
        if(soundEnabled){
          ensureAudio();
          playTone(720, 0.12, 'sine', 0.13, 0);
        }
        if(event.detail > 0) soundToggle.blur();
      });
    }

    boardEl.addEventListener('touchstart', function(event){
      if(paused || disposed) return;
      if(event.touches && event.touches.length !== 1){ touchStart = null;return; }
      var touch = event.changedTouches && event.changedTouches[0];
      if(!touch) return;
      ensureAudio();
      touchStart = {id:touch.identifier, x:touch.clientX, y:touch.clientY};
    }, {passive:true});

    boardEl.addEventListener('touchcancel', function(){ touchStart = null; }, {passive:true});

    boardEl.addEventListener('touchend', function(event){
      var touch = touchStart && Array.prototype.find.call(event.changedTouches || [], function(item){ return item.identifier === touchStart.id; });
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
    leaderboard.fetchTopScores().then(function(){
      window.setTimeout(function(){ if(!disposed) leaderboard.syncLocalBest(); }, 300);
    });
  }

  function boot(target){
    var root = target && target.querySelector ? target : document;
    root.querySelectorAll('[data-game-2048]').forEach(initGame);
  }

  window.SonglineInit2048 = boot;
})();
