(function(){
  function copyText(text){
    if(!text) return;
    if(navigator.clipboard && window.isSecureContext){
      navigator.clipboard.writeText(text).catch(function(){});
      return;
    }
    const input = document.createElement('textarea');
    input.value = text;
    input.setAttribute('readonly', '');
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    document.body.appendChild(input);
    input.select();
    try{ document.execCommand('copy'); }catch(e){}
    document.body.removeChild(input);
  }
  document.querySelectorAll('.email-contact[data-email]').forEach(function(link){
    link.addEventListener('click', function(){
      const email = link.getAttribute('data-email') || '';
      copyText(email);
      link.classList.add('copied');
      window.clearTimeout(link.__copiedTimer);
      link.__copiedTimer = window.setTimeout(function(){
        link.classList.remove('copied');
      }, 1600);
    });
  });
})();

