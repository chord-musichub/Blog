(function(){
  'use strict';
  function createLeaderboard(options){
    options=options||{};
    const topScoresEl=options.topScoresEl;
    const syncBestBtn=options.syncBestBtn;
    const bestKey=options.bestKey;
    let topScores=[];
    let submittedScores={};
    let autoSyncedLocalBest=false;
    if(!bestKey||typeof options.getBest!=='function') return null;
    function getPlayerID(){
      try{
        let id = localStorage.getItem(playerKey);
        if(!id){
          id = 'snake-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
          localStorage.setItem(playerKey, id);
        }
        return id;
      }catch(e){ return 'snake-guest'; }
    }

    function setSyncButtonText(text, delay){
      if(!syncBestBtn) return;
      syncBestBtn.textContent = text;
      if(delay){
        window.setTimeout(function(){ syncBestBtn.textContent = '同步本地最佳'; }, delay);
      }
    }

    function snakeScoreEndpoints(){
      const list = [
        '/write/api/tools/snake-scores',
        '/static/api/snake-scores',
        '/api/tools/snake-scores',
        '/api/snake-scores'
      ];
      try{
        const apiBase = String((window.BlogRuntimeConfig || {}).publicApiUrl || '').replace(/\/+$/, '');
        if(apiBase) list.push(apiBase + '/api/tools/snake-scores');
      }catch(e){}
      return Array.from(new Set(list));
    }

    function normalizeScores(raw){
      if(!Array.isArray(raw)) return [];
      return raw.map(function(item){
        if(typeof item === 'number') return { score:item, created_at:'' };
        return item || {};
      }).map(function(item){
        return {
          score:Number(item.score || 0),
          created_at:item.created_at || ''
        };
      }).filter(function(item){
        return Number.isFinite(item.score) && item.score > 0;
      }).sort(function(a,b){
        if(b.score === a.score) return String(a.created_at).localeCompare(String(b.created_at));
        return b.score - a.score;
      }).slice(0, 3);
    }

    function cacheTopScores(){
      try{ localStorage.setItem(scoresCacheKey, JSON.stringify(topScores)); }catch(e){}
    }

    function loadCachedTopScores(){
      try{ topScores = normalizeScores(JSON.parse(localStorage.getItem(scoresCacheKey) || '[]')); }
      catch(e){ topScores = []; }
    }

    async function requestScores(url, options){
      const absolute = /^https?:\/\//i.test(url);
      const baseOptions = absolute ? { mode:'cors', credentials:'omit' } : { credentials:'same-origin' };
      const res = await fetch(url, Object.assign(baseOptions, options || {}));
      if(!res.ok) throw new Error('bad status ' + res.status + ' @ ' + url);
      const data = await res.json();
      window.SonglineSnakeScoresDebug = { endpoint:url, data:data, time:new Date().toISOString() };
      return data;
    }

    async function requestScoresAny(options){
      const endpoints = snakeScoreEndpoints();
      let lastError = null;
      for(const url of endpoints){
        try{ return await requestScores(url, options); }
        catch(err){ lastError = err; }
      }
      throw lastError || new Error('all score endpoints failed');
    }

    function renderTopScores(){
      if(!topScoresEl) return;
      if(!topScores.length){
        topScoresEl.innerHTML = '<li>暂无记录</li>';
        return;
      }
      topScoresEl.innerHTML = topScores.map(function(item, index){
        return '<li><span>第 ' + (index + 1) + ' 名</span><b>' + item.score + '</b></li>';
      }).join('');
    }

    async function fetchTopScores(){
      loadCachedTopScores();
      renderTopScores();
      try{
        const data = await requestScoresAny();
        topScores = normalizeScores(data.scores);
        cacheTopScores();
        renderTopScores();
      }catch(e){
        renderTopScores();
      }
    }

    async function recordTopScore(value, reason){
      value = Number(value || 0);
      if(!Number.isFinite(value) || value <= 0) return;
      const submitKey = String(value) + ':' + (reason || 'score');
      if(submittedScores[submitKey]) return;
      try{
        const payload = {
          method:'POST',
          headers:{ 'Content-Type':'application/json' },
          credentials:'same-origin',
          body:JSON.stringify({ score:value, player_id:getPlayerID() })
        };
        const data = await requestScoresAny(payload);
        submittedScores[submitKey] = true;
        topScores = normalizeScores(data.scores);
        cacheTopScores();
        renderTopScores();
        if(reason === 'local-best') setSyncButtonText('已同步本地最佳', 1500);
      }catch(e){
        renderTopScores();
        if(reason === 'local-best') setSyncButtonText('同步失败，重试', 1700);
      }
    }

    function syncLocalBest(manual){
      const localBest = Number(localStorage.getItem(bestKey) || options.getBest() || 0) || 0;
      if(!manual && autoSyncedLocalBest) return;
      autoSyncedLocalBest = true;
      if(localBest > 0) return recordTopScore(localBest, 'local-best');
      if(manual) setSyncButtonText('暂无本地最佳', 1300);
    }

    return {fetchTopScores:fetchTopScores,recordTopScore:recordTopScore,syncLocalBest:syncLocalBest};
  }
  window.SonglineCreateSnakeLeaderboard=createLeaderboard;
})();