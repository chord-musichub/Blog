// 记住文章目录的展开状态，并支持鼠标和键盘切换。
(function(){
  const shell = document.querySelector('.article-shell');
  const toc = document.querySelector('.article-toc');
  if(!shell || !toc || shell.dataset.songlineTocBound === '1') return;
  shell.dataset.songlineTocBound = '1';

  const storageKey = 'songline-toc-state';
  try{
    const saved = localStorage.getItem(storageKey);
    if(saved === 'expanded' || saved === 'collapsed') shell.dataset.tocState = saved;
  }catch(error){}

  function syncAria(){
    toc.setAttribute('aria-expanded', shell.dataset.tocState === 'expanded' ? 'true' : 'false');
  }

  function toggle(){
    const next = shell.dataset.tocState === 'expanded' ? 'collapsed' : 'expanded';
    shell.dataset.tocState = next;
    try{ localStorage.setItem(storageKey, next); }catch(error){}
    syncAria();
  }

  toc.addEventListener('click', function(event){
    if(!(event.target && event.target.closest('a'))) toggle();
  });
  toc.addEventListener('keydown', function(event){
    if((event.key !== 'Enter' && event.key !== ' ') || (event.target && event.target.closest('a'))) return;
    event.preventDefault();
    toggle();
  });
  syncAria();
})();
