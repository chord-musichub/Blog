(function(){
  'use strict';

  var VERSION = '20.20.6';
  var VOLUME_KEY = 'songline-audio-visualizer-volume-v1';

  function init(root){
    if(!root || root.dataset.audioVisualizerBooted === VERSION) return;
    root.dataset.audioVisualizerBooted = VERSION;

    var canvas = root.querySelector('[data-av-canvas]');
    var stage = root.querySelector('[data-av-stage]') || root;
    var dropOverlay = root.querySelector('[data-av-drop-overlay]');
    var browserAudioBtn = root.querySelector('[data-av-browser-audio]');
    var uploadBtn = root.querySelector('[data-av-upload]');
    var openFileBtn = root.querySelector('[data-av-open-file]');
    var displayModeBtn = root.querySelector('[data-av-display-mode]');
    var fullscreenBtn = root.querySelector('[data-av-fullscreen]');
    var volumeInput = root.querySelector('[data-av-volume]');
    var volumeValue = root.querySelector('[data-av-volume-value]');
    var fileInput = root.querySelector('[data-av-file]');
    var audio = root.querySelector('[data-av-audio]');
    var audioState = root.querySelector('[data-av-audio-state]');
    var sourceEl = root.querySelector('[data-av-source]');
    var titleEl = root.querySelector('[data-av-title]');
    var artistEl = root.querySelector('[data-av-artist]');
    var timeEl = root.querySelector('[data-av-time]');
    var progressEl = root.querySelector('[data-av-progress]');
    var progressBar = root.querySelector('[data-av-progressbar]');
    var coverImg = root.querySelector('[data-av-cover-img]');
    var coverFallback = root.querySelector('[data-av-cover-fallback]');
    var hintEl = root.querySelector('[data-av-hint]');
    var playlistPanel = root.querySelector('[data-av-playlist]');
    var playlistList = root.querySelector('[data-av-playlist-list]');
    var playlistToggleBtn = root.querySelector('[data-av-playlist-toggle]');
    var playModeBtn = root.querySelector('[data-av-play-mode]');
    var prevBtn = root.querySelector('[data-av-prev]');
    var nextBtn = root.querySelector('[data-av-next]');

    if(!canvas) return;

    var ctx = canvas.getContext('2d');
    var width = 0;
    var height = 0;
    var dpr = 1;

    var audioCtx = null;
    var analyser = null;
    var freqData = null;
    var waveData = null;
    var elementSource = null;
    var browserStreamSource = null;
    var browserStream = null;
    var raf = 0;
    var startedAt = performance.now();
    var paletteHue = 202;
    var seekingLocalAudio = false;
    var fileUrl = '';
    var coverUrl = '';
    var uploadToken = 0;
    var playlist = [];
    var currentIndex = -1;
    var playlistCollapsed = false;
    var playMode = 'list';
    var displayMode = false;
    var lastBassPulse = 0;
    var lastBassEnergy = 0;
    var bassAverage = 0;
    var shockwaves = [];
    var sparks = [];
    var bgFlow = {bass:0, mid:0, high:0, energy:0};
    var ambientGhosts = [];
    var nextAmbientGhostAt = 0;
    var dragAudioDepth = 0;
    var lastResizeW = 0;
    var lastResizeH = 0;
    var lastResizeDpr = 0;
    var resizeDirty = true;
    var lastDrawAt = 0;
    var lastMetaUpdateAt = 0;
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

    function perfBudget(){
      var perf = window.SonglinePerf || {};
      var small = Math.min(window.innerWidth || 9999, window.innerHeight || 9999) <= 760;
      var low = !!perf.low || small || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
      var mid = !low && (!!perf.mid || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 6));

      // v20.20.6: 视觉时钟直接同步实时相位，不再先显示旧位置一帧后再跳回实时刷新位置。
      // 视觉元素继续保留，但把最容易卡顿的部分换成低分辨率缓存、频谱平滑和核心层优化绘制。
      return {
        low: low,
        mid: mid,
        dpr: low ? 1.15 : mid ? 1.3 : 1.45,
        interval: 16,
        atmosphereInterval: low ? 155 : mid ? 125 : 96,
        atmosphereScale: low ? 0.52 : mid ? 0.62 : 0.72,
        stars: 138,
        ringBars: 196,
        ringGlowStep: low ? 5 : mid ? 4 : 3,
        beams: 28,
        sideGroups: 7,
        orbitScale: 1,
        ghostMax: 7,
        wavePoints: low ? 300 : mid ? 390 : 520
      };
    }

    function setHint(text){
      if(hintEl) hintEl.textContent = text || '';
    }

    function setPill(el, text, ok){
      if(!el) return;
      el.textContent = text;
      el.classList.toggle('is-ok', !!ok);
      el.classList.toggle('is-soft', !ok);
    }

    function setVisualLive(live){
      root.classList.toggle('is-visual-live', !!live);
    }

    function setHasTrack(hasTrack){
      root.classList.toggle('has-track', !!hasTrack);
    }

    function modeLabel(mode){
      if(mode === 'single') return '单曲循环';
      if(mode === 'shuffle') return '随机播放';
      return '列表循环';
    }

    function updatePlayModeButton(){
      if(!playModeBtn) return;
      playModeBtn.textContent = modeLabel(playMode);
      playModeBtn.setAttribute('aria-label', '播放模式：' + modeLabel(playMode));
      playModeBtn.dataset.mode = playMode;
      root.classList.toggle('is-play-mode-single', playMode === 'single');
      root.classList.toggle('is-play-mode-shuffle', playMode === 'shuffle');
      root.classList.toggle('is-play-mode-list', playMode === 'list');
    }

    function cyclePlayMode(){
      if(playMode === 'list') playMode = 'single';
      else if(playMode === 'single') playMode = 'shuffle';
      else playMode = 'list';
      updatePlayModeButton();
      setHint('播放模式：' + modeLabel(playMode));
    }

    function updatePlaylistCollapse(){
      root.classList.toggle('is-playlist-collapsed', !!playlistCollapsed);
      if(playlistToggleBtn){
        playlistToggleBtn.textContent = playlistCollapsed ? '展开' : '收起';
        playlistToggleBtn.setAttribute('aria-expanded', playlistCollapsed ? 'false' : 'true');
      }
    }

    function setDisplayMode(on){
      displayMode = !!on;
      root.classList.toggle('is-display-mode', displayMode);
      if(displayModeBtn){
        displayModeBtn.textContent = displayMode ? '退出展示' : '全隐藏';
        displayModeBtn.setAttribute('aria-pressed', displayMode ? 'true' : 'false');
      }
      if(displayMode){
        setHint('已进入纯净展示模式。点击歌曲信息卡或按 Esc 退出。');
      }
    }

    function toggleDisplayMode(){
      if(!root.classList.contains('is-local-audio-live')){
        setHint('本地音乐播放后才能进入纯净展示模式。');
        return;
      }
      setDisplayMode(!displayMode);
    }

    function formatTime(ms){
      if(!Number.isFinite(ms) || ms <= 0) return '--:--';
      var total = Math.floor(ms / 1000);
      var m = Math.floor(total / 60);
      var s = total % 60;
      return m + ':' + String(s).padStart(2, '0');
    }

    function ensureAudio(){
      var AudioContext = window.AudioContext || window.webkitAudioContext;
      if(!AudioContext){
        setHint('当前浏览器不支持 Web Audio API。');
        return null;
      }

      if(!audioCtx){
        audioCtx = new AudioContext();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.82;
        freqData = new Uint8Array(analyser.frequencyBinCount);
        waveData = new Uint8Array(analyser.fftSize);
      }

      if(audioCtx.state === 'suspended'){
        audioCtx.resume().catch(function(){});
      }

      return audioCtx;
    }

    function stopBrowserStream(){
      try{
        if(browserStreamSource) browserStreamSource.disconnect();
      }catch(err){}
      browserStreamSource = null;

      try{
        if(browserStream){
          browserStream.getTracks().forEach(function(track){ track.stop(); });
        }
      }catch(err){}
      browserStream = null;
    }

    function connectAudioElement(){
      var ac = ensureAudio();
      if(!ac || !audio) return;
      if(!elementSource){
        elementSource = ac.createMediaElementSource(audio);
        elementSource.connect(analyser);
        analyser.connect(ac.destination);
      }
    }

    function revokeUrls(){
      if(fileUrl){
        try{ URL.revokeObjectURL(fileUrl); }catch(err){}
        fileUrl = '';
      }
      if(coverUrl){
        try{ URL.revokeObjectURL(coverUrl); }catch(err){}
        coverUrl = '';
      }
    }

    function renderTrack(data, forceShow){
      data = data || {};
      var title = (data.title || '').trim();
      var artist = (data.artist || '').trim();
      var hasRealTitle = !!title && title !== 'Audio Visualizer';

      if(sourceEl) sourceEl.textContent = data.source || '音频可视化';
      if(titleEl) titleEl.textContent = title || 'Audio Visualizer';
      if(artistEl) artistEl.textContent = artist || '';

      var safeProgress = Math.max(0, Math.min(100, Number(data.progress) || 0));
      if(progressEl) progressEl.style.width = safeProgress + '%';
      if(progressBar) progressBar.setAttribute('aria-valuenow', String(Math.round(safeProgress)));

      if(timeEl){
        timeEl.textContent = (data.positionText || '--:--') + ' / ' + (data.durationText || '--:--');
      }

      if(coverImg && coverFallback){
        if(data.cover){
          coverImg.src = data.cover;
          coverImg.hidden = false;
          coverFallback.hidden = true;
        }else{
          coverImg.removeAttribute('src');
          coverImg.hidden = true;
          coverFallback.hidden = false;
        }
      }

      setHasTrack(!!forceShow || hasRealTitle);
    }

    function updateLocalAudioMeta(now){
      if(!audio || !audio.src || !root.classList.contains('is-local-audio-live')) return;
      if(!Number.isFinite(audio.duration) || audio.duration <= 0) return;
      now = now || performance.now();

      // DOM 写入会抢主线程；进度条不需要 60fps，节流后中心可视化会更稳。
      if(!seekingLocalAudio && lastMetaUpdateAt && now - lastMetaUpdateAt < 180) return;
      lastMetaUpdateAt = now;

      var duration = audio.duration * 1000;
      var position = Math.max(0, audio.currentTime * 1000);
      var progress = Math.max(0, Math.min(100, position / duration * 100));

      if(!seekingLocalAudio){
        if(progressEl) progressEl.style.width = progress + '%';
        if(progressBar) progressBar.setAttribute('aria-valuenow', String(Math.round(progress)));
        if(timeEl) timeEl.textContent = formatTime(position) + ' / ' + formatTime(duration);
      }
    }

    function readTextFrame(bytes, start, size){
      if(size <= 1) return '';
      var enc = bytes[start];
      var data = bytes.slice(start + 1, start + size);
      try{
        if(enc === 1){
          if(data.length >= 2 && data[0] === 0xFE && data[1] === 0xFF){
            return new TextDecoder('utf-16be').decode(data.slice(2)).replace(/\0+$/g, '').trim();
          }
          if(data.length >= 2 && data[0] === 0xFF && data[1] === 0xFE){
            return new TextDecoder('utf-16le').decode(data.slice(2)).replace(/\0+$/g, '').trim();
          }
          return new TextDecoder('utf-16le').decode(data).replace(/\0+$/g, '').trim();
        }
        if(enc === 2) return new TextDecoder('utf-16be').decode(data).replace(/\0+$/g, '').trim();
        if(enc === 3) return new TextDecoder('utf-8').decode(data).replace(/\0+$/g, '').trim();
        return new TextDecoder('iso-8859-1').decode(data).replace(/\0+$/g, '').trim();
      }catch(err){
        try{
          return new TextDecoder('utf-8').decode(data).replace(/\0+$/g, '').trim();
        }catch(e){
          return '';
        }
      }
    }

    function syncSafe(b0, b1, b2, b3){
      return ((b0 & 0x7f) << 21) | ((b1 & 0x7f) << 14) | ((b2 & 0x7f) << 7) | (b3 & 0x7f);
    }

    function normalSize(b0, b1, b2, b3){
      return ((b0 << 24) >>> 0) + (b1 << 16) + (b2 << 8) + b3;
    }

    function findTextTerminator(bytes, pos, end, enc){
      if(enc === 1 || enc === 2){
        for(var i = pos; i + 1 < end; i += 2){
          if(bytes[i] === 0 && bytes[i + 1] === 0) return i + 2;
        }
        return pos;
      }
      for(var j = pos; j < end; j++){
        if(bytes[j] === 0) return j + 1;
      }
      return pos;
    }

    function parseApic(bytes, start, size){
      if(size <= 8) return null;
      var end = start + size;
      var enc = bytes[start];
      var pos = start + 1;
      var mimeEnd = pos;

      while(mimeEnd < end && bytes[mimeEnd] !== 0) mimeEnd++;

      var mime = 'image/jpeg';
      try{
        mime = new TextDecoder('ascii').decode(bytes.slice(pos, mimeEnd)) || 'image/jpeg';
      }catch(err){}

      pos = mimeEnd + 1;
      pos += 1; // picture type
      pos = findTextTerminator(bytes, pos, end, enc);

      if(pos <= start || pos >= end) return null;

      var imageBytes = bytes.slice(pos, end);
      if(!imageBytes.length) return null;

      return {mime:mime, bytes:imageBytes};
    }


    function readUint32BE(bytes, pos){
      return ((bytes[pos] << 24) >>> 0) + (bytes[pos + 1] << 16) + (bytes[pos + 2] << 8) + bytes[pos + 3];
    }

    function readUint32LE(bytes, pos){
      return (bytes[pos] >>> 0) + (bytes[pos + 1] << 8) + (bytes[pos + 2] << 16) + ((bytes[pos + 3] << 24) >>> 0);
    }

    function readUtf8(bytes, start, size){
      if(size <= 0) return '';
      try{
        return new TextDecoder('utf-8').decode(bytes.slice(start, start + size)).replace(/\0+$/g, '').trim();
      }catch(err){
        return '';
      }
    }

    function applyVorbisComment(result, raw){
      if(!raw) return;
      var eq = raw.indexOf('=');
      if(eq <= 0) return;
      var key = raw.slice(0, eq).toUpperCase();
      var value = raw.slice(eq + 1).trim();
      if(!value) return;
      if(key === 'TITLE') result.title = result.title || value;
      else if(key === 'ARTIST' || key === 'ALBUMARTIST') result.artist = result.artist || value;
      else if(key === 'ALBUM') result.album = result.album || value;
    }

    function parseVorbisCommentBlock(bytes, start, size, result){
      var end = start + size;
      var pos = start;
      if(pos + 8 > end) return;

      var vendorLen = readUint32LE(bytes, pos);
      pos += 4 + vendorLen;
      if(pos + 4 > end) return;

      var commentCount = readUint32LE(bytes, pos);
      pos += 4;

      for(var i = 0; i < commentCount && pos + 4 <= end; i++){
        var len = readUint32LE(bytes, pos);
        pos += 4;
        if(len <= 0 || pos + len > end) break;
        applyVorbisComment(result, readUtf8(bytes, pos, len));
        pos += len;
      }
    }

    function guessImageMime(imageBytes, fallback){
      if(imageBytes && imageBytes.length >= 12){
        if(imageBytes[0] === 0xff && imageBytes[1] === 0xd8) return 'image/jpeg';
        if(imageBytes[0] === 0x89 && imageBytes[1] === 0x50 && imageBytes[2] === 0x4e && imageBytes[3] === 0x47) return 'image/png';
        if(imageBytes[0] === 0x47 && imageBytes[1] === 0x49 && imageBytes[2] === 0x46) return 'image/gif';
        if(imageBytes[0] === 0x52 && imageBytes[1] === 0x49 && imageBytes[2] === 0x46 && imageBytes[3] === 0x46 && imageBytes[8] === 0x57 && imageBytes[9] === 0x45 && imageBytes[10] === 0x42 && imageBytes[11] === 0x50) return 'image/webp';
      }
      return fallback || 'image/jpeg';
    }

    function parseFlacPictureBlock(bytes, start, size){
      var end = start + size;
      var pos = start;
      if(pos + 8 > end) return null;

      pos += 4; // picture type
      var mimeLen = readUint32BE(bytes, pos);
      pos += 4;
      if(mimeLen < 0 || pos + mimeLen + 20 > end) return null;

      var mime = readUtf8(bytes, pos, mimeLen) || 'image/jpeg';
      pos += mimeLen;

      if(pos + 4 > end) return null;
      var descLen = readUint32BE(bytes, pos);
      pos += 4 + descLen;
      if(pos + 20 > end) return null;

      pos += 16; // width, height, depth, indexed colors
      var dataLen = readUint32BE(bytes, pos);
      pos += 4;
      if(dataLen <= 0 || pos + dataLen > end) return null;

      var imageBytes = bytes.slice(pos, pos + dataLen);
      return {mime:guessImageMime(imageBytes, mime), bytes:imageBytes};
    }

    function parseFlacTags(bytes, result){
      if(bytes.length < 8) return;
      if(!(bytes[0] === 0x66 && bytes[1] === 0x4c && bytes[2] === 0x61 && bytes[3] === 0x43)) return;

      var offset = 4;
      var last = false;
      var blockGuard = 0;
      while(!last && offset + 4 <= bytes.length && blockGuard++ < 64){
        var header = bytes[offset];
        last = !!(header & 0x80);
        var type = header & 0x7f;
        var length = (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3];
        var start = offset + 4;
        if(length < 0 || start + length > bytes.length) break;

        if(type === 4){
          parseVorbisCommentBlock(bytes, start, length, result);
        }else if(type === 6 && !result.cover){
          var pic = parseFlacPictureBlock(bytes, start, length);
          if(pic && pic.bytes && pic.bytes.length){
            if(coverUrl){
              try{ URL.revokeObjectURL(coverUrl); }catch(err){}
            }
            coverUrl = URL.createObjectURL(new Blob([pic.bytes], {type:pic.mime || 'image/jpeg'}));
            result.cover = coverUrl;
          }
        }

        offset = start + length;
      }
    }

    async function readAudioTags(file){
      var result = {title:'', artist:'', album:'', cover:''};
      try{
        var buf = await file.arrayBuffer();
        var bytes = new Uint8Array(buf);
        if(bytes.length < 16) return result;

        if(bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33){
          var version = bytes[3];
          var tagSize = syncSafe(bytes[6], bytes[7], bytes[8], bytes[9]);
          var offset = 10;
          var limit = Math.min(bytes.length, 10 + tagSize);

          while(offset + 10 <= limit){
            var id = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
            if(!/^[A-Z0-9]{4}$/.test(id)) break;

            var size = version === 4
              ? syncSafe(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7])
              : normalSize(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);

            if(size <= 0 || offset + 10 + size > limit) break;

            var frameStart = offset + 10;
            if(id === 'TIT2') result.title = result.title || readTextFrame(bytes, frameStart, size);
            else if(id === 'TPE1') result.artist = result.artist || readTextFrame(bytes, frameStart, size);
            else if(id === 'TALB') result.album = result.album || readTextFrame(bytes, frameStart, size);
            else if(id === 'APIC' && !result.cover){
              var pic = parseApic(bytes, frameStart, size);
              if(pic){
                if(coverUrl){
                  try{ URL.revokeObjectURL(coverUrl); }catch(err){}
                }
                coverUrl = URL.createObjectURL(new Blob([pic.bytes], {type:pic.mime || 'image/jpeg'}));
                result.cover = coverUrl;
              }
            }

            offset += 10 + size;
          }
        }else if(bytes[0] === 0x66 && bytes[1] === 0x4c && bytes[2] === 0x61 && bytes[3] === 0x43){
          parseFlacTags(bytes, result);
        }
      }catch(err){
        console.warn('[audio-visualizer] failed to parse audio tags', err);
      }
      return result;
    }

    function setVolume(raw){
      var value = Math.max(0, Math.min(100, Number(raw)));
      if(!Number.isFinite(value)) value = 80;

      var ratio = value / 100;
      if(audio) audio.volume = ratio;
      if(volumeInput) volumeInput.value = String(Math.round(value));
      if(volumeValue) volumeValue.textContent = Math.round(value) + '%';

      try{
        localStorage.setItem(VOLUME_KEY, String(Math.round(value)));
      }catch(err){}
    }


    function showPlaylist(){
      if(playlistPanel) playlistPanel.hidden = playlist.length === 0;
      root.classList.toggle('has-local-playlist', playlist.length > 0);
      updatePlaylistCollapse();
      updatePlayModeButton();
    }

    function renderPlaylist(){
      showPlaylist();
      if(!playlistList) return;
      playlistList.innerHTML = '';

      playlist.forEach(function(item, index){
        var row = document.createElement('div');
        row.className = 'av-playlist-item';
        row.classList.toggle('is-active', index === currentIndex);
        row.dataset.index = String(index);

        var main = document.createElement('button');
        main.type = 'button';
        main.className = 'av-playlist-main';
        main.setAttribute('aria-label', '播放 ' + (item.title || item.file.name.replace(/\.[^.]+$/, '')));

        var title = document.createElement('strong');
        title.textContent = item.title || item.file.name.replace(/\.[^.]+$/, '');

        var meta = document.createElement('span');
        meta.textContent = (index === currentIndex ? '正在播放 · ' : '') + (item.artist || item.file.name);

        main.appendChild(title);
        main.appendChild(meta);
        main.addEventListener('click', function(){ playPlaylistIndex(index); });

        var remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'av-playlist-remove';
        remove.textContent = '移出';
        remove.setAttribute('aria-label', '从列表移出 ' + (item.title || item.file.name));
        remove.addEventListener('click', function(event){
          event.stopPropagation();
          removePlaylistItem(index);
        });

        row.appendChild(main);
        row.appendChild(remove);
        playlistList.appendChild(row);
      });
    }

    function removePlaylistItem(index){
      if(index < 0 || index >= playlist.length) return;

      var removedCurrent = index === currentIndex;
      playlist.splice(index, 1);

      if(!playlist.length){
        currentIndex = -1;
        if(audio){
          try{
            audio.pause();
            audio.removeAttribute('src');
            audio.load();
          }catch(err){}
        }
        if(fileUrl){
          try{ URL.revokeObjectURL(fileUrl); }catch(err){}
          fileUrl = '';
        }
        root.classList.remove('is-local-audio-live');
        root.classList.remove('is-display-mode');
        setDisplayMode(false);
        setVisualLive(false);
        setHasTrack(false);
        setPill(audioState, '等待音频来源', false);
        setHint('播放列表已清空。可以继续添加本地音乐。');
        renderPlaylist();
        return;
      }

      if(index < currentIndex) currentIndex -= 1;
      if(removedCurrent){
        currentIndex = Math.min(index, playlist.length - 1);
        playPlaylistIndex(currentIndex);
        return;
      }

      renderPlaylist();
      setPill(audioState, '本地播放列表 · ' + (currentIndex + 1) + ' / ' + playlist.length, true);
      setHint('已从播放列表移出 1 首音乐。');
    }

    function isAudioFile(file){
      return !!file && (/^audio\//.test(file.type || '') || /\.(mp3|m4a|aac|wav|flac|ogg|opus|webm)$/i.test(file.name || ''));
    }

    function addFilesToPlaylist(files, autoplay){
      var incoming = Array.prototype.slice.call(files || []).filter(isAudioFile);
      if(!incoming.length){
        setHint('没有识别到音频文件。');
        return;
      }

      var startIndex = playlist.length;
      incoming.forEach(function(file){
        playlist.push({
          file:file,
          title:file.name.replace(/\.[^.]+$/, ''),
          artist:'本地音频',
          album:'',
          cover:'',
          parsed:false
        });
      });

      renderPlaylist();
      setHint('已加入 ' + incoming.length + ' 首本地音乐到播放列表。');

      incoming.forEach(function(file, i){
        var index = startIndex + i;
        readAudioTags(file).then(function(tags){
          var item = playlist[index];
          if(!item || item.file !== file) return;
          item.title = tags.title || item.title;
          item.artist = tags.artist || tags.album || item.artist;
          item.album = tags.album || '';
          item.cover = tags.cover || '';
          item.parsed = true;
          renderPlaylist();

          if(index === currentIndex && root.classList.contains('is-local-audio-live')){
            renderTrack({
              source:'本地播放列表',
              title:item.title,
              artist:item.artist || item.album || '本地音频',
              progress:0,
              positionText:audio && audio.currentTime ? formatTime(audio.currentTime * 1000) : '--:--',
              durationText:audio && Number.isFinite(audio.duration) ? formatTime(audio.duration * 1000) : '--:--',
              cover:item.cover || ''
            }, true);
          }
        });
      });

      if(autoplay || currentIndex < 0){
        playPlaylistIndex(startIndex);
      }
    }

    function playPlaylistIndex(index){
      if(index < 0 || index >= playlist.length || !audio) return;
      var item = playlist[index];
      currentIndex = index;
      handleUpload(item.file, item);
      renderPlaylist();
    }

    function playNext(manual){
      if(!playlist.length) return;

      if(!manual && playMode === 'single'){
        playPlaylistIndex(currentIndex >= 0 ? currentIndex : 0);
        return;
      }

      var next = currentIndex + 1;
      if(!manual && playMode === 'shuffle'){
        if(playlist.length === 1) next = 0;
        else{
          do{
            next = Math.floor(Math.random() * playlist.length);
          }while(next === currentIndex);
        }
      }

      if(next >= playlist.length) next = 0;
      playPlaylistIndex(next);
    }

    function playPrev(){
      if(!playlist.length) return;
      var prev = currentIndex - 1;
      if(prev < 0) prev = playlist.length - 1;
      playPlaylistIndex(prev);
    }

    async function connectBrowserSystemAudio(){
      var ac = ensureAudio();
      if(!ac) return;

      if(!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia){
        setHint('当前浏览器不支持网页端系统声音捕获。');
        return;
      }

      setHint('正在请求浏览器音频捕获权限。请选择包含声音的来源，并勾选共享音频。');

      try{
        var stream = await navigator.mediaDevices.getDisplayMedia({
          video:true,
          audio:{
            echoCancellation:false,
            noiseSuppression:false,
            autoGainControl:false,
            systemAudio:'include',
            suppressLocalAudioPlayback:false
          }
        });

        var audioTracks = stream.getAudioTracks();
        if(!audioTracks.length){
          stream.getTracks().forEach(function(track){ track.stop(); });
          setPill(audioState, '浏览器未返回音频轨道', false);
          setHint('浏览器没有返回系统声音。请确认已勾选共享音频。');
          return;
        }

        try{
          if(audio){
            audio.pause();
            audio.removeAttribute('src');
            audio.load();
          }
        }catch(err){}

        stream.getVideoTracks().forEach(function(track){ track.stop(); });
        stopBrowserStream();
        revokeUrls();

        browserStream = new MediaStream(audioTracks);
        browserStreamSource = ac.createMediaStreamSource(browserStream);
        browserStreamSource.connect(analyser);

        renderTrack({
          source:'浏览器授权系统声音',
          title:'',
          artist:'',
          progress:0,
          positionText:'--:--',
          durationText:'--:--',
          cover:''
        }, false);

        setHasTrack(false);
        root.classList.add('is-browser-audio-live');
        root.classList.remove('is-local-audio-live');
        root.classList.remove('is-seeking-local-audio');
        setPill(audioState, '浏览器系统声音已接入', true);
        setVisualLive(true);
        setHint('已接入网页端系统声音。这个模式只做频谱，不读取歌曲名和封面。');
      }catch(err){
        setPill(audioState, '系统声音待接入', false);
        setHint('浏览器音频授权被取消或失败：' + (err && err.message ? err.message : err));
      }
    }

    async function handleUpload(file, playlistItem){
      if(!file || !audio) return;

      var thisUpload = ++uploadToken;
      ensureAudio();
      connectAudioElement();
      stopBrowserStream();
      root.classList.remove('is-browser-audio-live');
      root.classList.add('is-local-audio-live');
      root.classList.remove('is-seeking-local-audio');
      revokeUrls();

      try{
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
      }catch(err){}

      fileUrl = URL.createObjectURL(file);
      audio.src = fileUrl;
      audio.currentTime = 0;
      audio.hidden = true;
      setVolume(volumeInput ? volumeInput.value : 80);

      var baseTitle = file.name.replace(/\.[^.]+$/, '');
      renderTrack({
        source:playlist.length ? '本地播放列表' : '本地音频文件',
        title:baseTitle,
        artist:'正在读取音频信息…',
        progress:0,
        positionText:'--:--',
        durationText:'--:--',
        cover:''
      }, true);

      setPill(audioState, playlist.length ? ('本地播放列表 · ' + (currentIndex + 1) + ' / ' + playlist.length) : '本地文件已接入', true);
      setVisualLive(true);
      setHint('正在播放本地音乐列表。空格可暂停 / 继续，右上角可继续添加音乐。');

      audio.play().catch(function(){
        setHint('浏览器阻止了自动播放，请再点一次上传或点击页面后播放。');
      });

      var tags = await readAudioTags(file);
      if(thisUpload !== uploadToken || !root.classList.contains('is-local-audio-live')) return;

      if(playlistItem){
        playlistItem.title = tags.title || playlistItem.title || baseTitle;
        playlistItem.artist = tags.artist || tags.album || playlistItem.artist || '本地音频';
        playlistItem.album = tags.album || '';
        playlistItem.cover = tags.cover || playlistItem.cover || '';
        playlistItem.parsed = true;
        renderPlaylist();
      }

      renderTrack({
        source:playlist.length ? '本地播放列表' : '本地音频文件',
        title:(playlistItem && playlistItem.title) || tags.title || baseTitle,
        artist:(playlistItem && playlistItem.artist) || tags.artist || tags.album || '本地音频',
        progress:0,
        positionText:'--:--',
        durationText:Number.isFinite(audio.duration) ? formatTime(audio.duration * 1000) : '--:--',
        cover:(playlistItem && playlistItem.cover) || tags.cover || ''
      }, true);
    }

    function canSeekLocalAudio(){
      return !!(audio && audio.src && root.classList.contains('is-local-audio-live') && Number.isFinite(audio.duration) && audio.duration > 0);
    }

    function seekLocalAudioFromEvent(event){
      if(!progressBar || !canSeekLocalAudio()) return;

      var rect = progressBar.getBoundingClientRect();
      var clientX = event.clientX;
      if(event.touches && event.touches[0]) clientX = event.touches[0].clientX;

      var ratio = (clientX - rect.left) / Math.max(1, rect.width);
      ratio = Math.max(0, Math.min(1, ratio));
      audio.currentTime = ratio * audio.duration;

      var progress = ratio * 100;
      if(progressEl) progressEl.style.width = progress + '%';
      if(progressBar) progressBar.setAttribute('aria-valuenow', String(Math.round(progress)));
      if(timeEl) timeEl.textContent = formatTime(audio.currentTime * 1000) + ' / ' + formatTime(audio.duration * 1000);
    }

    function beginSeekLocalAudio(event){
      if(!canSeekLocalAudio()) return;
      seekingLocalAudio = true;
      root.classList.add('is-seeking-local-audio');
      seekLocalAudioFromEvent(event);

      if(progressBar && event.pointerId !== undefined){
        try{ progressBar.setPointerCapture(event.pointerId); }catch(err){}
      }

      event.preventDefault();
    }

    function moveSeekLocalAudio(event){
      if(!seekingLocalAudio) return;
      seekLocalAudioFromEvent(event);
      event.preventDefault();
    }

    function endSeekLocalAudio(event){
      if(!seekingLocalAudio) return;
      seekLocalAudioFromEvent(event);
      seekingLocalAudio = false;
      root.classList.remove('is-seeking-local-audio');

      if(progressBar && event.pointerId !== undefined){
        try{ progressBar.releasePointerCapture(event.pointerId); }catch(err){}
      }

      event.preventDefault();
    }

    function hasLocalAudioFile(){
      return !!(audio && audio.src && root.classList.contains('is-local-audio-live'));
    }

    function toggleLocalAudioPlayback(){
      if(!hasLocalAudioFile()) return;

      if(audio.paused){
        audio.play().then(function(){
          setHint('本地音频继续播放。空格可暂停 / 继续。');
        }).catch(function(){
          setHint('浏览器阻止了播放，请点击页面或重新打开文件。');
        });
      }else{
        audio.pause();
        setHint('本地音频已暂停。按空格继续播放。');
      }
    }

    function isTypingOrControlTarget(target){
      if(!target) return false;
      var tag = String(target.tagName || '').toLowerCase();
      if(tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'button') return true;
      if(target.closest && target.closest('button,a,input,textarea,select,[role="slider"],[contenteditable="true"]')) return true;
      return false;
    }

    function stopAll(){
      uploadToken++;
      root.classList.remove('is-browser-audio-live');
      root.classList.remove('is-local-audio-live');
      root.classList.remove('is-seeking-local-audio');

      stopBrowserStream();

      if(audio){
        try{
          audio.pause();
          audio.removeAttribute('src');
          audio.load();
        }catch(err){}
      }

      revokeUrls();
      setDisplayMode(false);
      setVisualLive(false);
      setHasTrack(false);
      setPill(audioState, '等待音频来源', false);
      setHint('已停止音频输入。');
    }

    function resetToInitialView(){
      stopAll();

      renderTrack({
        source:'Local Audio',
        title:'',
        artist:'',
        progress:0,
        positionText:'--:--',
        durationText:'--:--',
        cover:''
      }, false);

      if(progressEl) progressEl.style.width = '0%';
      if(progressBar) progressBar.setAttribute('aria-valuenow', '0');
      if(fileInput) fileInput.value = '';
      currentIndex = -1;
      playlist = [];
      playlistCollapsed = false;
      setDisplayMode(false);
      renderPlaylist();

      setPill(audioState, '等待音频来源', false);
      setHint('已回到音频可视化初始界面。可以选择网页登录系统声音，或上传本地音频。');

      try{
        var stage = root.querySelector('.av-stage') || root;
        stage.scrollIntoView({block:'start', behavior:'smooth'});
      }catch(err){}
    }

    function bindBackButton(){
      var back =
        document.querySelector('.back-icon-link[data-back-icon]') ||
        document.querySelector('[data-back-icon]') ||
        document.querySelector('.back-icon-link') ||
        document.querySelector('.back-button');

      if(!back || back.dataset.audioVisualizerBackBound === VERSION) return;
      back.dataset.audioVisualizerBackBound = VERSION;
      back.setAttribute('href', '/tools/');

      back.addEventListener('click', function(event){
        var isLive =
          root.classList.contains('is-visual-live') ||
          root.classList.contains('is-local-audio-live') ||
          root.classList.contains('is-browser-audio-live') ||
          !!(audio && audio.src) || playlist.length > 0;

        if(isLive){
          event.preventDefault();
          event.stopPropagation();
          if(event.stopImmediatePropagation) event.stopImmediatePropagation();
          resetToInitialView();
          return false;
        }

        event.preventDefault();
        event.stopPropagation();
        if(event.stopImmediatePropagation) event.stopImmediatePropagation();
        window.location.href = '/tools/';
        return false;
      }, true);
    }

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

  // REALTIME_AUDIO_SMOOTH_ORBIT_PLANETS v20.20.6
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

    function dataTransferHasFiles(event){
      var dt = event && event.dataTransfer;
      if(!dt) return false;
      if(dt.types && Array.prototype.indexOf.call(dt.types, 'Files') >= 0) return true;
      return !!(dt.files && dt.files.length);
    }

    function setDragAudioActive(active){
      root.classList.toggle('is-dragging-audio', !!active);
      if(dropOverlay) dropOverlay.setAttribute('aria-hidden', active ? 'false' : 'true');
    }

    function handleDragAudioEnter(event){
      if(!dataTransferHasFiles(event)) return;
      event.preventDefault();
      dragAudioDepth += 1;
      setDragAudioActive(true);
      setHint('松开鼠标即可把音频加入本地播放列表。');
      if(event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    }

    function handleDragAudioOver(event){
      if(!dataTransferHasFiles(event)) return;
      event.preventDefault();
      setDragAudioActive(true);
      if(event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    }

    function handleDragAudioLeave(event){
      if(!dataTransferHasFiles(event)) return;
      event.preventDefault();
      dragAudioDepth = Math.max(0, dragAudioDepth - 1);
      if(dragAudioDepth === 0) setDragAudioActive(false);
    }

    function handleDragAudioDrop(event){
      if(!dataTransferHasFiles(event)) return;
      event.preventDefault();
      dragAudioDepth = 0;
      setDragAudioActive(false);
      var files = event.dataTransfer && event.dataTransfer.files;
      if(files && files.length){
        addFilesToPlaylist(files, true);
      }else{
        setHint('没有读取到可添加的音频文件。');
      }
    }

    function bindAudioDragDrop(){
      if(!stage || stage.dataset.avDragDropBound === VERSION) return;
      stage.dataset.avDragDropBound = VERSION;
      stage.addEventListener('dragenter', handleDragAudioEnter);
      stage.addEventListener('dragover', handleDragAudioOver);
      stage.addEventListener('dragleave', handleDragAudioLeave);
      stage.addEventListener('drop', handleDragAudioDrop);

      window.addEventListener('dragover', function(event){
        if(dataTransferHasFiles(event)) event.preventDefault();
      });
      window.addEventListener('drop', function(event){
        if(dataTransferHasFiles(event) && !stage.contains(event.target)){
          event.preventDefault();
          dragAudioDepth = 0;
          setDragAudioActive(false);
        }
      });
    }

    function openLocalAudioPicker(){
      if(!fileInput) return;
      fileInput.value = '';
      fileInput.click();
    }

    function bindSourceCards(){
      root.querySelectorAll('.av-source-card').forEach(function(card){
        if(card.dataset.audioVisualizerCardBound === VERSION) return;
        card.dataset.audioVisualizerCardBound = VERSION;
        card.tabIndex = 0;

        card.addEventListener('click', function(event){
          if(event.target.closest && event.target.closest('button,a,input,textarea,select')) return;
          var button = card.querySelector('button');
          if(button) button.click();
        });

        card.addEventListener('keydown', function(event){
          if(event.key !== 'Enter' && event.key !== ' ') return;
          if(event.target !== card) return;
          event.preventDefault();
          var button = card.querySelector('button');
          if(button) button.click();
        });
      });
    }

    bindSourceCards();
    bindAudioDragDrop();

    if(browserAudioBtn){
      browserAudioBtn.addEventListener('click', function(){
        connectBrowserSystemAudio();
        browserAudioBtn.blur();
      });
    }

    if(openFileBtn){
      openFileBtn.addEventListener('click', function(){
        openLocalAudioPicker();
        openFileBtn.blur();
      });
    }

    if(uploadBtn){
      uploadBtn.addEventListener('click', function(){
        openLocalAudioPicker();
        uploadBtn.blur();
      });
    }

    if(prevBtn){
      prevBtn.addEventListener('click', function(){
        playPrev();
        prevBtn.blur();
      });
    }

    if(playlistToggleBtn){
      playlistToggleBtn.addEventListener('click', function(){
        playlistCollapsed = !playlistCollapsed;
        updatePlaylistCollapse();
        playlistToggleBtn.blur();
      });
    }

    if(playModeBtn){
      playModeBtn.addEventListener('click', function(){
        cyclePlayMode();
        playModeBtn.blur();
      });
    }

    if(displayModeBtn){
      displayModeBtn.addEventListener('click', function(){
        toggleDisplayMode();
        displayModeBtn.blur();
      });
    }

    var nowCard = root.querySelector('[data-av-now]');
    if(nowCard){
      nowCard.addEventListener('click', function(event){
        if(!displayMode) return;
        if(event.target.closest && event.target.closest('[data-av-progressbar], button, input, a')) return;
        setDisplayMode(false);
      });
    }

    if(nextBtn){
      nextBtn.addEventListener('click', function(){
        playNext(true);
        nextBtn.blur();
      });
    }

    if(fileInput){
      fileInput.addEventListener('change', function(){
        var files = fileInput.files;
        if(files && files.length) addFilesToPlaylist(files, true);
        fileInput.value = '';
      });
    }

    if(audio){
      audio.addEventListener('ended', function(){
        if(playlist.length) playNext(false);
      });
      audio.addEventListener('loadedmetadata', updateLocalAudioMeta);
      audio.addEventListener('timeupdate', updateLocalAudioMeta);
    }

    if(progressBar){
      progressBar.addEventListener('pointerdown', beginSeekLocalAudio);
      progressBar.addEventListener('pointermove', moveSeekLocalAudio);
      progressBar.addEventListener('pointerup', endSeekLocalAudio);
      progressBar.addEventListener('pointercancel', function(event){
        seekingLocalAudio = false;
        root.classList.remove('is-seeking-local-audio');
        if(event && event.pointerId !== undefined){
          try{ progressBar.releasePointerCapture(event.pointerId); }catch(err){}
        }
      });

      progressBar.addEventListener('keydown', function(event){
        if(!canSeekLocalAudio()) return;
        var step = event.shiftKey ? 10 : 5;

        if(event.key === 'ArrowLeft' || event.key === 'ArrowDown'){
          audio.currentTime = Math.max(0, audio.currentTime - step);
          event.preventDefault();
        }else if(event.key === 'ArrowRight' || event.key === 'ArrowUp'){
          audio.currentTime = Math.min(audio.duration, audio.currentTime + step);
          event.preventDefault();
        }else if(event.key === 'Home'){
          audio.currentTime = 0;
          event.preventDefault();
        }else if(event.key === 'End'){
          audio.currentTime = audio.duration;
          event.preventDefault();
        }
      });
    }

    document.addEventListener('keydown', function(event){
      if(event.key === 'Escape' && displayMode){
        setDisplayMode(false);
        event.preventDefault();
        return;
      }
      if(event.code !== 'Space' && event.key !== ' ') return;
      if(!hasLocalAudioFile()) return;
      if(isTypingOrControlTarget(event.target)) return;
      event.preventDefault();
      toggleLocalAudioPlayback();
    });

    if(volumeInput){
      var stored = 80;
      try{
        stored = Number(localStorage.getItem(VOLUME_KEY) || 80);
      }catch(err){}
      setVolume(stored);
      volumeInput.addEventListener('input', function(){
        setVolume(volumeInput.value);
      });
    }

    if(fullscreenBtn){
      fullscreenBtn.addEventListener('click', function(){
        var target = root.querySelector('.av-stage') || root;
        if(!document.fullscreenElement && target.requestFullscreen){
          target.requestFullscreen();
        }else if(document.exitFullscreen){
          document.exitFullscreen();
        }
        fullscreenBtn.blur();
      });
    }

    setPill(audioState, '等待音频来源', false);
    setHasTrack(false);
    setVisualLive(false);
    showPlaylist();
    setHint('选择一个音频来源开始。网页系统声音适合临时频谱；本地音频支持多文件列表、顺播、切歌和音量控制。');

    bindBackButton();
    bindSourceCards();
    resize();

    window.addEventListener('resize', function(){ resizeDirty = true; atmosphereReady = false; }, {passive:true});
    document.addEventListener('visibilitychange', function(){
      if(!document.hidden) softenAnimationResume();
      else lastVisualClockAt = performance.now();
    });
    window.addEventListener('pageshow', function(event){
      if(event && event.persisted) softenAnimationResume();
    });
    window.addEventListener('songline:animation-before-resume', syncVisualPhase);
    window.addEventListener('songline:animation-resume', softenAnimationResume);
    if(!raf) raf = requestAnimationFrame(draw);
  }

  function boot(target){
    var root = target && target.querySelector ? target : document;
    root.querySelectorAll('[data-audio-visualizer]').forEach(init);
  }

  window.SonglineInitAudioVisualizer = boot;

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
