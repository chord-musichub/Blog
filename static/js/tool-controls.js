// Shared native help dialog. The top layer escapes glass transforms/clipping
// and provides inert background + keyboard focus containment automatically.
(function(){
  'use strict';
  if(window.SonglineInitToolControls) return;
  var states=new WeakMap();
  var triggers=new WeakMap();
  function notify(dialog, open){
    if(states.get(dialog)===open) return;
    states.set(dialog,open);
    dialog.dispatchEvent(new CustomEvent('songline:tool-help-change',{bubbles:true,detail:{open:open}}));
  }
  function close(dialog, pointer){
    if(!dialog.open) return;
    dialog.close();notify(dialog,false);
    // Pointer users can resume keyboard play immediately; keyboard users keep
    // the native return focus on the help button for predictable navigation.
    var trigger=triggers.get(dialog);
    if(pointer && trigger && document.activeElement===trigger) trigger.blur();
  }
  function init(root){
    (root || document).querySelectorAll('[data-tool-actionbar]').forEach(function(bar){
      if(bar.dataset.toolControlsBound) return;
      var surface=bar.closest('.tool-detail-surface');
      var dialog=surface && surface.querySelector('[data-tool-help-dialog]');
      var trigger=bar.querySelector('[data-tool-help-open]');
      if(!dialog || !trigger) return;
      bar.dataset.toolControlsBound='1';
      triggers.set(dialog,trigger);
      trigger.addEventListener('click',function(){
        if(dialog.open) return;
        dialog.showModal();notify(dialog,true);
      });
      dialog.querySelector('[data-tool-help-close]').addEventListener('click',function(event){close(dialog,event.detail>0);});
      dialog.addEventListener('cancel',function(event){event.preventDefault();close(dialog);});
      dialog.addEventListener('click',function(event){
        if(event.target!==dialog || !event.detail) return;
        var rect=dialog.getBoundingClientRect();
        if(event.clientX<rect.left || event.clientX>rect.right || event.clientY<rect.top || event.clientY>rect.bottom) close(dialog,true);
      });
      dialog.addEventListener('close',function(){if(!dialog.open) notify(dialog,false);});
    });
  }
  window.addEventListener('songline:page-transition-start',function(){
    document.querySelectorAll('[data-tool-help-dialog][open]').forEach(function(dialog){close(dialog);});
  });
  function syncBest(){
    document.querySelectorAll('[data-tool-actionbar]').forEach(function(bar){
      bar.dispatchEvent(new CustomEvent('songline:tool-sync-best',{bubbles:true}));
    });
  }
  window.addEventListener('online',syncBest);
  window.addEventListener('pageshow',function(event){if(event.persisted) syncBest();});
  window.SonglineInitToolControls=init;
})();
