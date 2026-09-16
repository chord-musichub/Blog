(function(){
  'use strict';
  var VERSION = '2.4.0';
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
    var suppressUntil = 0, measured = false;
    var compact = window.matchMedia('(max-width:980px)');
    var stackCount = cards.reduce(function(count, card){ return Math.max(count, 1 + Number(card.style.getPropertyValue('--memory-slot') || 0)); }, 1);
    function reduced(){ return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    function measure(){
      var bottom = measured ? viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop : 0;
      step = Math.round(Math.min(390, Math.max(218, window.innerWidth * .27)));
      track.style.setProperty('--memory-step', step + 'px');
      // A tall same-month stack must remain reachable on a phone, not clipped above the screen.
      track.style.setProperty('--memory-mobile-height', (stackCount * 148 + 144) + 'px');
      if(compact.matches) viewport.scrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight - bottom);
      measured = true;
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
      if(window.SonglineResources) window.SonglineResources.image(lightbox.querySelector('[data-memory-lightbox-image]'));
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
      if(Date.now() < suppressUntil){ event.preventDefault(); return; }
      var card = event.currentTarget.closest('[data-memory-card]');
      if(card) open(itemFromCard(card));
    }
    cards.forEach(function(card){
      var button = card.querySelector('[data-memory-open]');
      if(button) button.addEventListener('click', onCardClick);
      card.querySelectorAll('img').forEach(function(image){ image.draggable = false; });
    });
    function onPointerDown(event){
      if(event.button !== undefined && event.button !== 0) return;
      if(drag || event.isPrimary === false) return;
      if(frame){ window.cancelAnimationFrame(frame); frame = 0; }
      drag = { id:event.pointerId, x:event.clientX, y:event.clientY, position:position, moved:false };
    }
    function onPointerMove(event){
      if(!drag || event.pointerId !== drag.id) return;
      var delta = event.clientX - drag.x;
      if(!drag.moved){
        if(Math.abs(delta) < 8) return;
        // Let the browser handle vertical scrolling and pinch zoom without cancellation.
        if(event.pointerType === 'touch' && Math.abs(event.clientY - drag.y) > Math.abs(delta)) return;
        drag.moved = true;
        viewport.setPointerCapture && viewport.setPointerCapture(event.pointerId);
        viewport.classList.add('is-dragging'); track.classList.add('is-dragging');
      }
      dragNext = drag.position + delta;
      // 高频 pointermove 合并至每个动画帧，避免图片很多时反复重排造成卡顿。
      if(!dragFrame) dragFrame = window.requestAnimationFrame(function(){
        dragFrame = 0;
        if(drag) moveTo(dragNext, true);
      });
    }
    function stopDrag(event){
      if(!drag || event && event.pointerId !== drag.id) return;
      if(dragFrame){ window.cancelAnimationFrame(dragFrame); dragFrame = 0; moveTo(dragNext, true); }
      if(drag.moved) suppressUntil = Date.now() + 400;
      if(viewport.hasPointerCapture && viewport.hasPointerCapture(drag.id)) viewport.releasePointerCapture(drag.id);
      drag = null; viewport.classList.remove('is-dragging'); track.classList.remove('is-dragging'); moveTo(target, false);
    }
    function onWheel(event){
      if(compact.matches && viewport.scrollHeight > viewport.clientHeight && !event.shiftKey && Math.abs(event.deltaY) > Math.abs(event.deltaX)) return;
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
