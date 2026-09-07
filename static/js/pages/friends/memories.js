(function(){
  'use strict';
  var VERSION = '2.3.0';
  function parseData(root){
    var node = root.querySelector('#memory-room-data');
    try{return node ? JSON.parse(node.textContent || '[]') : [];}catch(e){return [];}
  }
  function init(root){
    root = root || document;
    var room = root.querySelector && root.querySelector('[data-memory-room]');
    if(!room || room.dataset.memoryReady === VERSION) return;
    room.dataset.memoryReady = VERSION;
    var data = parseData(room).sort(function(a, b){
      function dateKey(item){
        var parts = String(item && item.date || '').split('-');
        var year = Number(parts[0]) || 0;
        var month = Number(parts[1]) || 0;
        return year * 100 + month;
      }
      return dateKey(a) - dateKey(b);
    });
    var viewport = room.querySelector('[data-memory-viewport]');
    var track = room.querySelector('[data-memory-track]');
    var cards = Array.prototype.slice.call(room.querySelectorAll('[data-memory-card]'));
    var lightbox = document.querySelector('[data-memory-lightbox]');
    if(!data.length || !viewport || !track) return;
    var monthCount = Math.max(1, Number(track.dataset.memoryCount) || data.length);
    var step = 0, position = 0, target = 0, minimum = 0, drag = null, frame = 0, dragFrame = 0, dragNext = 0;
    function reduced(){ return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    function measure(){
      step = Math.round(Math.min(390, Math.max(218, window.innerWidth * .27)));
      track.style.setProperty('--memory-step', step + 'px');
      minimum = -Math.max(0, (monthCount - 1) * step);
    }
    function clamp(value){ return Math.max(minimum, Math.min(0, value)); }
    function paint(){ track.style.transform = 'translate3d(' + position + 'px,0,0)'; }
    function glide(){
      position += (target - position) * .16;
      if(Math.abs(target - position) < .25){ position = target; paint(); frame = 0; return; }
      paint(); frame = window.requestAnimationFrame(glide);
    }
    function moveTo(value, immediate){
      target = clamp(value);
      if(immediate){ position = target; paint(); return; }
      if(!frame) frame = window.requestAnimationFrame(glide);
    }
    function focusMemory(index){
      moveTo(-Math.max(0, Math.min(monthCount - 1, index)) * step, true);
    }
    function open(index){
      var item = data[index]; if(!item || !lightbox) return;
      lightbox.hidden = false; lightbox.setAttribute('aria-hidden','false');
      lightbox.querySelector('[data-memory-lightbox-image]').src = item.image || '';
      lightbox.querySelector('[data-memory-lightbox-image]').alt = item.title || item.date || '';
      lightbox.querySelector('[data-memory-lightbox-date]').textContent = item.date || '';
      lightbox.querySelector('[data-memory-lightbox-title]').textContent = item.title || item.date || '';
      lightbox.querySelector('[data-memory-lightbox-description]').textContent = item.description || '';
      document.documentElement.classList.add('is-memory-lightbox-open');
      var closeButton = lightbox.querySelector('[data-memory-close]'); if(closeButton) closeButton.focus();
    }
    function close(){ if(!lightbox) return; lightbox.hidden = true; lightbox.setAttribute('aria-hidden','true'); document.documentElement.classList.remove('is-memory-lightbox-open'); }
    cards.forEach(function(card){
      var button = card.querySelector('[data-memory-open]');
      if(button) button.addEventListener('click', function(){ open(Number(card.dataset.memoryIndex)); });
    });
    viewport.addEventListener('pointerdown', function(event){
      if(event.button !== undefined && event.button !== 0) return;
      // 卡片自身只负责预览/放大；横向拖动从轨道空白处开始，避免捕获按钮的 click。
      if(event.target.closest && event.target.closest('[data-memory-open]')) return;
      // 防止横向拖动时浏览器选中标题、导航等页面文字。
      event.preventDefault();
      if(frame){ window.cancelAnimationFrame(frame); frame = 0; }
      drag = { x:event.clientX, position:target };
      viewport.setPointerCapture && viewport.setPointerCapture(event.pointerId);
      viewport.classList.add('is-dragging'); track.classList.add('is-dragging');
    });
    viewport.addEventListener('pointermove', function(event){
      if(!drag) return;
      var delta = event.clientX - drag.x;
      dragNext = drag.position + delta;
      // 高频 pointermove 合并至每个动画帧，避免图片很多时反复重排造成卡顿。
      if(!dragFrame) dragFrame = window.requestAnimationFrame(function(){
        dragFrame = 0;
        if(drag) moveTo(dragNext, true);
      });
    });
    function stopDrag(){
      if(!drag) return;
      if(dragFrame){ window.cancelAnimationFrame(dragFrame); dragFrame = 0; moveTo(dragNext, true); }
      drag = null; viewport.classList.remove('is-dragging'); track.classList.remove('is-dragging'); moveTo(target, false);
    }
    viewport.addEventListener('pointerup', stopDrag); viewport.addEventListener('pointercancel', stopDrag);
    viewport.addEventListener('wheel', function(event){
      var delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if(!delta) return;
      event.preventDefault(); moveTo(target - delta * .62, false);
    }, {passive:false});
    if(lightbox){
      lightbox.addEventListener('click', function(event){ if(event.target === lightbox) close(); });
      var closeButton = lightbox.querySelector('[data-memory-close]'); if(closeButton) closeButton.addEventListener('click', close);
    }
    document.addEventListener('keydown', function(event){ if(event.key === 'Escape') close(); });
    window.addEventListener('resize', function(){ measure(); moveTo(target, true); });
    measure(); focusMemory(Number(cards[cards.length - 1].dataset.memoryMonthIndex) || 0);
  }
  window.SonglineInitMemoryRoom = init;
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){init(document);},{once:true}); else init(document);
  window.addEventListener('songline:page-swap', function(event){init((event.detail && event.detail.root) || document);});
})();
