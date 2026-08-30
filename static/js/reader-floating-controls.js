// 阅读页的置顶/置底按钮统一移到 body，避免被文章容器的定位和裁剪影响。
(function(){
  const STYLE_ID = 'songline-reader-floating-controls-style';
  const ARTICLE_STYLE_ID = 'songline-article-reader-style';
  const READER_SELECTOR = [
    '.article-reader',
    '.article-shell',
    '.article-layout',
    '.post-single',
    '.post-layout',
    '.md-tool-layout',
    '.md-tool-preview',
    '[data-article-renderer="songline-markdown"]'
  ].join(',');

  let assetVersion = '';
  try{
    const sourceURL = new URL((document.currentScript && document.currentScript.src) || '', window.location.href);
    assetVersion = sourceURL.searchParams.get('v') || '';
  }catch(e){}

  function ensureStylesheet(id, path){
    if(document.getElementById(id)) return;
    const style = document.createElement('link');
    style.id = id;
    style.rel = 'stylesheet';
    style.href = path + (assetVersion ? '?v=' + encodeURIComponent(assetVersion) : '');
    document.head.appendChild(style);
  }

  function ensureReaderStylesheets(){
    ensureStylesheet(ARTICLE_STYLE_ID, '/css/article-reader.css');
    ensureStylesheet(STYLE_ID, '/css/reader-floating-controls.css');
  }

  function hasReaderPage(){
    return !!document.querySelector(READER_SELECTOR);
  }

  function cleanInline(button){
    if(!button) return;
    ['left','right','top','bottom','position','transform','translate','inset','margin'].forEach(function(property){
      button.style.removeProperty(property);
    });
  }

  function pickButton(selector){
    const nodes = Array.from(document.querySelectorAll(selector));
    if(!nodes.length) return null;
    const fresh = nodes.filter(function(node){ return node.dataset.songlineFloatPortal !== '1'; });
    const chosen = fresh.length ? fresh[fresh.length - 1] : nodes[nodes.length - 1];
    nodes.forEach(function(node){ if(node !== chosen) node.remove(); });
    return chosen;
  }

  function bindButton(button, type){
    if(!button || button.dataset.songlineFloatBound === '1') return;
    button.dataset.songlineFloatBound = '1';
    button.addEventListener('click', function(event){
      event.preventDefault();
      if(type === 'top'){
        window.scrollTo({top:0, behavior:'smooth'});
        return;
      }
      const target = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
        document.documentElement.offsetHeight
      );
      window.scrollTo({top:target, behavior:'smooth'});
    });
  }

  function portalButton(button, type){
    if(!button) return null;
    button.dataset.songlineFloatPortal = '1';
    button.dataset.songlineFloatType = type;
    button.classList.add('songline-reading-float-button');
    cleanInline(button);
    bindButton(button, type);
    if(button.parentNode !== document.body) document.body.appendChild(button);
    return button;
  }

  function removePortaledButtons(){
    document.querySelectorAll('[data-songline-float-portal="1"], .songline-reading-float-button').forEach(function(node){ node.remove(); });
  }

  function updateVisibility(topButton, bottomButton){
    const y = window.scrollY || document.documentElement.scrollTop || 0;
    const maxY = Math.max(0, Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, document.documentElement.offsetHeight) - window.innerHeight);
    if(topButton){
      cleanInline(topButton);
      topButton.classList.toggle('show', y > 360);
    }
    if(bottomButton){
      cleanInline(bottomButton);
      bottomButton.classList.toggle('show', maxY - y > 360);
    }
  }

  function normalizeFloatReadingButtons(){
    if(!hasReaderPage()){
      removePortaledButtons();
      document.documentElement.classList.remove('has-reading-float-tools', 'has-mobile-reading-tools');
      return;
    }

    ensureReaderStylesheets();

    const topButton = portalButton(pickButton('.back-to-top-button'), 'top');
    const bottomButton = portalButton(pickButton('.scroll-to-bottom-button'), 'bottom');
    if(!topButton && !bottomButton){
      document.documentElement.classList.remove('has-reading-float-tools', 'has-mobile-reading-tools');
      return;
    }

    document.documentElement.classList.add('has-reading-float-tools');
    document.documentElement.classList.toggle(
      'has-mobile-reading-tools',
      !!(window.matchMedia && window.matchMedia('(max-width: 820px)').matches)
    );
    updateVisibility(topButton, bottomButton);
  }

  function scheduleNormalizeFloatReadingButtons(){
    normalizeFloatReadingButtons();
    window.setTimeout(normalizeFloatReadingButtons, 80);
    window.setTimeout(normalizeFloatReadingButtons, 260);
  }
  window.SonglineNormalizeFloatReadingButtons = scheduleNormalizeFloatReadingButtons;

  window.addEventListener('scroll', function(){
    updateVisibility(
      document.querySelector('.back-to-top-button.songline-reading-float-button'),
      document.querySelector('.scroll-to-bottom-button.songline-reading-float-button')
    );
  }, {passive:true});
  window.addEventListener('resize', normalizeFloatReadingButtons);
  window.addEventListener('orientationchange', normalizeFloatReadingButtons);
})();
