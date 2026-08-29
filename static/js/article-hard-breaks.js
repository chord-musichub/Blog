// 兼容文章正文里真实或被转义的 <br>，统一为可见的 Markdown 强制换行。
(function(){
  const reader = document.querySelector('.article-reader');
  if(!reader || reader.dataset.songlineHardBreaksBound === '1') return;
  reader.dataset.songlineHardBreaksBound = '1';

  reader.querySelectorAll('br').forEach(function(lineBreak){
    lineBreak.classList.add('md-hard-break');
  });

  const walker = document.createTreeWalker(reader, NodeFilter.SHOW_TEXT);
  const targets = [];
  while(walker.nextNode()){
    const node = walker.currentNode;
    if(/<br\s*\/?>|&lt;br\s*\/?&gt;/i.test(node.nodeValue || '')) targets.push(node);
  }

  targets.forEach(function(node){
    const parts = (node.nodeValue || '').split(/(?:<br\s*\/?>|&lt;br\s*\/?&gt;)/i);
    const fragment = document.createDocumentFragment();
    parts.forEach(function(part, index){
      if(index > 0){
        const lineBreak = document.createElement('br');
        lineBreak.className = 'md-hard-break';
        fragment.appendChild(lineBreak);
      }
      if(part) fragment.appendChild(document.createTextNode(part));
    });
    node.parentNode.replaceChild(fragment, node);
  });
})();
