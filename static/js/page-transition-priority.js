(function(){
  'use strict';

  // data/navigation.json 由 baseof 注入；这里不再维护第二份 priority / route 表。
  var pages = Array.isArray(window.SonglinePageConfig) ? window.SonglinePageConfig.slice() : [];
  var fallback = { key:'general', priority:3 };

  function normalizePath(path){
    path = path || '/';
    if(path !== '/' && path.charAt(path.length - 1) !== '/') path += '/';
    return path;
  }

  function pageForPath(path){
    path = normalizePath(path);
    var matches = pages.filter(function(page){
      return page.route && (page.route === '/' ? path === '/' : path.indexOf(page.route) === 0);
    }).sort(function(a, b){ return (b.route || '').length - (a.route || '').length; });
    return matches[0] || pages.filter(function(page){ return page.key === 'general'; })[0] || fallback;
  }

  function getPageKey(path){ return pageForPath(path).key || fallback.key; }
  function getPagePriority(path){ return Number(pageForPath(path).priority) || fallback.priority; }
  function getTransitionDirection(fromPath, toPath){
    var from = getPagePriority(fromPath);
    var to = getPagePriority(toPath);
    return to > from ? 'forward' : to < from ? 'backward' : 'same';
  }

  window.SonglinePagePriority = {
    config: pages,
    routes: pages,
    getNavigationItems:function(){ return pages.filter(function(page){ return page.visible; }); },
    getPageKey:getPageKey,
    getPagePriority:getPagePriority,
    getTransitionDirection:getTransitionDirection
  };
  document.documentElement.classList.add('songline-page-priority-ready');
})();
