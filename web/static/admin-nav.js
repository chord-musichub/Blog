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
    if(path === '/admin') return 'review';
    if(path === '/admin/site' || path === '/admin/theme' || path === '/admin/manuscript') return 'site';
    if(path === '/admin/media') return 'media';
    if(path === '/articles/new') return 'new';
    if(path === '/articles/upload') return 'upload';
    if(path.indexOf('/articles/') === 0) return 'dashboard';
    if(path === '/users/new' || path.indexOf('/users/') === 0) return 'users';
    if(path === '/account') return 'account';
    return '';
  }
  function init(){
    var nav = document.querySelector('[data-admin-client-nav]');
    if(!nav) return;
    var route = routeFor(window.location.pathname);
    nav.querySelectorAll('[data-admin-route]').forEach(function(link){
      link.classList.toggle('active', link.getAttribute('data-admin-route') === route);
    });
    document.body.classList.add('has-admin-client-nav');
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
