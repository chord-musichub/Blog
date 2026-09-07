(function(){
  'use strict';

  function initialize(root){
    root = root || document;
    var panel = root.querySelector('[data-home-panel]');
    if(!panel || panel.dataset.messageBoardReady === '1') return;
    panel.dataset.messageBoardReady = '1';

    var board = panel.querySelector('[data-home-message-board]');
    var goto = panel.querySelector('[data-home-panel-goto]');
    var back = panel.querySelector('[data-home-panel-return]');
    var openCompose = panel.querySelector('[data-home-message-compose-open]');
    var cancelCompose = panel.querySelector('[data-home-message-compose-cancel]');
    var form = panel.querySelector('[data-home-message-form]');
    var status = panel.querySelector('[data-home-message-compose-status]');
    var messageInput = form && form.querySelector('textarea[name="content"]');
    if(!board || !goto || !back) return;

    function setState(state, focusTarget){
      panel.dataset.homePanelState = state;
      board.setAttribute('aria-hidden', state === 'system' ? 'true' : 'false');
      if(form) form.hidden = state !== 'compose';
      window.dispatchEvent(new CustomEvent('songline:home-panel-state', { detail:{ state:state } }));
      if(focusTarget){
        window.setTimeout(function(){ focusTarget.focus(); }, 260);
      }
    }

    goto.addEventListener('click', function(){ setState('message', back); });
    back.addEventListener('click', function(){ setState('system', goto); });
    if(openCompose){
      openCompose.addEventListener('click', function(){
        if(status) status.textContent = '';
        setState('compose', messageInput || cancelCompose);
      });
    }
    if(cancelCompose){
      cancelCompose.addEventListener('click', function(){ setState('message', openCompose); });
    }
    if(form){
      form.addEventListener('submit', function(event){
        event.preventDefault();
        if(status) status.textContent = '留言服务尚未接入，内容没有发送。';
      });
    }
  }

  window.SonglineInitHomeMessageBoard = initialize;
})();
