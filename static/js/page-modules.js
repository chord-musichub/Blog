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
    if(path.indexOf('/posts/') === 0 || !!query(root, '.markdown-body, [data-article-renderer="songline-markdown"]')){
      ensureStylesheet('songline-markdown-renderer-style', '/css/markdown-renderer.css');
    }
    var isToolsPage = path.indexOf('/tools/') === 0 || !!query(root, '.tools-grid, .tool-card, .md-tool-layout, [data-snake-game], [data-game-2048]');
    if(isToolsPage){
      ensureStylesheet('songline-tool-shared-style', '/css/tool-shared.css');
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
    [
      ['songline-snake-style', '/tools/snake/', '[data-snake-game], .snake-tool-panel', '/css/tools/snake.css'],
      ['songline-2048-style', '/tools/2048/', '[data-game-2048], .tool-2048-page', '/css/tools/game-2048.css'],
      ['songline-gacha-style', '/tools/gacha/', '[data-gacha], .gacha-tool-panel', '/css/tools/gacha.css'],
      ['songline-reaction-style', '/tools/reaction-test/', '[data-reaction-test], .reaction-test-page', '/css/tools/reaction-test.css'],
      ['songline-flappy-style', '/tools/flappy-bird/', '[data-flappy-bird], .flappy-bird-page', '/css/tools/flappy-bird.css'],
      ['songline-typing-style', '/tools/typing-practice/', '[data-typing-practice], .typing-page', '/css/tools/typing-practice.css'],
      ['songline-focus-style', '/tools/focus-timer/', '[data-focus-timer], .focus-timer-page', '/css/tools/focus-timer.css'],
      ['songline-audio-style', '/tools/audio-visualizer/', '[data-audio-visualizer], .audio-visualizer-page', '/css/tools/audio-visualizer.css']
    ].forEach(function(style){
      if(path.indexOf(style[1]) === 0 || !!query(root, style[2])){
        ensureStylesheet(style[0], style[3]);
      }
    });
  }

  var modules = [
    {
      key:'home-orbit',
      src:'/js/home-orbit-waapi.js?v=' + VERSION,
      test:function(root){
        return !!query(root, '[data-waapi-orbit], .waapi-orbit-stage, .home-orbit-stage, .home-waapi-orbit');
      },
      init:function(root){
        if(window.SonglineInitHomeOrbit) window.SonglineInitHomeOrbit(root || document);
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
      src:'/js/friend-galaxy.js?v=' + VERSION,
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

    // 若服务端局部模板已输出脚本标签，先标记为即将加载，再尽快初始化。
    var existing = document.querySelector('script[data-page-script="' + mod.key + '"], script[src*="' + mod.src.split('?')[0] + '"]');
    if(existing){
      loading[mod.key] = true;
      existing.addEventListener('load', function(){
        loaded[mod.key] = true;
        loading[mod.key] = false;
        mod.init(root || document);
      }, {once:true});
      // 它可能已经加载完成。
      window.setTimeout(function(){
        if(loaded[mod.key]) return;
        loaded[mod.key] = true;
        loading[mod.key] = false;
        mod.init(root || document);
      }, existing.dataset.pageScript === mod.key ? 140 : 80);
      return;
    }

    loading[mod.key] = true;
    var script = document.createElement('script');
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
    document.addEventListener('DOMContentLoaded', function(){ scan(document); });
  }else{
    scan(document);
  }

  window.addEventListener('pageshow', function(){ scan(document); });
  window.addEventListener('songline:page-swap', function(event){
    var root = event.detail && event.detail.root ? event.detail.root : document;
    window.setTimeout(function(){ scan(root); }, 0);
    window.setTimeout(function(){ scan(document); }, 120);
  });
})();
