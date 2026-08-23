/* v20.18.5：首页 WAAPI 轨道入口。
 * 本项目改编自 Juan David Nicholls Cardona 发布的 MIT 许可 WAAPI solar-system 结构：
 * https://github.com/jdnichollsc/solar-systems
 * 下方实现保留 Web Animations API 的设计思路，但使用本博客自己的 DOM、图标、链接与响应式布局。
 */
(function(){
  'use strict';

  var VERSION = '20.20.6';
  var reduceMotionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var mobileQuery = window.matchMedia ? window.matchMedia('(max-width: 760px)') : null;
  var instances = [];


  function perfProfile(){
    var p = window.SonglinePerf || {};
    return {
      low: !!p.low,
      mid: !!p.mid,
      frameInterval: 16
    };
  }

  function prefersStatic(){
    return (reduceMotionQuery && reduceMotionQuery.matches) || !Element.prototype.animate;
  }

  function sharedVisualMs(){
    try{
      if(window.SonglineVisualClock && typeof window.SonglineVisualClock.now === 'function'){
        return window.SonglineVisualClock.now() * 1000;
      }
    }catch(e){}
    return performance.now();
  }

  function numberAttr(el, name, fallback){
    var raw = el.getAttribute(name);
    var n = raw == null ? NaN : parseFloat(raw);
    return Number.isFinite(n) ? n : fallback;
  }

  var DEFAULT_ORBIT_DETAILS = {
    posts: {
      kicker: 'Archive',
      title: '文章',
      desc: '浏览所有文章，按时间回看学习、项目和创作记录。',
      href: '/posts/',
      link: '进入文章'
    },
    tags: {
      kicker: 'Tags',
      title: '标签',
      desc: '按标签寻找主题，把零散内容重新归档成线索。',
      href: '/tags/',
      link: '查看标签'
    },
    friends: {
      kicker: 'Friends',
      title: '朋友',
      desc: '查看朋友们的主页与文字，进入这个小小的创作星图。',
      href: '/friends/',
      link: '查看朋友'
    },
    tools: {
      kicker: 'Tools',
      title: '工具',
      desc: '打开站内小工具和实验页面，放一些顺手好用的东西。',
      href: '/tools/',
      link: '进入工具'
    },
    notice: {
      kicker: 'Notice',
      title: '公告',
      desc: '查看站点更新、投稿说明和一些需要被看见的小通知。',
      href: '#site-notice',
      link: '查看公告'
    },
    about: {
      kicker: 'About',
      title: '关于本站',
      desc: '查看站点说明，了解这个小空间被放在这里的原因。',
      href: '#site-intro',
      link: '查看关于'
    }
  };


  var MOBILE_ORBIT_PRESETS = {
    posts:   { rx:0.37, ry:0.145, start:310, duration:39000, phase:0 },
    tags:    { rx:0.30, ry:0.205, start:205, duration:33000, phase:7 },
    friends: { rx:0.40, ry:0.175, start:35,  duration:43000, phase:13 },
    tools:   { rx:0.34, ry:0.155, start:130, duration:36000, phase:19 },
    notice:  { rx:0.25, ry:0.235, start:260, duration:31000, phase:23 },
    about:   { rx:0.28, ry:0.190, start:82,  duration:34500, phase:29 }
  };

  function buildOrbitKeyframes(stage, satellite){
    var rect = stage.getBoundingClientRect();
    var width = Math.max(320, rect.width || stage.offsetWidth || 760);
    var height = Math.max(280, rect.height || stage.offsetHeight || 520);
    var lane = numberAttr(satellite, 'data-orbit-lane', 0.36);
    var flat = numberAttr(satellite, 'data-orbit-flat', 0.5);
    var start = numberAttr(satellite, 'data-orbit-start', 0);
    var offsetX = numberAttr(satellite, 'data-orbit-offset-x', 0);
    var offsetY = numberAttr(satellite, 'data-orbit-offset-y', 0);
    var orbitRotate = numberAttr(satellite, 'data-orbit-rotate', 0) * Math.PI / 180;
    var mobile = mobileQuery && mobileQuery.matches;
    var radiusBase = Math.min(width, height * (mobile ? 1.04 : 1.22));
    var radiusX = Math.max(mobile ? 70 : 88, radiusBase * lane * (mobile ? 0.78 : 1));
    var radiusY = Math.max(mobile ? 34 : 42, radiusX * flat * (mobile ? 0.84 : 1));
    var frames = [];
    var total = perfProfile().low ? 40 : perfProfile().mid ? 56 : 72;
    for(var i = 0; i <= total; i += 1){
      var progress = i / total;
      var angle = (start + progress * 360) * Math.PI / 180;
      var baseX = Math.cos(angle) * radiusX;
      var baseY = Math.sin(angle) * radiusY;
      var x = (baseX * Math.cos(orbitRotate) - baseY * Math.sin(orbitRotate)) + offsetX;
      var y = (baseX * Math.sin(orbitRotate) + baseY * Math.cos(orbitRotate)) + offsetY;
      var depth = Math.sin(angle);
      var scale = 0.92 + (depth + 1) * 0.052;
      var opacity = 0.72 + (depth + 1) * 0.11;
      frames.push({
        offset: progress,
        transform: 'translate3d(calc(-50% + ' + x.toFixed(2) + 'px), calc(-50% + ' + y.toFixed(2) + 'px), 0) scale(' + scale.toFixed(3) + ')',
        opacity: opacity.toFixed(3),
        zIndex: depth > 0 ? 7 : 3
      });
    }
    return frames;
  }


  function mobileOrbitFrame(stage, satellite, now, startedAt, cachedBox){
    var rect = cachedBox || stage.getBoundingClientRect();
    var width = Math.max(300, rect.width || stage.offsetWidth || 360);
    var height = Math.max(360, rect.height || stage.offsetHeight || 420);
    var key = satellite.getAttribute('data-orbit-key') || 'posts';
    var preset = MOBILE_ORBIT_PRESETS[key] || MOBILE_ORBIT_PRESETS.posts;

    var duration = Math.max(18000, preset.duration || numberAttr(satellite, 'data-orbit-duration', 32000));
    var elapsed = ((now - startedAt + (preset.phase || 0) * 1000) % duration) / duration;
    var angle = ((preset.start || 0) + elapsed * 360) * Math.PI / 180;

    // 手机端使用固定轨道表，避免桌面端 lane / offset 在小屏把小球挤成一团。
    var radiusX = Math.max(68, Math.min(width * preset.rx, 156));
    var radiusY = Math.max(40, Math.min(height * preset.ry, 92));

    var x = Math.cos(angle) * radiusX;
    var y = Math.sin(angle) * radiusY;
    var depth = Math.sin(angle);
    var scale = 0.86 + (depth + 1) * 0.060;
    return {
      transform: 'translate3d(calc(-50% + ' + x.toFixed(2) + 'px), calc(-50% + ' + y.toFixed(2) + 'px), 0) scale(' + scale.toFixed(3) + ')',
      opacity: (0.76 + (depth + 1) * 0.09).toFixed(3),
      zIndex: depth > 0 ? 12 : 5
    };
  }

  function paintMobileOrbitFrame(stage, satellites, orbitClock){
    var rect = stage.getBoundingClientRect();
    satellites.forEach(function(sat){
      var frame = mobileOrbitFrame(stage, sat, orbitClock, 0, rect);
      sat.style.setProperty('transform', frame.transform, 'important');
      sat.style.setProperty('opacity', frame.opacity, 'important');
      sat.style.setProperty('z-index', String(frame.zIndex), 'important');
    });
  }

  function startMobileOrbit(stage, satellites, animations){
    // v20.20.6：移动端轨道直接读取统一视觉时钟，不再先显示上次记录位置再追到实时位置。
    var orbitClock = sharedVisualMs();
    paintMobileOrbitFrame(stage, satellites, orbitClock);
    var raf = 0;
    var last = performance.now();
    var lastPaint = 0;
    function tick(now){
      var perf = perfProfile();
      var dt = Math.max(0, Math.min(50, now - last));
      last = now;

      if(!document.hidden){
        orbitClock += dt;
        if(!lastPaint || now - lastPaint >= perf.frameInterval){
          lastPaint = now;
          var rect = stage.getBoundingClientRect();
          satellites.forEach(function(sat){
            var frame = mobileOrbitFrame(stage, sat, orbitClock, 0, rect);
            sat.style.setProperty('transform', frame.transform, 'important');
            sat.style.setProperty('opacity', frame.opacity, 'important');
            sat.style.setProperty('z-index', String(frame.zIndex), 'important');
          });
        }
      }
      raf = window.requestAnimationFrame(tick);
    }
    raf = window.requestAnimationFrame(tick);
    animations.push({ cancel: function(){ window.cancelAnimationFrame(raf); } });
  }


  function initGateway(root){
    var stage = root.querySelector('.waapi-orbit-stage');
    if(!stage) return null;
    var satellites = Array.prototype.slice.call(root.querySelectorAll('[data-orbit-satellite]'));
    var detail = root.querySelector('[data-orbit-detail]');
    var detailKicker = root.querySelector('[data-orbit-detail-kicker]');
    var detailTitle = root.querySelector('[data-orbit-detail-title]');
    var detailDesc = root.querySelector('[data-orbit-detail-desc]');
    var detailLink = root.querySelector('[data-orbit-detail-link]');
    var animations = [];
    var planetAnimations = [];

    function selectSatellite(sat){
      if(!sat) return;
      var key = sat.getAttribute('data-orbit-key') || 'posts';
      var fallback = DEFAULT_ORBIT_DETAILS[key] || DEFAULT_ORBIT_DETAILS.posts;
      var data = {
        kicker: sat.getAttribute('data-orbit-kicker') || fallback.kicker,
        title: sat.getAttribute('data-orbit-title') || fallback.title,
        desc: sat.getAttribute('data-orbit-desc') || fallback.desc,
        href: sat.getAttribute('data-orbit-href') || fallback.href,
        link: sat.getAttribute('data-orbit-link') || fallback.link
      };
      satellites.forEach(function(item){
        var active = item === sat;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      if(detail){
        detail.setAttribute('data-active-orbit', key);
        detail.classList.remove('is-updating');
        void detail.offsetWidth;
        detail.classList.add('is-updating');
      }
      if(detailKicker) detailKicker.textContent = data.kicker;
      if(detailTitle) detailTitle.textContent = data.title;
      if(detailDesc) detailDesc.textContent = data.desc;
      if(detailLink){
        detailLink.setAttribute('href', data.href);
        detailLink.innerHTML = data.link + ' <svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12h14M13 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
      }
    }

    function headerOffset(){
      var header = document.querySelector('.site-header');
      var height = header ? Math.ceil(header.getBoundingClientRect().height) : 86;
      return height + 18;
    }

    function clearTargetMark(){
      document.querySelectorAll('.is-orbit-scroll-target').forEach(function(item){
        item.classList.remove('is-orbit-scroll-target');
      });
    }

    function smoothScrollToHash(hash){
      if(!hash || hash.charAt(0) !== '#') return false;
      var target = document.getElementById(decodeURIComponent(hash.slice(1)));
      if(!target) return false;

      clearTargetMark();
      var top = target.getBoundingClientRect().top + window.pageYOffset - headerOffset();
      window.scrollTo({
        top: Math.max(0, Math.round(top)),
        behavior: prefersStatic() ? 'auto' : 'smooth'
      });

      try{
        history.replaceState(history.state, '', hash);
      }catch(e){}

      target.classList.add('is-orbit-scroll-target');
      window.setTimeout(function(){
        target.classList.remove('is-orbit-scroll-target');
      }, 1400);
      return true;
    }

    function clear(){
      animations.concat(planetAnimations).forEach(function(anim){
        try{ anim.cancel(); }catch(e){}
      });
      animations = [];
      planetAnimations = [];
      satellites.forEach(function(sat){
        sat.style.transform = '';
        sat.style.opacity = '';
        sat.style.zIndex = '';
      });
    }

    function alignAnimationPhase(anim, duration){
      if(!anim || !duration) return;
      try{
        if(typeof anim.pause === 'function') anim.pause();
        anim.currentTime = sharedVisualMs() % duration;
      }catch(e){}
    }

    function revealSynced(){
      window.clearTimeout(root.__orbitPhaseFallbackTimer);
      root.__orbitPhaseFallbackTimer = window.setTimeout(function(){
        root.classList.remove('is-orbit-phase-syncing');
      }, 520);
      window.requestAnimationFrame(function(){
        root.classList.remove('is-orbit-phase-syncing');
      });
    }

    function setup(){
      clear();
      root.classList.add('is-orbit-phase-syncing');
      root.setAttribute('data-orbit-version', VERSION);
      if(prefersStatic()){
        root.classList.add('is-orbit-static');
        root.classList.remove('is-orbit-animated');
        root.classList.remove('is-orbit-mobile-animated');
        root.classList.remove('is-orbit-phase-syncing');
        return;
      }
      root.classList.remove('is-orbit-static');
      root.classList.add('is-orbit-animated');

      var isMobile = mobileQuery && mobileQuery.matches;
      root.classList.toggle('is-orbit-mobile-animated', !!isMobile);

      if(isMobile){
        var planetMobile = root.querySelector('[data-waapi-planet]');
        if(planetMobile){
          planetMobile.style.setProperty('left', '50%', 'important');
          planetMobile.style.setProperty('top', '50%', 'important');
          planetMobile.style.setProperty('transform', 'translate3d(-50%,-50%,0)', 'important');
        }
        startMobileOrbit(stage, satellites, animations);
      }else{
        satellites.forEach(function(sat){
          var duration = numberAttr(sat, 'data-orbit-duration', 32000);
          var anim = sat.animate(buildOrbitKeyframes(stage, sat), {
            duration: duration,
            iterations: Infinity,
            easing: 'linear'
          });
          alignAnimationPhase(anim, duration);
          try{ if(typeof anim.commitStyles === 'function') anim.commitStyles(); }catch(e){}
          try{ anim.play(); }catch(e){}
          animations.push(anim);
        });
      }

      var texture = root.querySelector('[data-waapi-planet-texture]');
      if(texture){
        texture.style.transform = 'none';
      }
      var planet = root.querySelector('[data-waapi-planet]');
      if(planet && !isMobile){
        var planetAnim = planet.animate([
          { transform: 'translate3d(-50%,-50%,0) rotateZ(-1.5deg)' },
          { transform: 'translate3d(-50%,-50%,0) rotateZ(1.5deg)' },
          { transform: 'translate3d(-50%,-50%,0) rotateZ(-1.5deg)' }
        ], { duration: 9000, iterations: Infinity, easing: 'ease-in-out' });
        alignAnimationPhase(planetAnim, 9000);
        try{ if(typeof planetAnim.commitStyles === 'function') planetAnim.commitStyles(); }catch(e){}
        try{ planetAnim.play(); }catch(e){}
        planetAnimations.push(planetAnim);
      }
      revealSynced();
    }


    if(detailLink){
      detailLink.addEventListener('click', function(event){
        var href = detailLink.getAttribute('href') || '';
        if(href.charAt(0) === '#' && smoothScrollToHash(href)){
          event.preventDefault();
          event.stopPropagation();
        }
      });
    }

    satellites.forEach(function(sat){
      sat.addEventListener('click', function(){
        selectSatellite(sat);
      });
      sat.addEventListener('keydown', function(event){
        if(event.key === 'Enter' || event.key === ' '){
          event.preventDefault();
          selectSatellite(sat);
        }
      });
    });
    selectSatellite(satellites.find(function(sat){ return sat.classList.contains('is-active'); }) || satellites[0]);

    setup();
    var resizeTimer = 0;
    function onResize(){
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(setup, 150);
    }
    window.addEventListener('resize', onResize, { passive: true });
    if(reduceMotionQuery && reduceMotionQuery.addEventListener) reduceMotionQuery.addEventListener('change', setup);
    if(mobileQuery && mobileQuery.addEventListener) mobileQuery.addEventListener('change', setup);

    function alignPhaseBeforeResume(){
      root.classList.add('is-orbit-phase-syncing');
      animations.concat(planetAnimations).forEach(function(anim){
        try{
          if(anim && typeof anim.effect === 'object'){
            var timing = anim.effect && anim.effect.getTiming ? anim.effect.getTiming() : null;
            var duration = timing && Number(timing.duration) ? Number(timing.duration) : 0;
            if(duration) alignAnimationPhase(anim, duration);
          }
        }catch(e){}
      });
      revealSynced();
    }

    function softenResume(){
      alignPhaseBeforeResume();
      root.classList.add('is-orbit-soft-resume');
      animations.concat(planetAnimations).forEach(function(anim){
        try{
          if(anim && typeof anim.play === 'function' && anim.playState === 'paused') anim.play();
        }catch(e){}
      });
      window.clearTimeout(root.__orbitResumeTimer);
      root.__orbitResumeTimer = window.setTimeout(function(){
        root.classList.remove('is-orbit-soft-resume');
      }, 720);
    }

    return { root: root, setup: setup, clear: clear, animations: animations.concat(planetAnimations), softenResume: softenResume, alignPhaseBeforeResume: alignPhaseBeforeResume };
  }

  function clearDetachedInstances(){
    instances = instances.filter(function(instance){
      if(!instance || !instance.root) return false;
      if(document.documentElement.contains(instance.root)) return true;
      try{ instance.clear(); }catch(e){}
      return false;
    });
  }

  function boot(targetRoot){
    clearDetachedInstances();

    var scope = targetRoot && targetRoot.querySelector ? targetRoot : document;
    var roots = [];

    if(scope.matches && scope.matches('[data-waapi-orbit]')){
      roots.push(scope);
    }

    Array.prototype.slice.call(scope.querySelectorAll('[data-waapi-orbit]')).forEach(function(item){
      if(roots.indexOf(item) === -1) roots.push(item);
    });

    if(scope !== document){
      Array.prototype.slice.call(document.querySelectorAll('[data-waapi-orbit]')).forEach(function(item){
        if(roots.indexOf(item) === -1) roots.push(item);
      });
    }

    roots.forEach(function(rootItem){
      // v20.18.5：AJAX 回到首页时，新 DOM 需要重新初始化；
      // 但同一个 DOM 不能重复绑定事件和动画。
      if(rootItem.getAttribute('data-orbit-booted') === VERSION) return;
      rootItem.setAttribute('data-orbit-booted', VERSION);
      var instance = initGateway(rootItem);
      if(instance) instances.push(instance);
    });

    window.__songlineHomeOrbit = { version: VERSION, instances: instances };
  }

  window.SonglineInitHomeOrbit = boot;

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){ boot(document); });
  }else{
    boot(document);
  }

  window.addEventListener('pageshow', function(){
    boot(document);
  });

  window.addEventListener('songline:page-swap', function(event){
    var root = event.detail && event.detail.root ? event.detail.root : document;
    window.setTimeout(function(){ boot(root); }, 40);
    window.setTimeout(function(){ boot(document); }, 160);
  });

  window.addEventListener('songline:animation-before-resume', function(){
    instances.forEach(function(instance){
      try{ if(instance && instance.alignPhaseBeforeResume) instance.alignPhaseBeforeResume(); }catch(e){}
    });
  });

  window.addEventListener('songline:animation-resume', function(){
    instances.forEach(function(instance){
      try{ if(instance && instance.softenResume) instance.softenResume(); }catch(e){}
    });
  });
})();
