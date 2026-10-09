(function(){
  function uiText(node, value){
    if(window.SonglineI18n) window.SonglineI18n.setText(node, value);
    else if(node) node.textContent = value;
  }
/* Content Archive：索引、抽屉、双模式、轻量搜索和分页。 */
(function(){
  'use strict';
  var VERSION = '23.2.0';
  function text(value){ return String(value == null ? '' : value).trim().toLowerCase(); }
  function terms(value){ return text(value).split(/[\s,，;；|]+/).filter(Boolean); }
  function isMobile(){ return window.matchMedia && window.matchMedia('(max-width:980px), (hover:none)').matches; }
  function pageNumber(value){ return /^\d+$/.test(String(value || '')) && Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : 1; }
  function pageNumbers(current, total){
    var numbers = [], start = Math.max(2, Math.min(current - 1, total - 3));
    if(total <= 5){ for(var i = 1; i <= total; i++) numbers.push(i); return numbers; }
    numbers.push(1);
    if(start > 2) numbers.push(null);
    for(var j = start; j < start + 3; j++) numbers.push(j);
    if(start + 3 < total) numbers.push(null);
    numbers.push(total);
    return numbers;
  }
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
    var composing = false, searchScheduled = false;
    var recordLists = {};
    panels.forEach(function(panel){ recordLists[panel.dataset.archivePanel] = Array.prototype.slice.call(panel.querySelectorAll('[data-archive-record]')); });
    var pagers = {}, matchedCounts = {}, pageCounts = {}, currentPages = {};
    var pageSize = Math.min(100, pageNumber(archive.dataset.archivePageSize || 10));
    ['articles','projects'].forEach(function(mode){ pagers[mode] = archive.querySelector('[data-archive-pagination="' + mode + '"]'); });
    var searchData = new WeakMap();
    var archiveParams = new URLSearchParams(window.location.search);
    currentPages.articles = pageNumber(archiveParams.get('article_page'));
    currentPages.projects = pageNumber(archiveParams.get('project_page'));
    if(archiveParams.get('mode') === 'projects' && recordLists.projects) activeMode = 'projects';
    var tagFilter = archiveParams.get('tag') || '';
    // 首页“标签”入口直接打开档案页的搜索抽屉，并保留词条按钮。
    query = archiveParams.get('q') || tagFilter;
    if(input) input.value = query;
    if(clear) clear.hidden = !query;
    var shouldOpenSearch = !!query || /^(1|true|open)$/i.test(archiveParams.get('search') || '');
    function setQuery(value){
      if(query !== (value || '') || tagFilter){ currentPages.articles = 1; currentPages.projects = 1; }
      query = value || '';
      tagFilter = '';
      if(input) input.value = query;
      if(clear) clear.hidden = !query;
      runSearch();
    }
    function scheduleQuery(){
      if(composing || searchScheduled) return;
      searchScheduled = true;
      // Coalesce a burst of input events without adding a debounce delay to
      // keyboard input. Never commit a partial IME candidate or a detached page.
      Promise.resolve().then(function(){
        searchScheduled = false;
        if(!composing && archive.isConnected) setQuery(input.value);
      });
    }
    function records(mode){ return recordLists[mode] || []; }
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
      if(window.SonglineInitViews) window.SonglineInitViews(record);
    }
    function scheduleClose(record){
      if(!record || record === pinnedRecord) return;
      window.clearTimeout(closeTimer);
      closeTimer = window.setTimeout(function(){ if(record === activeRecord && !record.matches(':focus-within')) closeRecord(record); }, 180);
    }
    function bindRecord(record){
      var button = record.querySelector('[data-archive-trigger]');
      var detail = record.querySelector('[data-archive-open-url]');
      record.addEventListener('pointerenter', function(){ if(!isMobile()) openRecord(record, pinnedRecord === record); });
      record.addEventListener('pointerleave', function(){ if(!isMobile()) scheduleClose(record); });
      record.addEventListener('focusin', function(){ openRecord(record, pinnedRecord === record); });
      record.addEventListener('focusout', function(event){ if(!record.contains(event.relatedTarget)) scheduleClose(record); });
      if(button) button.addEventListener('click', function(){ if(activeRecord === record && pinnedRecord === record) closeRecord(record); else openRecord(record, true); });
      if(detail){
        function enterDetail(event){
          if(event.target.closest('a,button,input,select,textarea,[contenteditable]')) return;
          if(event.type === 'click' && (event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) return;
          var href = detail.dataset.archiveOpenUrl;
          if(!href) return;
          if(window.SonglinePageTransition && typeof window.SonglinePageTransition.navigateLink === 'function') window.SonglinePageTransition.navigateLink(href);
          else window.location.assign(new URL(href, window.location.href).href);
        }
        detail.addEventListener('click', enterDetail);
        detail.addEventListener('keydown', function(event){ if(event.target === detail && !event.isComposing && (event.key === 'Enter' || event.key === ' ')){ event.preventDefault(); enterDetail(event); } });
      }
    }
    function visibleCount(mode){ return matchedCounts[mode] || 0; }
    function syncPagesURL(){
      // Replace only archive parameters, preserving Back metadata and unrelated
      // parameters. Returning from a detail page restores this exact slice.
      var url = new URL(window.location.href);
      // Clearing a migrated tag must not restore it on reload. Commit search
      // and paging together, with only one history write per input batch.
      if(!tagFilter){
        url.searchParams.delete('tag');
        if(query) url.searchParams.set('q', query); else url.searchParams.delete('q');
      }
      ['articles','projects'].forEach(function(mode){
        if(!pagers[mode]) return;
        var key = mode === 'articles' ? 'article_page' : 'project_page';
        if(currentPages[mode] > 1) url.searchParams.set(key, currentPages[mode]); else url.searchParams.delete(key);
      });
      if(recordLists.projects){ if(activeMode === 'projects') url.searchParams.set('mode', 'projects'); else url.searchParams.delete('mode'); }
      if(url.href !== window.location.href) history.replaceState(history.state, '', url.href);
    }
    function renderPager(mode){
      var pager = pagers[mode]; if(!pager) return;
      var total = pageCounts[mode], current = currentPages[mode];
      pager.hidden = total <= 1;
      pager.querySelector('[data-archive-page-step="-1"]').disabled = current <= 1;
      pager.querySelector('[data-archive-page-step="1"]').disabled = current >= total;
      var numbers = pager.querySelector('[data-archive-page-numbers]');
      var signature = current + '/' + total;
      if(numbers.dataset.pageSignature === signature) return;
      var restoreFocus = numbers.contains(document.activeElement);
      var fragment = document.createDocumentFragment();
      pageNumbers(current, total).forEach(function(number){
        var item = document.createElement(number === null ? 'span' : 'button');
        if(number === null){ item.textContent = '…'; item.setAttribute('aria-hidden', 'true'); }
        else {
          item.type = 'button'; item.textContent = number; item.dataset.archivePage = number;
          item.setAttribute('aria-label', '第 ' + number + ' 页，共 ' + total + ' 页');
          if(number === current) item.setAttribute('aria-current', 'page');
        }
        fragment.appendChild(item);
      });
      numbers.replaceChildren(fragment); numbers.dataset.pageSignature = signature;
      if(restoreFocus && !pager.hidden) numbers.querySelector('[aria-current="page"]').focus({preventScroll:true});
    }
    function goToPage(mode, page){
      if(mode !== activeMode || !pagers[mode]) return;
      var next = Math.max(1, Math.min(pageNumber(page), pageCounts[mode] || 1));
      if(next === currentPages[mode]) return;
      window.clearTimeout(closeTimer); if(activeRecord) closeRecord(activeRecord);
      currentPages[mode] = next;
      runSearch();
      // A bottom pager should not leave the new list above the viewport.
      var header = document.querySelector('.site-header');
      var offset = (header ? header.getBoundingClientRect().height : 72) + 20;
      var top = archive.getBoundingClientRect().top;
      if(top < offset){
        var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion:reduce)').matches;
        window.scrollTo({top:Math.max(0, window.scrollY + top - offset), behavior:reduced ? 'instant' : 'smooth'});
      }
    }
    function matches(record, queryTerms, normalizedTag){
      if(!queryTerms.length && (!normalizedTag || record.dataset.archiveKind !== 'article')) return true;
      var data = searchData.get(record);
      if(!data){
        data = {haystack:text([record.dataset.title, record.dataset.summary, record.dataset.searchText, record.dataset.tags, record.dataset.author].join(' ')),tags:text(record.dataset.tags).split(',')};
        searchData.set(record, data);
      }
      var queryMatch = queryTerms.every(function(term){ return data.haystack.indexOf(term) >= 0; });
      var tagMatch = !normalizedTag || record.dataset.archiveKind !== 'article' || data.tags.indexOf(normalizedTag) >= 0;
      return queryMatch && tagMatch;
    }
    function runSearch(){
      var queryTerms = terms(query), normalizedTag = text(tagFilter);
      searchTerms.forEach(function(term){ term.setAttribute('aria-pressed', text(query) === text(term.dataset.archiveSearchTerm) ? 'true' : 'false'); });
      ['articles','projects'].forEach(function(mode){
        var matched = records(mode).filter(function(record){ return matches(record, queryTerms, normalizedTag); });
        matchedCounts[mode] = matched.length;
        pageCounts[mode] = Math.max(1, Math.ceil(matched.length / pageSize));
        currentPages[mode] = Math.min(currentPages[mode], pageCounts[mode]);
        var start = (currentPages[mode] - 1) * pageSize;
        // Archives without a pager (e.g. notices) keep their existing full list.
        var shown = new Set(pagers[mode] ? matched.slice(start, start + pageSize) : matched);
        records(mode).forEach(function(record){ var show = shown.has(record); if(record.hidden !== !show) record.hidden = !show; if(!show && activeRecord === record) closeRecord(record); });
        var empty = archive.querySelector('[data-archive-empty="' + mode + '"]'); if(empty) empty.hidden = matched.length !== 0;
        renderPager(mode);
      });
      var visible = visibleCount(activeMode), total = records(activeMode).length;
      var statusText = (query || tagFilter ? '搜索 / ' : '') + (activeMode === 'articles' ? (archive.dataset.archiveArticleLabel || '文章') : '项目') + ' / ' + visible + ' / ' + total;
      if(pagers[activeMode] && visible) statusText += ' / 第 ' + currentPages[activeMode] + ' 页，共 ' + pageCounts[activeMode] + ' 页';
      if(status && status.textContent !== statusText) uiText(status, statusText);
      if(projectHint){ var matchedProjects = visibleCount('projects'); projectHint.hidden = !(activeMode === 'articles' && query && matchedProjects); var hintText = '项目 / ' + matchedProjects + ' →'; if(projectHint.textContent !== hintText) uiText(projectHint, hintText); }
      syncPagesURL();
    }
    function switchMode(mode){
      if(mode !== 'articles' && mode !== 'projects') return;
      window.clearTimeout(closeTimer); if(activeRecord) closeRecord(activeRecord); activeMode = mode;
      modeButtons.forEach(function(button){ var selected = button.dataset.archiveMode === mode; button.classList.toggle('is-active', selected); button.setAttribute('aria-selected', selected ? 'true' : 'false'); });
      panels.forEach(function(panel){ var selected = panel.dataset.archivePanel === mode; panel.hidden = !selected; panel.classList.toggle('is-active', selected); });
      runSearch();
    }
    records('articles').concat(records('projects')).forEach(bindRecord);
    ['articles','projects'].forEach(function(mode){
      var pager = pagers[mode]; if(!pager) return;
      pager.addEventListener('click', function(event){
        var button = event.target.closest('button'); if(!button || !pager.contains(button) || button.disabled) return;
        if(button.dataset.archivePage) goToPage(mode, button.dataset.archivePage);
        else if(button.dataset.archivePageStep) goToPage(mode, currentPages[mode] + Number(button.dataset.archivePageStep));
      });
    });
    modeButtons.forEach(function(button){ button.addEventListener('click', function(){ switchMode(button.dataset.archiveMode); }); });
    if(projectHint) projectHint.addEventListener('click', function(){ switchMode('projects'); });
    if(searchTrigger && searchField) searchTrigger.addEventListener('click', function(){ var opening = searchField.hidden; searchField.hidden = !opening; searchTrigger.setAttribute('aria-expanded', opening ? 'true' : 'false'); searchTrigger.classList.toggle('is-open', opening); if(opening && input) input.focus(); });
    if(input){
      input.addEventListener('compositionstart', function(){ composing = true; });
      input.addEventListener('compositionend', function(){ composing = false; scheduleQuery(); });
      input.addEventListener('input', function(event){ if(!event.isComposing) scheduleQuery(); });
      input.addEventListener('keydown', function(event){ if(event.key === 'Escape' && !composing && !event.isComposing && event.keyCode !== 229){ setQuery(''); input.blur(); } });
    }
    searchTerms.forEach(function(term){ term.addEventListener('click', function(){ setQuery(term.dataset.archiveSearchTerm); if(input) input.focus(); }); });
    if(clear) clear.addEventListener('click', function(){ if(!input) return; setQuery(''); input.focus(); });
    if(shouldOpenSearch && searchField && searchTrigger){
      searchField.hidden = false;
      searchTrigger.setAttribute('aria-expanded', 'true');
      searchTrigger.classList.add('is-open');
    }
    switchMode(activeMode);
  }
  // Direct entry and AJAX entry share the page-module dispatcher.
  window.SonglineInitContentArchive = init;
})();

})();
