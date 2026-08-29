// 将当前文章的 Markdown 源内容下载为 UTF-8 文件。
(function(){
  const button = document.querySelector('[data-md-download]');
  const sourceElement = document.getElementById('article-md-source');
  const reader = document.querySelector('[data-article-renderer]');
  if(!button || !sourceElement || button.dataset.songlineDownloadBound === '1') return;
  button.dataset.songlineDownloadBound = '1';

  function decodeBase64Utf8(value){
    const clean = String(value || '').replace(/\s+/g, '');
    const binary = atob(clean);
    const bytes = new Uint8Array(binary.length);
    for(let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    if(window.TextDecoder) return new TextDecoder('utf-8', {fatal:false}).decode(bytes);
    let encoded = '';
    bytes.forEach(function(byte){ encoded += '%' + byte.toString(16).padStart(2, '0'); });
    return decodeURIComponent(encoded);
  }

  function readInlineMarkdown(){
    try{
      let markdown = JSON.parse(sourceElement.textContent || '""');
      if(sourceElement.dataset.sourceFormat === 'base64') markdown = decodeBase64Utf8(markdown);
      return String(markdown || '');
    }catch(error){
      return '';
    }
  }

  function filenameFromTitle(title){
    return String(title || 'article')
      .replace(/[\\/:*?"<>|]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80) || 'article';
  }

  function isMarkdownSource(value){
    return !/^\s*<(?:!doctype\s+html|html|head|body)(?:\s|>)/i.test(String(value || ''));
  }

  async function getMarkdown(){
    const sourceURL = sourceElement.dataset.sourceUrl || '';
    if(sourceURL){
      try{
        const response = await fetch(sourceURL, {credentials:'same-origin', cache:'no-store'});
        if(response.ok){
          const text = await response.text();
          if(text && isMarkdownSource(text)) return text;
        }
      }catch(error){}
    }
    return readInlineMarkdown();
  }

  button.addEventListener('click', async function(){
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = '准备中...';
    try{
      const blob = new Blob(['\ufeff' + await getMarkdown()], {type:'text/markdown;charset=utf-8'});
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filenameFromTitle(reader && reader.dataset.articleTitle) + '.md';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(function(){ URL.revokeObjectURL(url); }, 600);
    }finally{
      button.disabled = false;
      button.textContent = originalText;
    }
  });
})();
