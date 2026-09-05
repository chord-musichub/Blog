(function(){
  'use strict';

  const VERSION = '20.20.6';
  let activeController = null;

  function findGame(root){
    root = root && root.querySelector ? root : document;
    if(root.matches && root.matches('[data-snake-game]')) return root;
    return root.querySelector('[data-snake-game]') || document.querySelector('[data-snake-game]');
  }

  function init(root){
    const game = findGame(root);
    if(!game) return null;

    if(activeController && activeController.game === game && !activeController.destroyed){
      activeController.refreshScores();
      return activeController;
    }

    if(activeController && activeController.game !== game){
      activeController.destroy();
      activeController = null;
    }

    if(game.__songlineSnakeController && !game.__songlineSnakeController.destroyed){
      activeController = game.__songlineSnakeController;
      activeController.refreshScores();
      return activeController;
    }

    activeController = createGame(game);
    game.__songlineSnakeController = activeController;
    return activeController;
  }

  window.SonglineInitSnake = init;

  function createGame(game){
    const canvas = game.querySelector('[data-snake-canvas]');
    if(!canvas) return null;

    const ctx = canvas.getContext('2d');
    const scoreEl = game.querySelector('[data-snake-score]');
    const bestEl = game.querySelector('[data-snake-best]');
    const levelEl = game.querySelector('[data-snake-level]');
    const stateEl = game.querySelector('[data-snake-state]');
    const comboEl = game.querySelector('[data-snake-combo]');
    const shieldEl = game.querySelector('[data-snake-shield]');
    const slowEl = game.querySelector('[data-snake-slow]');
    const rushEl = game.querySelector('[data-snake-rush]');
    const tipEl = game.querySelector('[data-snake-tip]');
    const overlay = game.querySelector('[data-snake-overlay]');
    const overlayTitle = game.querySelector('[data-snake-overlay-title]');
    const overlayText = game.querySelector('[data-snake-overlay-text]');
    const startBtn = game.querySelector('[data-snake-start]');
    const pauseBtn = game.querySelector('[data-snake-pause]');
    const soundToggle = game.querySelector('[data-snake-sound]');
    const topScoresEl = game.querySelector('[data-snake-top-scores]');
    const syncBestBtn = game.querySelector('[data-snake-sync-best]');

    const grid = 18;
    const cell = canvas.width / grid;
    const normalTick = 126;
    const fastTick = 64;
    const bestKey = 'songline-snake-best';
    const playerKey = 'songline-snake-player-id-v1';
    const scoresCacheKey = 'songline-snake-server-top3-cache';

    let snake = [];
    let foods = [];
    let walls = [];
    let particles = [];
    let dir = {x:1, y:0};
    let nextDir = {x:1, y:0};
    let score = 0;
    let best = Number(localStorage.getItem(bestKey) || 0);
    let level = 1;
    let topScores = [];
    let running = false;
    let paused = true;
    let dead = false;
    let last = 0;
    let acc = 0;
    let fast = false;
    let audioCtx = null;
    let eatCount = 0;
    let combo = 0;
    let comboUntil = 0;
    let shields = 0;
    let slowUntil = 0;
    let rushActive = false;
    let rushStep = 0;
    let rushTarget = 0;
    let rushUntil = 0;
    let destroyed = false;
    let raf = 0;
    let scorePoll = 0;


    const leaderboard=window.SonglineCreateSnakeLeaderboard&&window.SonglineCreateSnakeLeaderboard({topScoresEl:topScoresEl,syncBestBtn:syncBestBtn,bestKey:bestKey,getBest:function(){return best;}});
    if(!leaderboard) return;
    function reset(){
      const startX = Math.floor(grid / 2);
      const startY = Math.floor(grid / 2);
      snake = [
        {x: startX + 1, y: startY},
        {x: startX, y: startY},
        {x: startX - 1, y: startY}
      ];
      foods = [];
      walls = [];
      particles = [];
      dir = {x: 1, y: 0};
      nextDir = {x: 1, y: 0};
      score = 0;
      level = 1;
      eatCount = 0;
      combo = 0;
      comboUntil = 0;
      shields = 0;
      slowUntil = 0;
      rushActive = false;
      rushStep = 0;
      rushTarget = 0;
      rushUntil = 0;
      running = true;
      paused = false;
      dead = false;
      last = performance.now();
      acc = 0;
      refillFoods(true);
      setTip('玩法：18格棋盘更清晰；粉豆限时连锁更难，棕豆会制造墙。');
      setState('游戏中');
      hideOverlay();
      updateHud();
      renderer.draw();
    }

    function currentLevel(){
      return Math.max(1, Math.min(12, 1 + Math.floor(score / 90)));
    }

    function updateHud(){
      const now = performance.now();
      if(now > comboUntil) combo = 0;
      level = currentLevel();

      if(scoreEl) scoreEl.textContent = String(score);
      if(bestEl) bestEl.textContent = String(best);
      if(levelEl) levelEl.textContent = String(level);
      if(comboEl){
        comboEl.textContent = combo > 1 ? '连击 x' + combo : '连击 x1';
        comboEl.classList.toggle('is-hot', combo > 1);
      }
      if(shieldEl){
        shieldEl.textContent = '护盾 ' + shields;
        shieldEl.classList.toggle('is-hot', shields > 0);
      }
      if(slowEl){
        const left = Math.max(0, Math.ceil((slowUntil - now) / 1000));
        slowEl.textContent = '缓速 ' + left + 's';
        slowEl.classList.toggle('is-hot', left > 0);
      }
      if(rushEl){
        const rushLeft = Math.max(0, Math.ceil((rushUntil - now) / 1000));
        if(rushActive){
          rushEl.textContent = '临时豆 ' + rushStep + '/' + rushTarget + ' · ' + rushLeft + 's';
        }else{
          rushEl.textContent = '临时豆 待机';
        }
        rushEl.classList.toggle('is-hot', rushActive && rushLeft > 0);
      }
    }

    function setTip(text){
      if(tipEl) tipEl.textContent = text;
    }

    function setState(text){
      if(stateEl) stateEl.textContent = text;
      updateHud();
    }

    function showOverlay(title, text){
      if(overlayTitle) overlayTitle.textContent = title;
      if(overlayText) overlayText.textContent = text;
      if(overlay) overlay.classList.add('show');
    }

    function hideOverlay(){
      if(overlay) overlay.classList.remove('show');
    }

    function same(a, b){
      return a && b && a.x === b.x && a.y === b.y;
    }

    function blocked(p){
      return snake.some(s => same(s, p)) || walls.some(w => same(w, p)) || foods.some(f => same(f, p));
    }

    function wrapDistance(a, b){
      const dx = Math.abs(a.x - b.x);
      const dy = Math.abs(a.y - b.y);
      return Math.min(dx, grid - dx) + Math.min(dy, grid - dy);
    }

    function randomEmptyCell(options){
      options = options || {};
      const avoidHeadDistance = Number(options.avoidHeadDistance || 0);
      const head = snake && snake[0];

      for(let guard = 0; guard < 1400; guard++){
        const p = { x:Math.floor(Math.random() * grid), y:Math.floor(Math.random() * grid) };
        if(blocked(p)) continue;
        if(head && avoidHeadDistance > 0 && wrapDistance(p, head) < avoidHeadDistance) continue;
        return p;
      }

      for(let guard = 0; guard < 1000; guard++){
        const p = { x:Math.floor(Math.random() * grid), y:Math.floor(Math.random() * grid) };
        if(!blocked(p)) return p;
      }
      return null;
    }

    function targetFoodCount(){
      // v20.18.5：棋盘变小后减少场上豆子数量，避免视觉拥挤。
      const max = snake.length >= 14 ? 5 : (snake.length >= 8 ? 4 : 3);
      return 2 + Math.floor(Math.random() * (max - 1));
    }

    function randomFoodType(forceSpecial){
      const allowShed = snake.length >= 6;
      const hasRushFood = foods.some(f => f.type === 'rush');
      const levelNow = currentLevel();

      if(forceSpecial){
        const pool = ['rotten', 'rotten', 'shed', 'shield', 'slow', 'star', 'rush'];
        if(walls.length >= 6 && Math.random() < 0.055) return 'clear';
        const filtered = pool.filter(function(type){
          if(type === 'shed') return allowShed;
          if(type === 'rush') return !rushActive && !hasRushFood;
          return true;
        });
        return filtered[Math.floor(Math.random() * filtered.length)] || 'rotten';
      }

      // 极小概率：全场清屏豆。墙越多越容易出现，但仍然稀有。
      if(walls.length >= 5 && Math.random() < 0.0035 + Math.min(0.006, walls.length * 0.00035)){
        return 'clear';
      }

      // 临时豆是高收益挑战，降低自然出现频率，避免太常见。
      if(!rushActive && !hasRushFood && Math.random() < 0.024 + Math.min(0.012, eatCount * 0.0008)){
        return 'rush';
      }

      const weights = [
        ['normal', Math.max(34, 56 - levelNow * 1.5)],
        ['rotten', 17 + Math.min(8, levelNow * 0.9) + Math.min(5, walls.length * 0.18)],
        ['shed', allowShed ? 9 + Math.min(4, snake.length * 0.12) : 0],
        ['shield', shields > 0 ? 4 : 6],
        ['slow', performance.now() < slowUntil ? 3 : 6],
        ['star', 8]
      ];

      let total = 0;
      weights.forEach(function(item){ total += Math.max(0, item[1]); });
      let roll = Math.random() * total;
      for(const item of weights){
        roll -= Math.max(0, item[1]);
        if(roll <= 0) return item[0];
      }
      return 'normal';
    }

    function addFood(type){
      const p = randomEmptyCell();
      if(!p) return false;
      p.type = type || randomFoodType(false);
      if(p.type === 'rush'){
        p.spawnedAt = performance.now();
        p.expiresAt = p.spawnedAt + (rushActive ? 5200 : 7600);
      }
      foods.push(p);
      return true;
    }

    function refillFoods(initial){
      const target = targetFoodCount();
      while(foods.length < target){
        const type = initial && foods.length === 0 ? 'normal' : randomFoodType(false);
        if(!addFood(type)) break;
      }

      if(eatCount >= 3 && foods.length < 7 && !foods.some(f => f.type !== 'normal') && Math.random() < 0.46){
        addFood(randomFoodType(true));
      }
    }

    function addRandomWalls(count){
      let added = 0;
      const safeDistance = Math.max(5, Math.ceil(snake.length / 4));
      for(let i = 0; i < count * 12 && added < count; i++){
        const p = randomEmptyCell({avoidHeadDistance: safeDistance});
        if(!p) break;
        walls.push({x: p.x, y: p.y, type: 'rotten'});
        added += 1;
      }
      return added;
    }

    function shedTailToWalls(){
      if(snake.length < 6) return 0;
      const keepCount = Math.max(3, Math.ceil(snake.length / 2));
      const shed = snake.slice(keepCount);
      snake = snake.slice(0, keepCount);

      const existing = new Set(walls.map(w => w.x + ',' + w.y));
      let added = 0;
      shed.forEach(function(part){
        const key = part.x + ',' + part.y;
        if(!existing.has(key)){
          walls.push({x: part.x, y: part.y, type: 'shed'});
          existing.add(key);
          added += 1;
        }
      });
      return added;
    }

    function clearSomeWalls(count){
      let removed = 0;
      while(walls.length && removed < count){
        const index = Math.floor(Math.random() * walls.length);
        const wall = walls.splice(index, 1)[0];
        renderer.spawnParticles(wall.x, wall.y, '#facc15', '');
        removed += 1;
      }
      return removed;
    }

    function clearAllWalls(){
      const removed = walls.length;
      const snapshot = walls.slice();
      walls = [];
      snapshot.slice(0, 42).forEach(function(wall){
        renderer.spawnParticles(wall.x, wall.y, '#e2e8f0', '');
      });
      return removed;
    }

    function removeRushFoods(){
      foods = foods.filter(function(food){ return food.type !== 'rush'; });
    }

    function failRush(reason){
      if(!rushActive && !foods.some(f => f.type === 'rush')) return;
      removeRushFoods();
      rushActive = false;
      rushStep = 0;
      rushTarget = 0;
      rushUntil = 0;
      setTip(reason || '临时豆超时：连锁中断。');
      setState('临时豆中断');
      updateHud();
    }

    function spawnRushBean(){
      removeRushFoods();
      // v20.18.5：临时豆挑战不再贴脸生成，尽量远离蛇头，让路线选择更有压力。
      const distance = Math.min(8, 5 + Math.floor(rushStep / 2));
      const p = randomEmptyCell({avoidHeadDistance: distance});
      if(!p) return false;
      p.type = 'rush';
      p.spawnedAt = performance.now();
      p.expiresAt = rushUntil;
      foods.push(p);
      renderer.spawnParticles(p.x, p.y, '#fb7185', '');
      return true;
    }

    function startOrAdvanceRush(eaten){
      const now = performance.now();
      if(!rushActive || now > rushUntil){
        rushActive = true;
        rushStep = 0;
        rushTarget = 7;
        rushUntil = now + 7800;
      }

      rushStep += 1;
      // v20.18.5：改为“每颗限时”节奏，越往后时间越短，不再无限续长总时间。
      const nextWindow = Math.max(3600, 7200 - rushStep * 420);
      rushUntil = now + nextWindow;

      const base = Math.round(18 * Math.pow(1.52, rushStep - 1));
      addScore(base, eaten, '临时豆 ' + rushStep + '/' + rushTarget);
      beep('star');

      if(rushStep >= rushTarget){
        const finalBonus = 760 + currentLevel() * 45 + combo * 24;
        score += finalBonus;
        if(score > best){
          best = score;
          localStorage.setItem(bestKey, String(best));
        }
        renderer.spawnParticles(eaten.x, eaten.y, '#fb7185', '+' + finalBonus);
        setTip('临时豆全收集！完成奖励 +' + finalBonus);
        setState('临时豆完成');
        rushActive = false;
        rushStep = 0;
        rushTarget = 0;
        rushUntil = 0;
        removeRushFoods();
        updateHud();
        return;
      }

      if(spawnRushBean()){
        const left = Math.max(0, Math.ceil((rushUntil - performance.now()) / 1000));
        setTip('临时豆连锁：剩余 ' + (rushTarget - rushStep) + ' 颗，' + left + ' 秒内吃到下一颗。');
        setState('临时豆连锁');
      }else{
        failRush('没有安全位置生成下一颗临时豆。');
      }
    }

    function cleanupTemporaryFoods(){
      const now = performance.now();
      if(rushActive && now > rushUntil){
        failRush('临时豆超时：连锁中断。');
        return;
      }

      const before = foods.length;
      foods = foods.filter(function(food){
        return !(food.type === 'rush' && food.expiresAt && now > food.expiresAt);
      });

      if(before !== foods.length && !rushActive){
        setTip('临时豆消失了。');
        updateHud();
      }
    }


    function turn(x, y){
      if(x + dir.x === 0 && y + dir.y === 0) return;
      nextDir = {x, y};
    }

    function unlockAudio(){
      if(soundToggle && !soundToggle.checked) return null;
      try{
        audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
        if(audioCtx.state === 'suspended') audioCtx.resume().catch(function(){});
        return audioCtx;
      }catch(e){
        return null;
      }
    }

    function beep(type){
      const ctx = unlockAudio();
      if(!ctx) return;

      try{
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        const now = ctx.currentTime + 0.012;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(0.0001, now);

        if(type === 'eat'){
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(540, now);
          osc.frequency.exponentialRampToValueAtTime(860, now + 0.09);
          gain.gain.exponentialRampToValueAtTime(0.18, now + 0.018);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
          osc.start(now); osc.stop(now + 0.2);
        }else if(type === 'rotten'){
          osc.type = 'square';
          osc.frequency.setValueAtTime(170, now);
          osc.frequency.exponentialRampToValueAtTime(120, now + 0.16);
          gain.gain.exponentialRampToValueAtTime(0.14, now + 0.018);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
          osc.start(now); osc.stop(now + 0.24);
        }else if(type === 'shield'){
          osc.type = 'sine';
          osc.frequency.setValueAtTime(620, now);
          osc.frequency.exponentialRampToValueAtTime(980, now + 0.08);
          gain.gain.exponentialRampToValueAtTime(0.16, now + 0.018);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
          osc.start(now); osc.stop(now + 0.22);
        }else if(type === 'star'){
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(740, now);
          osc.frequency.exponentialRampToValueAtTime(1180, now + 0.1);
          gain.gain.exponentialRampToValueAtTime(0.17, now + 0.018);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
          osc.start(now); osc.stop(now + 0.22);
        }else if(type === 'slow'){
          osc.type = 'sine';
          osc.frequency.setValueAtTime(460, now);
          osc.frequency.exponentialRampToValueAtTime(320, now + 0.12);
          gain.gain.exponentialRampToValueAtTime(0.13, now + 0.018);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
          osc.start(now); osc.stop(now + 0.26);
        }else if(type === 'dead'){
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(260, now);
          osc.frequency.exponentialRampToValueAtTime(74, now + 0.28);
          gain.gain.exponentialRampToValueAtTime(0.17, now + 0.018);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);
          osc.start(now); osc.stop(now + 0.36);
        }else{
          osc.type = 'sine';
          osc.frequency.setValueAtTime(420, now);
          osc.frequency.exponentialRampToValueAtTime(520, now + 0.035);
          gain.gain.exponentialRampToValueAtTime(0.12, now + 0.014);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.105);
          osc.start(now); osc.stop(now + 0.12);
        }
      }catch(e){}
    }

    function die(reason){
      dead = true;
      running = false;
      paused = true;
      beep('dead');
      leaderboard.recordTopScore(score, 'gameover');
      setState('游戏结束');
      showOverlay('游戏结束', reason + ' 得分 ' + score + '。点击屏幕重新来一局。');
      renderer.draw();
    }

    function useShield(reason){
      if(shields <= 0) return false;
      shields -= 1;
      combo = Math.max(combo, 1);
      comboUntil = performance.now() + 4500;
      beep('shield');
      setTip(reason + '，护盾已抵消。');
      setState('护盾触发');
      renderer.spawnParticles(snake[0].x, snake[0].y, '#fbbf24', '盾');
      updateHud();
      return true;
    }

    function addScore(base, food, label){
      const now = performance.now();
      combo = now <= comboUntil ? combo + 1 : 1;
      comboUntil = now + 5200;

      const multiplier = 1 + Math.min(combo - 1, 8) * 0.16;
      const gained = Math.round(base * multiplier);
      score += gained;
      if(score > best){
        best = score;
        localStorage.setItem(bestKey, String(best));
      }

      const text = combo > 1 ? '+' + gained + ' x' + combo : '+' + gained;
      renderer.spawnParticles(food.x, food.y, renderer.foodColor(food.type), text);
      setTip(label || text);
      updateHud();
      return gained;
    }

    function step(){
      if(paused || dead) return;

      cleanupTemporaryFoods();

      dir = nextDir;
      const head = {
        x: (snake[0].x + dir.x + grid) % grid,
        y: (snake[0].y + dir.y + grid) % grid
      };

      const wallIndex = walls.findIndex(w => same(w, head));
      if(wallIndex >= 0){
        if(useShield('撞墙')){
          const wall = walls.splice(wallIndex, 1)[0];
          renderer.spawnParticles(wall.x, wall.y, '#fbbf24', '');
          snake.unshift(head);
          snake.pop();
          renderer.draw();
          return;
        }
        die('撞到墙了。');
        return;
      }

      const bodyIndex = snake.findIndex(s => same(s, head));
      if(bodyIndex >= 0){
        if(useShield('咬到自己')){
          snake = [head].concat(snake.slice(0, Math.max(2, bodyIndex)));
          renderer.draw();
          return;
        }
        die('咬到自己了。');
        return;
      }

      snake.unshift(head);

      const foodIndex = foods.findIndex(f => same(f, head));
      if(foodIndex >= 0){
        const eaten = foods.splice(foodIndex, 1)[0];
        const type = eaten.type || 'normal';
        eatCount += 1;

        if(type === 'rush'){
          startOrAdvanceRush(eaten);
          snake.pop();
        }else if(type === 'clear'){
          const removed = clearAllWalls();
          const base = 42 + removed * 12;
          addScore(base, eaten, removed ? '全场清屏豆：清除 ' + removed + ' 面墙' : '全场清屏豆：场地已清空');
          beep('shield');
          setState('全场清屏');
          snake.pop();
        }else if(type === 'rotten'){
          addScore(6, eaten, '腐烂果实：远处生成墙');
          const added = addRandomWalls(3 + Math.floor(Math.random() * 2) + (currentLevel() >= 5 ? 1 : 0));
          beep('rotten');
          setState('腐烂果实：远处生成 ' + added + ' 面墙');
          snake.pop();
        }else if(type === 'shed'){
          addScore(16, eaten, '脱皮果实：后半截变成墙');
          const added = shedTailToWalls();
          beep('shed');
          setState('脱皮果实：蜕下 ' + added + ' 节');
        }else if(type === 'shield'){
          addScore(8, eaten, '护盾果实：获得 1 层护盾');
          shields = Math.min(3, shields + 1);
          beep('shield');
          setState('获得护盾');
          snake.pop();
        }else if(type === 'slow'){
          addScore(12, eaten, '缓速果实：世界慢下来');
          slowUntil = performance.now() + 7200;
          beep('slow');
          setState('缓速中');
          snake.pop();
        }else if(type === 'star'){
          combo = Math.max(combo + 1, 2);
          comboUntil = performance.now() + 6200;
          const removed = clearSomeWalls(2);
          addScore(20, eaten, removed ? '星尘：清除 ' + removed + ' 面墙' : '星尘：连击延长');
          beep('star');
          setState('星尘连击');
        }else{
          addScore(10, eaten, combo > 1 ? '连击 +1' : '普通果实');
          beep('eat');
        }

        refillFoods(false);
      }else{
        snake.pop();
        setState(fast ? '加速中' : (performance.now() < slowUntil ? '缓速中' : '游戏中'));
      }

      renderer.draw();
    }

    function currentTick(){
      let tick = normalTick - Math.min(42, (currentLevel() - 1) * 4);
      if(performance.now() < slowUntil) tick *= 1.45;
      if(fast) tick = Math.min(tick, fastTick);
      return Math.max(42, tick);
    }

    var renderer = window.SonglineCreateSnakeRenderer && window.SonglineCreateSnakeRenderer({
      canvas: canvas,
      ctx: ctx,
      getState: function(){
        return {snake:snake, foods:foods, walls:walls, particles:particles, dir:dir, shields:shields, slowUntil:slowUntil, running:running, paused:paused, dead:dead, cell:cell, grid:grid};
      },
      setParticles: function(nextParticles){ particles = nextParticles; },
      cleanupTemporaryFoods: cleanupTemporaryFoods,
      updateHud: updateHud
    });
    if(!renderer) return;
    function loop(now){
      if(destroyed) return;

      if(document.hidden){
        last = now;
        raf = requestAnimationFrame(loop);
        return;
      }

      if(!last) last = now;
      acc += now - last;
      last = now;

      const tick = currentTick();
      while(acc >= tick){
        step();
        acc -= tick;
      }

      renderer.updateParticles();
      if(particles.length || (running && !paused && !dead)){
        try{
          renderer.draw();
        }catch(err){
          console.error('[songline-snake] draw failed', err);
          setState('绘制异常，已自动恢复');
        }
      }

      raf = requestAnimationFrame(loop);
    }

    function togglePause(){
      if(!running || dead){
        reset();
        return;
      }
      paused = !paused;
      beep('tap');
      if(paused){
        setState('已暂停');
        showOverlay('暂停中', '按 Space 继续，Shift 加速。粉豆限时连锁，黑豆可清墙。');
      }else{
        setState('游戏中');
        hideOverlay();
        last = performance.now();
      }
    }

    function stageAction(){
      unlockAudio();
      if(!running || dead){
        beep('tap');
        reset();
        return;
      }
      togglePause();
    }

    function handleKeydown(event){
      const tag = (event.target && event.target.tagName || '').toLowerCase();
      if(tag === 'input' || tag === 'textarea' || tag === 'select') return;

      if(event.key === ' '){
        event.preventDefault();
        unlockAudio();
        togglePause();
        return;
      }

      if(event.key === 'Shift'){
        fast = true;
        if(running && !paused && !dead) setState('加速中');
        return;
      }

      const key = event.key.toLowerCase();
      if(key === 'arrowup' || key === 'w'){
        event.preventDefault(); turn(0, -1);
      }else if(key === 'arrowdown' || key === 's'){
        event.preventDefault(); turn(0, 1);
      }else if(key === 'arrowleft' || key === 'a'){
        event.preventDefault(); turn(-1, 0);
      }else if(key === 'arrowright' || key === 'd'){
        event.preventDefault(); turn(1, 0);
      }
    }

    function handleKeyup(event){
      if(event.key === 'Shift'){
        fast = false;
        if(running && !paused && !dead) setState('游戏中');
      }
    }

    function handleVisibility(){
      if(!document.hidden) leaderboard.fetchTopScores();
    }

    function bind(){
      if(startBtn){
        startBtn.addEventListener('click', function(){
          unlockAudio();
          beep('tap');
          reset();
        });
      }

      if(pauseBtn){
        pauseBtn.addEventListener('click', function(){
          unlockAudio();
          togglePause();
        });
      }

      if(canvas) canvas.addEventListener('click', stageAction);
      if(overlay) overlay.addEventListener('click', stageAction);

      if(soundToggle){
        soundToggle.addEventListener('change', function(){
          if(soundToggle.checked){
            unlockAudio();
            beep('tap');
          }
        });
      }

      game.querySelectorAll('[data-snake-dir]').forEach(function(btn){
        btn.addEventListener('click', function(){
          unlockAudio();
          const d = btn.getAttribute('data-snake-dir');
          if(d === 'up') turn(0, -1);
          if(d === 'down') turn(0, 1);
          if(d === 'left') turn(-1, 0);
          if(d === 'right') turn(1, 0);
          if(!running || dead) reset();
        });

        btn.addEventListener('touchstart', function(event){
          event.preventDefault();
          btn.click();
        }, {passive:false});
      });

      document.addEventListener('keydown', handleKeydown);
      document.addEventListener('keyup', handleKeyup);
      document.addEventListener('visibilitychange', handleVisibility);
      window.addEventListener('pageshow', leaderboard.fetchTopScores);
    }

    function destroy(){
      destroyed = true;
      if(raf) cancelAnimationFrame(raf);
      if(scorePoll) window.clearInterval(scorePoll);
      document.removeEventListener('keydown', handleKeydown);
      document.removeEventListener('keyup', handleKeyup);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pageshow', leaderboard.fetchTopScores);
      if(game.__songlineSnakeController === controller) delete game.__songlineSnakeController;
    }

    function initialDraw(){
      const startX = Math.floor(grid / 2);
      const startY = Math.floor(grid / 2);
      snake = [
        {x: startX + 1, y: startY},
        {x: startX, y: startY},
        {x: startX - 1, y: startY}
      ];
      foods = [];
      walls = [];
      particles = [];
      dir = {x: 1, y: 0};
      nextDir = {x: 1, y: 0};
      score = 0;
      eatCount = 0;
      combo = 0;
      shields = 0;
      slowUntil = 0;
      rushActive = false;
      rushStep = 0;
      rushTarget = 0;
      rushUntil = 0;
      refillFoods(true);
      setState('准备开始');
      showOverlay('玩法介绍', '18格棋盘；蓝豆得分；粉豆限时连锁，越后越紧；棕豆造墙；黑豆清墙；金盾抵伤。点击开始。');
      renderer.draw();
    }

    const controller = {
      game: game,
      destroyed: false,
      refreshScores: leaderboard.fetchTopScores,
      destroy: function(){
        controller.destroyed = true;
        destroy();
      }
    };

    if(syncBestBtn){
      syncBestBtn.addEventListener('click', function(){
        beep('default');
        leaderboard.syncLocalBest(true);
        syncBestBtn.blur();
      });
    }

    bestEl.textContent = String(best);
    bind();
    leaderboard.fetchTopScores().then(function(){ window.setTimeout(function(){ leaderboard.syncLocalBest(false); }, 320); });
    initialDraw();
    raf = requestAnimationFrame(loop);

    window.clearInterval(window.__songlineSnakeScorePoll);
    scorePoll = window.setInterval(function(){
      if(!document.hidden) leaderboard.fetchTopScores();
    }, 6000);
    window.__songlineSnakeScorePoll = scorePoll;

    return controller;
  }
})();
