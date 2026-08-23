/* v20.18.5：后台移动端深度适配辅助 */
(function(){
  function isMobile(){
    return window.matchMedia && window.matchMedia('(max-width: 820px)').matches;
  }

  function scrollActiveAdminNav(){
    if(!isMobile()) return;
    var links = document.querySelector('.admin-client-links');
    var active = links && links.querySelector('a.active');
    if(!links || !active) return;
    var linksRect = links.getBoundingClientRect();
    var activeRect = active.getBoundingClientRect();
    var delta = (activeRect.left + activeRect.width / 2) - (linksRect.left + linksRect.width / 2);
    links.scrollLeft += delta;
  }

  function wrapAdminTables(root){
    root = root || document;
    root.querySelectorAll('table').forEach(function(table){
      if(table.closest('.admin-mobile-table-scroll')) return;
      var parent = table.parentNode;
      if(!parent || parent.classList && parent.classList.contains('admin-mobile-table-scroll')) return;
      var wrap = document.createElement('div');
      wrap.className = 'admin-mobile-table-scroll';
      parent.insertBefore(wrap, table);
      wrap.appendChild(table);
    });
  }

  function init(root){
    scrollActiveAdminNav();
    wrapAdminTables(root || document);
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){ init(document); }, {once:true});
  }else{
    init(document);
  }
  window.addEventListener('resize', function(){ window.setTimeout(init, 120); });
  window.addEventListener('orientationchange', function(){ window.setTimeout(init, 260); });
})();
