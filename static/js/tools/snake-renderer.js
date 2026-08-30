(function(){
  'use strict';

  function createRenderer(options){
    options = options || {};
    var canvas = options.canvas;
    var ctx = options.ctx || (canvas && canvas.getContext('2d'));
    if(!canvas || !ctx || typeof options.getState !== 'function') return null;

    var snake;
    var foods;
    var walls;
    var particles;
    var dir;
    var shields;
    var slowUntil;
    var running;
    var paused;
    var dead;
    var cell;
    var grid;

    function syncState(){
      var state = options.getState();
      snake = state.snake;
      foods = state.foods;
      walls = state.walls;
      particles = state.particles;
      dir = state.dir;
      shields = state.shields;
      slowUntil = state.slowUntil;
      running = state.running;
      paused = state.paused;
      dead = state.dead;
      cell = state.cell;
      grid = state.grid;
    }
    function foodColor(type){
      if(type === 'rotten') return '#9a3412';
      if(type === 'shed') return '#a855f7';
      if(type === 'shield') return '#f59e0b';
      if(type === 'slow') return '#22c55e';
      if(type === 'star') return '#facc15';
      if(type === 'rush') return '#fb7185';
      if(type === 'clear') return '#020617';
      return '#0ea5e9';
    }

    function colorWithAlpha(color, alpha){
      alpha = Math.max(0, Math.min(1, Number(alpha) || 0));
      if(!color) return 'rgba(14,165,233,' + alpha + ')';
      if(color.charAt(0) === '#'){
        let hex = color.slice(1);
        if(hex.length === 3){
          hex = hex.split('').map(function(ch){ return ch + ch; }).join('');
        }
        const num = parseInt(hex, 16);
        if(Number.isFinite(num)){
          const r = (num >> 16) & 255;
          const g = (num >> 8) & 255;
          const b = num & 255;
          return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
        }
      }
      if(color.indexOf('rgb(') === 0){
        return color.replace('rgb(', 'rgba(').replace(')', ',' + alpha + ')');
      }
      return color;
    }

    function spawnParticles(x, y, color, label){
      syncState();
      const px = x * cell + cell / 2;
      const py = y * cell + cell / 2;
      for(let i = 0; i < 8; i++){
        const a = Math.random() * Math.PI * 2;
        const s = 0.6 + Math.random() * 1.7;
        particles.push({
          x:px,
          y:py,
          vx:Math.cos(a) * s,
          vy:Math.sin(a) * s,
          life:26 + Math.random() * 18,
          max:44,
          color:color || '#0ea5e9',
          label:i === 0 ? label : ''
        });
      }
      particles = particles.slice(-120);
      options.setParticles(particles);
    }

    function updateParticles(){
      particles = particles.filter(function(p){
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.018;
        p.life -= 1;
        return p.life > 0;
      });
      options.setParticles(particles);
    }

    function drawParticles(){
      particles.forEach(function(p){
        const alpha = Math.max(0, Math.min(1, p.life / p.max));
        ctx.save();
        ctx.globalAlpha = alpha;
        if(p.label){
          ctx.font = '700 11px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.lineWidth = Math.max(2.4, cell * .09);
          ctx.strokeStyle = 'rgba(15,23,42,.42)';
          ctx.strokeText(p.label, p.x, p.y - 8);
          ctx.fillStyle = colorWithAlpha(p.color, .86);
          ctx.fillText(p.label, p.x, p.y - 8);
        }else{
          ctx.fillStyle = colorWithAlpha(p.color, .78);
          ctx.beginPath();
          ctx.arc(p.x, p.y, 2.05, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      });
    }

    function drawStarIcon(cx, cy, radius, fill){
      ctx.save();
      ctx.fillStyle = fill || 'rgba(15,23,42,.86)';
      ctx.beginPath();
      for(let i = 0; i < 10; i++){
        const r = i % 2 === 0 ? radius : radius * .42;
        const a = -Math.PI / 2 + i * Math.PI / 5;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if(i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    function drawFoodIcon(type, fx, fy, size){
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if(type === 'rotten'){
        // v20.18.5：惩罚豆不再使用红色 X，改成更直观的警示图标。
        ctx.fillStyle = 'rgba(255,255,255,.92)';
        ctx.beginPath();
        ctx.moveTo(fx, fy - size * .24);
        ctx.lineTo(fx + size * .22, fy + size * .18);
        ctx.lineTo(fx - size * .22, fy + size * .18);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = 'rgba(15,23,42,.86)';
        ctx.lineWidth = Math.max(1.9, size * .075);
        ctx.beginPath();
        ctx.moveTo(fx, fy - size * .10);
        ctx.lineTo(fx, fy + size * .03);
        ctx.stroke();

        ctx.fillStyle = 'rgba(15,23,42,.9)';
        ctx.beginPath();
        ctx.arc(fx, fy + size * .11, Math.max(1.8, size * .035), 0, Math.PI * 2);
        ctx.fill();
      }else if(type === 'shed'){
        ctx.strokeStyle = 'rgba(255,255,255,.88)';
        ctx.lineWidth = Math.max(2.4, size * .095);
        ctx.beginPath();
        ctx.moveTo(fx, fy - size * .22);
        ctx.lineTo(fx + size * .22, fy);
        ctx.lineTo(fx, fy + size * .22);
        ctx.lineTo(fx - size * .22, fy);
        ctx.closePath();
        ctx.stroke();
      }else if(type === 'shield'){
        ctx.fillStyle = 'rgba(15,23,42,.82)';
        ctx.beginPath();
        ctx.moveTo(fx, fy - size * .25);
        ctx.lineTo(fx + size * .20, fy - size * .12);
        ctx.lineTo(fx + size * .16, fy + size * .15);
        ctx.lineTo(fx, fy + size * .28);
        ctx.lineTo(fx - size * .16, fy + size * .15);
        ctx.lineTo(fx - size * .20, fy - size * .12);
        ctx.closePath();
        ctx.fill();
      }else if(type === 'slow'){
        ctx.strokeStyle = 'rgba(15,23,42,.78)';
        ctx.lineWidth = Math.max(2.4, size * .095);
        ctx.beginPath();
        ctx.arc(fx, fy, size * .18, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        ctx.lineTo(fx, fy - size * .13);
        ctx.moveTo(fx, fy);
        ctx.lineTo(fx + size * .12, fy + size * .08);
        ctx.stroke();
      }else if(type === 'star'){
        drawStarIcon(fx, fy, size * .28, 'rgba(15,23,42,.86)');
      }else if(type === 'rush'){
        ctx.fillStyle = 'rgba(15,23,42,.86)';
        ctx.beginPath();
        ctx.moveTo(fx + size * .02, fy - size * .28);
        ctx.lineTo(fx - size * .17, fy + size * .02);
        ctx.lineTo(fx - size * .02, fy + size * .02);
        ctx.lineTo(fx - size * .08, fy + size * .28);
        ctx.lineTo(fx + size * .18, fy - size * .06);
        ctx.lineTo(fx + size * .03, fy - size * .06);
        ctx.closePath();
        ctx.fill();
      }else if(type === 'clear'){
        ctx.strokeStyle = 'rgba(226,232,240,.95)';
        ctx.lineWidth = Math.max(2.4, size * .095);
        ctx.beginPath();
        ctx.arc(fx, fy, size * .23, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(56,189,248,.85)';
        ctx.beginPath();
        ctx.moveTo(fx - size * .18, fy);
        ctx.lineTo(fx + size * .18, fy);
        ctx.moveTo(fx, fy - size * .18);
        ctx.lineTo(fx, fy + size * .18);
        ctx.stroke();
      }

      ctx.restore();
    }

    function drawFoodItem(food){
      const fx = food.x * cell + cell / 2;
      const fy = food.y * cell + cell / 2;
      const type = food.type || 'normal';
      const main = foodColor(type);
      const round = type === 'star' || type === 'rush' || type === 'clear' || type === 'shield' || type === 'slow';

      // v20.18.5：彻底收掉大面积发光，只保留小范围外圈。
      // 避免任何食物效果覆盖墙、蛇身或其他豆。
      ctx.save();
      const pad = Math.max(4, cell * .16);
      const body = cell - pad * 2;

      ctx.strokeStyle = colorWithAlpha(main, type === 'rush' ? .54 : .34);
      ctx.lineWidth = Math.max(1.8, cell * .075);
      ctx.beginPath();
      ctx.arc(fx, fy, cell * .43, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = main;
      roundedRect(food.x * cell + pad, food.y * cell + pad, body, body, round ? body / 2 : Math.max(6, body * .28));
      ctx.fill();
      ctx.restore();

      if(type === 'clear'){
        ctx.save();
        ctx.strokeStyle = 'rgba(56,189,248,.82)';
        ctx.lineWidth = Math.max(2.4, cell * .09);
        ctx.beginPath();
        ctx.arc(fx, fy, cell * .55, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(226,232,240,.92)';
        ctx.lineWidth = Math.max(1.6, cell * .06);
        ctx.beginPath();
        ctx.arc(fx, fy, cell * .38, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      if(type === 'rush' && food.expiresAt && food.spawnedAt){
        const total = Math.max(1, food.expiresAt - food.spawnedAt);
        const left = Math.max(0, food.expiresAt - performance.now());
        const ratio = Math.max(0, Math.min(1, left / total));
        ctx.save();
        ctx.strokeStyle = ratio < .32 ? 'rgba(248,113,113,.96)' : 'rgba(255,255,255,.86)';
        ctx.lineWidth = Math.max(2.4, cell * .09);
        ctx.beginPath();
        ctx.arc(fx, fy, cell * .55, -Math.PI / 2, -Math.PI / 2 + ratio * Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      drawFoodIcon(type, fx, fy, cell);
    }

    function drawFoods(){
      foods.forEach(drawFoodItem);
    }

    function drawEdgePortals(){
      ctx.save();
      ctx.strokeStyle = shields > 0 ? 'rgba(250,204,21,.42)' : 'rgba(37,99,235,.20)';
      ctx.lineWidth = shields > 0 ? 5 : 4;
      ctx.setLineDash(shields > 0 ? [8, 6] : [10, 10]);
      ctx.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);
      ctx.restore();
    }

    function drawWalls(){
      walls.forEach(function(w){
        const x = w.x * cell + 2.5;
        const y = w.y * cell + 2.5;
        const size = cell - 5;
        const isShed = w.type === 'shed';

        ctx.save();
        ctx.shadowColor = isShed ? 'rgba(168,85,247,.18)' : 'rgba(249,115,22,.18)';
        ctx.shadowBlur = 4;

        const grad = ctx.createLinearGradient(x, y, x + size, y + size);
        if(isShed){
          grad.addColorStop(0, '#581c87');
          grad.addColorStop(1, '#a855f7');
        }else{
          grad.addColorStop(0, '#020617');
          grad.addColorStop(1, '#1e293b');
        }

        ctx.fillStyle = grad;
        roundedRect(x, y, size, size, 5);
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.lineWidth = isShed ? 2 : 2.2;
        ctx.strokeStyle = isShed ? 'rgba(216,180,254,.9)' : 'rgba(251,146,60,.95)';
        roundedRect(x, y, size, size, 5);
        ctx.stroke();

        ctx.lineWidth = 1.25;
        ctx.beginPath();
        if(isShed){
          ctx.strokeStyle = 'rgba(255,255,255,.28)';
          ctx.moveTo(x + size * .25, y + size * .5);
          ctx.lineTo(x + size * .5, y + size * .25);
          ctx.lineTo(x + size * .75, y + size * .5);
          ctx.lineTo(x + size * .5, y + size * .75);
          ctx.closePath();
        }else{
          // v20.18.5：普通危险墙改用红色 X，更符合“禁止碰撞”的直觉。
          ctx.strokeStyle = 'rgba(248,113,113,.95)';
          ctx.lineWidth = 1.8;
          ctx.moveTo(x + 5, y + 5);
          ctx.lineTo(x + size - 5, y + size - 5);
          ctx.moveTo(x + 5, y + size - 5);
          ctx.lineTo(x + size - 5, y + 5);
        }
        ctx.stroke();
        ctx.restore();
      });
    }

    function drawSnake(){
      snake.forEach(function(part, index){
        const x = part.x * cell + 3;
        const y = part.y * cell + 3;
        const size = cell - 6;

        if(index === 0 && shields > 0){
          ctx.save();
          ctx.globalAlpha = 0.34;
          ctx.fillStyle = '#facc15';
          ctx.beginPath();
          ctx.arc(x + size / 2, y + size / 2, size * .78, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        ctx.fillStyle = index === 0 ? '#2563eb' : (index % 2 ? '#38bdf8' : '#0ea5e9');
        if(performance.now() < slowUntil && index > 0) ctx.fillStyle = index % 2 ? '#34d399' : '#22c55e';
        roundedRect(x, y, size, size, 7);
        ctx.fill();

        if(index === 0){
          ctx.fillStyle = 'rgba(255,255,255,.9)';
          const eyeOffsetX = dir.x !== 0 ? dir.x * 4 : 0;
          const eyeOffsetY = dir.y !== 0 ? dir.y * 4 : 0;
          ctx.beginPath();
          ctx.arc(x + size * .35 + eyeOffsetX, y + size * .36 + eyeOffsetY, 2.2, 0, Math.PI * 2);
          ctx.arc(x + size * .65 + eyeOffsetX, y + size * .36 + eyeOffsetY, 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    }

    function draw(){
      syncState();
      const w = canvas.width;
      const h = canvas.height;
      if(running && !paused && !dead) options.cleanupTemporaryFoods();
      options.updateHud();

      const bg = ctx.createLinearGradient(0, 0, w, h);
      if(document.body.classList.contains('dark') || document.documentElement.getAttribute('data-theme') === 'dark'){
        bg.addColorStop(0, '#111c2e');
        bg.addColorStop(1, '#1f2333');
      }else{
        bg.addColorStop(0, '#eaf6ff');
        bg.addColorStop(1, '#fff5e7');
      }
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = document.body.classList.contains('dark') ? 'rgba(219,234,254,.08)' : 'rgba(21,52,91,.07)';
      ctx.lineWidth = 1;
      for(let i = 1; i < grid; i++){
        const p = i * cell;
        ctx.beginPath();
        ctx.moveTo(p, 0);
        ctx.lineTo(p, h);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, p);
        ctx.lineTo(w, p);
        ctx.stroke();
      }

      drawEdgePortals();
      drawWalls();
      drawFoods();
      drawSnake();
      drawParticles();
    }

    function roundedRect(x, y, w, h, r){
      // v20.18.5：Canvas 的 arcTo 半径不能像 CSS border-radius 那样随便给 999。
      // 半径过大时会生成超出小格子的巨大弧线，导致整块棋盘被豆子颜色覆盖。
      r = Math.max(0, Math.min(Number(r) || 0, Math.abs(w) / 2, Math.abs(h) / 2));
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.arcTo(x + w, y, x + w, y + r, r);
      ctx.lineTo(x + w, y + h - r);
      ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
      ctx.lineTo(x + r, y + h);
      ctx.arcTo(x, y + h, x, y + h - r, r);
      ctx.lineTo(x, y + r);
      ctx.arcTo(x, y, x + r, y, r);
      ctx.closePath();
    }

    return {
      draw: draw,
      foodColor: foodColor,
      spawnParticles: spawnParticles,
      updateParticles: updateParticles
    };
  }

  window.SonglineCreateSnakeRenderer = createRenderer;
})();
