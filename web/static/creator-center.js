(function(){
  'use strict';
  function init(){
    document.querySelectorAll('img[data-image-fallback]').forEach(img=>{
      const fallback = ()=>{
        if(img.dataset.fallbackUsed) return;
        img.dataset.fallbackUsed = '1';
        img.src = img.dataset.imageFallback;
      };
      img.addEventListener('error',fallback);
      if(img.complete && !img.naturalWidth) fallback();
    });
    document.querySelectorAll('label:has(input[type="file"][hidden])').forEach(label=>{
      label.tabIndex=0;label.setAttribute('role','button');
      label.addEventListener('keydown',event=>{
        if(event.key==='Enter'||event.key===' '){event.preventDefault();label.querySelector('input[type="file"]').click();}
      });
    });
    const list = document.querySelector('[data-manuscripts]');
    if(list){
      const rows = Array.from(list.querySelectorAll('[data-manuscript-status]'));
      const search = list.querySelector('[data-manuscript-search]');
      let filter = 'all', page = 1;
      const size = 8;
      document.querySelectorAll('[data-stat]').forEach(el => {
        el.textContent = rows.filter(row => el.dataset.stat === 'all' || row.dataset.manuscriptStatus === el.dataset.stat).length;
      });
      function update(){
        const term = search.value.trim().toLocaleLowerCase();
        const matches = rows.filter(row => (filter === 'all' || row.dataset.manuscriptStatus === filter) && row.dataset.title.toLocaleLowerCase().includes(term));
        const pages = Math.max(1,Math.ceil(matches.length/size));
        page = Math.min(page,pages);
        rows.forEach(row => { row.hidden = true; });
        matches.slice((page-1)*size,page*size).forEach(row => { row.hidden=false; });
        list.querySelector('[data-manuscript-empty]').hidden = matches.length > 0 || rows.length === 0;
        list.querySelector('[data-list-result]').textContent = '共 ' + matches.length + ' 篇稿件';
        list.querySelector('[data-list-page]').textContent = page + ' / ' + pages;
        list.querySelector('[data-list-prev]').disabled = page <= 1;
        list.querySelector('[data-list-next]').disabled = page >= pages;
        list.querySelectorAll('[data-status-filter]').forEach(button => {
          const active = button.dataset.statusFilter === filter;
          button.classList.toggle('active',active); button.setAttribute('aria-pressed',String(active));
        });
      }
      search.addEventListener('input', () => { page=1; update(); });
      list.querySelectorAll('[data-status-filter]').forEach(button => button.addEventListener('click',() => { filter=button.dataset.statusFilter; page=1; update(); }));
      document.querySelectorAll('[data-status-jump]').forEach(link => link.addEventListener('click',() => { filter=link.dataset.statusJump; page=1; update(); }));
      list.querySelector('[data-list-prev]').addEventListener('click',() => { page--; update(); });
      list.querySelector('[data-list-next]').addEventListener('click',() => { page++; update(); });
      update();
    }

    const form = document.getElementById('article-form');
    const editor = document.getElementById('md');
    const preview = document.getElementById('preview');
    if(form && editor){
      let dirty = false, submitting = false;
      const count = document.querySelector('[data-word-count]');
      function changed(){ dirty=true; document.querySelector('[data-editor-dirty]').textContent='有未保存的修改'; }
      form.addEventListener('input',changed);
      form.addEventListener('change',changed);
      form.addEventListener('submit',event => { if(!event.defaultPrevented) submitting=true; });
      window.addEventListener('beforeunload',event => { if(dirty && !submitting){event.preventDefault();event.returnValue='';} });
      window.addEventListener('pageshow',()=>{submitting=false;});
      function countWords(){count.textContent=editor.value.replace(/\s/g,'').length + ' 字';}
      editor.addEventListener('input',countWords); countWords();
      function mode(value){
        editor.hidden=value==='preview'; preview.hidden=value!=='preview';
        document.querySelector('.formatting-toolbar').hidden=value==='preview';
        document.querySelectorAll('[data-writing-mode]').forEach(button => {
          const active=button.dataset.writingMode===value;
          button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));
        });
      }
      document.querySelectorAll('[data-writing-mode]').forEach(button => button.addEventListener('click',()=>mode(button.dataset.writingMode)));
      editor.addEventListener('invalid',()=>mode('edit'));
      const formats={heading:['## ',''],bold:['**','**'],italic:['*','*'],quote:['> ',''],list:['- ',''],link:['[','](https://)'],code:['`','`']};
      document.querySelectorAll('[data-md-insert]').forEach(button => button.addEventListener('click',()=>{
        const [left,right]=formats[button.dataset.mdInsert];
        const start=editor.selectionStart,end=editor.selectionEnd;
        const selection=editor.value.slice(start,end)||'文字';
        editor.setRangeText(left+selection+right,start,end,'select');
        editor.focus();editor.dispatchEvent(new Event('input',{bubbles:true}));
      }));
      document.querySelectorAll('.cover-option[data-cover]').forEach(button => button.addEventListener('click',()=>{
        const input=document.getElementById('coverInput');
        input.value=button.dataset.cover;input.dispatchEvent(new Event('input',{bubbles:true}));
        document.querySelectorAll('.cover-option').forEach(option=>option.classList.toggle('active',option===button));
      }));
      document.querySelector('[data-cover-path-editor]')?.addEventListener('input',event=>{
        const input=document.getElementById('coverInput');input.value=event.target.value;input.dispatchEvent(new Event('input',{bubbles:true}));
      });
    }

    function connectPreview(input,container){
      function sync(){
        const value=input.value.trim();
        container.replaceChildren();
        const placeholder=document.createElement('span');placeholder.textContent='选择一张图片';
        container.appendChild(placeholder);
        if(!value) return;
        let url;try{url=new URL(value,location.href);}catch(e){return;}
        if(!['http:','https:'].includes(url.protocol)) return;
        const image=document.createElement('img');image.alt='当前图片';
        image.onload=()=>{placeholder.hidden=true;};
        image.onerror=()=>{image.remove();placeholder.textContent='图片暂时无法显示';};
        image.src=url.href;container.appendChild(image);
      }
      input.addEventListener('input',sync);input.addEventListener('change',sync);sync();
    }
    document.querySelectorAll('[data-cover-preview-for]').forEach(container=>{
      const input=document.querySelector(container.dataset.coverPreviewFor);
      if(input)connectPreview(input,container);
    });
    document.querySelectorAll('.creator-entry input[name="cover"],.creator-entry input[name="image"]').forEach(input=>{
      const container=document.createElement('div');container.className='cover-preview creator-image-preview';
      input.closest('label').before(container);connectPreview(input,container);
    });

    const manager = document.querySelector('.creator-manager');
    if(manager){
      const entry=manager.querySelector('.creator-entry:not(.creator-entry--saved)');
      const heading=manager.querySelector('.workspace-detail-header');
      if(entry && heading){
        const button=document.createElement('button');button.type='button';button.textContent='＋ 新建';button.setAttribute('aria-expanded','false');
        entry.hidden=true;heading.appendChild(button);
        button.addEventListener('click',()=>{
          entry.hidden=!entry.hidden;button.textContent=entry.hidden?'＋ 新建':'取消新建';button.setAttribute('aria-expanded',String(!entry.hidden));
          if(!entry.hidden)entry.querySelector('input')?.focus();
        });
        // Only one existing record is expanded at a time, keeping long libraries scannable.
        manager.querySelectorAll('.creator-entry--saved').forEach(details => {
          details.addEventListener('toggle',()=>{
            if(details.open) manager.querySelectorAll('.creator-entry--saved').forEach(other=>{if(other!==details)other.open=false;});
          });
          const input=details.querySelector('input[name="cover"],input[name="image"]');
          if(input?.value){
            const image=document.createElement('img');image.className='creator-entry-thumb';image.alt='';image.loading='lazy';image.src=input.value;image.onerror=()=>image.remove();
            details.querySelector('summary').prepend(image);
          }
        });
      }
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
}());
