// 懒加载带 data-bg 的背景图，避免首屏一次请求所有卡片封面。
(function(){
  const items = Array.from(document.querySelectorAll('.lazy-bg[data-bg]'));
  if(!items.length) return;

  function load(el){
    const bg = el.getAttribute('data-bg');
    if(!bg || el.dataset.bgLoaded === '1') return;
    el.dataset.bgLoaded = '1';
    const img = new Image();
    img.decoding = 'async';
    img.onload = function(){
      el.style.backgroundImage = "url('" + bg.replace(/'/g, "\\\\'") + "')";
      el.classList.add('lazy-bg-loaded');
    };
    img.onerror = function(){
      el.style.backgroundImage = "url('" + bg.replace(/'/g, "\\\\'") + "')";
      el.classList.add('lazy-bg-loaded');
    };
    img.src = bg;
  }

  if(!('IntersectionObserver' in window)){
    items.forEach(load);
    return;
  }

  const observer = new IntersectionObserver(function(entries){
    entries.forEach(function(entry){
      if(entry.isIntersecting){
        load(entry.target);
        observer.unobserve(entry.target);
      }
    });
  }, {rootMargin:'320px 0px'});

  items.forEach(function(el){ observer.observe(el); });
})();
