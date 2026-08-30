/* v20.0.8：统一搜索。点击搜索/按 Enter 后筛选；文章搜索仅匹配文章标题与作者名；搜索 X 键带 hover。 */
(function(){
  var utils=window.SonglineSearchUtils;
  if(!utils) return;
  var normalize=utils.normalize, termsOf=utils.termsOf, includesAll=utils.includesAll, countTerm=utils.countTerm, showSearchRefresh=utils.showSearchRefresh, setVisible=utils.setVisible, setEmpty=utils.setEmpty, flashEmpty=utils.flashEmpty, installClearButtons=utils.installClearButtons;
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
    if(button) button.setAttribute('data-no-page-loading', '');

    function allText(item){
      if(config.text) return config.text(item);
      return [item.dataset.searchText, item.dataset.title, item.dataset.summary, item.dataset.tags, item.dataset.name, item.dataset.bio, item.dataset.posts, item.dataset.tagTitle, item.dataset.toolKeywords, item.textContent].filter(Boolean).join(' ');
    }
    function updateCount(active, visible){
      if(!count) return;
      count.textContent = active ? ('找到 ' + visible + ' / ' + items.length + ' ' + (config.unit || '项')) : ('共 ' + items.length + ' ' + (config.unit || '项'));
    }
    function runSearch(opts){
      opts = opts || {};
      var q = input.value || '';
      var active = !!normalize(q);
      var visible = 0;
      items.forEach(function(item){
        var show = !active || includesAll(allText(item), termsOf(q));
        if(show && config.extraMatch) show = !!config.extraMatch(item, q);
        setVisible(item, show);
        item.classList.toggle('is-search-hit', active && show);
        if(show) visible++;
      });
      setEmpty(empty, visible, active);
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
      items.forEach(function(item){ setVisible(item, true); item.classList.remove('is-search-hit'); });
      setEmpty(empty, items.length, false);
      updateCount(false, items.length);
      input.classList.remove('has-search-value');
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
    var params = new URLSearchParams(window.location.search);
    var initial = params.get('q') || params.get('search') || '';
    if(!input.value && initial) input.value = initial;
    runSearch({feedback:false});
  }

  function articleTitleAuthorScore(item, q){
    var phrase = normalize(q);
    var terms = termsOf(q);
    if(!terms.length) return 1;
    var title = normalize(item.dataset.title || '');
    var author = normalize(item.dataset.author || '');
    var hay = normalize([title, author].filter(Boolean).join(' '));
    if(!hay) return 0;
    if(!terms.every(function(t){ return hay.indexOf(t) >= 0; })) return 0;

    var score = 10;
    if(title === phrase) score += 120;
    if(author === phrase) score += 96;
    if(title.indexOf(phrase) >= 0) score += 80;
    if(author.indexOf(phrase) >= 0) score += 64;
    terms.forEach(function(t){
      if(title.indexOf(t) >= 0) score += 28;
      if(author.indexOf(t) >= 0) score += 22;
    });
    return score;
  }

  function initPostSearch(){
    var input = document.querySelector('#postSearch');
    var button = document.querySelector('#postSearchSubmit');
    var list = document.querySelector('#postList');
    if(!input || !list) return;
    if(input.dataset.songlinePostSearchBound === '1') return;
    input.dataset.songlinePostSearchBound = '1';

    var items = Array.from(list.querySelectorAll('.post-search-item'));
    var count = document.querySelector('#postSearchCount');
    var empty = document.querySelector('#postEmpty');
    var sortBtn = document.querySelector('#postSort');
    var filterButtons = Array.from(document.querySelectorAll('#postFilters [data-filter]'));
    var sortOrder = sortBtn ? (sortBtn.dataset.order || 'desc') : 'desc';
    var activeFilter = 'all';
    if(button) button.setAttribute('data-no-page-loading', '');

    function itemMatchesFilter(item){
      if(activeFilter === 'all') return true;
      var f = normalize(activeFilter);
      var hay = normalize([item.dataset.title, item.dataset.author, item.dataset.tags].filter(Boolean).join(' '));
      return !!f && hay.indexOf(f) >= 0;
    }

    function updateCount(active, visible){
      if(!count) return;
      count.textContent = active ? ('按标题/作者找到 ' + visible + ' / ' + items.length + ' 篇文章') : ('共 ' + items.length + ' 篇文章');
    }

    function sortItems(){
      if(!items.length) return;
      items.sort(function(a,b){
        var da = Number(a.dataset.date || 0), db = Number(b.dataset.date || 0);
        return sortOrder === 'desc' ? db - da : da - db;
      }).forEach(function(item){ list.appendChild(item); });
    }

    function runSearch(opts){
      opts = opts || {};
      var q = input.value || '';
      var active = !!normalize(q);
      var visible = 0;
      var scores = new Map();

      items.forEach(function(item){
        var s = active ? articleTitleAuthorScore(item, q) : 1;
        scores.set(item, s);
      });

      items.forEach(function(item){
        var show = (!active || scores.get(item) > 0) && itemMatchesFilter(item);
        setVisible(item, show);
        item.classList.toggle('is-search-hit', active && show);
        if(show) visible++;
      });
      setEmpty(empty, visible, active);
      updateCount(active, visible);
      input.classList.toggle('has-search-value', active);
      if(opts.feedback){
        showSearchRefresh('搜索文章中');
        if(active && visible === 0) flashEmpty(input.closest('.toolbar-panel') || input);
      }
    }

    function clearSearch(){
      input.value = '';
      items.forEach(function(item){ setVisible(item, itemMatchesFilter(item)); item.classList.remove('is-search-hit'); });
      var visible = items.filter(itemMatchesFilter).length;
      setEmpty(empty, visible, false);
      updateCount(false, visible);
      input.classList.remove('has-search-value');
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

    if(sortBtn && sortBtn.dataset.songlineSortBound !== '1'){
      sortBtn.dataset.songlineSortBound = '1';
      sortBtn.setAttribute('data-no-page-loading', '');
      sortBtn.addEventListener('click', function(e){
        e.preventDefault(); e.stopPropagation();
        sortOrder = sortOrder === 'desc' ? 'asc' : 'desc';
        sortBtn.dataset.order = sortOrder;
        sortBtn.textContent = sortOrder === 'desc' ? '排序：最新优先⌄' : '排序：最早优先⌃';
        sortItems(); showSearchRefresh('排序中');
      }, true);
    }
    filterButtons.forEach(function(btn){
      if(btn.dataset.songlineFilterBound === '1') return;
      btn.dataset.songlineFilterBound = '1';
      btn.setAttribute('data-no-page-loading', '');
      btn.addEventListener('click', function(e){
        e.preventDefault(); e.stopPropagation();
        filterButtons.forEach(function(x){ x.classList.remove('active'); });
        btn.classList.add('active');
        activeFilter = btn.dataset.filter || 'all';
        runSearch({feedback:true});
      }, true);
    });
    sortItems();
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
    function update(active, visible){
      if(count) count.textContent = active ? ('找到 ' + visible + ' / ' + items.length + ' 位朋友') : ('共 ' + items.length + ' 位朋友');
      if(empty){
        var show = active && visible === 0;
        empty.hidden = !show;
        empty.style.setProperty('display', show ? '' : 'none', 'important');
      }
    }
    function run(opts){
      opts = opts || {};
      var q = input.value || '';
      var active = !!normalize(q);
      var terms = termsOf(q);
      var visible = 0;
      items.forEach(function(item){
        var show = !active || includesAll(textOf(item), terms);
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

  function initTagSearch(){
    bindManualSearch({input:'#tagSearch', button:'#tagSearchSubmit', list:'#tagCloud', item:'.tag-search-item', empty:'#tagEmpty', count:'#tagSearchCount', unit:'个标签', feedbackText:'搜索标签中', text:function(item){ return [item.dataset.tagTitle, item.textContent].filter(Boolean).join(' '); }});
  }

  function initToolsSearch(){
    bindManualSearch({input:'[data-tools-search]', button:'[data-tools-search-submit]', list:'.modern-tools-grid', item:'.tool-app-card, .tool-card', count:'[data-tools-search-count]', unit:'个工具', feedbackText:'搜索工具中', text:function(item){ return [item.dataset.toolKeywords, item.textContent].filter(Boolean).join(' '); }});
  }

  function initAllSearch(root){
    installClearButtons(root || document);
    initPostSearch();
    initFriendListSearch();
    initTagSearch();
    initToolsSearch();
  }

  window.SonglineInitSearch = initAllSearch;
})();
