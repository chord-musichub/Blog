(function(){
  'use strict';
  const key = 'songline-privacy-v1';
  const lifetime = 180 * 24 * 60 * 60 * 1000;
  const panel = document.getElementById('privacyPreferences');
  if(!panel) return;
  let choice = null;
  let opener = null;
  let persisted = true;
  let motion = null;
  let motionRevision = 0;
  function setVisible(visible){
    const revision = ++motionRevision;
    if(motion){ motion.cancel(); motion = null; }
    if(!visible && panel.hidden) return;
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(!panel.animate || reduced){ panel.hidden = !visible; return; }
    panel.hidden = false;
    motion = panel.animate(visible ? [
      {transform:'translateY(-100%)',opacity:0},{transform:'translateY(0)',opacity:1}
    ] : [
      {transform:'translateY(0)',opacity:1},{transform:'translateY(-100%)',opacity:0}
    ],{duration:visible?280:200,easing:'cubic-bezier(.22,.72,.24,1)',fill:'forwards'});
    motion.finished.then(function(){
      if(revision !== motionRevision) return;
      panel.hidden = !visible;
      motion.cancel(); motion = null;
    },function(){});
  }
  function parse(raw){
    try{
      const data = JSON.parse(raw);
      return data && data.version === 1 && typeof data.statistics === 'boolean' && Number.isFinite(data.expires) && data.expires > Date.now() && data.expires <= Date.now()+lifetime ? data : null;
    }catch(error){ return null; }
  }
  try{ choice = parse(localStorage.getItem(key)); }catch(error){ persisted = false; }
  function allows(){ return !!(choice && choice.expires > Date.now() && choice.statistics); }
  function clearStatisticsStorage(){
    try{
      for(let i=sessionStorage.length-1;i>=0;i--){
        const name = sessionStorage.key(i);
        if(name && name.startsWith('songline-viewed:')) sessionStorage.removeItem(name);
      }
    }catch(error){}
  }
  function status(){
    panel.querySelector('[data-privacy-status]').textContent = (choice ? '当前：'+(allows()?'允许阅读统计。':'仅基础功能。') : '当前尚未选择，阅读统计默认关闭。') + (persisted?'':'浏览器不允许保存，选择仅在本页面有效。');
  }
  function open(trigger){
    opener = trigger || null;
    status(); setVisible(true);
    // The first-visit notice is non-modal: do not steal focus or block browsing.
    if(opener) panel.querySelector('button').focus();
  }
  function notify(){
    if(!allows()) clearStatisticsStorage();
    window.dispatchEvent(new CustomEvent('songline:privacy-change',{detail:{statistics:allows()}}));
  }
  function collapse(){
    setVisible(false);
    const target = opener || document.querySelector('[data-privacy-open]');
    if(target && target.isConnected) target.focus();
    opener = null;
  }
  function save(statistics){
    choice = {version:1,statistics:statistics,expires:Date.now()+lifetime};
    try{ localStorage.setItem(key,JSON.stringify(choice)); persisted = true; }catch(error){ persisted = false; }
    collapse(); notify();
  }
  panel.addEventListener('click',function(event){
    if(event.target.closest('[data-privacy-collapse]')){ collapse(); return; }
    const button = event.target.closest('[data-privacy-choice]');
    if(button) save(button.dataset.privacyChoice === 'statistics');
  });
  panel.addEventListener('keydown',function(event){
    if(event.key === 'Escape'){ event.preventDefault(); collapse(); }
  });
  document.addEventListener('click',function(event){
    const trigger = event.target.closest('[data-privacy-open]');
    if(trigger){ event.preventDefault(); open(trigger); }
  });
  window.addEventListener('storage',function(event){
    if(event.key !== key && event.key !== null) return;
    choice = parse(event.newValue); status(); setVisible(!choice); notify();
  });
  function refresh(){
    if(choice && choice.expires <= Date.now()){ choice = null; open(); notify(); }
  }
  window.addEventListener('pageshow',refresh);
  window.addEventListener('songline:page-swap',refresh);
  document.addEventListener('visibilitychange',function(){ if(!document.hidden) refresh(); });
  window.SonglinePrivacy = {allows:function(category){return category === 'statistics' && allows();},open:open};
  if(!allows()) clearStatisticsStorage();
  if(!choice) open();
})();
