/* v20.18.5：客户端移动端深度适配辅助 */
(function(){
  function isMobile(){
    return window.matchMedia && window.matchMedia('(max-width: 820px)').matches;
  }

  function scrollActiveNavIntoView(){
    if(!isMobile()) return;
    var nav = document.querySelector('.modern-nav-links');
    var active = nav && nav.querySelector('a.active');
    if(!nav || !active) return;
    var navRect = nav.getBoundingClientRect();
    var activeRect = active.getBoundingClientRect();
    var delta = (activeRect.left + activeRect.width / 2) - (navRect.left + navRect.width / 2);
    nav.scrollLeft += delta;
  }

  function wrapWideTables(root){
    root = root || document;
    root.querySelectorAll('.markdown-body table, .article-reader table').forEach(function(table){
      if(table.closest('.mobile-table-scroll')) return;
      var wrap = document.createElement('div');
      wrap.className = 'mobile-table-scroll';
      table.parentNode.insertBefore(wrap, table);
      wrap.appendChild(table);
    });
  }

  function markLongCode(root){
    root = root || document;
    root.querySelectorAll('.markdown-body pre, .md-code-block, .preview pre').forEach(function(el){
      el.classList.add('mobile-scroll-x');
    });
  }

  function init(root){
    scrollActiveNavIntoView();
    wrapWideTables(root || document);
    markLongCode(root || document);
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){ init(document); }, {once:true});
  }else{
    init(document);
  }
  window.addEventListener('resize', function(){ window.setTimeout(scrollActiveNavIntoView, 120); });
  window.addEventListener('orientationchange', function(){ window.setTimeout(init, 260); });
  window.addEventListener('songline:page-swap', function(event){
    init(event.detail && event.detail.root ? event.detail.root : document);
  });
})();
