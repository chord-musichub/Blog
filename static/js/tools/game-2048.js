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
    var score = 0;
    var best = Number(localStorage.getItem(BEST_KEY) || 0) || 0;
    var won = false;
    var ended = false;
    var animating = false;
    var touchStart = null;
    var resizeTimer = 0;
    var scoresCacheKey = 'songline-2048-server-top3-cache';
    var soundKey = 'songline-2048-sound-enabled-v1';
    var soundEnabled = localStorage.getItem(soundKey) !== '0';

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

    var audioEngine=window.SonglineCreate2048Audio&&window.SonglineCreate2048Audio({masterGain:SOUND_MASTER_GAIN,isEnabled:function(){return soundEnabled;}});
    if(!audioEngine) return;
    var ensureAudio=audioEngine.ensureAudio,playTone=audioEngine.playTone,playNoise=audioEngine.playNoise,playSound=audioEngine.playSound;

    var leaderboard=window.SonglineCreate2048Leaderboard&&window.SonglineCreate2048Leaderboard({topScoresEl:topScoresEl,syncBestBtn:syncBestBtn,cacheKey:scoresCacheKey,bestKey:BEST_KEY,getBest:function(){return best;}});
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
        setOverlay(false);
        playSound('win');
        leaderboard.recordTopScore(score, 'reach-2048');
      }

      if(!canMove(grid)){
        ended = true;
        setOverlay(true, '游戏结束', '棋盘已经没有可移动空间了。');
        playSound('gameover');
        leaderboard.recordTopScore(score, 'gameover');
      }
    }

    function commitAfterMove(finalTiles, consumedIds, gained){
      // 旧块已经滑到目标格；这一刻先清掉被合成吃掉的旧 DOM，
      // 再分帧渲染合成块，避免同一帧内“删除 + 新建 + 变换”导致闪现。
      renderer.removeNodes(consumedIds);
      tiles = finalTiles;
      score += gained;
      updateScore();

      window.requestAnimationFrame(function(){
        renderer.renderTiles(tiles, {immediate:true});

        window.setTimeout(function(){
          var newTile = addRandomTile(true);
          if(newTile){
            renderer.renderTiles(tiles, {immediate:true});
            playSound('spawn');
          }

          checkEndState();

          window.setTimeout(function(){
            renderer.clearTransientFlags();
            renderer.renderTiles(tiles, {immediate:true});
            animating = false;
          }, MERGE_MS);
        }, 90);
      });
    }

    function move(dir){
      if(animating || ended) return;

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
      window.requestAnimationFrame(function(){
        window.requestAnimationFrame(function(){
          renderer.renderTiles(movingTiles, {immediate:false});
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
      leaderboard.resetSubmission();
      setOverlay(false);
      renderer.buildShell();
      addRandomTile(true);
      addRandomTile(true);
      updateScore();
      updateSoundToggle();
      renderer.renderTiles(tiles, {immediate:true});
      window.setTimeout(function(){
        renderer.clearTransientFlags();
        renderer.renderTiles(tiles, {immediate:true});
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
        renderer.renderTiles(tiles, {immediate:true});
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
        leaderboard.syncLocalBest();
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
    leaderboard.fetchTopScores().then(function(){
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
