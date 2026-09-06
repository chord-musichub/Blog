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
    fromPath = normalizePath(fromPath); toPath = normalizePath(toPath);
    // 朋友楼层右侧的回忆室是同层子房间，使用横向切换而不是普通上下楼。
    if(fromPath === '/friends/' && toPath === '/friends/memories/') return 'right';
    if(fromPath === '/friends/memories/' && toPath === '/friends/') return 'left';
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
