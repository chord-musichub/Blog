(function(){
  function ready(fn){
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, {once:true});
    else fn();
  }

  function normalize(value){
    return String(value == null ? '' : value)
      .toLowerCase()
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/[\u3000\t\r\n]+/g, ' ')
      .replace(/[，。！？、；：,.!?;:|/\\()[\]{}<>《》“”‘’`~@#$%^&*_+=-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function termsOf(q){ return normalize(q).split(' ').filter(Boolean); }

  function includesAll(hay, terms){
    hay = normalize(hay);
    return terms.every(function(t){ return hay.indexOf(t) >= 0; });
  }

  function countTerm(hay, term){
    hay = normalize(hay);
    term = normalize(term);
    if(!hay || !term) return 0;
    var n = 0;
    var pos = hay.indexOf(term);
    while(pos >= 0 && n < 20){
      n++;
      pos = hay.indexOf(term, pos + term.length);
    }
    return n;
  }

  function showSearchRefresh(text){
    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(reduceMotion) return;
    var overlay = document.querySelector('.search-refresh-overlay');
    if(!overlay){
      overlay = document.createElement('div');
      overlay.className = 'search-refresh-overlay';
      overlay.setAttribute('aria-hidden', 'true');
      overlay.innerHTML = '<div class="search-refresh-card"><span class="search-refresh-ring"></span><span class="search-refresh-text">筛选中</span></div>';
      document.body.appendChild(overlay);
    }
    var label = overlay.querySelector('.search-refresh-text');
    if(label) label.textContent = text || '筛选中';
    overlay.classList.remove('is-active');
    void overlay.offsetWidth;
    overlay.classList.add('is-active');
    window.clearTimeout(overlay.__searchTimer);
    overlay.__searchTimer = window.setTimeout(function(){ overlay.classList.remove('is-active'); }, 520);
  }


  function setVisible(item, show){
    item.hidden = !show;
    item.classList.toggle('search-hidden', !show);
    item.classList.toggle('is-search-filtered', !show);
    if(show) item.style.removeProperty('display');
    else item.style.setProperty('display', 'none', 'important');
  }

  function setEmpty(empty, visible, active){
    if(!empty) return;
    var show = active && visible === 0;
    empty.hidden = !show;
    empty.style.setProperty('display', show ? '' : 'none', 'important');
  }

  function flashEmpty(el){
    if(!el) return;
    el.classList.remove('is-search-empty');
    void el.offsetWidth;
    el.classList.add('is-search-empty');
    window.setTimeout(function(){ el.classList.remove('is-search-empty'); }, 560);
  }

  function installClearButtons(root){
    root = root || document;
    Array.from(root.querySelectorAll('input[type="search"]')).forEach(function(input){
      if(input.dataset.songlineClearBound === '1') return;
      input.dataset.songlineClearBound = '1';
      input.classList.add('has-custom-clear');

      var parent = input.parentElement;
      var field;
      if(parent && parent.classList && parent.classList.contains('songline-search-field')){
        field = parent;
      }else{
        field = document.createElement('span');
        field.className = 'songline-search-field';
        input.insertAdjacentElement('beforebegin', field);
        field.appendChild(input);
      }

      var clear = field.querySelector('.songline-search-clear');
      if(!clear){
        clear = document.createElement('button');
        clear.type = 'button';
        clear.className = 'songline-search-clear';
        clear.setAttribute('aria-label', '清空搜索');
        clear.setAttribute('data-no-page-loading', '');
        clear.innerHTML = window.SonglineIcons && window.SonglineIcons.svg ? window.SonglineIcons.svg('close') : '<svg class="ui-line-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg>';
        field.appendChild(clear);
      }

      function sync(){
        clear.classList.toggle('is-visible', !!input.value);
        field.classList.toggle('has-value', !!input.value);
      }
      clear.addEventListener('click', function(e){
        e.preventDefault();
        e.stopPropagation();
        input.value = '';
        sync();
        input.dispatchEvent(new Event('search', {bubbles:true}));
        input.dispatchEvent(new Event('input', {bubbles:true}));
        input.focus();
        showSearchRefresh('已重置');
      }, true);
      input.addEventListener('input', sync);
      input.addEventListener('search', sync);
      sync();
    });
  }

  window.SonglineSearchUtils={ready:ready,normalize:normalize,termsOf:termsOf,includesAll:includesAll,countTerm:countTerm,showSearchRefresh:showSearchRefresh,setVisible:setVisible,setEmpty:setEmpty,flashEmpty:flashEmpty,installClearButtons:installClearButtons};
  window.SonglineSearchRefresh=showSearchRefresh;
})();
