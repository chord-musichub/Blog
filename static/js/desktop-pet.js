/* 信息面板雪人摆件：拖动只改绕木杆下端的转角，不平移组件。 */
(function(){
  'use strict';

  function init(root){
    root = root || document;
    var pet = root.querySelector ? root.querySelector('[data-desktop-pet]') : null;
    if(!pet || pet.dataset.desktopPetReady === '1') return;
    pet.dataset.desktopPetReady = '1';

    var rig = pet.querySelector('.songline-desktop-pet__rig');
    var image = pet.querySelector('.songline-desktop-pet__image');
    if(!rig || !image) return;
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var activePointer = null;
    var moved = false;
    var startX = 0;
    var startY = 0;
    var activeAngle = 0;

    function setAngle(angle){
      activeAngle = angle;
      pet.style.setProperty('--desktop-pet-angle', angle.toFixed(2) + 'deg');
    }

    function angleFromPointer(event){
      var rect = pet.getBoundingClientRect();
      var anchorX = rect.left + rect.width / 2;
      var anchorY = rect.bottom;
      var angle = Math.atan2(event.clientX - anchorX, anchorY - event.clientY) * 180 / Math.PI;
      return Math.max(-25, Math.min(25, angle));
    }

    function prepareSpring(angle){
      pet.classList.remove('is-returning');
      rig.style.setProperty('--desktop-pet-spring-start', angle.toFixed(2) + 'deg');
      rig.style.setProperty('--desktop-pet-spring-reverse-large', (-angle * .58).toFixed(2) + 'deg');
      rig.style.setProperty('--desktop-pet-spring-forward-small', (angle * .32).toFixed(2) + 'deg');
      rig.style.setProperty('--desktop-pet-spring-reverse-small', (-angle * .14).toFixed(2) + 'deg');
      setAngle(0);
      void pet.offsetWidth;
      pet.classList.add('is-returning');
    }

    function clearSpring(){
      pet.classList.remove('is-returning');
      rig.style.removeProperty('--desktop-pet-spring-start');
      rig.style.removeProperty('--desktop-pet-spring-reverse-large');
      rig.style.removeProperty('--desktop-pet-spring-forward-small');
      rig.style.removeProperty('--desktop-pet-spring-reverse-small');
    }

    pet.addEventListener('pointerdown', function(event){
      if(event.button !== undefined && event.button !== 0) return;
      activePointer = event.pointerId;
      moved = false;
      startX = event.clientX;
      startY = event.clientY;
      clearSpring();
      pet.classList.add('is-dragging');
      if(pet.setPointerCapture) pet.setPointerCapture(activePointer);
    });

    pet.addEventListener('pointermove', function(event){
      if(event.pointerId !== activePointer) return;
      if(Math.abs(event.clientX - startX) > 3 || Math.abs(event.clientY - startY) > 3) moved = true;
      if(!moved) return;
      setAngle(angleFromPointer(event));
    });

    function releasePointer(event){
      if(activePointer === null || (event && event.pointerId !== undefined && event.pointerId !== activePointer)) return;
      activePointer = null;
      pet.classList.remove('is-dragging');
      if(moved){
        if(reduced) setAngle(0);
        else prepareSpring(activeAngle);
      }
    }

    pet.addEventListener('pointerup', releasePointer);
    pet.addEventListener('pointercancel', releasePointer);
    pet.addEventListener('lostpointercapture', releasePointer);
    rig.addEventListener('animationend', function(event){
      if(event.animationName === 'songlineDesktopPetSpringReturn') clearSpring();
    });
    image.addEventListener('error', function(){ pet.hidden = true; }, { once:true });
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){ init(document); }, { once:true });
  else init(document);
  window.addEventListener('songline:page-swap', function(){ init(document); });
})();
