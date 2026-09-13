/* Full-document handoff between the public scene and creator center.
 * Runs in <head> so an arriving page is covered before its first paint.
 * Public floor navigation still belongs to SonglinePageTransition.
 */
(function(){
  'use strict';
  const root = document.documentElement;
  const backend = document.currentScript.hasAttribute('data-backend');
  const backendBase = document.currentScript.dataset.backendBase || '/write/';
  const key = 'songline-document-handoff';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let busy = false;
  let recovery = 0;
  const style = document.createElement('style');
  style.textContent = `
    html.document-cover::after{content:'';position:fixed;inset:0;z-index:2147483000;background:#080c14;transform:translateY(100%);transition:transform .42s cubic-bezier(.65,0,.25,1);pointer-events:auto}
    html.document-cover.is-document-covered::after{transform:translateY(0)}
    html.document-arriving::after{transition:none;transform:translateY(0)}
    html.document-cover.is-document-revealing::after{transform:translateY(-100%);transition:transform .5s cubic-bezier(.25,.8,.25,1)}
    @media(prefers-reduced-motion:reduce){html.document-cover::after{display:none}}
  `;
  document.head.appendChild(style);

  function clear(){
    busy = false;
    clearTimeout(recovery);
    root.classList.remove('document-cover','document-arriving','is-document-covered','is-document-revealing');
    try { sessionStorage.removeItem(key); } catch(e) {}
  }
  function remember(url){
    try { sessionStorage.setItem(key, JSON.stringify({at:Date.now(), target:url.href, backend:!backend})); } catch(e) {}
  }
  let incoming = false;
  try {
    const mark = JSON.parse(sessionStorage.getItem(key) || 'null');
    if(mark && mark.backend === backend && Date.now()-mark.at < 15000){
      const target = new URL(mark.target);
      const sameTarget = target.pathname.replace(/\/$/,'') === location.pathname.replace(/\/$/,'');
      // /write redirects to login (or dashboard); preserve that server-side auth boundary.
      incoming = sameTarget || (backend && (target.pathname + '/').startsWith(backendBase));
    }
    sessionStorage.removeItem(key);
  } catch(e) {}
  window.__songlineDocumentArrival = incoming;
  if(incoming && !reduced) root.classList.add('document-cover','document-arriving');

  async function reveal(){
    if(!incoming || reduced) return;
    const ready = [];
    if(document.readyState !== 'complete') ready.push(new Promise(resolve => window.addEventListener('load', resolve, {once:true})));
    if(document.fonts) ready.push(document.fonts.ready);
    document.querySelectorAll('img:not([loading="lazy"])').forEach(img => {
      if(img.decode) ready.push(img.decode().catch(()=>{}));
    });
    // Failed/offline assets must not leave an unclosable black screen.
    await Promise.race([Promise.allSettled(ready), new Promise(resolve=>setTimeout(resolve,6000))]);
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      root.classList.add('is-document-revealing');
      setTimeout(clear,550);
    }));
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',reveal,{once:true});
  else reveal();
  window.addEventListener('pageshow',event=>{ if(event.persisted) clear(); });

  function handles(link){
    if(!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return false;
    if(link.closest('[data-no-page-transition],[data-no-page-loading]')) return false;
    let url;
    try { url = new URL(link.href,location.href); } catch(e){ return false; }
    if(!/^https?:$/.test(url.protocol)) return false;
    if(url.pathname === location.pathname && url.search === location.search && url.origin === location.origin) return false;
    const writePage = (window.SonglinePageConfig || []).find(page=>page.key === 'write');
    const writeRoute = (backend ? backendBase : (writePage ? writePage.route : '/write/')).replace(/\/+$/, '');
    const sameOrigin = url.origin === location.origin;
    const targetBackend = sameOrigin && (url.pathname === writeRoute || url.pathname.startsWith(writeRoute + '/'));
    // Only crossing the public/backend boundary needs a curtain. Settings,
    // editing, media, login/password requests and logout keep native navigation.
    if(backend) return !targetBackend && (sameOrigin || link.hasAttribute('data-document-transition'));
    return targetBackend || link.hasAttribute('data-document-transition');
  }
  // Public AJAX navigation can ask this before attempting to fetch a login document.
  window.SonglineDocumentTransition = {handles:handles};
  document.addEventListener('click',event=>{
    if(event.defaultPrevented || event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest && event.target.closest('a[href]');
    if(!handles(link)) return;
    if(reduced) return;
    event.preventDefault();
    if(busy) return;
    busy = true;
    root.classList.add('document-cover');
    root.getBoundingClientRect();
    requestAnimationFrame(()=>root.classList.add('is-document-covered'));
    setTimeout(()=>{
      remember(new URL(link.href,location.href));
      location.assign(link.href);
      // Also recover after a cancelled unsaved-changes confirmation.
      recovery = setTimeout(clear,5000);
    },460);
  });
}());
