(function(){
  function copyText(text){
    if(!text) return Promise.reject(new Error('没有可复制的路径'));
    if(navigator.clipboard && window.isSecureContext){
      return navigator.clipboard.writeText(text);
    }
    const input=document.createElement('textarea');
    input.value=text;
    input.setAttribute('readonly','');
    input.style.position='fixed';
    input.style.left='-9999px';
    document.body.appendChild(input);
    input.select();
    let copied=false;
    try{copied=document.execCommand('copy');}catch(e){}
    document.body.removeChild(input);
    return copied ? Promise.resolve() : Promise.reject(new Error('复制失败'));
  }
  document.querySelectorAll('.copy-media-path').forEach(function(btn){
    btn.addEventListener('click', function(){
      const path=btn.getAttribute('data-path') || '';
      const text=btn.querySelector('.btn-text');
      const old=text ? text.textContent : '';
      copyText(path).then(function(){ if(text)text.textContent='已复制'; },function(){ if(text)text.textContent='请手动复制'; })
        .finally(function(){
          window.clearTimeout(btn.__timer);
          btn.__timer=window.setTimeout(function(){ if(text) text.textContent=old || '复制路径'; }, 1300);
        });
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
        // Do not search every option in the category editor: only this file's
        // name and current category should make the card match.
        var text = item.getAttribute('data-media-search') || item.textContent;
        var match = !query || text.toLowerCase().indexOf(query) !== -1;
        item.hidden = !match;
        if(match) shown += 1;
      });
      document.querySelectorAll('[data-media-group]').forEach(function(group){
        group.hidden = !group.querySelector('[data-media-item]:not([hidden])');
      });
      if(empty) empty.hidden = shown !== 0 || !query;
    });
  }
})();
