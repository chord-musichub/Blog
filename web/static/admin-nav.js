(function(){
  'use strict';
  function norm(path){
    if(!path) return '/';
    if(path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
    return path || '/';
  }
  function routeFor(path){
    path = norm(path);
    if(path === '/') return 'dashboard';
    if(path === '/admin') return 'admin';
    if(path === '/admin/site' || path === '/admin/theme' || path === '/admin/manuscript') return 'settings';
    if(path === '/admin/media') return 'media';
    if(path === '/compose' || path === '/articles/new' || path === '/articles/upload' || path.indexOf('/articles/') === 0 || path === '/compose/projects' || path === '/compose/memories') return 'compose';
    if(path === '/users/new' || path.indexOf('/users/') === 0 || path === '/account' || path === '/settings') return 'settings';
    return '';
  }
  function init(){
    var nav = document.querySelector('[data-admin-client-nav]');
    if(!nav) return;
    var route = routeFor(window.location.pathname);
    var section = (window.location.hash || '#reviews').slice(1);
    nav.querySelectorAll('[data-admin-route]').forEach(function(link){
      var active = link.getAttribute('data-admin-route') === route;
      if(route === 'admin' && link.hasAttribute('data-admin-section')) active = link.getAttribute('data-admin-section') === section;
      link.classList.toggle('active', active);
    });
    document.body.classList.add('has-admin-client-nav');
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
