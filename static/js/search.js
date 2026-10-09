(function(){
  function uiText(node, value){
    if(window.SonglineI18n) window.SonglineI18n.setText(node, value);
    else if(node) node.textContent = value;
  }
/* Shared manual search for tools and friend lists; the archive owns its search. */
(function(){
  var utils=window.SonglineSearchUtils;
  if(!utils) return;
  var normalize=utils.normalize, termsOf=utils.termsOf, showSearchRefresh=utils.showSearchRefresh, setVisible=utils.setVisible, setEmpty=utils.setEmpty, flashEmpty=utils.flashEmpty, installClearButtons=utils.installClearButtons;
  function matchesTerms(text, terms){
    return terms.every(function(term){ return text.indexOf(term) >= 0; });
  }
  function bindManualSearch(config){
    var input = document.querySelector(config.input);
    var list = document.querySelector(config.list);
    if(!input || !list) return;
    if(input.dataset.songlineSearchBound === '1') return;
    input.dataset.songlineSearchBound = '1';

    var items = Array.from(list.querySelectorAll(config.item));
    var button = config.button ? document.querySelector(config.button) : null;
    var count = config.count ? document.querySelector(config.count) : null;
    var empty = config.empty ? document.querySelector(config.empty) : null;
    if(config.strata && !empty){
      empty = document.createElement('div');
      empty.className = 'card tools-empty-state';
      uiText(empty, '这层土里还没有挖到这个工具。');
      list.appendChild(empty);
    }
    var strata = config.strata ? Array.from(list.querySelectorAll('.tools-strata')).map(function(layer){
      return {element:layer, items:Array.from(layer.querySelectorAll(config.item))};
    }) : [];
    function syncStrata(active){
      strata.forEach(function(layer){
        var hidden = active && !layer.items.some(function(item){ return !item.hidden; });
        if(layer.element.hidden !== hidden) layer.element.hidden = hidden;
      });
    }
    if(button) button.setAttribute('data-no-page-loading', '');

    function allText(item){
      if(config.text) return config.text(item);
      return [item.dataset.searchText, item.dataset.title, item.dataset.summary, item.dataset.tags, item.dataset.name, item.dataset.bio, item.dataset.posts, item.dataset.tagTitle, item.dataset.toolKeywords, item.textContent].filter(Boolean).join(' ');
    }
    // These cards are immutable within a page. Rebuild the index on page entry,
    // not on each keystroke; URL/search state and visibility remain live.
    var searchText = items.map(function(item){ return normalize(allText(item)); });
    function updateCount(active, visible){
      if(!count) return;
      var label = active ? ('找到 ' + visible + ' / ' + items.length + ' ' + (config.unit || '项')) : ('共 ' + items.length + ' ' + (config.unit || '项'));
      if(count.textContent !== label) uiText(count, label);
    }
    function runSearch(opts){
      opts = opts || {};
      var q = input.value || '';
      var terms = termsOf(q);
      var active = terms.length > 0;
      var visible = 0;
      items.forEach(function(item, index){
        var show = !active || matchesTerms(searchText[index], terms);
        if(show && config.extraMatch) show = !!config.extraMatch(item, q);
        setVisible(item, show);
        item.classList.toggle('is-search-hit', active && show);
        if(show) visible++;
      });
      setEmpty(empty, visible, active);
      syncStrata(active);
      updateCount(active, visible);
      input.classList.toggle('has-search-value', active);
      if(opts.feedback){
        showSearchRefresh(config.feedbackText || '筛选中');
        if(active && visible === 0) flashEmpty(input.closest('.toolbar-panel, .tools-command-center, .friend-search-box') || input);
      }
      return {active:active, visible:visible};
    }
    function clearSearch(){
      input.value = '';
      runSearch();
    }
    function submit(e){ if(e){ e.preventDefault(); e.stopPropagation(); } runSearch({feedback:true}); }
    if(button) button.addEventListener('click', submit, true);
    input.addEventListener('keydown', function(e){
      if(e.key === 'Enter') submit(e);
      else if(e.key === 'Escape'){
        e.preventDefault(); e.stopPropagation(); clearSearch(); showSearchRefresh('已重置');
      }
    }, true);
    input.addEventListener('search', function(){ if(!input.value) clearSearch(); });
    if(config.live) input.addEventListener('input', function(){ runSearch({feedback:false}); });
    var params = new URLSearchParams(window.location.search);
    var initial = params.get('q') || params.get('search') || '';
    if(!input.value && initial) input.value = initial;
    runSearch({feedback:false});
  }


  function initFriendListSearch(){
    var input = document.querySelector('#friendSearch');
    var lists = Array.from(document.querySelectorAll('.friend-search-list'));
    if(!input || !lists.length) return;
    if(input.dataset.songlineFriendListSearchBound === '1') return;
    input.dataset.songlineFriendListSearchBound = '1';

    var items = [];
    lists.forEach(function(list){
      items = items.concat(Array.from(list.querySelectorAll('.friend-search-item')));
    });
    var button = document.querySelector('#friendSearchSubmit');
    var count = document.querySelector('#friendSearchCount');
    var empty = document.querySelector('#friendEmpty');
    if(button) button.setAttribute('data-no-page-loading', '');

    function textOf(item){
      return [item.dataset.name, item.dataset.bio, item.dataset.posts, item.textContent].filter(Boolean).join(' ');
    }
    var searchText = items.map(function(item){ return normalize(textOf(item)); });
    function update(active, visible){
      if(count) uiText(count, active ? ('找到 ' + visible + ' / ' + items.length + ' 位朋友') : ('共 ' + items.length + ' 位朋友'));
      if(empty){
        var show = active && visible === 0;
        empty.hidden = !show;
        empty.style.setProperty('display', show ? '' : 'none', 'important');
      }
    }
    function run(opts){
      opts = opts || {};
      var q = input.value || '';
      var terms = termsOf(q);
      var active = terms.length > 0;
      var visible = 0;
      items.forEach(function(item, index){
        var show = !active || matchesTerms(searchText[index], terms);
        setVisible(item, show);
        item.classList.toggle('is-search-hit', active && show);
        if(show) visible++;
      });
      update(active, visible);
      input.classList.toggle('has-search-value', active);
      if(opts.feedback){
        showSearchRefresh('搜索朋友中');
        if(active && visible === 0) flashEmpty(input.closest('.toolbar-panel') || input);
      }
    }
    function clear(){
      input.value = '';
      items.forEach(function(item){ setVisible(item, true); item.classList.remove('is-search-hit'); });
      update(false, items.length);
      input.classList.remove('has-search-value');
    }
    function submit(e){ if(e){ e.preventDefault(); e.stopPropagation(); } run({feedback:true}); }
    if(button) button.addEventListener('click', submit, true);
    input.addEventListener('keydown', function(e){
      if(e.key === 'Enter') submit(e);
      else if(e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); clear(); showSearchRefresh('已重置'); }
    }, true);
    input.addEventListener('search', function(){ if(!input.value) clear(); });
    run({feedback:false});
  }


  function initToolsSearch(){
    bindManualSearch({input:'[data-tools-search]', button:'[data-tools-search-submit]', list:'.modern-tools-grid', item:'.tool-app-card, .tool-card', count:'[data-tools-search-count]', unit:'个工具', strata:true, live:true, feedbackText:'搜索工具中', text:function(item){ var i18n=window.SonglineI18n; return [item.dataset.toolKeywords,item.dataset.toolTitle,item.dataset.toolDescription,item.textContent,i18n && i18n.english(item.dataset.toolTitle),i18n && i18n.english(item.dataset.toolDescription)].filter(Boolean).join(' '); }});
  }

  function initAllSearch(root){
    installClearButtons(root || document);
    initFriendListSearch();
    initToolsSearch();
  }

  window.SonglineInitSearch = initAllSearch;
})();

})();
