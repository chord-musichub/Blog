(function(){
  'use strict';

  function initialize(root){
    root = root || document;
    var panel = root.querySelector('[data-home-panel]');
    if(!panel || panel.dataset.messageBoardReady === '1') return;
    if(typeof window.__songlineHomeMessageBoardCleanup === 'function') window.__songlineHomeMessageBoardCleanup();
    panel.dataset.messageBoardReady = '1';

    var board = panel.querySelector('[data-home-message-board]');
    var goto = panel.querySelector('[data-home-panel-goto]');
    var back = panel.querySelector('[data-home-panel-return]');
    var openCompose = panel.querySelector('[data-home-message-compose-open]');
    var cancelCompose = panel.querySelector('[data-home-message-compose-cancel]');
    var form = panel.querySelector('[data-home-message-form]');
    var status = panel.querySelector('[data-home-message-compose-status]');
    var list = panel.querySelector('[data-home-message-list]');
    var count = panel.querySelector('[data-home-message-count]');
    var previewToggle = panel.querySelector('[data-home-message-preview-toggle]');
    var preview = panel.querySelector('[data-home-message-preview]');
    var contentField = panel.querySelector('[data-home-message-content-field]');
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

    function endpoints(){
      var list = ['/api/messages'];
      try{
        var apiBase = String((window.BlogRuntimeConfig || {}).publicApiUrl || '').replace(/\/+$/, '');
        if(apiBase) list.push(apiBase + '/api/messages');
      }catch(error){}
      return Array.from(new Set(list));
    }

    function requestAny(options){
      var tries = endpoints();
      var index = 0;
      function next(lastError){
        if(index >= tries.length) return Promise.reject(lastError || new Error('request failed'));
        var url = tries[index++];
        var absolute = /^https?:\/\//i.test(url);
        var requestOptions = Object.assign(absolute ? {mode:'cors', credentials:'omit'} : {credentials:'same-origin'}, options || {});
        return fetch(url, requestOptions).then(function(response){
          return response.json().catch(function(){ return {}; }).then(function(data){
            if(!response.ok){
              var error = new Error(data.error || 'request failed');
              error.status = response.status;
              error.noFallback = response.status >= 400 && response.status < 500;
              throw error;
            }
            return data;
          });
        }).catch(function(error){ return error && error.noFallback ? Promise.reject(error) : next(error); });
      }
      return next();
    }

    function escapeHTML(value){
      return String(value || '').replace(/[&<>"']/g, function(char){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]; });
    }

    function inlineMarkdown(value){
      var safe = escapeHTML(value);
      safe = safe.replace(/`([^`]+)`/g, '<code>$1</code>');
      safe = safe.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      safe = safe.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
      return safe;
    }

    function renderMarkdown(value){
      var lines = String(value || '').split(/\r?\n/);
      return lines.map(function(line){
        if(/^###\s+/.test(line)) return '<h4>' + inlineMarkdown(line.replace(/^###\s+/, '')) + '</h4>';
        if(/^##\s+/.test(line)) return '<h3>' + inlineMarkdown(line.replace(/^##\s+/, '')) + '</h3>';
        if(/^#\s+/.test(line)) return '<h2>' + inlineMarkdown(line.replace(/^#\s+/, '')) + '</h2>';
        if(/^>\s?/.test(line)) return '<blockquote>' + inlineMarkdown(line.replace(/^>\s?/, '')) + '</blockquote>';
        return line ? '<p>' + inlineMarkdown(line) + '</p>' : '';
      }).join('');
    }

    function formatTime(value){
      var date = new Date(value);
      if(Number.isNaN(date.getTime())) return '';
      return date.getFullYear() + '.' + String(date.getMonth() + 1).padStart(2, '0') + '.' + String(date.getDate()).padStart(2, '0');
    }

    function focusLayer(){
      var layer = document.querySelector('[data-home-message-focus]');
      if(layer) return layer;
      layer = document.createElement('section');
      layer.className = 'songline-home-message-focus';
      layer.hidden = true;
      layer.setAttribute('data-home-message-focus', '');
      layer.setAttribute('aria-hidden', 'true');
      layer.innerHTML = '<article class="songline-home-message-focus-panel" role="dialog" aria-modal="true" aria-label="留言详情" tabindex="-1">' +
        '<button class="songline-home-message-focus-close" type="button" data-home-message-focus-close aria-label="关闭留言">×</button>' +
        '<header data-home-message-focus-meta></header><div class="songline-home-message-focus-content" data-home-message-focus-content></div></article>';
      document.body.appendChild(layer);
      return layer;
    }

    var focus = focusLayer();
    var focusReturn = null;
    function closeFocus(){
      if(focus.hidden) return;
      focus.hidden = true;
      focus.setAttribute('aria-hidden', 'true');
      document.documentElement.classList.remove('is-home-message-focus-open');
      if(focusReturn) focusReturn.focus();
      focusReturn = null;
    }

    function openFocus(message, trigger){
      if(!message) return;
      var avatar = message.avatar || '/media/users/user-null.png';
      focus.querySelector('[data-home-message-focus-meta]').innerHTML = '<img src="' + escapeHTML(avatar) + '" alt="" referrerpolicy="no-referrer">' +
        '<div><b>' + escapeHTML(message.name || '匿名') + '</b><time>' + escapeHTML(formatTime(message.created_at)) + '</time></div>';
      focus.querySelector('[data-home-message-focus-content]').innerHTML = renderMarkdown(message.content);
      focusReturn = trigger || null;
      focus.hidden = false;
      focus.setAttribute('aria-hidden', 'false');
      document.documentElement.classList.add('is-home-message-focus-open');
      window.setTimeout(function(){ focus.querySelector('.songline-home-message-focus-panel').focus(); }, 0);
    }

    var closeFocusButton = focus.querySelector('[data-home-message-focus-close]');
    function onFocusLayerClick(event){ if(event.target === focus) closeFocus(); }
    function onFocusKeydown(event){ if(event.key === 'Escape') closeFocus(); }
    focus.addEventListener('click', onFocusLayerClick);
    closeFocusButton.addEventListener('click', closeFocus);
    document.addEventListener('keydown', onFocusKeydown);

    function cleanup(){
      closeFocus();
      focus.removeEventListener('click', onFocusLayerClick);
      closeFocusButton.removeEventListener('click', closeFocus);
      document.removeEventListener('keydown', onFocusKeydown);
      window.removeEventListener('songline:page-transition-start', onTransitionStart);
      if(focus.parentNode) focus.parentNode.removeChild(focus);
      if(window.__songlineHomeMessageBoardCleanup === cleanup) window.__songlineHomeMessageBoardCleanup = null;
    }
    function onTransitionStart(event){ if((event.detail && event.detail.from) === '/') cleanup(); }
    window.addEventListener('songline:page-transition-start', onTransitionStart);
    window.__songlineHomeMessageBoardCleanup = cleanup;

    function updatePreview(){
      if(!preview || !messageInput) return;
      preview.innerHTML = renderMarkdown(messageInput.value) || '<p>输入内容后将在这里预览。</p>';
    }

    function renderMessages(messages){
      messages = Array.isArray(messages) ? messages : [];
      var currentMessages = messages;
      if(count) count.textContent = String(messages.length);
      if(!list) return;
      list.innerHTML = messages.map(function(message, index){
        var avatar = message.avatar || '/media/users/user-null.png';
        var longMessage = Array.from(String(message.content || '')).length > 40;
        return '<article class="songline-home-message-entry' + (index % 2 ? ' is-offset' : '') + (longMessage ? ' is-collapsible' : '') + '" data-home-message-entry data-home-message-index="' + index + '" tabindex="0" role="button" aria-label="查看留言详情">' +
          '<span class="songline-home-message-entry-no">' + String(index + 1).padStart(3, '0') + '</span>' +
          '<div class="songline-home-message-entry-copy"><div class="songline-home-message-markdown">' + renderMarkdown(message.content) + '</div>' +
          (longMessage ? '<span class="songline-home-message-expand">点击查看完整留言</span>' : '') +
          '<footer><img class="songline-home-message-avatar" src="' + escapeHTML(avatar) + '" alt="" referrerpolicy="no-referrer">' + '<b>' + escapeHTML(message.name || '匿名') + '</b><time>' + escapeHTML(formatTime(message.created_at)) + '</time></footer></div></article>';
      }).join('');
      Array.prototype.forEach.call(list.querySelectorAll('[data-home-message-entry]'), function(entry){
        function open(){ openFocus(currentMessages[Number(entry.dataset.homeMessageIndex)], entry); }
        entry.addEventListener('click', open);
        entry.addEventListener('keydown', function(event){ if(event.key === 'Enter' || event.key === ' '){ event.preventDefault(); open(); } });
      });
    }

    function loadMessages(){
      return requestAny({method:'GET'}).then(function(data){ renderMessages(data.messages); return data.messages || []; });
    }

    goto.addEventListener('click', function(){
      setState('message', back);
      loadMessages().catch(function(){});
    });
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
    if(previewToggle && preview && contentField){
      previewToggle.addEventListener('click', function(){
        var active = preview.hidden;
        updatePreview();
        preview.hidden = !active;
        contentField.hidden = active;
        previewToggle.setAttribute('aria-pressed', active ? 'true' : 'false');
        previewToggle.textContent = active ? '继续编辑' : '预览';
      });
    }
    if(messageInput) messageInput.addEventListener('input', updatePreview);
    if(form){
      form.addEventListener('submit', function(event){
        event.preventDefault();
        var submit = form.querySelector('button[type="submit"]');
        var payload = {
          qq: (form.elements.qq && form.elements.qq.value || '').trim(),
          name: (form.elements.name && form.elements.name.value || '').trim(),
          content: (form.elements.content && form.elements.content.value || '').trim()
        };
        if(submit) submit.disabled = true;
        if(status) status.textContent = '正在保存…';
        requestAny({method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)}).then(function(data){
          renderMessages(data.messages);
          form.reset();
          if(preview){ preview.hidden = true; preview.innerHTML = ''; }
          if(contentField) contentField.hidden = false;
          if(previewToggle){ previewToggle.setAttribute('aria-pressed', 'false'); previewToggle.textContent = '预览'; }
          if(status) status.textContent = '';
          setState('message', openCompose);
        }).catch(function(error){
          if(status) status.textContent = error && error.message ? error.message : '保存失败，请稍后重试。';
        }).finally(function(){ if(submit) submit.disabled = false; });
      });
    }
    loadMessages().catch(function(){});
  }

  window.SonglineInitHomeMessageBoard = initialize;
})();
