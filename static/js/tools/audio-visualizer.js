(function(){
  function uiContent(node, value){
    if(window.SonglineI18n) window.SonglineI18n.setContent(node,value);
    else if(node) node.textContent=value;
  }
  function uiText(node, value){
    if(window.SonglineI18n) window.SonglineI18n.setText(node, value);
    else if(node) node.textContent = value;
  }
(function(){
  'use strict';

  var VERSION = '26.10.08';
  var VOLUME_KEY = 'songline-audio-visualizer-volume-v1';

  function init(root){
    if(!root || root.dataset.audioVisualizerBooted === VERSION) return;
    if(typeof window.__songlineAudioVisualizerCleanup === 'function') window.__songlineAudioVisualizerCleanup();
    root.dataset.audioVisualizerBooted = VERSION;

    var canvas = root.querySelector('[data-av-canvas]');
    var stage = root.querySelector('[data-av-stage]') || root;
    var returnBtn = root.querySelector('[data-av-return]');
    var dropOverlay = root.querySelector('[data-av-drop-overlay]');
    var browserAudioBtn = root.querySelector('[data-av-browser-audio]');
    var uploadBtn = root.querySelector('[data-av-upload]');
    var openFileBtn = root.querySelector('[data-av-open-file]');
    var displayModeBtn = root.querySelector('[data-av-display-mode]');
    var fullscreenBtn = root.querySelector('[data-av-fullscreen]');
    var volumeInput = root.querySelector('[data-av-volume]');
    var fileInput = root.querySelector('[data-av-file]');
    var audio = root.querySelector('[data-av-audio]');
    var audioState = root.querySelector('[data-av-audio-state]');
    var titleEl = root.querySelector('[data-av-title]');
    var artistEl = root.querySelector('[data-av-artist]');
    var sampleRateEl = root.querySelector('[data-av-sample-rate]');
    var trackEditBtn = root.querySelector('[data-av-track-edit]');
    var trackDialog = root.querySelector('[data-av-track-dialog]');
    var trackForm = root.querySelector('[data-av-track-form]');
    var editTitle = root.querySelector('[data-av-edit-title]');
    var editArtist = root.querySelector('[data-av-edit-artist]');
    var editRate = root.querySelector('[data-av-edit-rate]');
    var editItem = null;
    var editDraft = null;
    var editInitial = null;
    var timeEl = root.querySelector('[data-av-time]');
    var progressEl = root.querySelector('[data-av-progress]');
    var progressBar = root.querySelector('[data-av-progressbar]');
    var coverImg = root.querySelector('[data-av-cover-img]');
    var coverFallback = root.querySelector('[data-av-cover-fallback]');
    var backdrop = root.querySelector('[data-av-backdrop]');
    var paintedCover = '';
    var playBtn = root.querySelector('[data-av-play]');
    var playIcon = root.querySelector('[data-av-play-icon]');
    var pauseIcon = root.querySelector('[data-av-pause-icon]');
    var coverPicker = root.querySelector('[data-av-cover-picker]');
    var coverFile = root.querySelector('[data-av-cover-file]');
    var exitDisplay = root.querySelector('[data-av-exit-display]');
    var disposed = false;
    var captureToken = 0;
    var coverToken = 0;
    var pendingCovers = new Set();
    var hintEl = root.querySelector('[data-av-hint]');
    var playlistPanel = root.querySelector('[data-av-playlist]');
    var playlistList = root.querySelector('[data-av-playlist-list]');
    var playlistToggleBtn = root.querySelector('[data-av-playlist-toggle]');
    var playModeBtn = root.querySelector('[data-av-play-mode]');
    var prevBtn = root.querySelector('[data-av-prev]');
    var nextBtn = root.querySelector('[data-av-next]');
    var queueCount = root.querySelector('[data-av-queue-count]');
    var modeIcons = ['list','single','shuffle'].map(function(mode){ return root.querySelector('[data-av-mode-' + mode + ']'); });

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
    var playlistRows = new Map(), playlistDirty = true, activePlaylistRow = null;
    var currentIndex = -1;
    var playlistCollapsed = true;
    var queueKeyboard = false;
    var nativeQueue = !!(playlistPanel && typeof playlistPanel.showPopover === 'function');
    if(playlistPanel && !nativeQueue){
      playlistPanel.removeAttribute('popover');
      playlistPanel.setAttribute('data-av-queue-fallback','');
    }
    if(nativeQueue && playlistToggleBtn) playlistToggleBtn.setAttribute('popovertarget',playlistPanel.id);
    var playMode = 'list';
    var keyboardFilePicker = false;
    var displayMode = false;
    var dragAudioDepth = 0;
    var lastMetaUpdateAt = 0;

    function perfBudget(){
      var perf = window.SonglinePerf || {};
      var small = Math.min(window.innerWidth || 9999, window.innerHeight || 9999) <= 760;
      var low = !!perf.low || small || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
      var mid = !low && (!!perf.mid || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 6));

      return {
        low: low,
        mid: mid,
        dpr: low ? 1 : mid ? 1.25 : 1.5,
        interval: 1000 / 60
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
      syncReturnButton();
    }

    function syncReturnButton(){
      if(!returnBtn) return;
      var live = root.classList.contains('is-visual-live');
      var label = live ? '返回音乐首页' : '返回工具页';
      returnBtn.setAttribute('aria-label',label);
      returnBtn.title = label;
      // The shared navigator handles links in the capture phase, before the
      // local click listener. Exclude only the in-tool reset state from it.
      returnBtn.toggleAttribute('data-no-page-transition',live);
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
      ['list','single','shuffle'].forEach(function(mode, index){
        var icon = modeIcons[index];
        if(icon) icon.hidden = mode !== playMode;
      });
      playModeBtn.setAttribute('aria-label', '播放模式：' + modeLabel(playMode));
      playModeBtn.title = modeLabel(playMode);
      playModeBtn.dataset.mode = playMode;
    }

    function cyclePlayMode(){
      if(playMode === 'list') playMode = 'single';
      else if(playMode === 'single') playMode = 'shuffle';
      else playMode = 'list';
      updatePlayModeButton();
      setHint('');
    }

    function syncQueueControls(){
      if(playlistList) playlistList.hidden = playlistCollapsed;
      if(playlistToggleBtn){
        playlistToggleBtn.setAttribute('aria-label',playlistCollapsed ? '打开歌曲列表' : '关闭歌曲列表');
        playlistToggleBtn.setAttribute('aria-expanded', playlistCollapsed ? 'false' : 'true');
      }
    }

    function updatePlaylistCollapse(){
      syncQueueControls();
      if(playlistPanel){
        if(nativeQueue){
          var open = playlistPanel.matches(':popover-open');
          if(playlistCollapsed && open) playlistPanel.hidePopover();
          else if(!playlistCollapsed && !open && playlist.length) playlistPanel.showPopover();
        }else playlistPanel.classList.toggle('is-open', !playlistCollapsed);
      }
    }

    function setDisplayMode(on){
      displayMode = !!on;
      if(displayMode){playlistCollapsed = true;updatePlaylistCollapse();}
      root.classList.toggle('is-display-mode', displayMode);
      if(displayModeBtn){
        displayModeBtn.setAttribute('aria-label', displayMode ? '退出纯净展示' : '进入纯净展示');
        displayModeBtn.title = displayMode ? '退出纯净展示' : '纯净展示';
        displayModeBtn.setAttribute('aria-pressed', displayMode ? 'true' : 'false');
      }
      if(exitDisplay) exitDisplay.hidden = !displayMode;
    }

    function toggleDisplayMode(){
      if(!root.classList.contains('is-visual-live')){
        setHint('选择音频后可进入纯净展示。');
        return;
      }
      setDisplayMode(!displayMode);
    }

    function formatTime(ms){
      if(!Number.isFinite(ms) || ms < 0) return '--:--';
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
    }

    function resetArtworkPalette(){
      root.style.removeProperty('--av-art-hue');
      root.style.removeProperty('--av-art-secondary');
      if(renderer) renderer.invalidate();
    }

    function colorFromArtwork(context, size){
      try{
        // Sample only 64 positions from the existing tiny blurred buffer, once per artwork.
        var pixels = context.getImageData(0,0,size,size).data;
        var stride = Math.max(4,Math.floor(pixels.length / 64 / 4) * 4);
        var winner = null;
        for(var i=0;i<pixels.length;i+=stride){
          var r=pixels[i]/255,g=pixels[i+1]/255,b=pixels[i+2]/255;
          var max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min;
          if(delta<.06 || max<.15 || min>.85) continue;
          var score=delta*(1-Math.abs((max+min)/2-.5));
          if(winner && score<=winner.score) continue;
          var hue=max===r?(g-b)/delta:max===g?(b-r)/delta+2:(r-g)/delta+4;
          winner={hue:Math.round((hue*60+360)%360)%360,score:score};
        }
        if(winner){
          root.style.setProperty('--av-art-hue',String(winner.hue));
          root.style.setProperty('--av-art-secondary',String((winner.hue+165)%360));
          if(renderer) renderer.invalidate();
        }else resetArtworkPalette();
      }catch(err){ resetArtworkPalette(); }
    }

    function paintBackdrop(){
      if(disposed || !backdrop || !coverImg || coverImg.hidden || !coverImg.complete || !coverImg.naturalWidth || paintedCover === coverImg.src) return;
      var context = backdrop.getContext('2d');
      if(!context) return;
      // Blur once at a bounded resolution, never a moving full-screen CSS filter.
      var size = perfBudget().low ? 160 : 256;
      backdrop.width = size; backdrop.height = size;
      context.filter = 'blur(' + Math.round(size * .065) + 'px)';
      var scale = Math.max(size / coverImg.naturalWidth, size / coverImg.naturalHeight) * 1.3;
      var w = coverImg.naturalWidth * scale, h = coverImg.naturalHeight * scale;
      context.drawImage(coverImg, (size - w) / 2, (size - h) / 2, w, h);
      context.filter = 'none';
      colorFromArtwork(context,size);
      paintedCover = coverImg.src;
      backdrop.hidden = false;
    }

    function renderTrack(data, forceShow){
      data = data || {};
      var title = (data.title || '').trim();
      var artist = (data.artist || '').trim();
      var hasRealTitle = !!title;

      if(titleEl){
        if(title) uiContent(titleEl,title);
        else uiText(titleEl,'等待音乐');
      }
      if(artistEl){
        if(artist) uiContent(artistEl,artist);
        else uiText(artistEl,forceShow ? '未知作者' : '');
        artistEl.hidden = !artist && !forceShow;
      }

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
      if(data.cover) paintBackdrop();
      else if(backdrop){ backdrop.hidden = true; paintedCover = ''; resetArtworkPalette(); }

      setHasTrack(!!forceShow || hasRealTitle);
      updatePlaybackState();
    }

    function trackFields(item){
      var manual = item.overrides || {};
      return {
        title:manual.title || item.title || item.file.name.replace(/\.[^.]+$/, ''),
        artist:manual.artist || item.artist || '',
        sampleRate:manual.sampleRate || item.sampleRate || 0
      };
    }

    function refreshCurrentTrackText(){
      if(!hasLocalAudioFile() || !playlist[currentIndex]) return;
      var info = trackFields(playlist[currentIndex]);
      if(titleEl) uiContent(titleEl,info.title);
      if(artistEl){
        if(info.artist) uiContent(artistEl,info.artist);
        else uiText(artistEl,'未知作者');
        artistEl.hidden=false;
      }
      updatePlaybackState();
    }

    function fillTrackEditor(){
      var info = trackFields(Object.assign({},editItem,{overrides:editDraft}));
      editTitle.value = info.title;
      editArtist.value = info.artist;
      editRate.value = info.sampleRate || '';
      editInitial = {title:editTitle.value.trim(),artist:editArtist.value.trim(),sampleRate:editRate.value.trim()};
    }

    function saveTrackEditor(){
      if(!editItem) return;
      if(!disposed && playlist.indexOf(editItem) >= 0){
        var draft = Object.assign({},editDraft);
        var values = {title:editTitle.value.trim(),artist:editArtist.value.trim(),sampleRate:editRate.value.trim()};
        ['title','artist','sampleRate'].forEach(function(key){
          if(values[key] === editInitial[key]) return;
          if(!values[key]) delete draft[key];
          else if(key !== 'sampleRate') draft[key] = values[key].slice(0,key === 'title' ? 240 : 160);
          else if(editRate.validity.valid) draft.sampleRate = Number(values[key]);
        });
        editItem.overrides = draft;
        renderPlaylist(editItem);
        refreshCurrentTrackText();
      }
      editItem = editDraft = editInitial = null;
    }

    function closeTrackEditor(){
      if(!trackDialog || !trackDialog.open) return;
      if(!trackForm.reportValidity()) return;
      saveTrackEditor();
      trackDialog.close();
    }

    function openTrackEditor(){
      if(disposed || !hasLocalAudioFile() || !playlist[currentIndex] || trackDialog.open) return;
      playlistCollapsed = true;updatePlaylistCollapse();
      editItem = playlist[currentIndex];
      editDraft = Object.assign({},editItem.overrides);
      fillTrackEditor();
      trackDialog.showModal();
    }

    function updatePlaybackState(){
      var local = hasLocalAudioFile();
      syncReturnButton();
      var playing = root.classList.contains('is-browser-audio-live') || !!(local && audio && !audio.paused && !audio.ended);
      root.classList.toggle('is-playing', playing);
      if(playBtn){
        playBtn.disabled = !local;
        playBtn.setAttribute('aria-label', playing ? '暂停' : '播放');
        playBtn.title = playing ? '暂停' : '播放';
        if(playIcon) playIcon.hidden = playing;
        if(pauseIcon) pauseIcon.hidden = !playing;
      }
      if(prevBtn) prevBtn.disabled = !local || playlist.length < 2;
      if(nextBtn) nextBtn.disabled = !local || playlist.length < 2;
      if(coverPicker) coverPicker.disabled = !local;
      if(trackEditBtn){trackEditBtn.hidden = !local;trackEditBtn.disabled = !local;}
      if(progressBar){
        progressBar.setAttribute('aria-disabled', canSeekLocalAudio() ? 'false' : 'true');
        progressBar.tabIndex = canSeekLocalAudio() ? 0 : -1;
      }
      if(sampleRateEl){
        var item = local && playlist[currentIndex];
        var fileRate = item && item.sampleRate;
        var manualRate = item && item.overrides && item.overrides.sampleRate;
        var rate = manualRate || fileRate || (audioCtx && audioCtx.sampleRate);
        sampleRateEl.hidden = !rate || !root.classList.contains('is-visual-live');
        sampleRateEl.textContent = rate ? (manualRate || fileRate ? '' : '分析 ') + Number((rate / 1000).toFixed(3)) + ' kHz' + (manualRate ? ' · 标注' : '') : '';
        sampleRateEl.dataset.source = manualRate ? 'manual' : fileRate ? 'file' : 'analysis';
        sampleRateEl.title = manualRate ? '手动标注（不改变音频采样率）' : fileRate ? '文件采样率' : '浏览器分析采样率（不代表原文件）';
        sampleRateEl.setAttribute('aria-label',sampleRateEl.title + '：' + sampleRateEl.textContent);
      }
    }

    function updateLocalAudioMeta(now){
      if(!audio || !audio.src || !root.classList.contains('is-local-audio-live')) return;
      if(!Number.isFinite(audio.duration) || audio.duration <= 0) return;
      if(typeof now !== 'number') now = performance.now();

      // DOM 写入会抢主线程；进度条不需要 60fps，节流后中心可视化会更稳。
      if(!seekingLocalAudio && lastMetaUpdateAt && now - lastMetaUpdateAt < 180) return;
      lastMetaUpdateAt = now;

      var duration = audio.duration * 1000;
      var position = Math.max(0, audio.currentTime * 1000);
      var progress = Math.max(0, Math.min(100, position / duration * 100));
      var timeText = formatTime(position) + ' / ' + formatTime(duration);
      if(progressBar){
        if(progressBar.getAttribute('aria-disabled') !== 'false'){
          progressBar.setAttribute('aria-disabled', 'false');progressBar.tabIndex = 0;
        }
        if(progressBar.getAttribute('aria-valuetext') !== timeText) progressBar.setAttribute('aria-valuetext', timeText);
      }

      if(!seekingLocalAudio){
        if(progressEl) progressEl.style.width = progress + '%';
        var percentage = String(Math.round(progress));
        if(progressBar && progressBar.getAttribute('aria-valuenow') !== percentage) progressBar.setAttribute('aria-valuenow', percentage);
        if(timeEl && timeEl.textContent !== timeText) timeEl.textContent = timeText;
      }
    }

    async function readAudioTags(file){
      var metadata = window.SonglineAudioMetadata;
      if(!metadata || typeof metadata.read !== 'function'){
        console.warn('[audio-visualizer] audio metadata module is unavailable');
        return {title:'', artist:'', cover:''};
      }
      return metadata.read(file, {independent:true});
    }

    function setVolume(raw){
      var value = Math.max(0, Math.min(100, Number(raw)));
      if(!Number.isFinite(value)) value = 80;

      var ratio = value / 100;
      if(audio) audio.volume = ratio;
      if(volumeInput) volumeInput.value = String(Math.round(value));

      try{
        localStorage.setItem(VOLUME_KEY, String(Math.round(value)));
      }catch(err){}
    }


    function showPlaylist(){
      if(!playlist.length){playlistCollapsed = true;updatePlaylistCollapse();}
      if(playlistPanel) playlistPanel.hidden = playlist.length === 0;
      root.classList.toggle('has-local-playlist', playlist.length > 0);
      if(queueCount && queueCount.textContent !== String(playlist.length)) queueCount.textContent = String(playlist.length);
      updatePlaylistCollapse();
      updatePlayModeButton();
    }

    function createPlaylistRow(){
        var row = document.createElement('div');
        row.className = 'av-playlist-item';
        var main = document.createElement('button');
        main.type = 'button';
        main.className = 'av-playlist-main';
        var title = document.createElement('strong');
        var meta = document.createElement('span');
        main.appendChild(title);
        var remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'av-playlist-remove';
        uiText(remove, '移出');
        row.appendChild(main);
        row.appendChild(remove);
        return {row:row, main:main, title:title, meta:meta, remove:remove};
    }

    function updatePlaylistRow(item){
      var entry = playlistRows.get(item);
      if(!entry) return;
      var info = trackFields(item);
      if(entry.title.textContent !== info.title) entry.title.textContent = info.title;
      if(entry.main.getAttribute('aria-label') !== '播放 ' + info.title){
        entry.main.setAttribute('aria-label', '播放 ' + info.title);
        entry.remove.setAttribute('aria-label', '从列表移出 ' + info.title);
      }
      if(entry.meta.textContent !== info.artist) entry.meta.textContent = info.artist;
      if(info.artist){ if(entry.meta.parentNode !== entry.main) entry.main.appendChild(entry.meta); }
      else if(entry.meta.parentNode) entry.meta.remove();
    }

    function renderPlaylist(changedItem){
      showPlaylist();
      if(!playlistList) return;
      if(playlistDirty){
        var retained = new Set(playlist);
        playlistRows.forEach(function(entry, item){
          if(!retained.has(item)){ entry.row.remove(); playlistRows.delete(item); }
        });
        playlist.forEach(function(item, index){
          var entry = playlistRows.get(item);
          if(!entry){ entry = createPlaylistRow(); playlistRows.set(item, entry); updatePlaylistRow(item); }
          entry.row.dataset.index = String(index);
          if(playlistList.children[index] !== entry.row) playlistList.insertBefore(entry.row, playlistList.children[index] || null);
        });
        playlistDirty = false;
      }
      if(changedItem) updatePlaylistRow(changedItem);
      var active = playlistRows.get(playlist[currentIndex]) || null;
      if(active !== activePlaylistRow){
        if(activePlaylistRow){ activePlaylistRow.row.classList.remove('is-active'); activePlaylistRow.main.removeAttribute('aria-current'); }
        if(active){ active.row.classList.add('is-active'); active.main.setAttribute('aria-current', 'true'); }
        activePlaylistRow = active;
      }
      updatePlaybackState();
    }

    function onPlaylistClick(event){
      if(disposed) return;
      var control = event.target.closest && event.target.closest('.av-playlist-main, .av-playlist-remove');
      var row = control && control.closest('.av-playlist-item');
      if(!row || !playlistList.contains(row)) return;
      var index = Number(row.dataset.index), entry = playlistRows.get(playlist[index]);
      if(!Number.isInteger(index) || !entry || entry.row !== row) return;
      if(control === entry.remove){ event.stopPropagation(); removePlaylistItem(index); }
      else if(control === entry.main) playPlaylistIndex(index);
    }

    function releaseCover(item){
      if(item && item.cover){ try{ URL.revokeObjectURL(item.cover); }catch(err){} item.cover = ''; }
    }

    function readPlaylistTags(item){
      if(item.tagsPromise) return item.tagsPromise;
      item.tagsPromise = readAudioTags(item.file).then(function(tags){
        if(disposed || playlist.indexOf(item) < 0){
          if(tags.cover) URL.revokeObjectURL(tags.cover);
          return {};
        }
        item.title = tags.title || item.title;
        item.artist = tags.artist || item.artist;
        item.sampleRate = Number(tags.sampleRate) || 0;
        if(item.customCover){ if(tags.cover) URL.revokeObjectURL(tags.cover); }
        else item.cover = tags.cover || '';
        renderPlaylist(item);
        return tags;
      }).catch(function(){ return {}; });
      return item.tagsPromise;
    }

    function removePlaylistItem(index){
      if(index < 0 || index >= playlist.length) return;

      var removedCurrent = index === currentIndex;
      releaseCover(playlist[index]);
      playlist.splice(index, 1);
      playlistDirty = true;

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
        renderTrack({}, false);
        setPill(audioState, '等待音频来源', false);
        setHint('');
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
      setHint('');
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
          artist:'',
          cover:''
        });
      });
      playlistDirty = true;
      renderPlaylist();
      setHint('');

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
      if(browserAudioBtn.disabled) return;
      var token = ++captureToken;
      var ac = ensureAudio();
      if(!ac) return;

      if(!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia){
        setHint('当前浏览器不支持网页端系统声音捕获。');
        return;
      }

      setHint('正在请求浏览器音频捕获权限。请选择包含声音的来源，并勾选共享音频。');
      browserAudioBtn.disabled = true;

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
        if(disposed || token !== captureToken){
          stream.getTracks().forEach(function(track){ track.stop(); });
          return;
        }

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
        uploadToken++;

        browserStream = new MediaStream(audioTracks);
        browserStreamSource = ac.createMediaStreamSource(browserStream);
        browserStreamSource.connect(analyser);

        renderTrack({
          title:'系统声音',
          artist:'',
          progress:0,
          positionText:'--:--',
          durationText:'--:--',
          cover:''
        }, false);

        setHasTrack(true);
        root.classList.add('is-browser-audio-live');
        root.classList.remove('is-local-audio-live');
        root.classList.remove('is-seeking-local-audio');
        setPill(audioState, '浏览器系统声音已接入', true);
        setVisualLive(true);
        updatePlaybackState();
        audioTracks.forEach(function(track){
          track.addEventListener('ended', function(){
            if(disposed || token !== captureToken) return;
            stopAll();
            renderTrack({}, false);
            setHint('共享已结束，可以重新选择音频。');
          }, {once:true});
        });
        setHint('');
      }catch(err){
        if(disposed || token !== captureToken) return;
        setPill(audioState, '系统声音待接入', false);
        setHint('浏览器音频授权被取消或失败：' + (err && err.message ? err.message : err));
      }finally{
        if(!disposed) browserAudioBtn.disabled = false;
      }
    }

    async function handleUpload(file, playlistItem){
      if(disposed || !file || !audio) return;

      var thisUpload = ++uploadToken;
      captureToken++;
      coverToken++;
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

      var info = trackFields(playlistItem);
      renderTrack({
        title:info.title,
        artist:info.artist,
        progress:0,
        positionText:'--:--',
        durationText:'--:--',
        cover:playlistItem.cover || ''
      }, true);

      setPill(audioState, playlist.length ? ('本地播放列表 · ' + (currentIndex + 1) + ' / ' + playlist.length) : '本地文件已接入', true);
      setVisualLive(true);
      setHint('');

      audio.play().catch(function(){
        if(!disposed && thisUpload === uploadToken) setHint('点击播放按钮开始聆听。');
      });

      await readPlaylistTags(playlistItem);
      if(disposed || thisUpload !== uploadToken || !root.classList.contains('is-local-audio-live')) return;

      info = trackFields(playlistItem);
      renderTrack({
        title:info.title,
        artist:info.artist,
        progress:Number.isFinite(audio.duration) && audio.duration > 0 ? audio.currentTime / audio.duration * 100 : 0,
        positionText:formatTime(audio.currentTime * 1000),
        durationText:Number.isFinite(audio.duration) ? formatTime(audio.duration * 1000) : '--:--',
        cover:playlistItem.cover || ''
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
        ensureAudio();
        audio.play().then(function(){
          if(!disposed) setHint('');
        }).catch(function(){
          if(!disposed) setHint('浏览器阻止了播放，请点击页面或重新打开文件。');
        });
      }else{
        audio.pause();
        setHint('');
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
      captureToken++;
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
      updatePlaybackState();
      setPill(audioState, '等待音频来源', false);
      setHint('');
    }

    function returnToSource(){
      // Reset the session without destroying the controller or its source buttons.
      // Late tags/covers/capture must not repopulate this freshly cleared screen.
      coverToken++;
      editItem = editDraft = editInitial = null;
      if(trackDialog && trackDialog.open) trackDialog.close();
      playlistCollapsed = true;updatePlaylistCollapse();
      playlist.forEach(releaseCover);
      playlist = [];
      playlistDirty = true;
      currentIndex = -1;
      pendingCovers.forEach(function(url){URL.revokeObjectURL(url);});
      pendingCovers.clear();
      lastMetaUpdateAt = 0;
      seekingLocalAudio = false;
      dragAudioDepth = 0;
      setDragAudioActive(false);
      stopAll();
      renderTrack({},false);
      renderPlaylist();
      if(backdrop){backdrop.width = 1;backdrop.height = 1;paintedCover = '';}
      window.scrollTo({top:0,left:0,behavior:'instant'});
    }

    function onReturnClick(event){
      if(disposed || event.defaultPrevented || event.button > 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || !root.classList.contains('is-visual-live')) return;
      event.preventDefault();
      returnToSource();
      if(event.detail === 0 && uploadBtn) uploadBtn.focus({preventScroll:true});
      else returnBtn.blur();
    }
    if(returnBtn) returnBtn.addEventListener('click',onReturnClick);

    var renderData = {};
    var renderer = window.SonglineCreateAudioVisualizerRenderer && window.SonglineCreateAudioVisualizerRenderer({
      root: root,
      canvas: canvas,
      ctx: ctx,
      perfBudget: perfBudget,
      getAudioData: function(){
        renderData.analyser = analyser;renderData.freqData = freqData;renderData.waveData = waveData;
        renderData.sampleRate = audioCtx && audioCtx.sampleRate;
        return renderData;
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

      window.addEventListener('dragover', onWindowDragOver);
      window.addEventListener('drop', onWindowDrop);
    }

    function onWindowDragOver(event){
      if(dataTransferHasFiles(event)) event.preventDefault();
    }

    function onWindowDrop(event){
      if(dataTransferHasFiles(event) && !stage.contains(event.target)){
        event.preventDefault();
        dragAudioDepth = 0;
        setDragAudioActive(false);
      }
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
      browserAudioBtn.addEventListener('click', function(event){
        connectBrowserSystemAudio();
        if(event.detail > 0) browserAudioBtn.blur();
      });
    }

    if(openFileBtn){
      openFileBtn.addEventListener('click', function(event){
        keyboardFilePicker = event.detail === 0;
        openLocalAudioPicker();
        if(event.detail > 0) openFileBtn.blur();
      });
    }

    if(uploadBtn){
      uploadBtn.addEventListener('click', function(event){
        keyboardFilePicker = event.detail === 0;
        openLocalAudioPicker();
        if(event.detail > 0) uploadBtn.blur();
      });
    }

    if(playBtn) playBtn.addEventListener('click', toggleLocalAudioPlayback);
    if(playlistList) playlistList.addEventListener('click', onPlaylistClick);
    if(exitDisplay) exitDisplay.addEventListener('click', function(){
      setDisplayMode(false);
      if(displayModeBtn) displayModeBtn.focus({preventScroll:true});
    });
    if(coverPicker && coverFile) coverPicker.addEventListener('click', function(){
      coverFile.value = '';
      coverFile.click();
    });
    if(coverFile) coverFile.addEventListener('change', function(){
      var file = coverFile.files && coverFile.files[0], item = playlist[currentIndex];
      coverFile.value = '';
      if(!file || !item || !hasLocalAudioFile()) return;
      if(!/^image\/(jpeg|png|webp|gif)$/.test(file.type) || file.size > 12 * 1024 * 1024){
        setHint('请选择不超过 12 MB 的 JPG、PNG、WebP 或 GIF 曲绘。');
        return;
      }
      var token = ++coverToken, url = URL.createObjectURL(file), probe = new Image();
      pendingCovers.add(url);
      probe.onload = function(){
        pendingCovers.delete(url);
        if(disposed || token !== coverToken || playlist.indexOf(item) < 0){ URL.revokeObjectURL(url); return; }
        releaseCover(item);
        item.cover = url;
        item.customCover = true;
        if(playlist[currentIndex] === item && hasLocalAudioFile()){
          coverImg.src = url; coverImg.hidden = false; coverFallback.hidden = true;
        }
        setHint('');
      };
      probe.onerror = function(){
        pendingCovers.delete(url);
        URL.revokeObjectURL(url);
        if(!disposed && token === coverToken) setHint('无法读取这张曲绘，请选择另一张图片。');
      };
      probe.src = url;
    });
    if(coverImg) coverImg.addEventListener('load', paintBackdrop);
    if(trackEditBtn) trackEditBtn.addEventListener('click',openTrackEditor);
    if(trackDialog){
      root.querySelector('[data-av-track-close]').addEventListener('click',closeTrackEditor);
      root.querySelector('[data-av-track-reset]').addEventListener('click',function(){editDraft = {};fillTrackEditor();});
      trackForm.addEventListener('submit',function(event){event.preventDefault();closeTrackEditor();});
      trackDialog.addEventListener('cancel',function(event){event.preventDefault();closeTrackEditor();});
      trackDialog.addEventListener('close',function(){if(!trackDialog.open) saveTrackEditor();});
      trackDialog.addEventListener('click',function(event){
        if(event.target !== trackDialog || !event.detail) return;
        var rect = trackDialog.getBoundingClientRect();
        if(event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeTrackEditor();
      });
    }
    if(coverImg) coverImg.addEventListener('error', function(){
      coverImg.hidden = true;
      coverFallback.hidden = false;
      if(backdrop){backdrop.hidden = true;paintedCover = '';resetArtworkPalette();}
    });

    if(prevBtn){
      prevBtn.addEventListener('click', function(event){
        playPrev();
        if(event.detail > 0) prevBtn.blur();
      });
    }

    if(playlistToggleBtn){
      playlistToggleBtn.addEventListener('click', function(event){
        queueKeyboard = event.detail === 0;
        if(!nativeQueue){
          playlistCollapsed = !playlistCollapsed;
          updatePlaylistCollapse();
          if(!playlistCollapsed && queueKeyboard){var first=playlistList.querySelector('button');if(first)first.focus({preventScroll:true});}
        }
        if(event.detail > 0) playlistToggleBtn.blur();
      });
    }
    function onQueueToggle(){
      if(disposed || !nativeQueue) return;
      playlistCollapsed = !playlistPanel.matches(':popover-open');
      syncQueueControls();
      if(!playlistCollapsed && queueKeyboard){var first=playlistList.querySelector('button');if(first)first.focus({preventScroll:true});}
      if(playlistCollapsed && queueKeyboard && (document.activeElement === document.body || playlistPanel.contains(document.activeElement))){
        playlistToggleBtn.focus({preventScroll:true});
      }
    }
    if(playlistPanel) playlistPanel.addEventListener('beforetoggle',function(event){
      if(disposed || !nativeQueue) return;
      playlistCollapsed = event.newState !== 'open';
      syncQueueControls();
    });
    if(playlistPanel) playlistPanel.addEventListener('toggle',onQueueToggle);
    function onOutsideQueue(event){
      if(!nativeQueue && !playlistCollapsed && !playlistPanel.contains(event.target) && !playlistToggleBtn.contains(event.target)){
        playlistCollapsed = true;updatePlaylistCollapse();
      }
    }
    document.addEventListener('pointerdown',onOutsideQueue);

    if(playModeBtn){
      playModeBtn.addEventListener('click', function(event){
        cyclePlayMode();
        if(event.detail > 0) playModeBtn.blur();
      });
    }

    if(displayModeBtn){
      displayModeBtn.addEventListener('click', function(event){
        toggleDisplayMode();
        if(displayMode && event.detail === 0 && exitDisplay) exitDisplay.focus({preventScroll:true});
        if(event.detail > 0) displayModeBtn.blur();
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
      nextBtn.addEventListener('click', function(event){
        playNext(true);
        if(event.detail > 0) nextBtn.blur();
      });
    }

    if(fileInput){
      fileInput.addEventListener('change', function(){
        var files = fileInput.files;
        if(files && files.length) addFilesToPlaylist(files, true);
        // The source chooser becomes hidden after loading. A keyboard user
        // needs a visible destination, not focus stranded in that hidden panel.
        if(keyboardFilePicker && root.classList.contains('is-local-audio-live') && nowCard){ nowCard.tabIndex = -1;nowCard.focus({preventScroll:true}); }
        keyboardFilePicker = false;
        fileInput.value = '';
      });
    }

    if(audio){
      audio.addEventListener('ended', function(){
        if(playlist.length) playNext(false);
      });
      audio.addEventListener('loadedmetadata', updateLocalAudioMeta);
      audio.addEventListener('timeupdate', updateLocalAudioMeta);
      ['play','pause','ended','loadedmetadata','emptied'].forEach(function(name){audio.addEventListener(name, updatePlaybackState);});
      audio.addEventListener('error', function(){
        if(!disposed && audio.getAttribute('src')){
          setHint('无法播放这个文件，请检查格式或选择另一首音乐。');
          updatePlaybackState();
        }
      });
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

    function onDocumentKeydown(event){
      if(event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.ctrlKey || event.metaKey || event.altKey || root.querySelector('[data-tool-help-dialog][open], [data-av-track-dialog][open]')) return;
      if(!playlistCollapsed){
        if(!nativeQueue && event.key === 'Escape'){
          playlistCollapsed = true;updatePlaylistCollapse();playlistToggleBtn.focus({preventScroll:true});event.preventDefault();
        }
        return;
      }
      if(event.key === 'Escape' && displayMode){
        setDisplayMode(false);
        if(displayModeBtn) displayModeBtn.focus({preventScroll:true});
        event.preventDefault();
        return;
      }
      if(event.code !== 'Space' && event.key !== ' ') return;
      if(!hasLocalAudioFile()) return;
      if(isTypingOrControlTarget(event.target)) return;
      event.preventDefault();
      if(event.repeat) return;
      toggleLocalAudioPlayback();
    }
    document.addEventListener('keydown', onDocumentKeydown);

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
      fullscreenBtn.addEventListener('click', function(event){
        var target = root.querySelector('.av-stage') || root;
        if(!document.fullscreenElement && target.requestFullscreen){
          target.requestFullscreen().catch(function(){setHint('当前浏览器未允许全屏，仍可在此播放。');});
        }else if(document.exitFullscreen){
          document.exitFullscreen().catch(function(){});
        }
        if(event.detail > 0) fullscreenBtn.blur();
      });
    }
    function onFullscreenChange(){
      var full = document.fullscreenElement === stage;
      if(fullscreenBtn){
        fullscreenBtn.setAttribute('aria-label',full ? '退出全屏' : '全屏显示');
        fullscreenBtn.title = full ? '退出全屏' : '全屏';
      }
    }
    document.addEventListener('fullscreenchange',onFullscreenChange);

    setPill(audioState, '等待音频来源', false);
    setHasTrack(false);
    setVisualLive(false);
    showPlaylist();
    setHint('');

    renderer.resize();

    function onVisibilityChange(){ renderer.handleVisibility(document.hidden); }
    var resumeCachedAudio = false;
    function onPageShow(event){
      if(!event || !event.persisted) return;
      renderer.start();
      renderer.softenAnimationResume();
      if(resumeCachedAudio && audio){
        resumeCachedAudio = false;
        if(audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(function(){});
        audio.play().catch(function(){});
      }
    }
    function onPageHide(event){
      if(!event.persisted){ cleanup(); return; }
      renderer.stop();
      closeTrackEditor();
      playlistCollapsed = true;updatePlaylistCollapse();
      resumeCachedAudio = !!(audio && !audio.paused);
      if(audio) audio.pause();
      if(audioCtx && audioCtx.state === 'running') audioCtx.suspend().catch(function(){});
    }
    function cleanup(){
      if(disposed) return;
      disposed = true;
      uploadToken++;
      captureToken++;
      coverToken++;
      renderer.stop();
      editItem = editDraft = editInitial = null;
      if(trackDialog && trackDialog.open) trackDialog.close();
      playlistCollapsed = true;
      updatePlaylistCollapse();
      setDisplayMode(false);
      setDragAudioActive(false);
      stopBrowserStream();
      revokeUrls();
      playlist.forEach(releaseCover);
      playlist = [];
      playlistRows.clear(); activePlaylistRow = null;
      if(playlistList){ playlistList.removeEventListener('click', onPlaylistClick); playlistList.replaceChildren(); }
      pendingCovers.forEach(function(url){ URL.revokeObjectURL(url); });
      pendingCovers.clear();
      if(coverImg) coverImg.removeAttribute('src');
      if(backdrop){ backdrop.width = 1; backdrop.height = 1; paintedCover = ''; }
      if(audio){
        try{ audio.pause(); audio.removeAttribute('src'); audio.load(); }catch(err){}
      }
      try{ if(elementSource) elementSource.disconnect(); }catch(err){}
      try{ if(analyser) analyser.disconnect(); }catch(err){}
      elementSource = null;
      analyser = null;
      if(audioCtx && audioCtx.state !== 'closed') audioCtx.close().catch(function(){});
      audioCtx = null;
      document.removeEventListener('keydown', onDocumentKeydown);
      document.removeEventListener('pointerdown',onOutsideQueue);
      document.removeEventListener('fullscreenchange',onFullscreenChange);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('dragover', onWindowDragOver);
      window.removeEventListener('drop', onWindowDrop);
      window.removeEventListener('resize', renderer.invalidate);
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('songline:animation-before-resume', renderer.syncVisualPhase);
      window.removeEventListener('songline:animation-resume', renderer.softenAnimationResume);
      window.removeEventListener('songline:page-transition-start', onTransitionStart);
      window.removeEventListener('pagehide', onPageHide);
      if(document.fullscreenElement && root.contains(document.fullscreenElement) && document.exitFullscreen) document.exitFullscreen().catch(function(){});
      if(window.__songlineAudioVisualizerCleanup === cleanup) window.__songlineAudioVisualizerCleanup = null;
    }
    function onTransitionStart(){ cleanup(); }
    window.addEventListener('resize', renderer.invalidate, {passive:true});
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('songline:animation-before-resume', renderer.syncVisualPhase);
    window.addEventListener('songline:animation-resume', renderer.softenAnimationResume);
    window.addEventListener('songline:page-transition-start', onTransitionStart);
    window.addEventListener('pagehide', onPageHide);
    window.__songlineAudioVisualizerCleanup = cleanup;
    renderer.start();
  }

  function boot(target){
    var root = target && target.querySelector ? target : document;
    root.querySelectorAll('[data-audio-visualizer]').forEach(init);
  }

  window.SonglineInitAudioVisualizer = boot;
})();

})();
