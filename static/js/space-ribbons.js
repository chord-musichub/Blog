(function(){
  'use strict';

  var reduced = false;
  try{
    reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }catch(e){}
  if(reduced) return;

  // SPACE_RIBBONS_LAYERED_START v20.20.6：统一运行时调度；保留视觉效果，避免旧帧相位闪现。

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var isAdmin = document.documentElement.hasAttribute('data-admin-theme') || location.pathname.indexOf('/admin') === 0 || location.pathname.indexOf('/articles') === 0;
  var isMobile = false;
  try{
    isMobile = window.matchMedia && window.matchMedia('(max-width: 820px)').matches;
  }catch(e){}

  // v20.18.5：星轨渐入 + 轨迹缓慢变形。
  var layer = null;
  var svg = null;
  var started = false;
  var resizeTimer = 0;
  var lastW = 0;
  var lastH = 0;

  function viewport(){
    return {
      w: Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0, 320),
      h: Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0, 520)
    };
  }

  function bootIsActive(){
    var html = document.documentElement;
    var overlay = document.querySelector('.site-boot-overlay');
    if(html && html.classList && html.classList.contains('is-boot-preparing')) return true;
    if(overlay){
      var rect = overlay.getBoundingClientRect();
      var visible = rect.width > 0 && rect.height > 0;
      var style = window.getComputedStyle ? window.getComputedStyle(overlay) : null;
      if(visible && (!style || (style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0.01))){
        return true;
      }
    }
    return false;
  }

  function waitUntilBootDone(cb){
    if(!bootIsActive()){
      cb();
      return;
    }

    var done = false;
    var observer = null;
    var finish = function(){
      if(done || bootIsActive()) return;
      done = true;
      if(observer) observer.disconnect();
      cb();
    };

    try{
      observer = new MutationObserver(finish);
      observer.observe(document.documentElement, {attributes:true, attributeFilter:['class', 'style']});
      if(document.body) observer.observe(document.body, {childList:true, subtree:true, attributes:true, attributeFilter:['class', 'style']});
    }catch(e){}

    var tries = 0;
    var interval = window.setInterval(function(){
      tries++;
      finish();
      if(done || tries > 90){
        window.clearInterval(interval);
        if(observer) observer.disconnect();
        if(!done){
          done = true;
          cb();
        }
      }
    }, 140);
  }

  function createLayer(){
    var old = document.querySelector('[data-songline-space-ribbons], [data-songline-starstream]');
    if(old){
      layer = old;
      layer.className = 'songline-starstream-layer songline-starstream-morph-layer';
      layer.setAttribute('data-songline-starstream', '1');
      layer.setAttribute('data-songline-space-ribbons', '1');
      svg = old.querySelector('svg');
      if(!svg){
        svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('class', 'songline-starstream-svg');
        svg.setAttribute('focusable', 'false');
        svg.setAttribute('preserveAspectRatio', 'none');
        old.appendChild(svg);
      }
      svg.setAttribute('class', 'songline-starstream-svg');
      return old;
    }

    layer = document.createElement('div');
    layer.className = 'songline-starstream-layer songline-starstream-morph-layer';
    layer.setAttribute('data-songline-starstream', '1');
    layer.setAttribute('data-songline-space-ribbons', '1');
    layer.setAttribute('aria-hidden', 'true');

    svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'songline-starstream-svg');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('preserveAspectRatio', 'none');

    layer.appendChild(svg);
    document.body.insertBefore(layer, document.body.firstChild);
    return layer;
  }

  function cubicPath(w, h, pts){
    return 'M ' + (w * pts[0]).toFixed(1) + ' ' + (h * pts[1]).toFixed(1) +
      ' C ' + (w * pts[2]).toFixed(1) + ' ' + (h * pts[3]).toFixed(1) + ', ' +
               (w * pts[4]).toFixed(1) + ' ' + (h * pts[5]).toFixed(1) + ', ' +
               (w * pts[6]).toFixed(1) + ' ' + (h * pts[7]).toFixed(1);
  }

  function morphValues(w, h, states){
    return states.map(function(pts){ return cubicPath(w, h, pts); }).join(';');
  }

  function pathDefs(box){
    var w = box.w;
    var h = box.h;

    if(isMobile){
      return [
        {
          states:[
            [-.20,.24, .16,.05, .72,.42, 1.18,.22],
            [-.18,.28, .22,.02, .66,.48, 1.20,.26],
            [-.22,.21, .10,.11, .78,.34, 1.16,.18],
            [-.20,.24, .16,.05, .72,.42, 1.18,.22]
          ],
          width:2.1, base:.070, flow:.48, dash:120, gap:740, duration:14500, morph:36000, delay:-2400
        },
        {
          states:[
            [-.16,.62, .24,.82, .64,.42, 1.16,.68],
            [-.18,.66, .30,.76, .56,.36, 1.18,.61],
            [-.12,.58, .18,.88, .72,.50, 1.12,.72],
            [-.16,.62, .24,.82, .64,.42, 1.16,.68]
          ],
          width:1.7, base:.060, flow:.40, dash:104, gap:680, duration:16500, morph:40500, delay:-9400
        },
        {
          states:[
            [.78,-.16, .34,.20, .95,.58, .40,1.18],
            [.84,-.12, .26,.24, .88,.50, .48,1.16],
            [.70,-.18, .42,.16, 1.02,.66, .34,1.20],
            [.78,-.16, .34,.20, .95,.58, .40,1.18]
          ],
          width:5.2, base:.038, flow:.17, dash:150, gap:860, duration:19800, morph:48500, delay:-16000
        }
      ];
    }

    return [
      {
        states:[
          [-.14,.20, .16,.03, .56,.40, 1.14,.18],
          [-.13,.25, .22,.00, .52,.46, 1.16,.22],
          [-.17,.16, .10,.08, .62,.33, 1.12,.14],
          [-.14,.20, .16,.03, .56,.40, 1.14,.18]
        ],
        width:2.0, base:.070, flow:.44, dash:155, gap:900, duration:isAdmin?19500:16500, morph:isAdmin?43500:39000, delay:-2000
      },
      {
        states:[
          [-.10,.58, .24,.82, .62,.34, 1.10,.66],
          [-.12,.63, .32,.77, .54,.28, 1.13,.60],
          [-.08,.53, .16,.88, .70,.42, 1.08,.71],
          [-.10,.58, .24,.82, .62,.34, 1.10,.66]
        ],
        width:1.6, base:.058, flow:.36, dash:132, gap:830, duration:isAdmin?22500:18000, morph:isAdmin?48500:42000, delay:-9800
      },
      {
        states:[
          [.20,-.12, .05,.26, .82,.45, .72,1.12],
          [.14,-.10, .12,.32, .74,.38, .80,1.14],
          [.26,-.14, -.02,.20, .90,.52, .64,1.10],
          [.20,-.12, .05,.26, .82,.45, .72,1.12]
        ],
        width:4.4, base:.038, flow:.17, dash:190, gap:1040, duration:isAdmin?27000:23000, morph:isAdmin?56000:50000, delay:-18300
      },
      {
        states:[
          [1.12,.36, .82,.18, .42,.78, -.12,.48],
          [1.14,.30, .76,.24, .48,.72, -.10,.54],
          [1.08,.42, .90,.12, .34,.84, -.14,.44],
          [1.12,.36, .82,.18, .42,.78, -.12,.48]
        ],
        width:1.25, base:.048, flow:.32, dash:98, gap:735, duration:isAdmin?21000:17500, morph:isAdmin?45500:40500, delay:-15100
      }
    ];
  }

  function appendAnimateD(path, values, dur, delay){
    var anim = document.createElementNS(SVG_NS, 'animate');
    anim.setAttribute('attributeName', 'd');
    anim.setAttribute('dur', dur + 'ms');
    anim.setAttribute('begin', (delay || 0) + 'ms');
    anim.setAttribute('repeatCount', 'indefinite');
    anim.setAttribute('calcMode', 'spline');
    anim.setAttribute('keyTimes', '0;0.36;0.72;1');
    anim.setAttribute('keySplines', '.42 0 .58 1;.42 0 .58 1;.42 0 .58 1');
    anim.setAttribute('values', values);
    path.appendChild(anim);
  }

  function addPathGroup(def, index, box){
    var group = document.createElementNS(SVG_NS, 'g');
    group.setAttribute('class', 'starstream-line-group starstream-morph-group starstream-line-' + index);
    group.style.setProperty('--group-drift-duration', (def.morph + 12000 + index * 2600) + 'ms');
    group.style.setProperty('--group-drift-delay', (-index * 5200) + 'ms');

    var d0 = cubicPath(box.w, box.h, def.states[0]);
    var values = morphValues(box.w, box.h, def.states);

    var base = document.createElementNS(SVG_NS, 'path');
    base.setAttribute('d', d0);
    base.setAttribute('class', 'starstream-path starstream-base starstream-morph-base');
    base.style.strokeWidth = String(def.width);
    base.style.stroke = 'rgba(255,255,255,' + def.base + ')';
    appendAnimateD(base, values, def.morph, -index * 3100);

    var flow = document.createElementNS(SVG_NS, 'path');
    flow.setAttribute('d', d0);
    flow.setAttribute('class', 'starstream-path starstream-flow starstream-morph-flow');
    flow.style.strokeWidth = String(Math.max(def.width * 1.22, def.width + .62));
    flow.style.stroke = 'rgba(255,255,255,' + def.flow + ')';
    flow.style.strokeDasharray = def.dash + ' ' + def.gap;
    flow.style.strokeDashoffset = '0';
    flow.style.setProperty('--starstream-distance', '-' + (def.dash + def.gap));
    flow.style.setProperty('--starstream-duration', def.duration + 'ms');
    flow.style.animationDelay = def.delay + 'ms';
    appendAnimateD(flow, values, def.morph, -index * 3100);

    group.appendChild(base);
    group.appendChild(flow);
    svg.appendChild(group);
  }

  function revealLayer(){
    if(!layer) return;
    // 下一帧再加 class，保证浏览器先拿到 opacity:0 的初始状态。
    window.requestAnimationFrame(function(){
      window.requestAnimationFrame(function(){
        layer.classList.add('is-visible');
      });
    });
  }

  function pauseSvgAnimations(){
    if(svg && typeof svg.pauseAnimations === 'function'){
      try{ svg.pauseAnimations(); }catch(e){}
    }
  }

  function prepareSvgPhaseResume(){
    if(!layer) return;
    layer.classList.add('is-starstream-soft-sync');
    window.clearTimeout(layer.__starstreamPhaseFallbackTimer);
    layer.__starstreamPhaseFallbackTimer = window.setTimeout(function(){
      if(layer) layer.classList.remove('is-starstream-soft-sync');
    }, 280);
    window.requestAnimationFrame(function(){
      if(layer) layer.classList.remove('is-starstream-soft-sync');
    });
  }

  function resumeSvgAnimations(){
    prepareSvgPhaseResume();
    if(svg && typeof svg.unpauseAnimations === 'function'){
      try{ svg.unpauseAnimations(); }catch(e){}
    }
    if(layer){
      layer.classList.add('is-soft-resume');
      window.clearTimeout(layer.__softResumeTimer);
      layer.__softResumeTimer = window.setTimeout(function(){
        layer.classList.remove('is-soft-resume');
      }, 720);
    }
  }

  function render(force){
    createLayer();
    if(!svg) return;

    var box = viewport();
    var sizeChanged = Math.abs(box.w - lastW) > 120 || Math.abs(box.h - lastH) > 160;
    if(!force && svg.children.length && !sizeChanged){
      revealLayer();
      return;
    }

    lastW = box.w;
    lastH = box.h;

    svg.setAttribute('viewBox', '0 0 ' + box.w + ' ' + box.h);
    while(svg.firstChild) svg.removeChild(svg.firstChild);

    pathDefs(box).forEach(function(def, index){
      addPathGroup(def, index, box);
    });

    revealLayer();
  }

  function scheduleResize(){
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(function(){
      render(false);
    }, 260);
  }

  function startNow(){
    if(!document.body) return;
    render(!started);
    started = true;
  }

  function start(){
    if(!document.body) return;
    waitUntilBootDone(function(){
      var run = function(){ window.setTimeout(startNow, 260); };
      if(window.SonglineRuntime && typeof window.SonglineRuntime.idle === 'function'){
        window.SonglineRuntime.idle('space-ribbons-start', run, 1200);
        return;
      }
      if('requestIdleCallback' in window){
        try{ window.requestIdleCallback(run, {timeout:1200}); return; }catch(e){}
      }
      run();
    });
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', start);
  }else{
    start();
  }

  window.addEventListener('resize', scheduleResize);
  window.addEventListener('orientationchange', scheduleResize);
  window.addEventListener('pageshow', function(event){
    start();
    if(event && event.persisted) window.setTimeout(resumeSvgAnimations, 60);
  });

  document.addEventListener('visibilitychange', function(){
    if(document.hidden) pauseSvgAnimations();
    else window.setTimeout(resumeSvgAnimations, 40);
  });

  window.addEventListener('songline:animation-before-resume', function(){
    prepareSvgPhaseResume();
  });

  window.addEventListener('songline:animation-resume', function(){
    window.setTimeout(resumeSvgAnimations, 40);
  });

  // 页面切换不重新生成曲线，只保证背景图层仍在。
  window.addEventListener('songline:page-swap', function(){
    window.setTimeout(start, 120);
    window.setTimeout(resumeSvgAnimations, 180);
  });
})();
