(function(){
  'use strict';

  var VERSION = '20.20.6';
  try{
    var sourceURL = new URL((document.currentScript && document.currentScript.src) || '', window.location.href);
    VERSION = sourceURL.searchParams.get('v') || VERSION;
  }catch(e){}
  var loaded = Object.create(null);
  var loading = Object.create(null);

  function ensureStylesheet(id, href){
    if(document.getElementById(id)) return;
    var style = document.createElement('link');
    style.id = id;
    style.rel = 'stylesheet';
    style.href = href + '?v=' + encodeURIComponent(VERSION);
    document.head.appendChild(style);
  }

  function syncPageStyles(root){
    var path = window.location.pathname || '';
    // /posts/ 是档案列表，不是阅读页；用实际阅读容器判断可避免把文章阅读规则
    // 注入归档页，尤其是在无刷新过场后造成列表样式被污染。
    var isArticleSurface = path.indexOf('/tools/markdown-previewer/') === 0 || !!query(root, '.markdown-body, [data-article-renderer="songline-markdown"]');
    var isToolsPage = path.indexOf('/tools/') === 0 || !!query(root, '.tools-grid, .tool-card, .md-tool-layout, [data-snake-game], [data-game-2048]');
    var isSearchSurface = isToolsPage || path === '/' || path.indexOf('/posts/') === 0 || path.indexOf('/friends/') === 0 || !!query(root, '[data-content-archive], [data-search-submit], [data-tools-search], .home-friends-section');
    if(isArticleSurface){
      ensureStylesheet('songline-markdown-renderer-style', '/css/pages/content/markdown-renderer.css');
      ensureStylesheet('songline-article-compat-style', '/css/site-article-compat.css');
      ensureStylesheet('songline-markdown-compat-style', '/css/site-markdown-compat.css');
      ensureStylesheet('songline-article-overrides-style', '/css/site-article-overrides.css');
    }
    if(isToolsPage){
      ensureStylesheet('songline-tool-shared-style', '/css/tool-shared.css');
      ensureStylesheet('songline-tool-detail-shell-style', '/css/tools/detail-shell.css');
    }
    if(isSearchSurface){
      ensureStylesheet('songline-search-overrides-style', '/css/site-search-overrides.css');
    }
    if(path.indexOf('/tools/random-number/') === 0 || !!query(root, '[data-random-tool], .random-tool-panel')){
      ensureStylesheet('songline-random-number-style', '/css/tools/random-number.css');
    }
    if(path.indexOf('/tools/markdown-previewer/') === 0 || !!query(root, '[data-md-tool], .md-tool-layout')){
      // 动态换页时明确维持与服务端直开一致的层级顺序。
      ensureStylesheet('songline-article-reader-style', '/css/pages/content/article-reader.css');
      ensureStylesheet('songline-reader-floating-controls-style', '/css/pages/content/reader-floating-controls.css');
      ensureStylesheet('songline-markdown-previewer-style', '/css/tools/markdown-previewer.css');
      ensureStylesheet('songline-posts-campus-scene-style', '/css/pages/posts/campus-scene.css');
      ensureStylesheet('songline-tool-detail-shell-style', '/css/tools/detail-shell.css');
    }
    if(path.indexOf('/tools/audio-visualizer/') === 0 || !!query(root, '[data-audio-visualizer], .audio-visualizer-page')){
      // 与服务端直开页面保持一致：后面的样式层覆盖前面的历史规则。
      ensureStylesheet('songline-audio-foundation-style', '/css/tools/audio-visualizer-foundation.css');
      ensureStylesheet('songline-audio-interface-style', '/css/tools/audio-visualizer-interface.css');
      ensureStylesheet('songline-audio-stage-style', '/css/tools/audio-visualizer-stage.css');
      ensureStylesheet('songline-audio-playback-style', '/css/tools/audio-visualizer-playback.css');
    }
    [
      ['songline-snake-style', '/tools/snake/', '[data-snake-game], .snake-tool-panel', '/css/tools/snake.css'],
      ['songline-2048-style', '/tools/2048/', '[data-game-2048], .tool-2048-page', '/css/tools/game-2048.css'],
      ['songline-gacha-style', '/tools/gacha/', '[data-gacha], .gacha-tool-panel', '/css/tools/gacha.css'],
      ['songline-reaction-style', '/tools/reaction-test/', '[data-reaction-test], .reaction-test-page', '/css/tools/reaction-test.css'],
      ['songline-flappy-style', '/tools/flappy-bird/', '[data-flappy-bird], .flappy-bird-page', '/css/tools/flappy-bird.css'],
      ['songline-typing-style', '/tools/typing-practice/', '[data-typing-practice], .typing-page', '/css/tools/typing-practice.css'],
      ['songline-focus-style', '/tools/focus-timer/', '[data-focus-timer], .focus-timer-page', '/css/tools/focus-timer.css']
    ].forEach(function(style){
      if(path.indexOf(style[1]) === 0 || !!query(root, style[2])){
        ensureStylesheet(style[0], style[3]);
      }
    });
    if(query(root, '.tool-detail-surface')){
      ensureStylesheet('songline-tool-detail-shell-style', '/css/tools/detail-shell.css');
      ensureStylesheet('songline-tool-detail-layout-style', '/css/tools/detail-layout.css');
    }
  }

  var modules = [
    {
      key:'tool-controls', src:'/js/tool-controls.js?v=' + VERSION,
      test:function(root){ return !!query(root, '[data-tool-actionbar]'); },
      init:function(root){ window.SonglineInitToolControls(root || document); }
    },
    {
      key:'article-reading', src:'/js/article-reading.js?v=' + VERSION,
      test:function(root){ return !!query(root, '.article-shell'); },
      init:function(){}
    },
    {
      key:'article-toc-controls', src:'/js/article-toc-controls.js?v=' + VERSION,
      test:function(root){ return !!query(root, '.article-shell'); },
      init:function(root){ window.SonglineInitArticleToc(root || document); }
    },
    {
      key:'home-parallax', src:'/js/pages/home/scene-parallax.js?v=' + VERSION,
      test:function(root){ return document.body.dataset.pageKind === 'home' && !!query(root, '[data-home-parallax]') && !window.matchMedia('(max-width:980px), (prefers-reduced-motion: reduce)').matches; },
      init:function(){ window.SonglineInitHomeParallax(); }
    },
    {
      key:'desktop-pet', src:'/js/desktop-pet.js?v=' + VERSION,
      test:function(root){ return !!query(root, '[data-desktop-pet]'); },
      init:function(root){ window.SonglineInitDesktopPet(root || document); }
    },
    {
      key:'random-number', src:'/js/tools/random-number.js?v=' + VERSION,
      test:function(root){ return !!query(root, '[data-random-tool]'); },
      init:function(root){ window.SonglineInitRandomNumber(root || document); }
    },
    {
      key:'gacha', src:'/js/tools/gacha.js?v=' + VERSION,
      test:function(root){ return !!query(root, '[data-gacha-tool]'); },
      init:function(root){ window.SonglineInitGacha(root || document); }
    },
    {
      key:'focus-timer', src:'/js/tools/focus-timer.js?v=' + VERSION,
      test:function(root){ return !!query(root, '[data-focus-timer]'); },
      init:function(root){ window.SonglineInitFocusTimer(root || document); }
    },
    {
      key:'markdown-renderer', src:'/js/markdown-renderer.js?v=' + VERSION,
      test:function(root){ return !!query(root, '[data-md-tool]'); },
      init:function(){}
    },
    {
      key:'markdown-previewer', src:'/js/tools/markdown-previewer.js?v=' + VERSION,
      test:function(root){ return !!query(root, '[data-md-tool]'); },
      init:function(root){ window.SonglineInitMarkdownPreviewer(root || document); }
    },
    {
      key:'space-ribbons',
      src:'/js/space-ribbons.js?v=' + VERSION,
      test:function(){
        // 行星轨迹仍是现用背景；仅在可见场景且未要求减少动画时加载。
        var page = document.body.dataset;
        return page.pageKind !== 'home' && page.pageSection !== 'posts' && page.pageLayout !== 'tools' && page.pageLayout !== 'site-notice' &&
          !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      },
      init:function(){ if(window.SonglineInitSpaceRibbons) window.SonglineInitSpaceRibbons(); }
    },
    {
      key:'views',
      src:'/js/views.js?v=' + VERSION,
      test:function(root){
        return !!query(root, '.real-views[data-view-path]');
      },
      init:function(root){
        if(window.SonglineInitViews) window.SonglineInitViews(root || document);
      }
    },
    {
      key:'home-recommendations',
      src:'/js/pages/home/recommendations.js?v=' + VERSION,
      test:function(root){
        return !!query(root, '[data-home-recommendations]');
      },
      init:function(root){
        if(window.SonglineInitHomeRecommendations) window.SonglineInitHomeRecommendations(root || document);
      }
    },
    {
      key:'home-message-board',
      src:'/js/pages/home/message-board.js?v=' + VERSION,
      test:function(root){
        return !!query(root, '[data-home-panel]');
      },
      init:function(root){
        if(window.SonglineInitHomeMessageBoard) window.SonglineInitHomeMessageBoard(root || document);
      }
    },
    {
      key:'markdown-code-tools',
      src:'/js/markdown-code-tools.js?v=' + VERSION,
      test:function(root){
        return !!query(root, '.markdown-body pre, .preview pre, .md-live-preview pre');
      },
      init:function(root){
        if(window.SonglineEnhanceMarkdown) window.SonglineEnhanceMarkdown(root || document);
      }
    },
    {
      key:'search-utils',
      src:'/js/search-utils.js?v=' + VERSION,
      test:function(root){
        return !!query(root, '[data-search-submit], [data-tools-search]');
      },
      init:function(){}
    },
    {
      key:'search',
      src:'/js/search.js?v=' + VERSION,
      test:function(root){
        return !!query(root, '[data-search-submit], [data-tools-search]');
      },
      init:function(root){
        if(window.SonglineInitSearch) window.SonglineInitSearch(root || document);
      }
    },
    {
      key:'friend-galaxy',
      // 与服务端直开页面共用当前资源版本；固定版本号会让 AJAX 进入朋友页时
      // 命中旧缓存，导致新坐标逻辑没有真正执行。
      src:'/js/pages/friends/galaxy.js?v=' + VERSION + '&friends=22.15',
      test:function(root){
        return !!query(root, '[data-friend-galaxy], .friend-galaxy, .friend-galaxy-stage, .friends-galaxy, .galaxy-map');
      },
      init:function(root){
        if(window.SonglineInitFriendGalaxy) window.SonglineInitFriendGalaxy(root || document);
      }
    },
    {
      key:'memory-room',
      src:'/js/pages/friends/memories.js?v=' + VERSION,
      test:function(root){ return !!query(root, '[data-memory-room]'); },
      init:function(root){ if(window.SonglineInitMemoryRoom) window.SonglineInitMemoryRoom(root || document); }
    },
    {
      key:'snake-leaderboard',
      src:'/js/tools/snake-leaderboard.js?v=' + VERSION,
      test:function(root){ return !!query(root, '[data-snake-game], .snake-game, .snake-tool-panel, #snake-canvas'); },
      init:function(){}
    },
    {
      key:'snake-renderer',
      src:'/js/tools/snake-renderer.js?v=' + VERSION,
      test:function(root){
        return !!query(root, '[data-snake-game], .snake-game, .snake-tool-panel, #snake-canvas');
      },
      init:function(){}
    },
    {
      key:'snake',
      src:'/js/tools/snake.js?v=' + VERSION,
      test:function(root){
        return !!query(root, '[data-snake-game], .snake-game, .snake-tool-panel, #snake-canvas');
      },
      init:function(root){
        if(window.SonglineInitSnake) window.SonglineInitSnake(root || document);
      }
    },
    {
      key:'2048-engine',
      src:'/js/tools/game-2048-engine.js?v=' + VERSION,
      test:function(root){
        return !!query(root, '[data-game-2048], .tool-2048-page, .game-2048-board');
      },
      init:function(){}
    },
    {
      key:'2048-renderer',
      src:'/js/tools/game-2048-renderer.js?v=' + VERSION,
      test:function(root){
        return !!query(root, '[data-game-2048], .tool-2048-page, .game-2048-board');
      },
      init:function(){}
    },
    {
      key:'2048-leaderboard',
      src:'/js/tools/game-2048-leaderboard.js?v=' + VERSION,
      test:function(root){ return !!query(root, '[data-game-2048], .tool-2048-page, .game-2048-board'); },
      init:function(){}
    },
    {
      key:'2048-audio',
      src:'/js/tools/game-2048-audio.js?v=' + VERSION,
      test:function(root){ return !!query(root, '[data-game-2048], .tool-2048-page, .game-2048-board'); },
      init:function(){}
    },
    {
      key:'2048',
      src:'/js/tools/game-2048.js?v=' + VERSION,
      test:function(root){
        return !!query(root, '[data-game-2048], .tool-2048-page, .game-2048-board');
      },
      init:function(root){
        if(window.SonglineInit2048) window.SonglineInit2048(root || document);
      }
    },
    {
      key:'typing-practice',
      src:'/js/tools/typing-practice.js?v=' + VERSION,
      test:function(root){
        return !!query(root, '[data-typing-practice], .typing-page, .typing-input');
      },
      init:function(root){
        if(window.SonglineInitTypingPractice) window.SonglineInitTypingPractice(root || document);
      }
    },
    {
      key:'flappy-bird',
      src:'/js/tools/flappy-bird.js?v=' + VERSION,
      test:function(root){
        return !!query(root, '[data-flappy-game], .flappy-page, .flappy-canvas');
      },
      init:function(root){
        if(window.SonglineInitFlappyBird) window.SonglineInitFlappyBird(root || document);
      }
    },
    {
      key:'reaction-test',
      src:'/js/tools/reaction-test.js?v=' + VERSION,
      test:function(root){
        return !!query(root, '[data-reaction-test], .reaction-test-page, .reaction-stage');
      },
      init:function(root){
        if(window.SonglineInitReactionTest) window.SonglineInitReactionTest(root || document);
      }
    },
    {
      key:'audio-metadata',
      src:'/js/tools/audio-metadata.js?v=' + VERSION,
      test:function(root){
        return !!query(root, '[data-audio-visualizer], .audio-visualizer-page, .av-canvas, [data-home-music]');
      },
      init:function(){}
    },
    {
      key:'home-music',
      src:'/js/pages/home/music-player.js?v=' + VERSION,
      test:function(root){
        return !!query(root, '[data-home-music]');
      },
      init:function(root){
        if(window.SonglineInitHomeMusic) window.SonglineInitHomeMusic(root || document);
      }
    },
    {
      key:'audio-visualizer-renderer',
      src:'/js/tools/audio-visualizer-renderer.js?v=' + VERSION,
      test:function(root){
        return !!query(root, '[data-audio-visualizer], .audio-visualizer-page, .av-canvas');
      },
      init:function(){}
    },
    {
      key:'audio-visualizer',
      src:'/js/tools/audio-visualizer.js?v=' + VERSION,
      test:function(root){
        return !!query(root, '[data-audio-visualizer], .audio-visualizer-page, .av-canvas');
      },
      init:function(root){
        if(window.SonglineInitAudioVisualizer) window.SonglineInitAudioVisualizer(root || document);
      }
    },
    {
      key:'mobile-toc',
      src:'/js/mobile-toc.js?v=' + VERSION,
      test:function(root){
        return !!query(root, '.article-shell, .article-layout, .post-single, .post-layout, nav#TableOfContents, #TableOfContents');
      },
      init:function(root){
        if(window.SonglineInitMobileToc) window.SonglineInitMobileToc(root || document);
      }
    },
    {
      key:'reader-floating-controls',
      src:'/js/reader-floating-controls.js?v=' + VERSION,
      test:function(root){
        return !!query(root, '.article-reader, .article-shell, .article-layout, .post-single, .post-layout, .md-tool-layout, .md-tool-preview, [data-article-renderer="songline-markdown"]');
      },
      init:function(){
        if(window.SonglineNormalizeFloatReadingButtons) window.SonglineNormalizeFloatReadingButtons();
      }
    },
    {
      key:'content-archive',
      src:'/js/pages/archive/index.js?v=' + VERSION,
      test:function(root){
        return !!query(root, '[data-content-archive]');
      },
      init:function(root){
        if(window.SonglineInitContentArchive) window.SonglineInitContentArchive(root || document);
      }
    }
  ];

  function query(root, selector){
    root = root || document;
    try{
      if(root.querySelector && root.querySelector(selector)) return true;
    }catch(e){}
    if(root !== document && document.querySelector){
      try{
        return !!document.querySelector(selector);
      }catch(e){}
    }
    return false;
  }

  // A DOM script tag is not proof of execution (inert main HTML, failed loads,
  // and still-loading deferred scripts all have tags). Check the exported API.
  var exports = {
    'tool-controls':'SonglineInitToolControls',
    'article-reading':'SonglineReading', 'article-toc-controls':'SonglineInitArticleToc',
    'home-parallax':'SonglineInitHomeParallax', 'desktop-pet':'SonglineInitDesktopPet',
    'random-number':'SonglineInitRandomNumber', 'gacha':'SonglineInitGacha', 'focus-timer':'SonglineInitFocusTimer',
    'markdown-renderer':'SonglineMarkdown', 'markdown-previewer':'SonglineInitMarkdownPreviewer',
    'space-ribbons':'SonglineInitSpaceRibbons', 'views':'SonglineInitViews',
    'home-recommendations':'SonglineInitHomeRecommendations', 'home-message-board':'SonglineInitHomeMessageBoard',
    'markdown-code-tools':'SonglineEnhanceMarkdown', 'search-utils':'SonglineSearchUtils', 'search':'SonglineInitSearch',
    'friend-galaxy':'SonglineInitFriendGalaxy', 'memory-room':'SonglineInitMemoryRoom',
    'snake-leaderboard':'SonglineCreateSnakeLeaderboard', 'snake-renderer':'SonglineCreateSnakeRenderer', 'snake':'SonglineInitSnake',
    '2048-engine':'Songline2048Engine', '2048-renderer':'SonglineCreate2048Renderer',
    '2048-leaderboard':'SonglineCreate2048Leaderboard', '2048-audio':'SonglineCreate2048Audio', '2048':'SonglineInit2048',
    'typing-practice':'SonglineInitTypingPractice', 'flappy-bird':'SonglineInitFlappyBird', 'reaction-test':'SonglineInitReactionTest',
    'audio-metadata':'SonglineAudioMetadata', 'home-music':'SonglineInitHomeMusic',
    'audio-visualizer-renderer':'SonglineCreateAudioVisualizerRenderer', 'audio-visualizer':'SonglineInitAudioVisualizer',
    'mobile-toc':'SonglineInitMobileToc', 'reader-floating-controls':'SonglineNormalizeFloatReadingButtons',
    'content-archive':'SonglineInitContentArchive'
  };
  var dependencies = {
    'search':['search-utils'], 'markdown-previewer':['markdown-renderer','article-reading','article-toc-controls'],
    'snake':['snake-leaderboard','snake-renderer'],
    '2048':['2048-engine','2048-renderer','2048-leaderboard','2048-audio'],
    'home-music':['audio-metadata'], 'audio-visualizer':['audio-metadata','audio-visualizer-renderer']
  };
  function isReady(mod){ return !!window[exports[mod.key]]; }
  function initCurrent(mod, root){
    root = root || document;
    if(root !== document && root.isConnected === false) return;
    mod.init(root);
  }
  function loadScript(mod, root){
    var deps = dependencies[mod.key] || [];
    return Promise.all(deps.map(function(key){
      return loadScript(modules.find(function(candidate){ return candidate.key === key; }), root);
    })).then(function(){ return loadScriptFile(mod, root); });
  }
  function loadScriptFile(mod, root){
    if(loaded[mod.key]){
      initCurrent(mod, root);
      return Promise.resolve();
    }
    if(loading[mod.key]) return loading[mod.key].then(function(){ initCurrent(mod, root); });

    if(isReady(mod)){
      loaded[mod.key] = true;
      initCurrent(mod, root);
      return Promise.resolve();
    }

    loading[mod.key] = new Promise(function(resolve, reject){
    var script = document.createElement('script');
    // 站内换页时，存在依赖关系的工具脚本也要按插入顺序执行。
    script.async = false;
    script.defer = true;
    script.src = mod.src;
    script.dataset.pageScript = mod.key;
    script.dataset.loadedBy = 'page-modules';
    script.onload = function(){
      loading[mod.key] = false;
      try{
        if(!isReady(mod)) throw new Error('Module API missing: ' + mod.key);
        initCurrent(mod, root);
        loaded[mod.key] = true;
        resolve();
      }
      catch(error){ reject(error); }
    };
    script.onerror = function(){
      loading[mod.key] = false;
      script.remove();
      console.warn('[page-modules] failed to load', mod.key, mod.src);
      reject(new Error('Module failed: ' + mod.key));
    };
    document.head.appendChild(script);
    });
    return loading[mod.key];
  }

  var scanTimer = 0;
  var pendingRoot = null;
  var activeScans = new WeakMap();

  function mergeRoot(root){
    if(!pendingRoot || root === document) pendingRoot = root || document;
  }

  function scanNow(root){
    root = root || pendingRoot || document;
    pendingRoot = null;
    if(root !== document && root.isConnected === false) return Promise.resolve();
    if(activeScans.has(root)) return activeScans.get(root);
    var now = Date.now();
    if(window.SonglinePageModules) window.SonglinePageModules.lastScanAt = now;
    var task = Promise.resolve().then(function(){
      syncPageStyles(root);
      return Promise.all(modules.filter(function(mod){ return mod.test(root); }).map(function(mod){ return loadScript(mod, root); }));
    });
    activeScans.set(root, task);
    task.then(function(){ activeScans.delete(root); }, function(){ activeScans.delete(root); });
    return task;
  }

  function scan(root){
    mergeRoot(root || document);
    window.clearTimeout(scanTimer);
    var run = function(){ scanNow(pendingRoot || document).catch(function(error){ console.warn('[page-modules]', error); }); };
    if(window.SonglineRuntime && typeof window.SonglineRuntime.idle === 'function'){
      window.SonglineRuntime.idle('page-modules-scan', run, 260);
      return;
    }
    if(window.requestIdleCallback){
      scanTimer = window.setTimeout(function(){ window.requestIdleCallback(run, {timeout: 260}); }, 0);
    }else if(window.requestAnimationFrame){
      scanTimer = window.requestAnimationFrame(run);
    }else{
      scanTimer = window.setTimeout(run, 0);
    }
  }

  window.SonglinePageModules = {
    scan: scan,
    ready: scanNow,
    loaded: loaded,
    assetVersion: VERSION,
    lastScanAt: 0
  };

  if(document.readyState === 'loading'){
    // 首次直开页面与旧的 defer 自启动保持同一时机；站内换页仍走空闲调度。
    document.addEventListener('DOMContentLoaded', function(){ scanNow(document).catch(function(error){ console.warn('[page-modules]', error); }); });
  }else{
    scanNow(document).catch(function(error){ console.warn('[page-modules]', error); });
  }

  window.addEventListener('pageshow', function(event){ if(event.persisted) scan(document); });
  window.addEventListener('songline:page-swap', function(event){
    var root = event.detail && event.detail.root ? event.detail.root : document;
    if(!(event.detail && event.detail.modulesManaged)) scan(root);
  });
})();
