// /posts 卡片布局兜底：处理旧页面样式残留和无刷新换页后的新卡片。
(function(){
  const STYLE_ID = 'songline-posts-list-style';
  let assetVersion = '';
  try{
    assetVersion = new URL((document.currentScript && document.currentScript.src) || '', window.location.href).searchParams.get('v') || '';
  }catch(error){}

  function ensureStylesheet(){
    if(document.getElementById(STYLE_ID)) return;
    const link = document.createElement('link');
    link.id = STYLE_ID;
    link.rel = 'stylesheet';
    link.href = '/css/pages/posts/list.css' + (assetVersion ? '?v=' + encodeURIComponent(assetVersion) : '');
    link.dataset.songlinePageStyle = 'posts-list';
    document.head.appendChild(link);
  }

  function flattenPostCards(list){
    if(!list) return;
    const mobile = window.matchMedia && window.matchMedia('(max-width: 760px)').matches;
    list.querySelectorAll('.post-search-item > article.post-card').forEach(function(card){
      card.classList.remove('notice-card', 'latest-card', 'recent-card', 'update-card');
      card.style.setProperty('grid-column', 'auto', 'important');
      card.style.setProperty('display', 'grid', 'important');
      card.style.setProperty('grid-template-columns', mobile ? 'minmax(0, 1fr)' : '450px minmax(0, 1fr)', 'important');
      card.style.setProperty('grid-template-rows', mobile ? 'auto auto' : 'auto', 'important');
      card.style.setProperty('width', '100%', 'important');
      card.style.setProperty('max-width', '100%', 'important');
      card.style.setProperty('min-width', '0', 'important');
      card.style.setProperty('min-height', mobile ? '0' : '186px', 'important');
      card.style.setProperty('height', 'auto', 'important');
      card.style.setProperty('overflow', 'hidden', 'important');
      card.style.setProperty('background', 'color-mix(in srgb, var(--panel) 86%, transparent)', 'important');
      card.style.setProperty('border-color', 'var(--border)', 'important');
      const thumb = card.querySelector('.post-thumb');
      const info = card.querySelector('.post-info');
      const title = card.querySelector('.post-info h2');
      const summary = card.querySelector('.post-info p');
      const meta = card.querySelector('.meta-row');
      if(thumb){
        thumb.style.setProperty('width', '100%', 'important');
        thumb.style.setProperty('min-height', mobile ? '132px' : '186px', 'important');
        thumb.style.setProperty('height', mobile ? '132px' : '100%', 'important');
        thumb.style.setProperty('max-height', mobile ? '132px' : 'none', 'important');
      }
      if(info){
        info.style.setProperty('padding', mobile ? '12px 13px 13px' : '24px 30px', 'important');
        info.style.setProperty('background', 'transparent', 'important');
        info.style.setProperty('min-width', '0', 'important');
      }
      if(title){
        title.style.setProperty('font-size', mobile ? '18px' : '25px', 'important');
        title.style.setProperty('line-height', mobile ? '1.32' : '1.35', 'important');
        title.style.setProperty('display', mobile ? '-webkit-box' : 'block', 'important');
        title.style.setProperty('-webkit-box-orient', 'vertical', 'important');
        title.style.setProperty('-webkit-line-clamp', mobile ? '2' : 'unset', 'important');
        title.style.setProperty('overflow', mobile ? 'hidden' : 'visible', 'important');
      }
      if(summary){
        summary.style.setProperty('display', '-webkit-box', 'important');
        summary.style.setProperty('-webkit-box-orient', 'vertical', 'important');
        summary.style.setProperty('-webkit-line-clamp', mobile ? '2' : '3', 'important');
        summary.style.setProperty('line-clamp', mobile ? '2' : '3', 'important');
        summary.style.setProperty('overflow', 'hidden', 'important');
        summary.style.setProperty('text-overflow', 'ellipsis', 'important');
        summary.style.setProperty('max-height', mobile ? '3.35em' : '4.95em', 'important');
        summary.style.setProperty('font-size', mobile ? '13px' : '', 'important');
        summary.style.setProperty('line-height', mobile ? '1.62' : '', 'important');
      }
      if(meta){
        meta.style.setProperty('gap', mobile ? '6px' : '', 'important');
        meta.style.setProperty('font-size', mobile ? '11.5px' : '', 'important');
        meta.style.setProperty('max-height', 'none', 'important');
        meta.style.setProperty('overflow', 'visible', 'important');
        meta.style.setProperty('flex-wrap', 'wrap', 'important');
      }
    });
  }

  function init(root){
    root = root || document;
    const list = root.querySelector ? root.querySelector('.posts-list') : document.querySelector('.posts-list');
    if(!list) return;
    ensureStylesheet();
    flattenPostCards(list);
    if(list.dataset.songlinePostsListBound === '1') return;
    if(typeof window.__songlinePostsListLayoutCleanup === 'function') window.__songlinePostsListLayoutCleanup();
    list.dataset.songlinePostsListBound = '1';
    const observer = new MutationObserver(function(){ flattenPostCards(list); });
    observer.observe(list, {childList:true, subtree:false});
    function cleanup(){
      observer.disconnect();
      window.removeEventListener('songline:page-transition-start', onTransitionStart);
      if(window.__songlinePostsListLayoutCleanup === cleanup) window.__songlinePostsListLayoutCleanup = null;
    }
    function onTransitionStart(event){
      if((event.detail && event.detail.from || '').indexOf('/posts/') === 0) cleanup();
    }
    window.addEventListener('songline:page-transition-start', onTransitionStart);
    window.__songlinePostsListLayoutCleanup = cleanup;
  }

  function refresh(){ init(document); }
  window.SonglineInitPostsListLayout = init;
  if(!window.SonglinePostsListFlatGlobalBound){
    window.SonglinePostsListFlatGlobalBound = true;
    window.addEventListener('resize', function(){
      window.clearTimeout(window.__postsMobileTimer);
      window.__postsMobileTimer = window.setTimeout(refresh, 120);
    });
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){ init(document); }, {once:true});
  else init(document);
})();

