(function(){
  'use strict';

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var targetX = 0;
  var targetY = 0;
  var currentX = 0;
  var currentY = 0;
  var frame = 0;
  var layers = [];
  var backgroundLayer = null;
  // 环境层几乎静止，信息层则依次更靠近观察者。
  var depth = { background:1.5, rear:2, middle:4, system:7, front:7 };

  function clearLayers(){
    layers.forEach(function(layer){
      layer.style.removeProperty('transform');
      layer.style.removeProperty('--home-parallax-x');
      layer.style.removeProperty('--home-parallax-y');
    });
    layers = [];
    backgroundLayer = null;
  }

  function collect(){
    clearLayers();
    if(reduced || !document.body || document.body.dataset.pageKind !== 'home') return;
    layers = Array.prototype.slice.call(document.querySelectorAll('[data-home-parallax]'));
    backgroundLayer = document.querySelector('.site-bg-layer');
    if(backgroundLayer){
      backgroundLayer.dataset.homeParallax = 'background';
      layers.unshift(backgroundLayer);
    }
    if(!layers.length) return;
    layers.forEach(function(layer){ layer.style.willChange = 'transform'; });
  }

  function render(){
    frame = 0;
    // 开机镜头拥有 transform 的唯一控制权，避免实时视差在中途写入内联样式。
    if(document.documentElement.classList.contains('is-booting') || document.documentElement.classList.contains('is-home-boot-revealing')) return;
    currentX += (targetX - currentX) * 0.065;
    currentY += (targetY - currentY) * 0.065;
    layers.forEach(function(layer){
      var amount = depth[layer.dataset.homeParallax] || 0;
      var x = (currentX * amount).toFixed(2) + 'px';
      var y = (currentY * amount).toFixed(2) + 'px';
      if(layer === backgroundLayer){
        layer.style.setProperty('--home-parallax-x', x);
        layer.style.setProperty('--home-parallax-y', y);
      }else{
        layer.style.transform = 'translate3d(' + x + ',' + y + ',0)';
      }
    });
    if(Math.abs(targetX - currentX) > 0.02 || Math.abs(targetY - currentY) > 0.02){
      frame = window.requestAnimationFrame(render);
    }
  }

  function queue(){
    if(!layers.length || frame) return;
    frame = window.requestAnimationFrame(render);
  }

  function onPointerMove(event){
    if(!layers.length) return;
    targetX = ((event.clientX / Math.max(1, window.innerWidth)) - 0.5) * 2;
    targetY = ((event.clientY / Math.max(1, window.innerHeight)) - 0.5) * 2;
    queue();
  }

  function onPointerLeave(){
    targetX = 0;
    targetY = 0;
    queue();
  }

  function initialize(){
    collect();
    currentX = 0;
    currentY = 0;
    targetX = 0;
    targetY = 0;
  }

  document.addEventListener('pointermove', onPointerMove, { passive:true });
  document.addEventListener('pointerleave', onPointerLeave, { passive:true });
  window.addEventListener('songline:page-swap', function(){ window.setTimeout(initialize, 30); });
  window.addEventListener('pageshow', initialize);
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once:true });
  else initialize();
})();
