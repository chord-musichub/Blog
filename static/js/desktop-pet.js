/* 固定底座的雪人弹簧：空闲动画由 CSS 驱动，交互回弹只占用一条有限帧链。 */
(function(){
  'use strict';
  if(window.SonglineInitDesktopPet) return;
  var current = null;
  var motion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');

  function init(root){
    root = root || document;
    var pet = root.querySelector ? root.querySelector('[data-desktop-pet]') : null;
    if(!pet || pet.dataset.desktopPetReady === '1') return;
    var figure = pet.querySelector('.songline-desktop-pet__figure');
    var image = pet.querySelector('.songline-desktop-pet__image');
    var wire = pet.querySelector('[data-pet-spring-wire]');
    if(!figure || !image || !wire) return;
    if(current) current.destroy();
    pet.dataset.desktopPetReady = '1';
    var activePointer = null, moved = false, frame = 0;
    var angle = 0, lift = 0, velocity = 0, liftVelocity = 0;
    var startX = 0, startY = 0, startLift = 0, pointerTime = 0;
    var rect = null, lastTime = 0, started = 0, kickDirection = 1;
    var paused = false, disposed = false;

    function clamp(value, limit){ return Math.max(-limit, Math.min(limit, value)); }
    function reduced(){ return motion && motion.matches; }
    function render(){
      pet.style.setProperty('--desktop-pet-angle', angle.toFixed(2) + 'deg');
      pet.style.setProperty('--desktop-pet-lift', lift.toFixed(2) + 'px');
      var height = rect && rect.height || pet.getBoundingClientRect().height || 178;
      var radians = angle * Math.PI / 180;
      var dx = 54 * Math.sin(radians);
      var dy = -54 * Math.cos(radians) + lift * 178 / height;
      var points = [];
      // A curved spine keeps the base fixed; six elliptical turns follow it.
      for(var i = 0; i <= 96; i++){
        var t = i / 96, phase = t * Math.PI * 12;
        var taper = Math.min(1, t * 8, (1 - t) * 8);
        var tangentX = 2 * dx * t, length = Math.hypot(tangentX, dy);
        var coilX = Math.sin(phase) * 11 * taper;
        var coilY = (Math.cos(phase) - 1) * 2.4 * taper;
        var x = 68 + dx * t * t + coilX * (-dy / length) + coilY * tangentX / length;
        var y = 178 + dy * t + coilX * tangentX / length + coilY * dy / length;
        points.push((i ? 'L' : 'M') + x.toFixed(2) + ' ' + y.toFixed(2));
      }
      wire.setAttribute('d', points.join(' '));
    }
    function stopFrame(){ if(frame) window.cancelAnimationFrame(frame); frame = 0; }
    function reset(){
      stopFrame();angle = lift = velocity = liftVelocity = 0;
      render();pet.classList.remove('is-returning');
    }
    function capturePose(){
      var transform = window.getComputedStyle(figure).transform;
      if(transform && transform !== 'none'){
        var matrix = new DOMMatrixReadOnly(transform);
        angle = Math.atan2(matrix.b, matrix.a) * 180 / Math.PI;
        lift = matrix.f;
      }
      stopFrame();
    }
    function tick(time){
      frame = 0;
      if(disposed || paused || !pet.isConnected || document.hidden){ reset();return; }
      var dt = Math.min((time - lastTime) / 1000, 1 / 30);
      lastTime = time;
      var steps = Math.max(1, Math.ceil(dt / .008)), step = dt / steps;
      for(var i = 0; i < steps; i++){
        velocity += (-180 * angle - 5.2 * velocity) * step;
        liftVelocity += (-220 * lift - 8 * liftVelocity) * step;
        angle += velocity * step;lift += liftVelocity * step;
        if(Math.abs(angle) > 56){ angle = clamp(angle, 56);velocity *= .45; }
        lift = clamp(lift, (rect && rect.height || 178) * .12);
      }
      render();
      if(time - started > 2400 || (Math.abs(angle) < .15 && Math.abs(velocity) < .6 && Math.abs(lift) < .15 && Math.abs(liftVelocity) < .8)){ reset();return; }
      frame = window.requestAnimationFrame(tick);
    }
    function rebound(){
      if(reduced() || paused){ reset();return; }
      pet.classList.add('is-returning');render();
      started = lastTime = performance.now();
      if(!frame) frame = window.requestAnimationFrame(tick);
    }
    function kick(){
      if(disposed || paused || activePointer !== null) return;
      rect = pet.getBoundingClientRect();capturePose();
      angle = clamp(angle + kickDirection * 28, 46);
      velocity = kickDirection * 140;lift = -8;liftVelocity = -90;
      kickDirection *= -1;rebound();
    }
    pet.addEventListener('pointerdown', function(event){
      if(disposed || paused || (event.button !== undefined && event.button !== 0) || activePointer !== null || event.isPrimary === false) return;
      rect = pet.getBoundingClientRect();capturePose();
      activePointer = event.pointerId;moved = false;
      startX = event.clientX;startY = event.clientY;startLift = lift;
      pointerTime = event.timeStamp;velocity = liftVelocity = 0;
      pet.classList.add('is-dragging');render();
      if(pet.setPointerCapture) pet.setPointerCapture(activePointer);
    });
    pet.addEventListener('pointermove', function(event){
      if(event.pointerId !== activePointer) return;
      if(Math.hypot(event.clientX - startX, event.clientY - startY) > 3) moved = true;
      if(!moved) return;
      var oldAngle = angle, oldLift = lift;
      var anchorX = rect.left + rect.width / 2, anchorY = rect.bottom;
      var limit = reduced() ? 8 : 46;
      angle = clamp(Math.atan2(event.clientX - anchorX, anchorY - event.clientY) * 180 / Math.PI, limit);
      lift = clamp(startLift + (event.clientY - startY) * .45, reduced() ? 3 : rect.height * .12);
      var dt = Math.max(.008, (event.timeStamp - pointerTime) / 1000);
      velocity = clamp((angle - oldAngle) / dt, 280);
      liftVelocity = clamp((lift - oldLift) / dt, 120);
      pointerTime = event.timeStamp;render();
    });
    function releasePointer(event){
      if(event && event.type === 'lostpointercapture' && event.target !== pet) return;
      if(activePointer === null || (event && event.pointerId !== undefined && event.pointerId !== activePointer)) return;
      var pointer = activePointer;activePointer = null;
      pet.classList.remove('is-dragging');
      if(pet.hasPointerCapture && pet.hasPointerCapture(pointer)) pet.releasePointerCapture(pointer);
      if(event && event.type !== 'pointerup'){ reset();return; }
      if(moved){
        if(event.timeStamp - pointerTime > 100) velocity = liftVelocity = 0;
        rebound();
      }else kick();
    }
    pet.addEventListener('pointerup', releasePointer);
    pet.addEventListener('pointercancel', releasePointer);
    pet.addEventListener('lostpointercapture', releasePointer);
    pet.addEventListener('keydown', function(event){
      if(event.key === 'Enter' || event.key === ' '){ event.preventDefault();if(!event.repeat) kick(); }
    });
    image.addEventListener('error', function(){ pet.hidden = true;pause(); }, {once:true});
    function pause(){
      paused = true;releasePointer();reset();pet.classList.add('is-paused');
    }
    current = {
      pause:pause,
      resume:function(){ if(!disposed && pet.isConnected && !pet.hidden){ paused = false;pet.classList.remove('is-paused'); } },
      reset:reset,
      destroy:function(){ pause();disposed = true; }
    };
    render();
    if(image.complete && !image.naturalWidth){ pet.hidden = true;pause(); }
  }
  window.SonglineInitDesktopPet = init;
  window.addEventListener('songline:page-transition-start', function(){ if(current){ current.destroy();current = null; } });
  window.addEventListener('pagehide', function(event){ if(current){ if(event.persisted) current.pause();else {current.destroy();current = null;} } });
  window.addEventListener('pageshow', function(event){ if(event.persisted && current) current.resume(); });
  document.addEventListener('visibilitychange', function(){ if(current){ if(document.hidden) current.pause();else current.resume(); } });
  if(motion && motion.addEventListener) motion.addEventListener('change', function(){ if(current) current.reset(); });
})();