/* Content Archive：索引、抽屉、双模式和轻量搜索。 */
(function(){
  'use strict';
  var VERSION = '23.0.0';
  function text(value){ return String(value == null ? '' : value).trim().toLowerCase(); }
  function terms(value){ return text(value).split(/[\s,，;；|]+/).filter(Boolean); }
  function isMobile(){ return window.matchMedia && window.matchMedia('(max-width: 760px)').matches; }
  function init(root){
    root = root || document;
    var archive = root.querySelector ? root.querySelector('[data-content-archive]') : null;
    if(!archive || archive.dataset.archiveReady === VERSION) return;
    archive.dataset.archiveReady = VERSION;
    var modeButtons = Array.prototype.slice.call(archive.querySelectorAll('[data-archive-mode]'));
    var panels = Array.prototype.slice.call(archive.querySelectorAll('[data-archive-panel]'));
    var searchTrigger = archive.querySelector('[data-archive-search-trigger]');
    var searchField = archive.querySelector('[data-archive-search-field]');
    var input = archive.querySelector('[data-archive-search-input]');
    var clear = archive.querySelector('[data-archive-search-clear]');
    var searchTerms = Array.prototype.slice.call(archive.querySelectorAll('[data-archive-search-term]'));
    var status = archive.querySelector('[data-archive-status]');
    var projectHint = archive.querySelector('[data-archive-project-hint]');
    var activeMode = 'articles', activeRecord = null, pinnedRecord = null, closeTimer = 0, query = '';
    var tagFilter = new URLSearchParams(window.location.search).get('tag') || '';
    function records(mode){ var panel = archive.querySelector('[data-archive-panel="' + mode + '"]'); return panel ? Array.prototype.slice.call(panel.querySelectorAll('[data-archive-record]')) : []; }
    function closeRecord(record){
      if(!record) return;
      record.classList.remove('is-open', 'is-pinned');
      var button = record.querySelector('[data-archive-trigger]');
      if(button) button.setAttribute('aria-expanded', 'false');
      if(activeRecord === record) activeRecord = null;
      if(pinnedRecord === record) pinnedRecord = null;
    }
    function openRecord(record, pinned){
      if(!record || record.hidden) return;
      window.clearTimeout(closeTimer);
      if(activeRecord && activeRecord !== record) closeRecord(activeRecord);
      activeRecord = record;
      record.classList.add('is-open'); record.classList.toggle('is-pinned', !!pinned);
      var button = record.querySelector('[data-archive-trigger]');
      if(button) button.setAttribute('aria-expanded', 'true');
      pinnedRecord = pinned ? record : null;
    }
    function scheduleClose(record){
      if(!record || record === pinnedRecord) return;
      window.clearTimeout(closeTimer);
      closeTimer = window.setTimeout(function(){ if(record === activeRecord && !record.matches(':focus-within')) closeRecord(record); }, 180);
    }
    function bindRecord(record){
      var button = record.querySelector('[data-archive-trigger]');
      var detail = record.querySelector('[data-archive-open-url]');
      record.addEventListener('pointerenter', function(){ if(!isMobile()) openRecord(record, false); });
      record.addEventListener('pointerleave', function(){ if(!isMobile()) scheduleClose(record); });
      record.addEventListener('focusin', function(){ openRecord(record, false); });
      record.addEventListener('focusout', function(event){ if(!record.contains(event.relatedTarget)) scheduleClose(record); });
      if(button) button.addEventListener('click', function(){ if(activeRecord === record && pinnedRecord === record) closeRecord(record); else openRecord(record, true); });
      if(detail){
        function enterDetail(event){
          if(event.target.closest('a')) return;
          var href = detail.dataset.archiveOpenUrl;
          if(!href) return;
          if(window.SonglinePageTransition && typeof window.SonglinePageTransition.navigateLink === 'function') window.SonglinePageTransition.navigateLink(href);
          else window.location.assign(new URL(href, window.location.href).href);
        }
        detail.addEventListener('click', enterDetail);
        detail.addEventListener('keydown', function(event){ if(event.key === 'Enter' || event.key === ' '){ event.preventDefault(); enterDetail(event); } });
      }
    }
    function visibleCount(mode){ return records(mode).filter(function(record){ return !record.hidden; }).length; }
    function matches(record){
      var haystack = [record.dataset.title, record.dataset.summary, record.dataset.searchText, record.dataset.tags, record.dataset.author].join(' ');
      var queryMatch = !query || terms(query).every(function(term){ return text(haystack).indexOf(term) >= 0; });
      var tagMatch = !tagFilter || record.dataset.archiveKind !== 'article' || text(record.dataset.tags).split(',').indexOf(text(tagFilter)) >= 0;
      return queryMatch && tagMatch;
    }
    function runSearch(){
      ['articles','projects'].forEach(function(mode){
        var count = 0;
        records(mode).forEach(function(record){ var show = matches(record); record.hidden = !show; if(!show && activeRecord === record) closeRecord(record); if(show) count++; });
        var empty = archive.querySelector('[data-archive-empty="' + mode + '"]'); if(empty) empty.hidden = count !== 0;
      });
      var visible = visibleCount(activeMode), total = records(activeMode).length;
      if(status) status.textContent = (query || tagFilter ? '搜索 / ' : '') + (activeMode === 'articles' ? '文章' : '项目') + ' / ' + visible + ' / ' + total;
      if(projectHint){ var matchedProjects = visibleCount('projects'); projectHint.hidden = !(activeMode === 'articles' && query && matchedProjects); projectHint.textContent = '项目 / ' + matchedProjects + ' →'; }
    }
    function switchMode(mode){
      if(mode !== 'articles' && mode !== 'projects') return;
      window.clearTimeout(closeTimer); if(activeRecord) closeRecord(activeRecord); activeMode = mode;
      modeButtons.forEach(function(button){ var selected = button.dataset.archiveMode === mode; button.classList.toggle('is-active', selected); button.setAttribute('aria-selected', selected ? 'true' : 'false'); });
      panels.forEach(function(panel){ var selected = panel.dataset.archivePanel === mode; panel.hidden = !selected; panel.classList.toggle('is-active', selected); });
      runSearch();
    }
    records('articles').concat(records('projects')).forEach(bindRecord);
    modeButtons.forEach(function(button){ button.addEventListener('click', function(){ switchMode(button.dataset.archiveMode); }); });
    if(projectHint) projectHint.addEventListener('click', function(){ switchMode('projects'); });
    if(searchTrigger && searchField) searchTrigger.addEventListener('click', function(){ var opening = searchField.hidden; searchField.hidden = !opening; searchTrigger.setAttribute('aria-expanded', opening ? 'true' : 'false'); searchTrigger.classList.toggle('is-open', opening); if(opening && input) input.focus(); });
    if(input){ input.addEventListener('input', function(){ query = input.value || ''; if(clear) clear.hidden = !query; runSearch(); }); input.addEventListener('keydown', function(event){ if(event.key === 'Escape'){ input.value = ''; query = ''; if(clear) clear.hidden = true; runSearch(); input.blur(); } }); }
    searchTerms.forEach(function(term){ term.addEventListener('click', function(){ query = term.dataset.archiveSearchTerm || ''; if(input) input.value = query; if(clear) clear.hidden = !query; runSearch(); if(input) input.focus(); }); });
    if(clear) clear.addEventListener('click', function(){ if(!input) return; input.value = ''; query = ''; clear.hidden = true; runSearch(); input.focus(); });
    runSearch();
  }
  window.SonglineInitPostsListFlat = init;
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){ init(document); }, {once:true}); else init(document);
  window.addEventListener('songline:page-swap', function(event){ init((event.detail && event.detail.root) || document); });
})();
