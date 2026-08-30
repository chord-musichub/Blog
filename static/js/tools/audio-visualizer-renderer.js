(function(){
  'use strict';

  function createRenderer(options){
    options = options || {};
    var root = options.root;
    var canvas = options.canvas;
    var ctx = options.ctx || (canvas && canvas.getContext('2d'));
    var perfBudget = options.perfBudget;
    var getAudioData = options.getAudioData;
    var updateLocalAudioMeta = options.updateLocalAudioMeta || function(){};
    if(!root || !canvas || !ctx || typeof perfBudget !== 'function') return null;

    var width = 0;
    var height = 0;
    var dpr = 1;
    var analyser = null;
    var freqData = null;
    var waveData = null;
    var raf = 0;
    var paletteHue = 202;
    var lastBassPulse = 0;
    var lastBassEnergy = 0;
    var bassAverage = 0;
    var shockwaves = [];
    var sparks = [];
    var bgFlow = {bass:0, mid:0, high:0, energy:0};
    var ambientGhosts = [];
    var nextAmbientGhostAt = 0;
    var lastResizeW = 0;
    var lastResizeH = 0;
    var lastResizeDpr = 0;
    var resizeDirty = true;
    var lastDrawAt = 0;
    var visualClockMs = 0;
    var visualClockSynced = false;
    var lastVisualClockAt = performance.now();
    var visualResumeUntil = 0;
    var atmosphereScale = 1;
    var visualEnergy = {bass:0, mid:0, high:0};
    var visualFreqData = null;
    var ringGeometryCache = {};
    var atmosphereCanvas = document.createElement('canvas');
    var atmosphereCtx = atmosphereCanvas.getContext('2d');
    var atmosphereReady = false;
    var lastAtmosphereAt = 0;
    function resize(force){
      if(!force && !resizeDirty && width && height) return;

      var rect = canvas.getBoundingClientRect();
      var nextW = Math.max(320, Math.floor(rect.width || window.innerWidth || 1280));
      var nextH = Math.max(320, Math.floor(rect.height || window.innerHeight || 720));
      var budget = perfBudget();
      var nextDpr = Math.min(budget.dpr, window.devicePixelRatio || 1);
      var nextAtmosphereScale = budget.atmosphereScale || 1;

      if(!force && nextW === lastResizeW && nextH === lastResizeH &&
        Math.abs(nextDpr - lastResizeDpr) < 0.01 && Math.abs(nextAtmosphereScale - atmosphereScale) < 0.01){
        resizeDirty = false;
        return;
      }

      width = nextW;
      height = nextH;
      dpr = nextDpr;
      atmosphereScale = nextAtmosphereScale;
      lastResizeW = nextW;
      lastResizeH = nextH;
      lastResizeDpr = nextDpr;
      resizeDirty = false;

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      if(atmosphereCanvas){
        atmosphereCanvas.width = Math.max(1, Math.floor(width * dpr * atmosphereScale));
        atmosphereCanvas.height = Math.max(1, Math.floor(height * dpr * atmosphereScale));
        if(atmosphereCtx) atmosphereCtx.setTransform(dpr * atmosphereScale, 0, 0, dpr * atmosphereScale, 0, 0);
        atmosphereReady = false;
      }
    }

    function sharedVisualNow(){
      try{
        if(window.SonglineVisualClock && typeof window.SonglineVisualClock.now === 'function'){
          return window.SonglineVisualClock.now();
        }
      }catch(e){}
      return null;
    }

    function getVisualTime(now){
      now = now || performance.now();
      var shared = sharedVisualNow();
      if(shared != null){
        // 直接使用全站统一视觉时钟。
        // 旧版会从上次记录位置缓慢追向实时位置，进入页面第一帧容易显示旧相位，随后跳到实时相位造成偏移感。
        visualClockMs = shared * 1000;
        visualClockSynced = true;
        lastVisualClockAt = now;
        return shared;
      }

      if(document.hidden){
        lastVisualClockAt = now;
        return visualClockMs / 1000;
      }

      var dt = Math.max(0, Math.min(34, now - lastVisualClockAt));
      lastVisualClockAt = now;

      if(now < visualResumeUntil){
        var remain = Math.max(0, visualResumeUntil - now) / 620;
        dt *= 0.48 + (1 - remain) * 0.52;
      }

      if(!visualClockSynced){ visualClockSynced = true; }
      visualClockMs += dt;
      return visualClockMs / 1000;
    }

    function syncVisualPhase(){
      var shared = sharedVisualNow();
      if(shared != null){
        visualClockMs = shared * 1000;
        visualClockSynced = true;
      }
      lastVisualClockAt = performance.now();
    }

    function softenAnimationResume(){
      syncVisualPhase();
      lastDrawAt = 0;
      resizeDirty = true;
      // 不再强制清空氛围缓存，避免返回页面时背景层重绘造成突跳。
      visualResumeUntil = performance.now() + 360;
      root.classList.add('is-av-soft-resume');
      window.clearTimeout(root.__avSoftResumeTimer);
      root.__avSoftResumeTimer = window.setTimeout(function(){
        root.classList.remove('is-av-soft-resume');
      }, 720);
    }

    function getEnergy(){
      var audioData = typeof getAudioData === 'function' ? getAudioData() : null;
      analyser = audioData && audioData.analyser;
      freqData = audioData && audioData.freqData;
      waveData = audioData && audioData.waveData;
      if(analyser && freqData){
        analyser.getByteFrequencyData(freqData);
        analyser.getByteTimeDomainData(waveData);
        if(!visualFreqData || visualFreqData.length !== freqData.length) visualFreqData = new Float32Array(freqData.length);
        for(var vf = 0; vf < freqData.length; vf++){
          visualFreqData[vf] += (freqData[vf] - visualFreqData[vf]) * 0.26;
        }
      }

      var now = performance.now();
      var t = getVisualTime(now);
      var bass = 0;
      var mid = 0;
      var high = 0;

      if(analyser && freqData){
        var bassEnd = Math.max(4, Math.floor(freqData.length * 0.08));
        var midEnd = Math.floor(freqData.length * 0.36);

        for(var i = 0; i < freqData.length; i++){
          if(i < bassEnd) bass += freqData[i];
          else if(i < midEnd) mid += freqData[i];
          else high += freqData[i];
        }

        bass = bass / bassEnd / 255;
        mid = mid / Math.max(1, midEnd - bassEnd) / 255;
        high = high / Math.max(1, freqData.length - midEnd) / 255;
      }else{
        bass = 0.18 + Math.sin(t * 1.6) * 0.08;
        mid = 0.16 + Math.sin(t * 2.1 + 1.5) * 0.07;
        high = 0.14 + Math.sin(t * 2.8 + 2.2) * 0.05;
      }

      bassAverage = bassAverage ? bassAverage * 0.925 + bass * 0.075 : bass;
      var bassRise = bass - lastBassEnergy;
      var dynamicGate = Math.max(0.34, bassAverage + 0.11);
      var beatHit = bass > dynamicGate && bassRise > 0.035 && now - lastBassPulse > 145;

      if(beatHit){
        var budget = perfBudget();
        lastBassPulse = now;
        var strength = Math.max(0.28, Math.min(1, bass + bassRise * 2.2));
        shockwaves.push({
          born:now,
          hue:paletteHue,
          strength:strength,
          speed:0.72 + strength * 0.62 + Math.random() * 0.18,
          life:0.58 + (1 - Math.min(1, strength)) * 0.32 + Math.random() * 0.22
        });
        if(shockwaves.length > (budget.low ? 3 : budget.mid ? 5 : 7)) shockwaves.splice(0, shockwaves.length - (budget.low ? 3 : budget.mid ? 5 : 7));
        var sparkCount = (budget.low ? 3 : 6) + Math.round(strength * (budget.low ? 5 : budget.mid ? 8 : 10));
        if(sparks.length > (budget.low ? 34 : budget.mid ? 54 : 72)) sparks.splice(0, sparks.length - (budget.low ? 34 : budget.mid ? 54 : 72));
        for(var spark = 0; spark < sparkCount; spark++){
          sparks.push({
            born:now,
            angle:Math.random() * Math.PI * 2,
            speed:0.18 + Math.random() * 0.62 + strength * 0.22,
            dist:0,
            hue:(paletteHue + Math.random() * 100) % 360,
            alpha:0.42 + Math.random() * 0.34
          });
        }
      }
      lastBassEnergy = bass;

      visualEnergy.bass += (bass - visualEnergy.bass) * 0.23;
      visualEnergy.mid += (mid - visualEnergy.mid) * 0.20;
      visualEnergy.high += (high - visualEnergy.high) * 0.18;

      return {
        bass:Math.max(0, Math.min(1, visualEnergy.bass)),
        mid:Math.max(0, Math.min(1, visualEnergy.mid)),
        high:Math.max(0, Math.min(1, visualEnergy.high)),
        rawBass:Math.max(0, Math.min(1, bass)),
        t:t
      };
    }

    function sampleBand(ratio, e){
      ratio = Math.max(0, Math.min(1, ratio));
      var source = visualFreqData || freqData;
      if(analyser && source) return source[Math.floor(ratio * (source.length - 1))] / 255;
      return 0.3 + Math.sin(e.t * 2.1 + ratio * 26) * 0.18;
    }

    function getRingGeometry(bars){
      var cached = ringGeometryCache[bars];
      if(cached) return cached;
      var cos = new Float32Array(bars);
      var sin = new Float32Array(bars);
      for(var i = 0; i < bars; i++){
        var angle = i / bars * Math.PI * 2 - Math.PI / 2;
        cos[i] = Math.cos(angle);
        sin[i] = Math.sin(angle);
      }
      cached = {cos:cos, sin:sin};
      ringGeometryCache[bars] = cached;
      return cached;
    }

    function smoothstep01(x){
      x = Math.max(0, Math.min(1, x));
      return x * x * (3 - 2 * x);
    }

    function updateBgFlow(e){
      bgFlow.bass += (e.bass - bgFlow.bass) * 0.06;
      bgFlow.mid += (e.mid - bgFlow.mid) * 0.055;
      bgFlow.high += (e.high - bgFlow.high) * 0.05;
      var target = Math.min(1, e.bass * 0.52 + e.mid * 0.31 + e.high * 0.24);
      bgFlow.energy += (target - bgFlow.energy) * 0.045;
      return bgFlow;
    }

    function randomAmbientGhost(){
      var side = Math.floor(Math.random() * 4);
      var marginX = width * (0.11 + Math.random() * 0.16);
      var marginY = height * (0.14 + Math.random() * 0.18);
      var x = side === 0 ? marginX : side === 1 ? width - marginX : width * (0.18 + Math.random() * 0.64);
      var y = side === 2 ? marginY : side === 3 ? height - marginY : height * (0.20 + Math.random() * 0.60);
      var type = ['arc','cluster','scan'][Math.floor(Math.random() * 3)];
      return {
        born: performance.now(),
        life: 1600 + Math.random() * 2200,
        x: x,
        y: y,
        rot: Math.random() * Math.PI * 2,
        size: 20 + Math.random() * 48,
        driftX: (Math.random() - 0.5) * 10,
        driftY: (Math.random() - 0.5) * 10,
        type: type,
        hue: (paletteHue + 70 + Math.random() * 140) % 360,
        alpha: 0.10 + Math.random() * 0.12,
        count: 3 + Math.floor(Math.random() * 3)
      };
    }

    function drawAmbientGhosts(e){
      var now = performance.now();
      var budget = perfBudget();
      if(now >= nextAmbientGhostAt && ambientGhosts.length < budget.ghostMax){
        ambientGhosts.push(randomAmbientGhost());
        nextAmbientGhostAt = now + (budget.low ? 1700 : 900) + Math.random() * (budget.low ? 2600 : 1800) + (1 - bgFlow.energy) * 500;
      }
      ambientGhosts = ambientGhosts.filter(function(g){ return now - g.born < g.life; });
      if(!ambientGhosts.length) return;

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ambientGhosts.forEach(function(g, index){
        var age = (now - g.born) / g.life;
        var fade = smoothstep01(Math.min(1, age / 0.22)) * (1 - smoothstep01(Math.max(0, (age - 0.68) / 0.32)));
        var pulse = 0.94 + Math.sin(e.t * (0.7 + index * 0.03) + index) * 0.06;
        var alpha = g.alpha * fade * pulse * (0.88 + bgFlow.high * 0.22);
        var x = g.x + g.driftX * age;
        var y = g.y + g.driftY * age;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(g.rot + age * 0.08);
        ctx.strokeStyle = 'hsla(' + g.hue + ', 100%, 80%, ' + alpha + ')';
        ctx.fillStyle = 'hsla(' + g.hue + ', 100%, 82%, ' + (alpha * 0.62) + ')';
        ctx.lineWidth = 1.05;

        if(g.type === 'arc'){
          ctx.beginPath();
          ctx.arc(0, 0, g.size, 0.22 + age * 0.6, 1.46 + age * 0.6);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(0, 0, g.size * 0.72, 3.18 - age * 0.4, 4.06 - age * 0.4);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(g.size * 0.86, 0);
          ctx.lineTo(g.size * 1.26, 0);
          ctx.stroke();
        } else if(g.type === 'cluster'){
          for(var i = 0; i < g.count; i++){
            var px = (i - (g.count - 1) / 2) * g.size * 0.28;
            var py = Math.sin(age * 3.2 + i) * g.size * 0.09;
            ctx.beginPath();
            ctx.arc(px, py, 1.8 + i * 0.45, 0, Math.PI * 2);
            ctx.fill();
            if(i < g.count - 1){
              ctx.beginPath();
              ctx.moveTo(px, py);
              ctx.lineTo(px + g.size * 0.28, Math.sin(age * 3.2 + i + 1) * g.size * 0.09);
              ctx.stroke();
            }
          }
        } else {
          for(var j = 0; j < 4; j++){
            var yy = (j - 1.5) * g.size * 0.18;
            ctx.beginPath();
            ctx.moveTo(-g.size * 0.7, yy);
            ctx.lineTo(g.size * 0.7, yy);
            ctx.stroke();
          }
          ctx.beginPath();
          ctx.roundRect(-g.size * 0.84, -g.size * 0.44, g.size * 1.68, g.size * 0.88, 999);
          ctx.stroke();
        }
        ctx.restore();
      });
      ctx.restore();
    }

  // REALTIME_AUDIO_SMOOTH_ORBIT_PLANETS v20.20.6：实时音频平滑驱动轨道星体。
    function drawBackground(e){
      var flow = updateBgFlow(e);
      paletteHue = (paletteHue + 0.08 + flow.bass * 0.22 + flow.mid * 0.08) % 360;

      var cx = width * 0.5;
      var cy = height * 0.52;
      var bg = ctx.createLinearGradient(0, 0, width, height);
      bg.addColorStop(0, 'hsl(' + ((paletteHue + 215) % 360) + ' 82% ' + (7 + flow.bass * 5) + '%)');
      bg.addColorStop(0.48, 'hsl(' + ((paletteHue + 270) % 360) + ' 78% ' + (9 + flow.mid * 6) + '%)');
      bg.addColorStop(1, 'hsl(' + ((paletteHue + 325) % 360) + ' 86% ' + (6 + flow.high * 6) + '%)');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      var energy = flow.energy;
      var budget = perfBudget();
      var starCount = budget.stars;

      ctx.save();
      ctx.globalCompositeOperation = 'screen';

      for(var p = 0; p < starCount; p++){
        var seedA = Math.sin(p * 12.9898) * 43758.5453;
        var seedB = Math.sin(p * 78.233) * 24634.6345;
        var seedC = Math.sin(p * 37.719) * 13541.313;
        var seedD = Math.sin(p * 91.17) * 97531.121;
        var u = seedA - Math.floor(seedA);
        var v = seedB - Math.floor(seedB);
        var q = seedC - Math.floor(seedC);
        var d = seedD - Math.floor(seedD);

        var baseX = u * width;
        var baseY = v * height;
        var orbitA = 7 + q * 24;
        var orbitB = 6 + d * 20;
        var speed = 0.032 + q * 0.048 + energy * 0.010;
        var phase = e.t * speed + p * 0.73;
        var driftX = Math.cos(phase * (0.92 + d * 0.24)) * orbitA + Math.sin(e.t * 0.05 + p * 0.31) * (3 + energy * 4);
        var driftY = Math.sin(phase * (0.84 + q * 0.18)) * orbitB + Math.cos(e.t * 0.045 + p * 0.27) * (2.5 + energy * 3.5);
        var swirl = Math.sin(e.t * 0.02 + p * 0.13) * (2 + q * 6);
        var x = baseX + driftX + swirl;
        var y = baseY + driftY + Math.cos(e.t * 0.018 + p * 0.11) * (1 + d * 5);

        if(x < -20) x += width + 40;
        if(x > width + 20) x -= width + 40;
        if(y < -20) y += height + 40;
        if(y > height + 20) y -= height + 40;

        var band = sampleBand((q + d * 0.37) % 1, e);
        var twinkle = 0.58 + 0.42 * Math.sin(e.t * (0.45 + q * 0.35) + p * 0.49);
        var alpha = (0.11 + q * 0.18 + band * 0.10 + flow.high * 0.04) * twinkle;
        var radius = 0.55 + q * 1.2 + band * 0.65;
        var hue = (paletteHue + 90 + q * 120) % 360;

        if((p % 11) === 0){
          var glowRadius = radius * (4.2 + band * 2.6);
          var starGlow = ctx.createRadialGradient(x, y, 0, x, y, glowRadius);
          starGlow.addColorStop(0, 'hsla(' + hue + ', 100%, 80%, ' + Math.min(0.34, alpha * 0.72) + ')');
          starGlow.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = starGlow;
          ctx.beginPath();
          ctx.arc(x, y, glowRadius * (1.42 + energy * 0.18), 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.fillStyle = 'hsla(' + hue + ', 100%, ' + (78 + band * 12) + '%, ' + Math.min(0.84, alpha) + ')';
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      for(var layer = 0; layer < 2; layer++){
        ctx.strokeStyle = 'hsla(' + ((paletteHue + 110 + layer * 28) % 360) + ', 95%, 76%, ' + (0.024 + energy * 0.014) + ')';
        ctx.lineWidth = 1.0 + layer * 0.35;
        ctx.setLineDash([18 + layer * 8, 16 + layer * 10]);
        ctx.lineDashOffset = -e.t * (2.4 + layer * 1.8 + energy * 1.8);
        ctx.beginPath();
        ctx.ellipse(cx, cy, width * (0.28 + layer * 0.12), height * (0.18 + layer * 0.09), -0.16 + layer * 0.08, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.restore();
    }

    function drawRing(e){
      var cx = width * 0.5;
      var cy = height * 0.52;
      var minSide = Math.min(width, height);
      var baseR = minSide * (0.17 + e.bass * 0.04);
      var budget = perfBudget();

      var glow = ctx.createRadialGradient(cx, cy, baseR * 0.15, cx, cy, baseR * (4.1 + e.bass * 1.6));
      glow.addColorStop(0, 'hsla(' + paletteHue + ', 96%, 68%, ' + (0.34 + e.bass * 0.28) + ')');
      glow.addColorStop(0.44, 'hsla(' + ((paletteHue + 60) % 360) + ', 94%, 62%, ' + (0.13 + e.mid * 0.18) + ')');
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);

      var bars = budget.ringBars;
      var geom = getRingGeometry(bars);
      var glowStep = budget.ringGlowStep || 4;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.lineCap = 'round';
      ctx.globalCompositeOperation = 'screen';

      // 昂贵的 shadowBlur 不再 196 条全量逐条跑，改成抽样光晕 + 全量清晰条。
      ctx.shadowBlur = 12;
      for(var gi = 0; gi < bars; gi += glowStep){
        var gr = gi / bars;
        var gb = sampleBand(gr, e);
        var glen = 20 + gb * minSide * 0.25 + e.bass * 12;
        var ginner = baseR + Math.sin(e.t * 1.4 + gi * 0.09) * 4;
        var gouter = ginner + glen;
        var ghue = (paletteHue + gi * 1.35) % 360;
        ctx.shadowColor = 'hsla(' + ghue + ', 96%, 68%, ' + (0.12 + gb * 0.14) + ')';
        ctx.strokeStyle = 'hsla(' + ghue + ', 96%, ' + (62 + gb * 18) + '%, ' + (0.18 + gb * 0.22) + ')';
        ctx.lineWidth = 3.2 + gb * 4.2 + e.bass * 1.1;
        ctx.beginPath();
        ctx.moveTo(geom.cos[gi] * ginner, geom.sin[gi] * ginner);
        ctx.lineTo(geom.cos[gi] * gouter, geom.sin[gi] * gouter);
        ctx.stroke();
      }

      ctx.shadowBlur = 0;
      for(var i = 0; i < bars; i++){
        var ratio = i / bars;
        var bin = sampleBand(ratio, e);
        var len = 20 + bin * minSide * 0.25 + e.bass * 12;
        var inner = baseR + Math.sin(e.t * 1.4 + i * 0.09) * 4;
        var outer = inner + len;
        var hue = (paletteHue + i * 1.35) % 360;

        ctx.strokeStyle = 'hsla(' + hue + ', 96%, ' + (60 + bin * 20) + '%, ' + (0.36 + bin * 0.38) + ')';
        ctx.lineWidth = 1.85 + bin * 4.75 + e.bass * 1.18;
        ctx.beginPath();
        ctx.moveTo(geom.cos[i] * inner, geom.sin[i] * inner);
        ctx.lineTo(geom.cos[i] * outer, geom.sin[i] * outer);
        ctx.stroke();
      }

      ctx.strokeStyle = 'rgba(255,255,255,.72)';
      ctx.lineWidth = 1.55;
      ctx.beginPath();
      ctx.arc(0, 0, baseR, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255,255,255,.11)';
      ctx.lineWidth = 12 + e.bass * 18;
      ctx.beginPath();
      ctx.arc(0, 0, baseR * (1.12 + e.bass * 0.08), 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();
    }


    function drawLightBeams(e){
      var cx = width * .5;
      var cy = height * .52;
      var beams = perfBudget().beams;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.globalCompositeOperation = 'screen';
      for(var i = 0; i < beams; i++){
        var ratio = i / beams;
        var angle = ratio * Math.PI * 2 + e.t * .12;
        var bin = sampleBand(ratio, e);
        var len = Math.min(width, height) * (.30 + bin * .22 + e.bass * .08);
        var grad = ctx.createLinearGradient(0, 0, Math.cos(angle) * len, Math.sin(angle) * len);
        grad.addColorStop(0, 'hsla(' + ((paletteHue + i * 10) % 360) + ', 98%, 72%, .30)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.strokeStyle = grad;
        ctx.lineWidth = 10 + bin * 28;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * 80, Math.sin(angle) * 80);
        ctx.lineTo(Math.cos(angle) * len, Math.sin(angle) * len);
        ctx.stroke();
      }
      ctx.restore();
    }

    function drawShockwaves(e){
      var now = performance.now();
      var cx = width * .5;
      var cy = height * .52;
      var maxR = Math.min(width, height) * .48;

      ctx.save();
      ctx.globalCompositeOperation = 'screen';

      shockwaves = shockwaves.filter(function(w){
        var age = (now - w.born) / 1000;
        return age < (w.life || 0.9);
      });

      shockwaves.forEach(function(w){
        var age = (now - w.born) / 1000;
        var life = w.life || 0.9;
        var phase = Math.max(0, Math.min(1, age / life));
        var r = maxR * Math.pow(phase, 0.68) * (w.speed || 1);
        var alpha = Math.max(0, 1 - phase) * (.16 + w.strength * .30);
        ctx.strokeStyle = 'hsla(' + w.hue + ', 96%, 66%, ' + alpha + ')';
        ctx.lineWidth = 1.2 + w.strength * 5.6;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      });

      sparks = sparks.filter(function(s){
        var age = (now - s.born) / 1000;
        return age < 1.05;
      });

      sparks.forEach(function(s){
        var age = (now - s.born) / 1000;
        s.dist += s.speed * (2 + e.bass * 8);
        var r = Math.min(width, height) * (.18 + s.dist * .006);
        var x = cx + Math.cos(s.angle) * r;
        var y = cy + Math.sin(s.angle) * r;
        var alpha = s.alpha * Math.max(0, 1 - age / 1.05) * 0.94;
        ctx.fillStyle = 'hsla(' + s.hue + ', 96%, 70%, ' + alpha + ')';
        ctx.beginPath();
        ctx.arc(x, y, 1.6 + e.high * 3, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.restore();
    }

    function drawPulseCore(e){
      var cx = width * 0.5;
      var cy = height * 0.52;
      var minSide = Math.min(width, height);
      var baseR = minSide * (0.098 + e.bass * 0.032);

      ctx.save();
      ctx.translate(cx, cy);
      ctx.globalCompositeOperation = 'screen';

      var core = ctx.createRadialGradient(0, 0, baseR * 0.12, 0, 0, baseR * 2.7);
      core.addColorStop(0, 'hsla(' + ((paletteHue + 18) % 360) + ', 98%, 78%, ' + (0.90 + e.high * 0.08) + ')');
      core.addColorStop(0.26, 'hsla(' + paletteHue + ', 96%, 66%, ' + (0.52 + e.bass * 0.20) + ')');
      core.addColorStop(0.62, 'hsla(' + ((paletteHue + 72) % 360) + ', 98%, 60%, ' + (0.18 + e.mid * 0.12) + ')');
      core.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(0, 0, baseR * 2.7, 0, Math.PI * 2);
      ctx.fill();

      for(var j = 0; j < 3; j++){
        var rr = baseR * (1.15 + j * 0.34 + e.bass * 0.08);
        ctx.strokeStyle = 'hsla(' + ((paletteHue + j * 34) % 360) + ', 98%, 70%, ' + (0.34 - j * 0.07) + ')';
        ctx.lineWidth = 2.8 - j * 0.45;
        ctx.shadowBlur = 14 + j * 4;
        ctx.shadowColor = 'hsla(' + ((paletteHue + j * 34) % 360) + ', 98%, 70%, .28)';
        ctx.beginPath();
        ctx.arc(0, 0, rr, e.t * (0.46 + j * 0.1), e.t * (0.46 + j * 0.1) + Math.PI * (0.65 + e.mid * 0.12));
        ctx.stroke();
      }

      for(var k = 0; k < 10; k++){
        var ang = e.t * 0.65 + (Math.PI * 2 * k / 10);
        var r1 = baseR * 1.45;
        var r2 = baseR * (1.95 + e.high * 0.22);
        ctx.strokeStyle = 'hsla(' + ((paletteHue + 140 + k * 7) % 360) + ', 100%, 76%, ' + (0.22 + e.high * 0.10) + ')';
        ctx.lineWidth = 1.5 + e.high * 1.1;
        ctx.beginPath();
        ctx.moveTo(Math.cos(ang) * r1, Math.sin(ang) * r1);
        ctx.lineTo(Math.cos(ang) * r2, Math.sin(ang) * r2);
        ctx.stroke();
      }

      ctx.restore();
    }


    function perimeterOrbitConfig(){
      var budget = perfBudget();
      var os = budget.orbitScale;
      return [
        { rx: width * 0.28 * os, ry: height * 0.18 * os, rot: -0.16, speed: 0.18, count: budget.low ? 2 : 3, hueOffset: 90 },
        { rx: width * 0.36 * os, ry: height * 0.24 * os, rot: 0.10, speed: -0.14, count: budget.low ? 3 : 4, hueOffset: 130 },
        { rx: width * 0.43 * os, ry: height * 0.30 * os, rot: -0.08, speed: 0.11, count: budget.low ? 2 : 3, hueOffset: 170 }
      ];
    }

    function drawPerimeterOrbitals(e, mode){
      mode = mode || 'all';
      var drawTracks = mode === 'all' || mode === 'tracks';
      var drawPlanets = mode === 'all' || mode === 'planets';
      var cx = width * 0.5;
      var cy = height * 0.52;
      var orbits = perimeterOrbitConfig();

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.translate(cx, cy);

      orbits.forEach(function(orbit, orbitIndex){
        ctx.save();
        ctx.rotate(orbit.rot);

        if(drawTracks){
          ctx.strokeStyle = 'hsla(' + ((paletteHue + orbit.hueOffset) % 360) + ', 90%, 74%, .075)';
          ctx.lineWidth = 1.15;
          ctx.setLineDash([10, 14]);
          ctx.beginPath();
          ctx.ellipse(0, 0, orbit.rx, orbit.ry, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);

          for(var seg = 0; seg < 3; seg++){
            var segStart = e.t * (0.12 + orbitIndex * 0.03) + seg * 2.18;
            var segEnd = segStart + 0.62 + e.mid * 0.18;
            ctx.strokeStyle = 'hsla(' + ((paletteHue + orbit.hueOffset + seg * 18) % 360) + ', 100%, 78%, ' + (0.14 + e.high * 0.06) + ')';
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.ellipse(0, 0, orbit.rx, orbit.ry, 0, segStart, segEnd);
            ctx.stroke();
          }
        }

        if(drawPlanets){
          for(var i = 0; i < orbit.count; i++){
            var ratio = (i + 1) / orbit.count;
            var band = sampleBand((orbitIndex * 0.28 + ratio * 0.6) % 1, e);
            var a = e.t * orbit.speed + ratio * Math.PI * 2 + orbitIndex * 0.8;
            var x = Math.cos(a) * orbit.rx;
            var y = Math.sin(a) * orbit.ry;
            var size = 3.4 + band * 4.2;
            var hue = (paletteHue + orbit.hueOffset + i * 24) % 360;

            // v20.20.6: 小星球从缓存层拆出来，每帧只绘制少量节点，避免随 atmosphereInterval 一卡一卡跳。
            ctx.strokeStyle = 'hsla(' + hue + ', 96%, 78%, ' + (0.12 + band * 0.10) + ')';
            ctx.lineWidth = 1.0;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a - 0.06) * orbit.rx * 0.94, Math.sin(a - 0.06) * orbit.ry * 0.94);
            ctx.lineTo(x, y);
            ctx.stroke();

            var glow = ctx.createRadialGradient(x, y, 0, x, y, size * 2.8);
            glow.addColorStop(0, 'hsla(' + hue + ', 100%, 82%, ' + (0.82 + band * 0.08) + ')');
            glow.addColorStop(0.55, 'hsla(' + ((hue + 34) % 360) + ', 100%, 68%, ' + (0.22 + band * 0.16) + ')');
            glow.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(x, y, size * 2.8, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = 'hsla(' + hue + ', 100%, 88%, ' + (0.92 + band * 0.06) + ')';
            ctx.beginPath();
            ctx.arc(x, y, size * 0.62, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();
      });
      ctx.restore();
    }

    function drawSideRhythm(e){
      var groups = perfBudget().sideGroups;
      var baseX = Math.max(26, width * 0.048);
      var usableH = height * 0.44;
      var top = height * 0.28;

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for(var i = 0; i < groups; i++){
        var band = sampleBand(i / groups, e);
        var barH = 20 + band * usableH * 0.22;
        var y = top + i * ((usableH - 20) / Math.max(1, groups - 1));
        var hue = (paletteHue + 32 + i * 14) % 360;
        var widthNow = 2.8 + band * 4.2;

        var leftGrad = ctx.createLinearGradient(baseX, y - barH * 0.5, baseX + widthNow, y + barH * 0.5);
        leftGrad.addColorStop(0, 'hsla(' + hue + ', 100%, 76%, 0)');
        leftGrad.addColorStop(0.65, 'hsla(' + hue + ', 100%, 76%, ' + (0.14 + band * 0.12) + ')');
        leftGrad.addColorStop(1, 'hsla(' + ((hue + 28) % 360) + ', 100%, 82%, ' + (0.34 + band * 0.16) + ')');
        ctx.fillStyle = leftGrad;
        ctx.beginPath();
        ctx.roundRect(baseX, y - barH * 0.5, widthNow, barH, 999);
        ctx.fill();

        var rx0 = width - baseX - widthNow;
        var rightGrad = ctx.createLinearGradient(rx0, y - barH * 0.5, rx0 + widthNow, y + barH * 0.5);
        rightGrad.addColorStop(0, 'hsla(' + ((hue + 28) % 360) + ', 100%, 82%, ' + (0.34 + band * 0.16) + ')');
        rightGrad.addColorStop(0.35, 'hsla(' + hue + ', 100%, 76%, ' + (0.14 + band * 0.12) + ')');
        rightGrad.addColorStop(1, 'hsla(' + hue + ', 100%, 76%, 0)');
        ctx.fillStyle = rightGrad;
        ctx.beginPath();
        ctx.roundRect(rx0, y - barH * 0.5, widthNow, barH, 999);
        ctx.fill();

        ctx.strokeStyle = 'hsla(' + hue + ', 100%, 80%, ' + (0.12 + band * 0.12) + ')';
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.moveTo(baseX + widthNow + 8, y);
        ctx.lineTo(baseX + widthNow + 28 + band * 18, y);
        ctx.moveTo(width - baseX - widthNow - 8, y);
        ctx.lineTo(width - baseX - widthNow - 28 - band * 18, y);
        ctx.stroke();
      }
      ctx.restore();
    }

    function drawCornerTrails(e){
      var corners = [
        [width * 0.14, height * 0.16, 1, 1],
        [width * 0.86, height * 0.16, -1, 1],
        [width * 0.14, height * 0.86, 1, -1],
        [width * 0.86, height * 0.86, -1, -1]
      ];
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      corners.forEach(function(c, idx){
        var cx = c[0], cy = c[1], dir = c[2], vertical = c[3];
        for(var t = 0; t < 2; t++){
          var band = sampleBand(((idx * 2 + t) % 10) / 10, e);
          var phase = e.t * (0.34 + t * 0.05) + idx * 0.8;
          ctx.strokeStyle = 'hsla(' + ((paletteHue + idx * 30 + t * 16) % 360) + ', 100%, 78%, ' + (0.10 + band * 0.08) + ')';
          ctx.lineWidth = 1.2 + band * 1.0;
          ctx.beginPath();
          ctx.moveTo(cx + Math.sin(phase) * 6, cy + Math.cos(phase * 0.65) * 6);
          ctx.bezierCurveTo(
            cx + dir * (38 + t * 14), cy + vertical * (-18 + t * 10),
            cx + dir * (76 + t * 18), cy + vertical * (10 + Math.sin(phase) * 12),
            cx + dir * (112 + t * 22), cy + vertical * (28 + Math.cos(phase) * 12)
          );
          ctx.stroke();
        }
      });
      ctx.restore();
    }

    function drawDualWave(e){
      if(!(waveData && analyser)) return;
      var budget = perfBudget();
      var step = Math.max(1, Math.floor(waveData.length / budget.wavePoints));
      ctx.save();
      ctx.globalCompositeOperation = 'screen';

      var grad = ctx.createLinearGradient(0, height * 0.68, 0, height * 0.95);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(.18, 'hsla(' + paletteHue + ', 100%, 72%, .10)');
      grad.addColorStop(.72, 'hsla(' + ((paletteHue + 72) % 360) + ', 100%, 66%, .20)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');

      ctx.strokeStyle = grad;
      ctx.lineWidth = 8 + e.bass * 5;
      ctx.beginPath();
      for(var i = 0; i < waveData.length; i += step){
        var x = i / Math.max(1, waveData.length - 1) * width;
        var y = height * 0.82 + ((waveData[i] - 128) / 128) * (48 + e.bass * 54);
        if(i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255,255,255,.26)';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      for(var m = 0; m < waveData.length; m += step){
        var mx = m / Math.max(1, waveData.length - 1) * width;
        var my = height * 0.74 - ((waveData[m] - 128) / 128) * (20 + e.mid * 24);
        if(m === 0) ctx.moveTo(mx, my);
        else ctx.lineTo(mx, my);
      }
      ctx.stroke();
      ctx.restore();
    }

    function drawWave(e){
      if(waveData && analyser){
        var budget = perfBudget();
        var step = Math.max(1, Math.floor(waveData.length / budget.wavePoints));
        ctx.save();
        ctx.globalAlpha = 0.92;
        ctx.strokeStyle = 'rgba(255,255,255,.99)';
        ctx.lineWidth = 3.1;
        ctx.shadowBlur = 13;
        ctx.shadowColor = 'rgba(255,255,255,.22)';
        ctx.beginPath();

        for(var w = 0; w < waveData.length; w += step){
          var x = w / Math.max(1, waveData.length - 1) * width;
          var y = height * 0.82 + ((waveData[w] - 128) / 128) * (46 + e.bass * 48);
          if(w === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }

        ctx.stroke();
        ctx.restore();
      }
    }

    function drawCachedAtmosphere(e, now, budget){
      var mainCtx = ctx;
      var shouldRefresh = !atmosphereReady || !lastAtmosphereAt || now - lastAtmosphereAt >= budget.atmosphereInterval;

      if(shouldRefresh && atmosphereCtx && atmosphereCanvas.width && atmosphereCanvas.height){
        ctx = atmosphereCtx;
        ctx.setTransform(dpr * atmosphereScale, 0, 0, dpr * atmosphereScale, 0, 0);
        drawBackground(e);
        drawAmbientGhosts(e);
        drawCornerTrails(e);
        drawSideRhythm(e);
        drawPerimeterOrbitals(e, 'tracks');
        drawLightBeams(e);
        ctx = mainCtx;
        lastAtmosphereAt = now;
        atmosphereReady = true;
      }else{
        ctx = mainCtx;
      }

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'medium';
      ctx.drawImage(atmosphereCanvas, 0, 0, canvas.width, canvas.height);
      ctx.restore();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function draw(now){
      now = now || performance.now();
      if(document.hidden){
        raf = requestAnimationFrame(draw);
        return;
      }

      var budget = perfBudget();
      if(lastDrawAt && now - lastDrawAt < budget.interval){
        raf = requestAnimationFrame(draw);
        return;
      }
      lastDrawAt = now;

      resize();
      var e = getEnergy();
      drawCachedAtmosphere(e, now, budget);
      drawPerimeterOrbitals(e, 'planets');
      drawShockwaves(e);
      drawRing(e);
      drawPulseCore(e);
      drawDualWave(e);
      drawWave(e);
      updateLocalAudioMeta(now);
      raf = requestAnimationFrame(draw);
    }

    function invalidate(){
      resizeDirty = true;
      atmosphereReady = false;
    }

    function handleVisibility(hidden){
      if(hidden) lastVisualClockAt = performance.now();
      else softenAnimationResume();
    }

    function start(){
      if(!raf) raf = requestAnimationFrame(draw);
    }

    return {
      resize: resize,
      start: start,
      invalidate: invalidate,
      handleVisibility: handleVisibility,
      syncVisualPhase: syncVisualPhase,
      softenAnimationResume: softenAnimationResume
    };
  }

  window.SonglineCreateAudioVisualizerRenderer = createRenderer;
})();
