/* Shared creator navigation. Works with both / and /write deployments. */
(function(){
  'use strict';
  const header = document.querySelector('[data-admin-client-nav]');
  if (!header) return;
  document.body.classList.add('has-admin-client-nav');
  const base = new URL(header.dataset.base, location.href).pathname.replace(/\/$/, '');
  const path = location.pathname.slice(base.length).replace(/\/$/, '') || '/';
  function sync(){
    const section = location.hash.slice(1);
    let page = path === '/' ? (section === 'manuscripts' ? 'manuscripts' : 'home') :
      path === '/admin' ? (['reviews','messages','users','password-requests'].includes(section) ? section : 'reviews') :
      path === '/compose/projects' ? 'projects' : path === '/compose/memories' ? 'memories' :
      path === '/admin/media' ? 'media' : path === '/account' ? 'account' :
      path.startsWith('/users/') ? 'users' : path.startsWith('/articles/') || path === '/compose' ? 'compose' : 'settings';
    document.querySelectorAll('[data-cc-page]').forEach(link => {
      const active = link.dataset.ccPage === page;
      link.classList.toggle('active', active);
      if(active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    });
    const panels = Array.from(document.querySelectorAll('.admin-workspace-section'));
    if(panels.length){
      const chosen = panels.find(panel => panel.id === page) || panels[0];
      panels.forEach(panel => { panel.hidden = panel !== chosen; });
      const heading = document.querySelector('.admin-management .workspace-detail-header h1');
      const label = chosen.querySelector('h2');
      if(heading && label) heading.textContent = label.textContent;
    }
  }
  sync();
  window.addEventListener('hashchange', sync);
  const toggle = document.querySelector('.rail-toggle');
  const rail = document.querySelector('.creator-rail');
  const mobile = window.matchMedia('(max-width:700px)');
  function setOpen(open){
    document.body.classList.toggle('rail-open',open);
    toggle?.setAttribute('aria-expanded',String(open));
    if(rail) rail.inert = mobile.matches && !open;
  }
  setOpen(false);
  mobile.addEventListener('change',()=>setOpen(false));
  toggle?.addEventListener('click', () => setOpen(!document.body.classList.contains('rail-open')));
  document.addEventListener('keydown', event => {
    if(event.key === 'Escape' && document.body.classList.contains('rail-open')){ setOpen(false); toggle?.focus(); }
  });
  document.addEventListener('click', event => {
    if(!event.target.closest('.creator-rail,.rail-toggle') || event.target.closest('.creator-rail a')){
      setOpen(false);
    }
  });
}());
