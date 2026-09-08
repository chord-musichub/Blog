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
    // 过场替换 main 后，旧时间线的 document/window 监听必须先释放。
    if(typeof window.__songlineMemoryRoomCleanup === 'function') window.__songlineMemoryRoomCleanup();
    room.dataset.memoryReady = VERSION;
    // Hugo 模板已用补零后的 sort_key 排好时间线，并以同一顺序输出卡片与 JSON。
    var data = parseData(room);
    var viewport = room.querySelector('[data-memory-viewport]');
    var track = room.querySelector('[data-memory-track]');
    var cards = Array.prototype.slice.call(room.querySelectorAll('[data-memory-card]'));
    var lightbox = document.querySelector('[data-memory-lightbox]');
    if((!data.length && !cards.length) || !viewport || !track) return;
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
    function open(item){
      if(!item || !lightbox) return;
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
    function itemFromCard(card){
      return {
        date:card.dataset.memoryDate || '',
        title:card.dataset.memoryTitle || '',
        image:card.dataset.memoryImage || '',
        description:card.dataset.memoryDescription || ''
      };
    }
    function onCardClick(event){
      var card = event.currentTarget.closest('[data-memory-card]');
      if(card) open(itemFromCard(card));
    }
    cards.forEach(function(card){
      var button = card.querySelector('[data-memory-open]');
      if(button) button.addEventListener('click', onCardClick);
    });
    function onPointerDown(event){
      if(event.button !== undefined && event.button !== 0) return;
      // 卡片自身只负责预览/放大；横向拖动从轨道空白处开始，避免捕获按钮的 click。
      if(event.target.closest && event.target.closest('[data-memory-open]')) return;
      // 防止横向拖动时浏览器选中标题、导航等页面文字。
      event.preventDefault();
      if(frame){ window.cancelAnimationFrame(frame); frame = 0; }
      drag = { x:event.clientX, position:target };
      viewport.setPointerCapture && viewport.setPointerCapture(event.pointerId);
      viewport.classList.add('is-dragging'); track.classList.add('is-dragging');
    }
    function onPointerMove(event){
      if(!drag) return;
      var delta = event.clientX - drag.x;
      dragNext = drag.position + delta;
      // 高频 pointermove 合并至每个动画帧，避免图片很多时反复重排造成卡顿。
      if(!dragFrame) dragFrame = window.requestAnimationFrame(function(){
        dragFrame = 0;
        if(drag) moveTo(dragNext, true);
      });
    }
    function stopDrag(){
      if(!drag) return;
      if(dragFrame){ window.cancelAnimationFrame(dragFrame); dragFrame = 0; moveTo(dragNext, true); }
      drag = null; viewport.classList.remove('is-dragging'); track.classList.remove('is-dragging'); moveTo(target, false);
    }
    function onWheel(event){
      var delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if(!delta) return;
      event.preventDefault(); moveTo(target - delta * .62, false);
    }
    function onLightboxClick(event){ if(event.target === lightbox) close(); }
    function onKeyDown(event){ if(event.key === 'Escape') close(); }
    function onResize(){ measure(); moveTo(target, true); }
    function cleanup(){
      if(frame) window.cancelAnimationFrame(frame);
      if(dragFrame) window.cancelAnimationFrame(dragFrame);
      frame = 0; dragFrame = 0; drag = null;
      viewport.classList.remove('is-dragging'); track.classList.remove('is-dragging');
      cards.forEach(function(card){
        var button = card.querySelector('[data-memory-open]');
        if(button) button.removeEventListener('click', onCardClick);
      });
      viewport.removeEventListener('pointerdown', onPointerDown);
      viewport.removeEventListener('pointermove', onPointerMove);
      viewport.removeEventListener('pointerup', stopDrag);
      viewport.removeEventListener('pointercancel', stopDrag);
      viewport.removeEventListener('wheel', onWheel);
      if(lightbox){
        lightbox.removeEventListener('click', onLightboxClick);
        var closeButton = lightbox.querySelector('[data-memory-close]');
        if(closeButton) closeButton.removeEventListener('click', close);
      }
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('songline:page-transition-start', onTransitionStart);
      document.documentElement.classList.remove('is-memory-lightbox-open');
      if(window.__songlineMemoryRoomCleanup === cleanup) window.__songlineMemoryRoomCleanup = null;
    }
    function onTransitionStart(event){
      var from = event.detail && event.detail.from || '';
      if(from.indexOf('/friends/memories/') === 0) cleanup();
    }
    viewport.addEventListener('pointerdown', onPointerDown);
    viewport.addEventListener('pointermove', onPointerMove);
    viewport.addEventListener('pointerup', stopDrag); viewport.addEventListener('pointercancel', stopDrag);
    viewport.addEventListener('wheel', onWheel, {passive:false});
    if(lightbox){
      lightbox.addEventListener('click', onLightboxClick);
      var closeButton = lightbox.querySelector('[data-memory-close]'); if(closeButton) closeButton.addEventListener('click', close);
    }
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onResize);
    window.addEventListener('songline:page-transition-start', onTransitionStart);
    window.__songlineMemoryRoomCleanup = cleanup;
    measure(); focusMemory(Number(cards[cards.length - 1].dataset.memoryMonthIndex) || 0);
  }
  window.SonglineInitMemoryRoom = init;
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){init(document);},{once:true}); else init(document);
  window.addEventListener('songline:page-swap', function(event){init((event.detail && event.detail.root) || document);});
})();
