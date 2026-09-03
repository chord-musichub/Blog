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
    var isArticleSurface = path.indexOf('/posts/') === 0 || !!query(root, '.markdown-body, [data-article-renderer="songline-markdown"]');
    var isToolsPage = path.indexOf('/tools/') === 0 || !!query(root, '.tools-grid, .tool-card, .md-tool-layout, [data-snake-game], [data-game-2048]');
    var isSearchSurface = isToolsPage || path === '/' || path.indexOf('/posts/') === 0 || path.indexOf('/friends/') === 0 || path.indexOf('/tags/') === 0 || !!query(root, '[data-search-submit], [data-tag-search-panel], [data-tools-search], .home-friends-section');
    if(isArticleSurface){
      ensureStylesheet('songline-markdown-renderer-style', '/css/markdown-renderer.css');
      ensureStylesheet('songline-article-compat-style', '/css/site-article-compat.css');
      ensureStylesheet('songline-markdown-compat-style', '/css/site-markdown-compat.css');
      ensureStylesheet('songline-article-overrides-style', '/css/site-article-overrides.css');
    }
    if(isToolsPage){
      ensureStylesheet('songline-tool-shared-style', '/css/tool-shared.css');
      ensureStylesheet('songline-tools-compat-style', '/css/site-tools-compat.css');
    }
    if(isSearchSurface){
      ensureStylesheet('songline-search-overrides-style', '/css/site-search-overrides.css');
    }
    if(path.indexOf('/tools/random-number/') === 0 || !!query(root, '[data-random-tool], .random-tool-panel')){
      ensureStylesheet('songline-random-number-style', '/css/tools/random-number.css');
    }
    if(path.indexOf('/tools/markdown-previewer/') === 0 || !!query(root, '[data-md-tool], .md-tool-layout')){
      // 动态换页时明确维持与服务端直开一致的层级顺序。
      ensureStylesheet('songline-markdown-previewer-base-style', '/css/tools/markdown-previewer-base.css');
      ensureStylesheet('songline-article-reader-style', '/css/article-reader.css');
      ensureStylesheet('songline-reader-floating-controls-style', '/css/reader-floating-controls.css');
      ensureStylesheet('songline-markdown-previewer-style', '/css/tools/markdown-previewer.css');
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
  }

  var modules = [
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
      key:'recommended-posts',
      src:'/js/recommended-posts.js?v=' + VERSION,
      test:function(root){
        return !!query(root, '[data-recommended-posts]');
      },
      init:function(root){
        if(window.SonglineInitRecommendedViews) window.SonglineInitRecommendedViews(root || document);
      }
    },
    {
      key:'home-recommendations',
      src:'/js/home-recommendations.js?v=' + VERSION,
      test:function(root){
        return !!query(root, '[data-home-recommendations]');
      },
      init:function(root){
        if(window.SonglineInitHomeRecommendations) window.SonglineInitHomeRecommendations(root || document);
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
        return !!query(root, 'input[type="search"]');
      },
      init:function(){}
    },
    {
      key:'search',
      src:'/js/search.js?v=' + VERSION,
      test:function(root){
        return !!query(root, '[data-search-submit], [data-tag-search-panel], [data-tools-search]');
      },
      init:function(root){
        if(window.SonglineInitSearch) window.SonglineInitSearch(root || document);
      }
    },
    {
      key:'home-friend-carousel',
      src:'/js/home-friend-carousel.js?v=' + VERSION,
      test:function(root){
        return !!query(root, '[data-home-friend-carousel], [data-home-friend-track]');
      },
      init:function(root){
        if(window.SonglineInitHomeFriendCarousel) window.SonglineInitHomeFriendCarousel(root || document);
      }
    },
    {
      key:'friend-galaxy',
      // 与服务端直开页面共用当前资源版本；固定版本号会让 AJAX 进入朋友页时
      // 命中旧缓存，导致新坐标逻辑没有真正执行。
      src:'/js/friend-galaxy.js?v=' + VERSION + '&friends=22.3',
      test:function(root){
        return !!query(root, '[data-friend-galaxy], .friend-galaxy, .friend-galaxy-stage, .friends-galaxy, .galaxy-map');
      },
      init:function(root){
        if(window.SonglineInitFriendGalaxy) window.SonglineInitFriendGalaxy(root || document);
      }
    },
    {
      key:'tag-flow',
      src:'/js/tag-flow.js?v=' + VERSION,
      test:function(root){
        return !!query(root, '[data-tag-flow], .tag-flow, .tag-river, .tag-river-stage, .tag-river-canvas, .tag-river-search');
      },
      init:function(root){
        if(window.SonglineInitTagFlow) window.SonglineInitTagFlow(root || document);
      }
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
      src:'/js/home-music-player.js?v=' + VERSION,
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
      key:'posts-list-flat',
      src:'/js/posts-list-flat.js?v=' + VERSION,
      test:function(root){
        return !!query(root, '.posts-list, #postList');
      },
      init:function(root){
        if(window.SonglineInitPostsListFlat) window.SonglineInitPostsListFlat(root || document);
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

  function loadScript(mod, root){
    if(loaded[mod.key]){
      mod.init(root || document);
      return;
    }
    if(loading[mod.key]) return;

    // 服务端页级脚本在本调度器之前执行；直接复用它，避免额外监听和延迟兜底。
    var existing = document.querySelector('script[data-page-script="' + mod.key + '"], script[src*="' + mod.src.split('?')[0] + '"]');
    // 站内过场会把新页面的 main 直接写入 DOM，其中的 script 标签不会执行。
    // Friends 过去因此误把这类“未执行脚本”当作已加载，星图只剩服务端兜底头像。
    var friendGalaxyReady = mod.key !== 'friend-galaxy' || typeof window.SonglineInitFriendGalaxy === 'function';
    if(existing && friendGalaxyReady){
      loaded[mod.key] = true;
      mod.init(root || document);
      return;
    }

    loading[mod.key] = true;
    var script = document.createElement('script');
    // 站内换页时，存在依赖关系的工具脚本也要按插入顺序执行。
    script.async = false;
    script.defer = true;
    script.src = mod.src;
    script.dataset.pageScript = mod.key;
    script.dataset.loadedBy = 'page-modules';
    script.onload = function(){
      loaded[mod.key] = true;
      loading[mod.key] = false;
      mod.init(root || document);
    };
    script.onerror = function(){
      loading[mod.key] = false;
      console.warn('[page-modules] failed to load', mod.key, mod.src);
    };
    document.head.appendChild(script);
  }

  var scanTimer = 0;
  var pendingRoot = null;
  var lastScanAt = 0;

  function mergeRoot(root){
    if(!pendingRoot || root === document) pendingRoot = root || document;
  }

  function scanNow(root){
    root = root || pendingRoot || document;
    pendingRoot = null;
    var now = Date.now();
    if(now - lastScanAt < 90 && root === document) return;
    lastScanAt = now;
    if(window.SonglinePageModules) window.SonglinePageModules.lastScanAt = now;
    syncPageStyles(root);
    modules.forEach(function(mod){
      if(mod.test(root)){
        loadScript(mod, root);
      }
    });
  }

  function scan(root){
    mergeRoot(root || document);
    window.clearTimeout(scanTimer);
    var run = function(){ scanNow(pendingRoot || document); };
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
    loaded: loaded,
    assetVersion: VERSION,
    lastScanAt: 0
  };

  if(document.readyState === 'loading'){
    // 首次直开页面与旧的 defer 自启动保持同一时机；站内换页仍走空闲调度。
    document.addEventListener('DOMContentLoaded', function(){ scanNow(document); });
  }else{
    scanNow(document);
  }

  window.addEventListener('pageshow', function(){ scan(document); });
  window.addEventListener('songline:page-swap', function(event){
    var root = event.detail && event.detail.root ? event.detail.root : document;
    window.setTimeout(function(){ scan(root); }, 0);
    window.setTimeout(function(){ scan(document); }, 120);
  });
})();
