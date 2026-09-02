(function(){
  'use strict';

  var AUDIO_RE = /\.(mp3|flac|wav|m4a|aac|ogg|opus)$/i;
  var DB_NAME = 'songline-home-music';
  var DB_STORE = 'sources';
  var DB_KEY = 'default-directory';
  var LAST_INDEX_KEY = 'songline-home-music-last-index';

  function isAudio(file){
    return !!(file && (file.type && file.type.indexOf('audio/') === 0 || AUDIO_RE.test(file.name || '')));
  }

  function displayName(file){
    return String(file && file.name || '未命名曲目').replace(/\.[^.]+$/, '');
  }

  function readLastIndex(){
    try{ return Math.max(0, Number(localStorage.getItem(LAST_INDEX_KEY) || 0) || 0); }catch(e){ return 0; }
  }

  function saveLastIndex(index){
    try{ localStorage.setItem(LAST_INDEX_KEY, String(index)); }catch(e){}
  }

  function openDatabase(){
    return new Promise(function(resolve, reject){
      if(!window.indexedDB) return reject(new Error('IndexedDB unavailable'));
      var request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = function(){
        if(!request.result.objectStoreNames.contains(DB_STORE)) request.result.createObjectStore(DB_STORE);
      };
      request.onsuccess = function(){ resolve(request.result); };
      request.onerror = function(){ reject(request.error || new Error('IndexedDB unavailable')); };
    });
  }

  async function saveDirectoryHandle(handle){
    try{
      var db = await openDatabase();
      await new Promise(function(resolve, reject){
        var request = db.transaction(DB_STORE, 'readwrite').objectStore(DB_STORE).put(handle, DB_KEY);
        request.onsuccess = resolve;
        request.onerror = function(){ reject(request.error); };
      });
      db.close();
    }catch(e){}
  }

  async function readDirectoryHandle(){
    try{
      var db = await openDatabase();
      var handle = await new Promise(function(resolve, reject){
        var request = db.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).get(DB_KEY);
        request.onsuccess = function(){ resolve(request.result || null); };
        request.onerror = function(){ reject(request.error); };
      });
      db.close();
      return handle;
    }catch(e){ return null; }
  }

  async function collectDirectoryFiles(handle, list){
    list = list || [];
    for await (var entry of handle.values()){
      if(entry.kind === 'directory') await collectDirectoryFiles(entry, list);
      else if(entry.kind === 'file'){
        var file = await entry.getFile();
        if(isAudio(file)) list.push(file);
      }
    }
    return list;
  }

  function init(root){
    root = root || document;
    var host = root.querySelector ? root.querySelector('[data-home-music]') : null;
    if(!host || host.dataset.homeMusicReady === '1') return;
    host.dataset.homeMusicReady = '1';

    if(window.__songlineHomeMusicPlayer && typeof window.__songlineHomeMusicPlayer.destroy === 'function'){
      window.__songlineHomeMusicPlayer.destroy();
    }

    var audio = host.querySelector('[data-home-music-audio]');
    var playGlyph = host.querySelector('[data-home-music-play-glyph]');
    var title = host.querySelector('[data-home-music-title]');
    var artist = host.querySelector('[data-home-music-artist]');
    var status = host.querySelector('[data-home-music-status]');
    var toggle = host.querySelector('[data-home-music-toggle]');
    var fileInput = host.querySelector('[data-home-music-file]');
    var folderInput = host.querySelector('[data-home-music-folder]');
    var listPanel = host.querySelector('[data-home-music-playlist]');
    var list = host.querySelector('[data-home-music-playlist-list]');
    var listToggle = host.querySelector('[data-home-music-list-toggle]');
    var sourceToggle = host.querySelector('[data-home-music-source-toggle]');
    var volumeButton = host.querySelector('[data-home-music-volume]');
    var volumeInput = host.querySelector('[data-home-music-volume-input]');
    var waveform = host.querySelector('[data-home-music-waveform]');
    var wavesurfer = null;
    var tracks = [];
    var current = -1;
    var activeUrl = '';
    var metadataToken = 0;
    var volumeFadeTimer = 0;
    var volumeFadeResolve = null;
    var preferredVolume = .88;
    var isMuted = false;
    var disposed = false;

    audio.volume = preferredVolume;

    function setStatus(message){ if(status) status.textContent = message; }
    function setText(node, value){ if(node) node.textContent = value || ''; }
    function revokeActiveUrl(){
      if(!activeUrl) return;
      try{ URL.revokeObjectURL(activeUrl); }catch(e){}
      activeUrl = '';
    }

    function updateControls(){
      var hasTrack = current >= 0 && current < tracks.length;
      host.classList.toggle('has-track', hasTrack);
      host.classList.toggle('is-playing', !audio.paused && hasTrack);
      if(toggle){
        toggle.setAttribute('aria-label', !audio.paused && hasTrack ? '暂停' : hasTrack ? '播放' : '选择音乐');
        toggle.setAttribute('aria-pressed', !audio.paused && hasTrack ? 'true' : 'false');
        toggle.title = !audio.paused && hasTrack ? '暂停' : hasTrack ? '播放' : '选择音乐';
      }
      if(playGlyph) playGlyph.textContent = !audio.paused && hasTrack ? 'Ⅱ' : '▶';
      if(listToggle) listToggle.setAttribute('aria-expanded', listPanel && !listPanel.hidden ? 'true' : 'false');
      if(volumeButton){
        var muted = isMuted || preferredVolume <= 0;
        volumeButton.setAttribute('aria-pressed', muted ? 'true' : 'false');
        volumeButton.setAttribute('aria-label', muted ? '取消静音' : '静音');
        volumeButton.title = muted ? '取消静音' : '静音';
      }
      if(volumeInput) volumeInput.value = String(Math.round(preferredVolume * 100));
      host.classList.toggle('is-muted', isMuted || preferredVolume <= 0);
    }

    function cancelVolumeFade(){
      if(volumeFadeTimer) clearTimeout(volumeFadeTimer);
      volumeFadeTimer = 0;
      if(volumeFadeResolve){
        var resolve = volumeFadeResolve;
        volumeFadeResolve = null;
        resolve();
      }
    }

    function fadeAudioVolume(target, duration){
      cancelVolumeFade();
      target = Math.max(0, Math.min(1, Number(target) || 0));
      duration = Math.max(0, Number(duration) || 0);
      var initial = audio.volume;
      if(document.hidden || !duration || Math.abs(initial - target) < .005){ audio.volume = target; return Promise.resolve(); }
      return new Promise(function(resolve){
        var started = Date.now();
        volumeFadeResolve = resolve;
        function finish(){
          volumeFadeTimer = 0;
          volumeFadeResolve = null;
          resolve();
        }
        function step(){
          if(document.hidden){ audio.volume = target; finish(); return; }
          var progress = Math.min(1, (Date.now() - started) / duration);
          var eased = 1 - Math.pow(1 - progress, 3);
          audio.volume = initial + (target - initial) * eased;
          if(progress < 1){ volumeFadeTimer = setTimeout(step, 16); return; }
          finish();
        }
        volumeFadeTimer = setTimeout(step, 0);
      });
    }

    function setPreferredVolume(value){
      preferredVolume = Math.max(0, Math.min(1, Number(value) || 0));
      isMuted = false;
      try{ audio.muted = false; }catch(e){}
      cancelVolumeFade();
      audio.volume = preferredVolume;
      updateControls();
    }

    function renderList(){
      if(!list) return;
      list.innerHTML = '';
      tracks.forEach(function(track, index){
        var button = document.createElement('button');
        button.type = 'button';
        button.className = index === current ? 'is-current' : '';
        button.innerHTML = '<span></span><small></small>';
        button.querySelector('span').textContent = track.title || displayName(track.file);
        button.querySelector('small').textContent = track.artist || '本地音频';
        button.addEventListener('click', function(){ loadTrack(index, true); });
        list.appendChild(button);
      });
    }

    function destroyWaveform(){
      if(wavesurfer && typeof wavesurfer.destroy === 'function') wavesurfer.destroy();
      wavesurfer = null;
      host.classList.remove('has-waveform', 'is-waveform-loading');
      if(waveform) waveform.innerHTML = '';
    }

    function loadWaveform(url){
      destroyWaveform();
      if(!waveform || !window.WaveSurfer || !url) return;
      host.classList.add('is-waveform-loading');
      try{
        wavesurfer = window.WaveSurfer.create({
          container: waveform,
          media: audio,
          url: url,
          height: 28,
          waveColor: 'rgba(239, 226, 211, .48)',
          progressColor: 'rgba(255, 235, 216, .96)',
          cursorColor: 'transparent',
          cursorWidth: 0,
          normalize: true,
          interact: false,
          hideScrollbar: true
        });
        wavesurfer.once('ready', function(){
          if(!disposed && wavesurfer){
            host.classList.remove('is-waveform-loading');
            host.classList.add('has-waveform');
          }
        });
        wavesurfer.once('error', function(){
          if(!disposed) destroyWaveform();
        });
      }catch(e){
        destroyWaveform();
      }
    }

    async function playCurrent(){
      if(current < 0){ if(fileInput) fileInput.click(); return; }
      try{
        var fadeIn = !isMuted && !document.hidden;
        audio.volume = isMuted ? 0 : fadeIn ? .02 : preferredVolume;
        await audio.play();
        if(fadeIn && !audio.paused) await fadeAudioVolume(preferredVolume, 230);
        setStatus((tracks[current].source || '本地音乐') + ' · 正在播放');
      }catch(e){ setStatus('浏览器需要再次点击播放'); }
      updateControls();
    }

    async function pauseCurrent(){
      if(audio.paused) return;
      if(!isMuted) await fadeAudioVolume(0, 170);
      audio.pause();
      audio.volume = preferredVolume;
      updateControls();
    }

    function stopPlaybackImmediately(){
      cancelVolumeFade();
      try{ audio.pause(); }catch(e){}
      audio.volume = preferredVolume;
      updateControls();
    }

    async function loadMetadata(track, index){
      var token = ++metadataToken;
      var result = null;
      try{
        if(window.SonglineAudioMetadata && typeof window.SonglineAudioMetadata.read === 'function') result = await window.SonglineAudioMetadata.read(track.file);
      }catch(e){}
      if(disposed || token !== metadataToken || index !== current) return;
      result = result || {};
      track.title = result.title || track.title || displayName(track.file);
      track.artist = result.artist || track.artist || '本地音频';
      setText(title, track.title);
      setText(artist, track.artist);
      renderList();
    }

    function loadTrack(index, autoplay){
      if(!tracks.length) return;
      current = (index + tracks.length) % tracks.length;
      saveLastIndex(current);
      destroyWaveform();
      revokeActiveUrl();
      activeUrl = URL.createObjectURL(tracks[current].file);
      audio.src = activeUrl;
      audio.volume = preferredVolume;
      audio.load();
      loadWaveform(activeUrl);
      var track = tracks[current];
      setText(title, track.title || displayName(track.file));
      setText(artist, track.artist || '读取音频信息…');
      setStatus((track.source || '本地音乐') + ' · ' + (current + 1) + ' / ' + tracks.length);
      renderList();
      updateControls();
      loadMetadata(track, current);
      if(autoplay) playCurrent();
    }

    function setTracks(files, source, preferredIndex){
      stopPlaybackImmediately();
      destroyWaveform();
      revokeActiveUrl();
      tracks = Array.prototype.slice.call(files || []).filter(isAudio).sort(function(a, b){
        var an = a.webkitRelativePath || a.name || '';
        var bn = b.webkitRelativePath || b.name || '';
        return an.localeCompare(bn, 'zh-Hans-CN', {numeric:true});
      }).map(function(file){ return { file:file, source:source, title:displayName(file), artist:'本地音频' }; });
      current = -1;
      metadataToken++;
      renderList();
      if(!tracks.length){
        setText(title, '没有找到音频');
        setText(artist, '请重新选择音乐来源');
        setStatus('未发现可播放的音频文件');
        updateControls();
        return;
      }
      loadTrack(Math.min(Math.max(0, preferredIndex || 0), tracks.length - 1), false);
    }

    function togglePlaylist(force){
      if(!listPanel) return;
      listPanel.hidden = typeof force === 'boolean' ? !force : !listPanel.hidden;
      updateControls();
    }

    function closePlaylistOnOutside(event){
      if(!listPanel || listPanel.hidden || listPanel.contains(event.target) || listToggle.contains(event.target)) return;
      togglePlaylist(false);
    }

    function readDroppedEntry(entry){
      if(!entry) return Promise.resolve([]);
      if(entry.isFile) return new Promise(function(resolve){ entry.file(function(file){ resolve([file]); }, function(){ resolve([]); }); });
      if(!entry.isDirectory) return Promise.resolve([]);
      return new Promise(function(resolve){
        var reader = entry.createReader();
        var entries = [];
        function readBatch(){
          reader.readEntries(function(batch){
            if(!batch.length){
              Promise.all(entries.map(readDroppedEntry)).then(function(groups){ resolve([].concat.apply([], groups)); });
              return;
            }
            entries = entries.concat(Array.prototype.slice.call(batch));
            readBatch();
          }, function(){ resolve([]); });
        }
        readBatch();
      });
    }

    function collectDroppedFiles(dataTransfer){
      var items = Array.prototype.slice.call(dataTransfer && dataTransfer.items || []);
      var entries = items.map(function(item){ return item.webkitGetAsEntry ? item.webkitGetAsEntry() : null; }).filter(Boolean);
      if(!entries.length) return Promise.resolve(Array.prototype.slice.call(dataTransfer && dataTransfer.files || []));
      return Promise.all(entries.map(readDroppedEntry)).then(function(groups){ return [].concat.apply([], groups); });
    }

    function hasFilePayload(event){
      var types = event.dataTransfer && event.dataTransfer.types;
      return !!(types && Array.prototype.indexOf.call(types, 'Files') >= 0);
    }

    function toggleMute(){
      if(isMuted || preferredVolume <= 0){
        if(preferredVolume <= 0) preferredVolume = .88;
        isMuted = false;
      }else{
        isMuted = true;
      }
      updateControls();
      try{
        audio.muted = isMuted;
        audio.volume = isMuted ? 0 : preferredVolume;
      }catch(e){}
    }

    async function chooseDirectory(){
      if(typeof window.showDirectoryPicker === 'function'){
        try{
          setStatus('正在读取音乐文件夹…');
          var handle = await window.showDirectoryPicker({mode:'read'});
          await saveDirectoryHandle(handle);
          var files = await collectDirectoryFiles(handle);
          setTracks(files, '已选择文件夹', 0);
          setStatus('已记住音乐文件夹 · 下次会自动恢复');
          return;
        }catch(e){
          if(e && e.name !== 'AbortError') setStatus('无法读取该文件夹');
          return;
        }
      }
      if(folderInput) folderInput.click();
    }

    async function restoreDirectory(){
      var handle = await readDirectoryHandle();
      if(!handle || disposed) return;
      try{
        var permission = handle.queryPermission ? await handle.queryPermission({mode:'read'}) : 'prompt';
        if(permission !== 'granted'){
          setStatus('已记住音乐文件夹 · 点击文件夹按钮恢复访问');
          return;
        }
        setStatus('正在恢复默认音乐文件夹…');
        var files = await collectDirectoryFiles(handle);
        setTracks(files, '已恢复文件夹', readLastIndex());
        setStatus('已恢复默认音乐文件夹 · 点击播放键开始');
      }catch(e){ setStatus('默认音乐文件夹暂不可访问'); }
    }

    toggle.addEventListener('click', function(){ audio.paused ? playCurrent() : pauseCurrent(); });
    host.querySelector('[data-home-music-previous]').addEventListener('click', function(){ if(tracks.length) loadTrack(current - 1, true); });
    host.querySelector('[data-home-music-next]').addEventListener('click', function(){ if(tracks.length) loadTrack(current + 1, true); });
    sourceToggle.addEventListener('click', function(){
      togglePlaylist(false);
      if(fileInput) fileInput.click();
    });
    listToggle.addEventListener('click', function(){ togglePlaylist(); });
    host.querySelector('[data-home-music-list-close]').addEventListener('click', function(){ togglePlaylist(false); });
    fileInput.addEventListener('change', function(){ setTracks(fileInput.files, '已选择单曲', 0); fileInput.value = ''; });
    folderInput.addEventListener('change', function(){ setTracks(folderInput.files, '已选择文件夹', 0); setStatus('已加载文件夹（此浏览器不会保留目录授权）'); folderInput.value = ''; });
    volumeButton.addEventListener('click', toggleMute);
    volumeInput.addEventListener('input', function(){ setPreferredVolume(Number(volumeInput.value) / 100); });
    audio.addEventListener('play', updateControls);
    audio.addEventListener('pause', updateControls);
    audio.addEventListener('ended', function(){ if(tracks.length) loadTrack(current + 1, true); });
    audio.addEventListener('error', function(){ if(current >= 0) setStatus('该音频暂时无法播放'); });
    document.addEventListener('visibilitychange', function(){
      if(!document.hidden) return;
      cancelVolumeFade();
      if(audio.paused) audio.volume = preferredVolume;
      else audio.volume = isMuted ? 0 : preferredVolume;
    });
    document.addEventListener('pointerdown', closePlaylistOnOutside);
    host.addEventListener('dragenter', function(event){ if(hasFilePayload(event)){ event.preventDefault(); host.classList.add('is-drop-target'); } });
    host.addEventListener('dragover', function(event){ if(hasFilePayload(event)) event.preventDefault(); });
    host.addEventListener('dragleave', function(event){ if(!host.contains(event.relatedTarget)) host.classList.remove('is-drop-target'); });
    host.addEventListener('drop', function(event){
      if(!hasFilePayload(event)) return;
      event.preventDefault();
      host.classList.remove('is-drop-target');
      setStatus('正在读取拖入的音乐…');
      collectDroppedFiles(event.dataTransfer).then(function(files){
        setTracks(files, '拖入音乐', 0);
        if(files.length) setStatus('已加载拖入的音乐');
      }).catch(function(){ setStatus('无法读取拖入的文件夹'); });
    });

    updateControls();
    restoreDirectory();
    window.__songlineHomeMusicPlayer = {
      destroy:function(){
        disposed = true;
        destroyWaveform();
        cancelVolumeFade();
        document.removeEventListener('pointerdown', closePlaylistOnOutside);
        try{ audio.pause(); }catch(e){}
        revokeActiveUrl();
        if(window.__songlineHomeMusicPlayer === this) window.__songlineHomeMusicPlayer = null;
      }
    };
  }

  window.SonglineInitHomeMusic = init;
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){ init(document); }, {once:true});
  else init(document);
})();
