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
    var audioCtx = null;
    var analyser = null;
    var freqData = null;
    var waveData = null;
    var elementSource = null;
    var browserStreamSource = null;
    var browserStream = null;
    var seekingLocalAudio = false;
    var fileUrl = '';
    var uploadToken = 0;
    var playlist = [];
    var currentIndex = -1;
    var playlistCollapsed = false;
    var playMode = 'list';
    var displayMode = false;
    var dragAudioDepth = 0;
    var lastMetaUpdateAt = 0;

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
      var metadata = window.SonglineAudioMetadata;
      if(metadata && typeof metadata.revokeLastCover === 'function'){
        metadata.revokeLastCover();
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

    async function readAudioTags(file){
      var metadata = window.SonglineAudioMetadata;
      if(!metadata || typeof metadata.read !== 'function'){
        console.warn('[audio-visualizer] audio metadata module is unavailable');
        return {title:'', artist:'', album:'', cover:''};
      }
      return metadata.read(file);
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

    var renderer = window.SonglineCreateAudioVisualizerRenderer && window.SonglineCreateAudioVisualizerRenderer({
      root: root,
      canvas: canvas,
      ctx: ctx,
      perfBudget: perfBudget,
      getAudioData: function(){
        return {analyser: analyser, freqData: freqData, waveData: waveData};
      },
      updateLocalAudioMeta: updateLocalAudioMeta
    });
    if(!renderer) return;
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
    renderer.resize();

    window.addEventListener('resize', renderer.invalidate, {passive:true});
    document.addEventListener('visibilitychange', function(){
      renderer.handleVisibility(document.hidden);
    });
    window.addEventListener('pageshow', function(event){
      if(event && event.persisted) renderer.softenAnimationResume();
    });
    window.addEventListener('songline:animation-before-resume', renderer.syncVisualPhase);
    window.addEventListener('songline:animation-resume', renderer.softenAnimationResume);
    renderer.start();
  }

  function boot(target){
    var root = target && target.querySelector ? target : document;
    root.querySelectorAll('[data-audio-visualizer]').forEach(init);
  }

  window.SonglineInitAudioVisualizer = boot;
})();
