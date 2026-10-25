// The original summary remains readable, selectable and available to assistive
// technology. Only an aria-hidden overlay types; it never edits author content.
(function(){
  'use strict';
  if(window.SonglineInitArticleHeading) return;
  var active = null;
  function init(root){
    var scope = root || document;
    if(scope !== document && scope.isConnected === false) return;
    var summary = scope.querySelector('[data-article-summary]');
    // Markdown hydration scans the reader subtree, which has no heading.
    // An unrelated scan must not complete a live summary elsewhere on the page.
    if(!summary){
      if(active && !active.summary.isConnected) active.finish();
      return;
    }
    if(active && active.summary === summary) return;
    if(active) active.finish();
    if(!summary || summary.dataset.summaryState === 'complete') return;
    var source = summary.querySelector('[data-article-summary-source]');
    var text = source && source.textContent || '';
    var motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if(!text.trim() || motion.matches){ summary.dataset.summaryState = 'complete'; return; }
    var segments = window.Intl && Intl.Segmenter
      ? Array.from(new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text), function(part){ return part.segment; })
      : Array.from(text);
    var visual = document.createElement('span');
    visual.className = 'article-heading__summary-visual';
    visual.setAttribute('aria-hidden','true');
    var typed = document.createTextNode('');
    var cursor = document.createElement('span');
    cursor.className = 'article-heading__cursor';
    visual.append(typed,cursor);summary.appendChild(visual);
    summary.classList.add('is-typing');summary.dataset.summaryState = 'waiting';
    var frame = 0, started = null, disposed = false, shown = 0;
    var viewportObserver = null, coverObserver = null;
    var duration = Math.min(20500, Math.max(4100, segments.length * 148));
    function releaseWaiting(){
      if(viewportObserver) viewportObserver.disconnect();
      if(coverObserver) coverObserver.disconnect();
      viewportObserver = coverObserver = null;
      window.removeEventListener('scroll', start);
      window.removeEventListener('resize', start);
    }
    function finish(){
      if(disposed) return;
      disposed = true;window.cancelAnimationFrame(frame);frame = 0;
      releaseWaiting();
      summary.classList.remove('is-typing');summary.dataset.summaryState = 'complete';visual.remove();
      window.removeEventListener('songline:page-transition-end', start);
      window.removeEventListener('songline:page-transition-start', finish);
      window.removeEventListener('songline:page-swap', onSwap);
      window.removeEventListener('pagehide', finish);
      document.removeEventListener('visibilitychange', onVisibility);
      motion.removeEventListener('change', onMotion);
      if(active && active.summary === summary) active = null;
    }
    function tick(now){
      frame = 0;
      if(disposed) return;
      if(!summary.isConnected || document.hidden){ finish(); return; }
      if(started === null) started = now;
      var elapsed = now - started - 410;
      // Reveal the first character after the cursor lead-in, then let each
      // following character settle. Even a one-character summary holds its cursor.
      var count = elapsed < 0 ? 0 : Math.min(segments.length, Math.max(1, Math.floor(elapsed / duration * segments.length)));
      if(count !== shown){ typed.nodeValue = segments.slice(0,count).join('');shown = count; }
      if(elapsed >= duration){ finish(); return; }
      frame = window.requestAnimationFrame(tick);
    }
    function start(){
      if(disposed || frame || document.hidden) return;
      var root = document.documentElement;
      if(['songline-page-transitioning','is-scene-preparing','document-cover'].some(function(name){ return root.classList.contains(name); })
        || document.querySelector('#songline-scene-entry-loader')) return;
      var box = summary.getBoundingClientRect();
      if(box.bottom <= 72 || box.top >= window.innerHeight - 64 || box.width <= 0 || box.height <= 0) return;
      releaseWaiting();
      summary.dataset.summaryState = 'typing';frame = window.requestAnimationFrame(tick);
    }
    function onSwap(){ if(!summary.isConnected) finish(); }
    function onVisibility(){
      if(document.hidden){ if(summary.dataset.summaryState === 'typing') finish(); }
      else start();
    }
    function onMotion(){ if(motion.matches) finish(); }
    active = {summary:summary,finish:finish};
    window.addEventListener('songline:page-transition-end', start);
    window.addEventListener('songline:page-transition-start', finish);
    window.addEventListener('songline:page-swap', onSwap);
    window.addEventListener('pagehide', finish);
    document.addEventListener('visibilitychange', onVisibility);
    motion.addEventListener('change', onMotion);
    if(window.IntersectionObserver){
      viewportObserver = new window.IntersectionObserver(start, {rootMargin:'-72px 0px -64px 0px'});
      viewportObserver.observe(summary);
    }else{
      window.addEventListener('scroll', start, {passive:true});
      window.addEventListener('resize', start);
    }
    // Direct entry and full-document arrivals can still be covered after module
    // initialization. Observe only root classes and its loader removal.
    if(window.MutationObserver){
      coverObserver = new window.MutationObserver(start);
      coverObserver.observe(document.documentElement, {attributes:true,attributeFilter:['class'],childList:true});
    }
    start();
  }
  window.SonglineInitArticleHeading = init;
  init(document);
})();
