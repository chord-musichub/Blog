// /posts 卡片布局兜底：处理旧页面样式残留和无刷新换页后的新卡片。
(function(){
  const STYLE_ID = 'songline-posts-list-style';
  let assetVersion = '';
  try{
    assetVersion = new URL((document.currentScript && document.currentScript.src) || '', window.location.href).searchParams.get('v') || '';
  }catch(error){}

  function ensureStylesheet(){
    if(document.getElementById(STYLE_ID)) return;
    const link = document.createElement('link');
    link.id = STYLE_ID;
    link.rel = 'stylesheet';
    link.href = '/css/posts-list.css' + (assetVersion ? '?v=' + encodeURIComponent(assetVersion) : '');
    link.dataset.songlinePageStyle = 'posts-list';
    document.head.appendChild(link);
  }

  function flattenPostCards(list){
    if(!list) return;
    const mobile = window.matchMedia && window.matchMedia('(max-width: 760px)').matches;
    list.querySelectorAll('.post-search-item > article.post-card').forEach(function(card){
      card.classList.remove('notice-card', 'latest-card', 'recent-card', 'update-card');
      card.style.setProperty('grid-column', 'auto', 'important');
      card.style.setProperty('display', 'grid', 'important');
      card.style.setProperty('grid-template-columns', mobile ? 'minmax(0, 1fr)' : '450px minmax(0, 1fr)', 'important');
      card.style.setProperty('grid-template-rows', mobile ? 'auto auto' : 'auto', 'important');
      card.style.setProperty('width', '100%', 'important');
      card.style.setProperty('max-width', '100%', 'important');
      card.style.setProperty('min-width', '0', 'important');
      card.style.setProperty('min-height', mobile ? '0' : '186px', 'important');
      card.style.setProperty('height', 'auto', 'important');
      card.style.setProperty('overflow', 'hidden', 'important');
      card.style.setProperty('background', 'color-mix(in srgb, var(--panel) 86%, transparent)', 'important');
      card.style.setProperty('border-color', 'var(--border)', 'important');
      const thumb = card.querySelector('.post-thumb');
      const info = card.querySelector('.post-info');
      const title = card.querySelector('.post-info h2');
      const summary = card.querySelector('.post-info p');
      const meta = card.querySelector('.meta-row');
      if(thumb){
        thumb.style.setProperty('width', '100%', 'important');
        thumb.style.setProperty('min-height', mobile ? '132px' : '186px', 'important');
        thumb.style.setProperty('height', mobile ? '132px' : '100%', 'important');
        thumb.style.setProperty('max-height', mobile ? '132px' : 'none', 'important');
      }
      if(info){
        info.style.setProperty('padding', mobile ? '12px 13px 13px' : '24px 30px', 'important');
        info.style.setProperty('background', 'transparent', 'important');
        info.style.setProperty('min-width', '0', 'important');
      }
      if(title){
        title.style.setProperty('font-size', mobile ? '18px' : '25px', 'important');
        title.style.setProperty('line-height', mobile ? '1.32' : '1.35', 'important');
        title.style.setProperty('display', mobile ? '-webkit-box' : 'block', 'important');
        title.style.setProperty('-webkit-box-orient', 'vertical', 'important');
        title.style.setProperty('-webkit-line-clamp', mobile ? '2' : 'unset', 'important');
        title.style.setProperty('overflow', mobile ? 'hidden' : 'visible', 'important');
      }
      if(summary){
        summary.style.setProperty('display', '-webkit-box', 'important');
        summary.style.setProperty('-webkit-box-orient', 'vertical', 'important');
        summary.style.setProperty('-webkit-line-clamp', mobile ? '2' : '3', 'important');
        summary.style.setProperty('line-clamp', mobile ? '2' : '3', 'important');
        summary.style.setProperty('overflow', 'hidden', 'important');
        summary.style.setProperty('text-overflow', 'ellipsis', 'important');
        summary.style.setProperty('max-height', mobile ? '3.35em' : '4.95em', 'important');
        summary.style.setProperty('font-size', mobile ? '13px' : '', 'important');
        summary.style.setProperty('line-height', mobile ? '1.62' : '', 'important');
      }
      if(meta){
        meta.style.setProperty('gap', mobile ? '6px' : '', 'important');
        meta.style.setProperty('font-size', mobile ? '11.5px' : '', 'important');
        meta.style.setProperty('max-height', 'none', 'important');
        meta.style.setProperty('overflow', 'visible', 'important');
        meta.style.setProperty('flex-wrap', 'wrap', 'important');
      }
    });
  }

  function init(root){
    root = root || document;
    const list = root.querySelector ? root.querySelector('.posts-list') : document.querySelector('.posts-list');
    if(!list) return;
    ensureStylesheet();
    flattenPostCards(list);
    if(list.dataset.songlinePostsListBound === '1') return;
    list.dataset.songlinePostsListBound = '1';
    new MutationObserver(function(){ flattenPostCards(list); }).observe(list, {childList:true, subtree:false});
  }

  function refresh(){ init(document); }
  window.SonglineInitPostsListFlat = init;
  if(!window.SonglinePostsListFlatGlobalBound){
    window.SonglinePostsListFlatGlobalBound = true;
    window.addEventListener('resize', function(){
      window.clearTimeout(window.__postsMobileTimer);
      window.__postsMobileTimer = window.setTimeout(refresh, 120);
    });
  }
})();
