(function(){
  'use strict';
  var VERSION = '2.0.0';
  function parseData(root){
    var node = root.querySelector('#memory-room-data');
    try{return node ? JSON.parse(node.textContent || '[]') : [];}catch(e){return [];}
  }
  function init(root){
    root = root || document;
    var room = root.querySelector && root.querySelector('[data-memory-room]');
    if(!room || room.dataset.memoryReady === VERSION) return;
    room.dataset.memoryReady = VERSION;
    var data = parseData(room);
    var viewport = room.querySelector('[data-memory-viewport]');
    var track = room.querySelector('[data-memory-track]');
    var cards = Array.prototype.slice.call(room.querySelectorAll('[data-memory-card]'));
    var lightbox = document.querySelector('[data-memory-lightbox]');
    if(!data.length || !viewport || !track) return;
    var step = 0, offset = 0, minimum = 0, drag = null, dragged = false;
    function reduced(){ return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    function measure(){
      step = Math.round(Math.min(390, Math.max(218, window.innerWidth * .27)));
      track.style.setProperty('--memory-step', step + 'px');
      minimum = -Math.max(0, (data.length - 1) * step);
    }
    function render(animate){
      offset = Math.max(minimum, Math.min(0, offset));
      track.classList.toggle('is-dragging', !animate);
      track.style.transform = 'translate3d(' + offset + 'px,0,0)';
    }
    function focusMemory(index, animate){
      offset = -Math.max(0, Math.min(data.length - 1, index)) * step;
      render(animate);
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
      drag = { x:event.clientX, offset:offset }; dragged = false;
      viewport.setPointerCapture && viewport.setPointerCapture(event.pointerId);
      viewport.classList.add('is-dragging'); track.classList.add('is-dragging');
    });
    viewport.addEventListener('pointermove', function(event){
      if(!drag) return;
      var delta = event.clientX - drag.x;
      if(Math.abs(delta) > 5) dragged = true;
      offset = drag.offset + delta; render(false);
    });
    function stopDrag(){ if(!drag) return; drag = null; viewport.classList.remove('is-dragging'); track.classList.remove('is-dragging'); render(true); window.setTimeout(function(){ dragged = false; }, 0); }
    viewport.addEventListener('pointerup', stopDrag); viewport.addEventListener('pointercancel', stopDrag);
    viewport.addEventListener('wheel', function(event){
      var delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if(!delta) return;
      event.preventDefault(); offset -= delta; render(false); window.clearTimeout(viewport._memoryWheelTimer); viewport._memoryWheelTimer = window.setTimeout(function(){ render(true); }, 90);
    }, {passive:false});
    if(lightbox){
      lightbox.addEventListener('click', function(event){ if(event.target === lightbox) close(); });
      var closeButton = lightbox.querySelector('[data-memory-close]'); if(closeButton) closeButton.addEventListener('click', close);
    }
    document.addEventListener('keydown', function(event){ if(event.key === 'Escape') close(); });
    window.addEventListener('resize', function(){ measure(); render(!reduced()); });
    measure(); focusMemory(data.length - 1, !reduced());
  }
  window.SonglineInitMemoryRoom = init;
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){init(document);},{once:true}); else init(document);
  window.addEventListener('songline:page-swap', function(event){init((event.detail && event.detail.root) || document);});
})();
