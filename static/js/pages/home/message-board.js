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
    var ticker = panel.querySelector('[data-home-message-ticker]');
    var tickerText = ticker && ticker.querySelector('[data-home-message-ticker-text]');
    var openCompose = panel.querySelector('[data-home-message-compose-open]');
    var cancelCompose = panel.querySelector('[data-home-message-compose-cancel]');
    var form = panel.querySelector('[data-home-message-form]');
    var status = panel.querySelector('[data-home-message-compose-status]');
    var list = panel.querySelector('[data-home-message-list]');
    var count = panel.querySelector('[data-home-message-count]');
    var statCount = panel.querySelector('[data-home-message-stat-count]');
    var loadStatus = panel.querySelector('[data-home-message-load-status]');
    var previewToggle = panel.querySelector('[data-home-message-preview-toggle]');
    var preview = panel.querySelector('[data-home-message-preview]');
    var contentField = panel.querySelector('[data-home-message-content-field]');
    var messageInput = form && form.querySelector('textarea[name="content"]');
    if(!board || !goto || !back) return;

    var tickerMessages = [];
    var tickerTimer = 0;
    var tickerFrame = 0;
    var disposed = false;
    var requestController = new AbortController();
    var pendingMessages = null;
    var saving = false, hasLoaded = false, messagesRevision = 0, focusTimer = 0;
    var tickerObserver = ticker && typeof ResizeObserver === 'function' ? new ResizeObserver(function(){
      if(tickerMessages.length && !ticker.hidden) renderMessageTicker(tickerMessages);
    }) : null;
    if(tickerObserver) tickerObserver.observe(ticker);
    function messageSummary(value){
      return String(value || '').replace(/^\s*(?:#{1,6}\s+|>\s?|[-*+]\s+)/gm, '')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[`*_~]/g, '')
        .replace(/\s+/g, ' ').trim();
    }
    function renderMessageTicker(messages){
      tickerMessages = (Array.isArray(messages) ? messages : []).filter(function(message){
        return message && String(message.content || '').trim();
      });
      if(!ticker || !tickerText) return;
      window.clearTimeout(tickerTimer);
      window.cancelAnimationFrame(tickerFrame);
      if(!tickerMessages.length){
        ticker.hidden = true;
        tickerText.textContent = '';
        return;
      }
      var lastIndex = -1;
      function showNext(){
        if(disposed || !tickerMessages.length) return;
        if(document.hidden || panel.dataset.homePanelState !== 'system' || ticker.matches(':hover, :focus')){
          tickerTimer = window.setTimeout(showNext, 1000);
          return;
        }
        var index = Math.floor(Math.random() * tickerMessages.length);
        if(tickerMessages.length > 1 && index === lastIndex) index = (index + 1) % tickerMessages.length;
        lastIndex = index;
        var message = tickerMessages[index];
        var summary = Array.from(messageSummary(message.content));
        var text = summary.slice(0, 64).join('') + (summary.length > 64 ? '…' : '');
        tickerText.textContent = (message.name || '匿名') + '：' + text;
        ticker.setAttribute('aria-label', '打开留言板：' + tickerText.textContent);
        ticker.classList.remove('is-switching', 'is-scrolling');
        ticker.hidden = false;
        tickerFrame = window.requestAnimationFrame(function(){
          if(disposed) return;
          var travel = Math.max(0, tickerText.scrollWidth - ticker.clientWidth);
          var duration = Math.max(6500, Math.min(16000, travel / 30 * 1000 + 3000));
          ticker.style.setProperty('--ticker-travel', -travel + 'px');
          ticker.style.setProperty('--ticker-duration', duration + 'ms');
          ticker.classList.add('is-switching');
          if(travel > 0) ticker.classList.add('is-scrolling');
          tickerTimer = window.setTimeout(showNext, duration + 500);
        });
      }
      showNext();
    }

    function setState(state, focusTarget){
      if(disposed) return;
      window.clearTimeout(focusTimer);
      panel.dataset.homePanelState = state;
      board.setAttribute('aria-hidden', state === 'system' ? 'true' : 'false');
      if(form) form.hidden = state !== 'compose';
      var system = panel.querySelector('[data-home-panel-system]');
      if(system) system.inert = state !== 'system';
      board.inert = state === 'system';
      window.dispatchEvent(new CustomEvent('songline:home-panel-state', { detail:{ state:state } }));
      if(focusTarget){
        focusTimer = window.setTimeout(function(){ if(!disposed && panel.dataset.homePanelState === state && focusTarget.isConnected) focusTarget.focus({preventScroll:true}); }, 260);
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
      var reading = !options || options.method === 'GET';
      function next(lastError){
        if(index >= tries.length) return Promise.reject(lastError || new Error('request failed'));
        var url = tries[index++];
        var absolute = /^https?:\/\//i.test(url);
        var controller = new AbortController(), timedOut = false;
        function abort(){ controller.abort(); }
        requestController.signal.addEventListener('abort', abort, {once:true});
        if(requestController.signal.aborted) abort();
        var timeout = window.setTimeout(function(){ timedOut = true; abort(); }, 8000);
        var requestOptions = Object.assign(absolute ? {mode:'cors', credentials:'omit'} : {credentials:'same-origin'}, options || {}, {signal:controller.signal});
        return fetch(url, requestOptions).then(function(response){
          return response.json().catch(function(){ return {}; }).then(function(data){
            if(!response.ok){
              var error = new Error(data.error || 'request failed');
              error.status = response.status;
              // A missing endpoint can be tried elsewhere. Never replay a
              // possibly accepted write after a timeout/network/5xx failure.
              error.noFallback = response.status !== 404 && response.status !== 405 && (!reading || response.status < 500);
              throw error;
            }
            if(!data || !Object.prototype.hasOwnProperty.call(data, 'messages') || data.messages !== null && !Array.isArray(data.messages)){
              var invalid = new Error(reading ? '留言服务返回格式异常，请稍后重新打开。' : '提交响应异常，请先重新打开留言板确认是否已发布。');
              invalid.noFallback = !reading; throw invalid;
            }
            return data;
          });
        }).finally(function(){ window.clearTimeout(timeout); requestController.signal.removeEventListener('abort', abort); }).catch(function(error){
          if(timedOut) error = new Error(reading ? '留言加载超时，请稍后重新打开。' : '提交超时，请先重新打开留言板确认是否已发布，避免重复提交。');
          else if(!reading && !disposed && error && !error.status && !error.noFallback) error = new Error('提交结果未确认，请重新打开留言板检查后再试。');
          var missingEndpoint = error && (error.status === 404 || error.status === 405);
          if(disposed || (error && error.noFallback) || (!reading && !missingEndpoint)) return Promise.reject(error);
          return next(error);
        });
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
      layer = document.createElement('dialog');
      layer.className = 'songline-home-message-focus';
      layer.hidden = true;
      layer.setAttribute('data-home-message-focus', '');
      layer.setAttribute('aria-hidden', 'true');
      layer.setAttribute('aria-label', '留言详情');
      layer.innerHTML = '<article class="songline-home-message-focus-panel" tabindex="-1">' +
        '<button class="songline-home-message-focus-close" type="button" data-home-message-focus-close aria-label="关闭留言">×</button>' +
        '<header data-home-message-focus-meta></header><div class="songline-home-message-focus-content" data-home-message-focus-content></div></article>';
      document.body.appendChild(layer);
      return layer;
    }

    var focus = focusLayer();
    var focusReturn = null;
    function closeFocus(restoreFocus){
      if(focus.hidden) return;
      if(focus.open) focus.close();
      focus.hidden = true;
      focus.setAttribute('aria-hidden', 'true');
      document.documentElement.classList.remove('is-home-message-focus-open');
      if(restoreFocus !== false && focusReturn && focusReturn.isConnected) focusReturn.focus({preventScroll:true});
      focusReturn = null;
    }

    function openFocus(message, trigger){
      if(disposed || !message) return;
      var avatar = message.avatar || '/uploads/admin/friends/user-null.png';
      focus.querySelector('[data-home-message-focus-meta]').innerHTML = '<img src="' + escapeHTML(avatar) + '" alt="" referrerpolicy="no-referrer">' +
        '<div><b>' + escapeHTML(message.name || '匿名') + '</b><time>' + escapeHTML(formatTime(message.created_at)) + '</time></div>';
      focus.querySelector('[data-home-message-focus-content]').innerHTML = renderMarkdown(message.content);
      focusReturn = trigger || null;
      focus.hidden = false;
      focus.setAttribute('aria-hidden', 'false');
      document.documentElement.classList.add('is-home-message-focus-open');
      if(!focus.open) focus.showModal();
      focus.querySelector('.songline-home-message-focus-panel').focus({preventScroll:true});
    }

    var closeFocusButton = focus.querySelector('[data-home-message-focus-close]');
    function onFocusLayerClick(event){ if(event.target === focus) closeFocus(); }
    function onFocusCancel(event){ event.preventDefault(); closeFocus(); }
    function onFocusClose(){ if(!focus.open) closeFocus(); }
    function onFocusDismiss(){ closeFocus(); }
    focus.addEventListener('click', onFocusLayerClick);
    closeFocusButton.addEventListener('click', onFocusDismiss);
    focus.addEventListener('cancel', onFocusCancel);
    focus.addEventListener('close', onFocusClose);

    function cleanup(){
      if(disposed) return;
      disposed = true;
      requestController.abort();
      closeFocus(false);
      window.clearTimeout(focusTimer);
      window.clearTimeout(tickerTimer);
      window.cancelAnimationFrame(tickerFrame);
      tickerTimer = 0;
      if(tickerObserver) tickerObserver.disconnect();
      focus.removeEventListener('click', onFocusLayerClick);
      closeFocusButton.removeEventListener('click', onFocusDismiss);
      focus.removeEventListener('cancel', onFocusCancel);
      focus.removeEventListener('close', onFocusClose);
      if(ticker) ticker.removeEventListener('click', openMessageBoard);
      goto.removeEventListener('click', openMessageBoard);
      back.removeEventListener('click', closeMessageBoard);
      window.removeEventListener('songline:page-swap', onPageSwap);
      window.removeEventListener('songline:page-transition-start', onDeparture);
      window.removeEventListener('pagehide', onPageHide);
      if(focus.parentNode) focus.parentNode.removeChild(focus);
      if(window.__songlineHomeMessageBoardCleanup === cleanup) window.__songlineHomeMessageBoardCleanup = null;
    }
    function onPageSwap(){ if(!panel.isConnected) cleanup(); }
    // Close the modal before the transition: a native top-layer dialog would
    // otherwise cover the loading scene until main is finally replaced.
    function onDeparture(){ closeFocus(false); window.clearTimeout(focusTimer); }
    function onPageHide(event){ if(event.persisted) onDeparture(); else cleanup(); }
    window.addEventListener('songline:page-swap', onPageSwap);
    window.addEventListener('songline:page-transition-start', onDeparture);
    window.addEventListener('pagehide', onPageHide);
    window.__songlineHomeMessageBoardCleanup = cleanup;

    function updatePreview(){
      if(!preview || !messageInput) return;
      preview.innerHTML = renderMarkdown(messageInput.value) || '<p>输入内容后将在这里预览。</p>';
    }

    function renderMessages(messages){
      if(disposed) return;
      hasLoaded = true; messagesRevision++;
      messages = Array.isArray(messages) ? messages : [];
      var currentMessages = messages;
      if(count) count.textContent = String(messages.length);
      if(statCount) statCount.textContent = String(messages.length);
      renderMessageTicker(messages);
      if(!list) return;
      list.innerHTML = messages.map(function(message, index){
        var avatar = message.avatar || '/uploads/admin/friends/user-null.png';
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
        entry.addEventListener('keydown', function(event){ if(!event.defaultPrevented && !event.isComposing && event.keyCode !== 229 && !event.repeat && (event.key === 'Enter' || event.key === ' ')){ event.preventDefault(); open(); } });
      });
    }

    function loadMessages(){
      if(pendingMessages) return pendingMessages;
      var revision = messagesRevision;
      if(loadStatus){ loadStatus.hidden = false; loadStatus.textContent = '正在加载留言…'; }
      if(count && !hasLoaded) count.textContent = '—';
      pendingMessages = requestAny({method:'GET'}).then(function(data){
        if(!disposed){ if(revision === messagesRevision) renderMessages(data.messages); if(loadStatus) loadStatus.hidden = true; }
        return data.messages || [];
      }).catch(function(error){
        if(!disposed && loadStatus){ loadStatus.hidden = false; loadStatus.textContent = '留言暂时无法加载，请稍后重新打开。'; }
        throw error;
      })
        .finally(function(){ pendingMessages = null; });
      return pendingMessages;
    }

    function openMessageBoard(){
      setState('message', back);
      loadMessages().catch(function(){});
    }
    function closeMessageBoard(){ setState('system', goto); }
    goto.addEventListener('click', openMessageBoard);
    if(ticker) ticker.addEventListener('click', openMessageBoard);
    back.addEventListener('click', closeMessageBoard);
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
        if(active && messageInput && !messageInput.value.trim()){
          if(status) status.textContent = '请先写下留言。'; messageInput.focus(); return;
        }
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
        if(disposed || saving) return;
        var submit = form.querySelector('button[type="submit"]');
        var payload = {
          qq: (form.elements.qq && form.elements.qq.value || '').trim(),
          name: (form.elements.name && form.elements.name.value || '').trim(),
          content: (form.elements.content && form.elements.content.value || '').trim()
        };
        if(!payload.content){ if(status) status.textContent = '请先写下留言。'; return; }
        saving = true;
        if(submit) submit.disabled = true;
        if(status) status.textContent = '正在保存…';
        requestAny({method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)}).then(function(data){
          if(disposed) return;
          renderMessages(data.messages);
          form.reset();
          if(preview){ preview.hidden = true; preview.innerHTML = ''; }
          if(contentField) contentField.hidden = false;
          if(previewToggle){ previewToggle.setAttribute('aria-pressed', 'false'); previewToggle.textContent = '预览'; }
          if(status) status.textContent = '';
          setState('message', openCompose);
        }).catch(function(error){
          if(!disposed && status) status.textContent = error && error.message ? error.message : '保存失败，请稍后重试。';
        }).finally(function(){ saving = false; if(!disposed && submit) submit.disabled = false; });
      });
    }
    board.inert = true;
    loadMessages().catch(function(){});
  }

  window.SonglineInitHomeMessageBoard = initialize;
})();
