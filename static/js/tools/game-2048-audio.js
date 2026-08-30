(function(){'use strict';function createAudio(options){options=options||{};var audioCtx=null,masterGain=Number(options.masterGain)||1;function isEnabled(){return typeof options.isEnabled==='function'&&options.isEnabled();}
    function ensureAudio(){
      if(!isEnabled()) return null;
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
      var peak = Math.min(0.34, Math.max(0.0001, (gainValue || 0.12) * masterGain));
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
      var noisePeak = Math.min(0.22, Math.max(0.0001, (gainValue || 0.055) * masterGain));
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
      if(!isEnabled()) return;
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


return {ensureAudio:ensureAudio,playTone:playTone,playNoise:playNoise,playSound:playSound};}window.SonglineCreate2048Audio=createAudio;})();
