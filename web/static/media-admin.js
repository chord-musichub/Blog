(function(){
  function copyText(text){
    if(!text) return;
    if(navigator.clipboard && window.isSecureContext){
      navigator.clipboard.writeText(text).catch(function(){});
      return;
    }
    const input=document.createElement('textarea');
    input.value=text;
    input.setAttribute('readonly','');
    input.style.position='fixed';
    input.style.left='-9999px';
    document.body.appendChild(input);
    input.select();
    try{document.execCommand('copy');}catch(e){}
    document.body.removeChild(input);
  }
  document.querySelectorAll('.copy-media-path').forEach(function(btn){
    btn.addEventListener('click', function(){
      const path=btn.getAttribute('data-path') || '';
      copyText(path);
      const text=btn.querySelector('.btn-text');
      const old=text ? text.textContent : '';
      if(text) text.textContent='已复制';
      window.clearTimeout(btn.__timer);
      btn.__timer=window.setTimeout(function(){ if(text) text.textContent=old || '复制路径'; }, 1300);
    });
  });
})();
