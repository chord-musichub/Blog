(function(){'use strict';function createLeaderboard(options){options=options||{};var topScoresEl=options.topScoresEl,syncBestBtn=options.syncBestBtn,scoresCacheKey=options.cacheKey,topScores=[],submittedScores={};if(!scoresCacheKey||typeof options.getBest!=='function')return null;    function getPlayerID(){
      try{
        var id = localStorage.getItem(PLAYER_KEY);
        if(!id){
          id = 'g2048-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
          localStorage.setItem(PLAYER_KEY, id);
        }
        return id;
      }catch(e){
        return 'g2048-guest';
      }
    }

function game2048ScoreEndpoints(){
      var list = [
        '/write/api/tools/2048-scores',
        '/static/api/2048-scores',
        '/api/tools/2048-scores',
        '/api/2048-scores'
      ];
      try{
        var apiBase = String((window.BlogRuntimeConfig || {}).publicApiUrl || '').replace(/\/+$/, '');
        if(apiBase) list.push(apiBase + '/api/tools/2048-scores');
      }catch(e){}
      return Array.from(new Set(list));
    }

    function normalizeScores(raw){
      if(!Array.isArray(raw)) return [];
      return raw.map(function(item){
        if(typeof item === 'number') return {score:item, created_at:''};
        return item || {};
      }).map(function(item){
        return {
          score:Number(item.score || 0),
          created_at:item.created_at || ''
        };
      }).filter(function(item){
        return Number.isFinite(item.score) && item.score > 0;
      }).sort(function(a, b){
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

    function requestScores(url, options){
      var absolute = /^https?:\/\//i.test(url);
      var baseOptions = absolute ? {mode:'cors', credentials:'omit'} : {credentials:'same-origin'};
      return fetch(url, Object.assign(baseOptions, options || {})).then(function(res){
        if(!res.ok) throw new Error('bad status ' + res.status + ' @ ' + url);
        return res.json();
      }).then(function(data){
        window.Songline2048ScoresDebug = {endpoint:url, data:data, time:new Date().toISOString()};
        return data;
      });
    }

    function requestScoresAny(options){
      var endpoints = game2048ScoreEndpoints();
      var index = 0;
      var lastError = null;

      function next(){
        if(index >= endpoints.length){
          throw lastError || new Error('all 2048 score endpoints failed');
        }
        var url = endpoints[index++];
        return requestScores(url, options).catch(function(err){
          lastError = err;
          return next();
        });
      }

      return next();
    }

    function fetchTopScores(){
      loadCachedTopScores();
      renderTopScores();
      return requestScoresAny().then(function(data){
        topScores = normalizeScores(data.scores);
        cacheTopScores();
        renderTopScores();
      }).catch(function(){
        renderTopScores();
      });
    }

    function recordTopScore(value, reason){
      value = Number(value || 0);
      if(!Number.isFinite(value) || value <= 0) return;
      var key = String(value) + ':' + (reason || 'score');
      if(submittedScores[key]) return;
      submittedScores[key] = true;

      return requestScoresAny({
        method:'POST',
        headers:{'Content-Type':'application/json'},
        credentials:'same-origin',
        body:JSON.stringify({score:value, player_id:getPlayerID()})
      }).then(function(data){
        topScores = normalizeScores(data.scores);
        cacheTopScores();
        renderTopScores();
        if(syncBestBtn){
          syncBestBtn.textContent = reason === 'local-best' ? '已同步本地最佳' : '成绩已同步';
          window.setTimeout(function(){ syncBestBtn.textContent = '同步本地最佳'; }, 1600);
        }
      }).catch(function(){
        renderTopScores();
        if(syncBestBtn){
          syncBestBtn.textContent = '同步失败，重试';
          window.setTimeout(function(){ syncBestBtn.textContent = '同步本地最佳'; }, 1800);
        }
      });
    }

    function syncLocalBest(){
      var localBest = Number(localStorage.getItem(options.bestKey) || options.getBest() || 0) || 0;
      if(localBest > 0){
        return recordTopScore(localBest, 'local-best');
      }
      if(syncBestBtn){
        syncBestBtn.textContent = '暂无本地最佳';
        window.setTimeout(function(){ syncBestBtn.textContent = '同步本地最佳'; }, 1400);
      }
    }

return {fetchTopScores:fetchTopScores,recordTopScore:recordTopScore,syncLocalBest:syncLocalBest,resetSubmission:function(){submittedScores={};}};}window.SonglineCreate2048Leaderboard=createLeaderboard;})();