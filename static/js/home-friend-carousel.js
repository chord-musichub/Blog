// 首页朋友卡片轮播：仅在朋友超过一屏时显示切换按钮。
(function(){
  function init(root){
    root = root || document;
    const carousel = root.querySelector ? root.querySelector('[data-home-friend-carousel]') : document.querySelector('[data-home-friend-carousel]');
    const track = root.querySelector ? root.querySelector('[data-home-friend-track]') : document.querySelector('[data-home-friend-track]');
    if(!carousel || !track) return;
    if(carousel.dataset.songlineFriendCarouselBound === '1') return;
    carousel.dataset.songlineFriendCarouselBound = '1';
    const prev = document.querySelector('[data-home-friend-prev]');
    const next = document.querySelector('[data-home-friend-next]');
    const slides = Array.from(track.querySelectorAll('.home-friend-slide'));
    if(slides.length <= 4){
      if(prev) prev.hidden = true;
      if(next) next.hidden = true;
    }

    function step(){
      const first = slides[0];
      if(!first) return carousel.clientWidth || 320;
      const rect = first.getBoundingClientRect();
      const gap = parseFloat(getComputedStyle(track).gap || '18') || 18;
      return Math.max(180, rect.width + gap) * Math.min(2, Math.max(1, Math.floor(carousel.clientWidth / Math.max(1, rect.width + gap))));
    }

    function update(){
      if(!prev || !next) return;
      const max = track.scrollWidth - track.clientWidth - 2;
      prev.disabled = track.scrollLeft <= 2;
      next.disabled = track.scrollLeft >= max;
      const canScroll = track.scrollWidth > track.clientWidth + 4;
      prev.hidden = !canScroll;
      next.hidden = !canScroll;
    }

    function move(dir){
      track.scrollBy({left: dir * step(), behavior:'smooth'});
      window.setTimeout(update, 360);
    }

    if(prev){
      prev.setAttribute('data-no-page-loading', '');
      prev.addEventListener('click', function(event){ event.preventDefault(); event.stopPropagation(); move(-1); });
    }
    if(next){
      next.setAttribute('data-no-page-loading', '');
      next.addEventListener('click', function(event){ event.preventDefault(); event.stopPropagation(); move(1); });
    }
    track.addEventListener('scroll', update, {passive:true});
    window.addEventListener('resize', update);
    update();
  }

  window.SonglineInitHomeFriendCarousel = init;
})();
