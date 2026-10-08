(function(){
  'use strict';
  // Lightweight, lifecycle-aware adapter for the official giscus widget.
  // Protocol: giscus/client.ts and giscus-component/web/src/giscus.ts.
  // Do not repeatedly inject client.js: it has no message-listener teardown.
  var ORIGIN = 'https://giscus.app';
  var SESSION_KEY = 'giscus-session';
  var memorySession = '';

  function storeSession(value){
    memorySession = value;
    try{
      if(value) localStorage.setItem(SESSION_KEY, JSON.stringify(value));
      else localStorage.removeItem(SESSION_KEY);
    }catch(e){}
  }

  function readSession(){
    var url = new URL(window.location.href);
    var returned = url.searchParams.get('giscus');
    if(returned !== null){
      storeSession(returned);
      url.searchParams.delete('giscus');
      // Preserve the navigation system's metadata and the comments anchor.
      window.history.replaceState(window.history.state, '', url.href);
      return returned;
    }
    var saved;
    try{ saved = localStorage.getItem(SESSION_KEY); }catch(e){ return memorySession; }
    if(saved){
      try{
        var parsed = JSON.parse(saved);
        if(typeof parsed === 'string') return parsed;
        storeSession('');
      }catch(e){ storeSession(''); }
    }
    return '';
  }

  function init(panel){
    if(!panel.isConnected) return;
    // A queued idle scan can still see the departing DOM after teardown and
    // before main is swapped. Do not resurrect that panel's global listeners.
    if(panel.songlineCommentsDeparting){
      if(document.documentElement.classList.contains('songline-page-transitioning')) return;
      delete panel.songlineCommentsDeparting;
    }
    if(panel.songlineCommentsCleanup) return;
    var mount = panel.querySelector('[data-comments-mount]');
    var status = panel.querySelector('[data-comments-status]');
    var message = panel.querySelector('[data-comments-message]');
    var button = panel.querySelector('[data-comments-load]');
    if(!mount || !status || !message || !button) return;
    var session = readSession();
    var frame = null, timer = 0, observer = null, disposed = false;
    function theme(){ return document.documentElement.getAttribute('data-theme') === 'dark' ? 'transparent_dark' : 'light'; }
    function state(value, text){
      panel.dataset.state = value;
      status.hidden = value === 'ready';
      button.hidden = value === 'loading';
      button.textContent = value === 'error' ? '重试' : '加载留言';
      if(text) message.textContent = text;
      panel.setAttribute('aria-busy', value === 'loading' ? 'true' : 'false');
    }
    function clearFrame(){
      window.clearTimeout(timer); timer = 0;
      if(frame){
        frame.removeEventListener('load', syncTheme);
        frame.removeEventListener('error', fail);
        frame.remove(); frame = null;
      }
    }
    function fail(){
      if(disposed) return;
      clearFrame();
      state('error', '留言暂时无法加载，可重试或前往 GitHub');
    }
    function syncTheme(){
      if(frame && frame.contentWindow){
        frame.contentWindow.postMessage({giscus:{setConfig:{theme:theme()}}}, ORIGIN);
      }
    }
    function load(){
      if(disposed || !panel.isConnected || frame) return;
      if(observer){ observer.disconnect(); observer = null; }
      state('loading', '正在加载留言…');
      var locationURL = new URL(window.location.href);
      locationURL.searchParams.delete('giscus');
      locationURL.hash = panel.id;
      var params = new URLSearchParams({
        origin:locationURL.href, session:session, repo:panel.dataset.repo, repoId:panel.dataset.repoId,
        category:panel.dataset.category, categoryId:panel.dataset.categoryId,
        term:panel.dataset.term, strict:'1', reactionsEnabled:'1', emitMetadata:'0',
        inputPosition:'top', theme:theme(), description:panel.dataset.description || '',
        backLink:panel.dataset.backlink || locationURL.href
      });
      frame = document.createElement('iframe');
      frame.className = 'giscus-frame';
      frame.title = '文章留言（GitHub）';
      frame.setAttribute('scrolling', 'no');
      frame.setAttribute('allow', 'clipboard-write');
      // Our observer already gates the entire request. A second iframe lazy
      // gate could consume the timeout while the browser postpones its load.
      frame.loading = 'eager';
      frame.src = ORIGIN + '/zh-CN/widget?' + params.toString();
      frame.addEventListener('load', syncTheme);
      frame.addEventListener('error', fail);
      mount.replaceChildren(frame);
      timer = window.setTimeout(fail, 20000);
    }
    function receive(event){
      if(disposed || !frame || event.origin !== ORIGIN || event.source !== frame.contentWindow) return;
      var data = event.data && event.data.giscus;
      if(!data || typeof data !== 'object') return;
      if(data.signOut){
        session = ''; storeSession(''); clearFrame(); load(); return;
      }
      if(typeof data.error === 'string'){
        if(/Bad credentials|Invalid state value|State has expired/.test(data.error)){
          if(session){ session = ''; storeSession(''); clearFrame(); load(); }
          else fail();
          return;
        }
        // Normal for a new article: giscus creates its thread at first comment.
        if(data.error.indexOf('Discussion not found') < 0){ fail(); return; }
      }
      if(typeof data.resizeHeight === 'number' && Number.isFinite(data.resizeHeight) && data.resizeHeight > 0 && data.resizeHeight <= 100000){
        frame.style.height = Math.max(150, Math.ceil(data.resizeHeight)) + 'px';
        window.clearTimeout(timer); timer = 0;
        state('ready');
      }
    }
    var themeObserver = new MutationObserver(syncTheme);
    themeObserver.observe(document.documentElement, {attributes:true,attributeFilter:['data-theme']});
    function cleanup(event){
      disposed = true;
      if(event && event.type === 'songline:page-transition-start') panel.songlineCommentsDeparting = true;
      clearFrame();
      if(observer) observer.disconnect();
      themeObserver.disconnect();
      button.removeEventListener('click', load);
      window.removeEventListener('message', receive);
      window.removeEventListener('songline:page-transition-start', cleanup);
      window.removeEventListener('pagehide', cleanup);
      delete panel.songlineCommentsCleanup;
      state('idle', '使用 GitHub 登录留言');
    }
    panel.songlineCommentsCleanup = cleanup;
    state('idle', '使用 GitHub 登录留言');
    button.addEventListener('click', load);
    window.addEventListener('message', receive);
    window.addEventListener('songline:page-transition-start', cleanup);
    window.addEventListener('pagehide', cleanup);
    if('IntersectionObserver' in window){
      observer = new IntersectionObserver(function(entries){
        if(entries.some(function(entry){ return entry.isIntersecting; })) load();
      }, {rootMargin:'300px 0px'});
      observer.observe(panel);
    }
  }

  window.SonglineInitArticleComments = function(root){
    root = root || document;
    if(root.matches && root.matches('[data-article-comments]')) init(root);
    root.querySelectorAll('[data-article-comments]').forEach(init);
  };
})();
