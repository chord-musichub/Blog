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

  var search = document.getElementById('mediaSearch');
  var empty = document.getElementById('mediaSearchEmpty');
  if(search){
    var items = Array.prototype.slice.call(document.querySelectorAll('[data-media-item]'));
    search.addEventListener('input', function(){
      var query = search.value.trim().toLowerCase();
      var shown = 0;
      items.forEach(function(item){
        var match = !query || item.textContent.toLowerCase().indexOf(query) !== -1;
        item.hidden = !match;
        if(match) shown += 1;
      });
      if(empty) empty.hidden = shown !== 0 || !query;
    });
  }
})();
