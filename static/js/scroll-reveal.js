// 为非阅读器内容提供进入视口时的渐显动画。
(function(){
  if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const items = Array.from(document.querySelectorAll('.card, .page-hero, .hero-banner, .section-head'))
    .filter(function(el){
      return !el.closest('.article-shell') &&
        !el.classList.contains('article-reader') &&
        !el.classList.contains('markdown-body') &&
        !el.classList.contains('article-toc');
    });
  if(!items.length) return;
  if(!('IntersectionObserver' in window)){
    items.forEach(function(el){ el.classList.add('is-visible'); });
    return;
  }
  items.forEach(function(el){ el.classList.add('reveal-item'); });
  const observer = new IntersectionObserver(function(entries){
    entries.forEach(function(entry){
      if(entry.isIntersecting){
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -6% 0px' });
  items.forEach(function(el){ observer.observe(el); });
})();
