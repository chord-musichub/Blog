/* v20.0.8：朋友星图重构兜底版
   目标：数据已有 7 人时，无论旧 CSS/旧 DOM 怎么干扰，都稳定渲染多节点关系图。
   只使用专属 slv2004-* 类名，避开旧 friend-node/friend-galaxy 规则污染。
*/
(function(){
  'use strict';
  var VERSION = '20.20.6';

  function ready(fn){
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, {once:true});
    else fn();
  }

  function clean(value){
    var s = String(value == null ? '' : value).trim();
    for(var i = 0; i < 2; i++){
      if(s.length >= 2 && ((s[0] === '"' && s[s.length - 1] === '"') || (s[0] === "'" && s[s.length - 1] === "'"))){
        s = s.slice(1, -1).trim();
      }
    }
    return s.replace(/\\n/g, '\n').replace(/\\r/g, '').replace(/\\"/g, '"').replace(/\\\\/g, '\\').trim();
  }

  function normalize(value){
    return String(value == null ? '' : value)
      .toLowerCase()
      .replace(/[\u3000\t\r\n]+/g, ' ')
      .replace(/[，。！？、；：,.!?;:|/\\()[\]{}<>《》“”‘’`~@#$%^&*_+=-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function slugify(value){
    var raw = clean(value);
    var ascii = normalize(raw).replace(/\s+/g, '-').replace(/^-+|-+$/g, '');
    if(ascii) return ascii;
    return raw ? encodeURIComponent(raw).replace(/%/g, '').slice(0, 42).toLowerCase() : 'friend';
  }

  function toUrl(value, fallback){
    var s = clean(value);
    if(!s || s === 'null' || s === 'undefined') return fallback || '';
    if(/^https?:\/\//.test(s) || s[0] === '/') return s;
    return '/' + s.replace(/^\/+/, '');
  }

  function arrayOf(value){
    if(Array.isArray(value)) return value.map(clean).filter(Boolean);
    if(typeof value === 'string'){
      var s = clean(value);
      if(!s) return [];
      try{
        var parsed = JSON.parse(s);
        if(Array.isArray(parsed)) return parsed.map(clean).filter(Boolean);
      }catch(e){}
      return s.split(/[\s,，;；|]+/).map(clean).filter(Boolean);
    }
    return [];
  }

  function parseInlineFriends(){
    var el = document.getElementById('friend-galaxy-data');
    if(!el) return [];
    try{
      var parsed = JSON.parse(el.textContent || '[]');
      if(Array.isArray(parsed)) return parsed;
      if(parsed && typeof parsed === 'object'){
        if(Array.isArray(parsed.friends)) return parsed.friends;
        if(Array.isArray(parsed.items)) return parsed.items;
        return Object.keys(parsed).map(function(k){ return parsed[k]; }).filter(function(v){ return v && typeof v === 'object'; });
      }
    }catch(e){
      console.warn('[friend-galaxy:' + VERSION + '] inline 数据解析失败', e);
    }
    return [];
  }

  function fetchJson(url){
    if(!url || !window.fetch) return Promise.resolve([]);
    return fetch(url, {cache:'no-store', credentials:'same-origin'})
      .then(function(res){ return res.ok ? res.json() : []; })
      .then(function(data){
        if(Array.isArray(data)) return data;
        if(data && Array.isArray(data.friends)) return data.friends;
        if(data && Array.isArray(data.items)) return data.items;
        if(data && typeof data === 'object'){
          return Object.keys(data).map(function(k){ return data[k]; }).filter(function(v){ return v && typeof v === 'object'; });
        }
        return [];
      })
      .catch(function(e){
        console.warn('[friend-galaxy:' + VERSION + '] public JSON 读取失败', e);
        return [];
      });
  }

  function text(value, fallback){
    var s = clean(value);
    return s || fallback || '';
  }

  function shortText(value, max){
    var s = clean(value).replace(/\s+/g, ' ');
    if(!s) return '这个朋友还没有写简介。';
    return s.length > max ? s.slice(0, max).trim() + '…' : s;
  }

  function dateText(value){
    var s = clean(value);
    if(!s) return '最近更新 —';
    var m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    return '最近更新 ' + (m ? m[1] : s.slice(0, 10));
  }

  function safeImg(img, src){
    if(!img) return;
    img.onerror = function(){
      if(img.getAttribute('src') !== '/uploads/admin/main_logo.png') img.src = '/uploads/admin/main_logo.png';
    };
    img.src = src || '/uploads/admin/main_logo.png';
  }

  function escapeHtml(s){
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }


  function compactKey(value){
    return normalize(value).replace(/\s+/g, '-');
  }

  function isSystemFriendRaw(f){
    f = f || {};
    function pick(){
      for(var i = 0; i < arguments.length; i++){
        if(arguments[i] in f) return f[arguments[i]];
      }
      var lower = {};
      Object.keys(f).forEach(function(k){ lower[String(k).toLowerCase()] = k; });
      for(var j = 0; j < arguments.length; j++){
        var kk = lower[String(arguments[j]).toLowerCase()];
        if(kk) return f[kk];
      }
      return '';
    }
    var username = compactKey(pick('username','Username'));
    var id = compactKey(pick('id','ID'));
    var slug = compactKey(pick('slug','Slug'));
    var nameRaw = clean(pick('name','Name','display_name','DisplayName','displayName','title','Title'));
    var name = compactKey(nameRaw);
    var role = compactKey(pick('role','Role'));
    var accountType = compactKey(pick('account_type','AccountType','type','Type'));

    var exactSystem = {
      'admin': true,
      'root': true,
      'system': true,
      'notice': true,
      'announcement': true,
      'announcer': true,
      'gonggao': true,
      'bot': true,
      'site-admin': true,
      'site-admins': true,
      'manager': true,
      'test': true,
      'tests': true,
      'demo': true,
      'dummy': true,
      'sample': true,
      'ceshi': true,
      'test-user': true,
      'demo-user': true
    };
    if(exactSystem[username] || exactSystem[id] || exactSystem[slug]) return true;
    if(accountType === 'system' || role === 'system' || role === 'announcer' || role === 'notice' || role === 'gonggao') return true;
    if(/^(管理员|公告员|公告|系统|系统账号|站点公告|测试|测试账号|测试用户|临时账号|测试用户)$/.test(nameRaw)) return true;
    if(/管理员|公告员|系统账号|测试账号|临时账号/.test(nameRaw)) return true;
    return false;
  }

  function normalizeFriends(raw){
    var used = Object.create(null);
    var friends = [];
    (raw || []).forEach(function(f, index){
      f = f || {};
      if(isSystemFriendRaw(f)) return;
      var username = text(f.username || f.Username);
      var name = text(f.name || f.Name || f.display_name || f.DisplayName || f.displayName, username || ('朋友 ' + (index + 1)));
      var id = text(f.id || f.ID || f.slug || f.Slug || username || name);
      id = slugify(id);
      var base = id, n = 1;
      while(used[id]){ n++; id = base + '-' + n; }
      used[id] = true;
      var slug = text(f.slug || f.Slug, id);
      var links = arrayOf(f.links || f.Links || f.relations || f.Relations || f.friends || f.Friends);
      friends.push({
        index: friends.length,
        id: id,
        slug: slugify(slug),
        username: username,
        name: name,
        bio: text(f.bio || f.Bio, '这个朋友还没有写简介。'),
        avatar: toUrl(f.avatar || f.Avatar, '/uploads/admin/main_logo.png'),
        href: toUrl(f.url || f.URL || f.href || f.Href, '/friends/' + slugify(slug) + '/'),
        count: Number(f.post_count || f.postCount || f.PostCount || 0),
        updated: text(f.updated_at || f.updatedAt || f.UpdatedAt),
        titles: arrayOf(f.post_titles || f.postTitles || f.PostTitles),
        links: links.map(slugify)
      });
    });
    return friends;
  }

  function installStage(shell){
    var oldStage = shell.querySelector('[data-galaxy-stage]') || shell.querySelector('.friend-galaxy-stage');
    if(!oldStage) return null;

    var profile = oldStage.querySelector('[data-galaxy-profile]');
    var centerOpen = oldStage.querySelector('[data-center-open]');
    var centerAvatar = oldStage.querySelector('[data-center-avatar]');
    var centerName = oldStage.querySelector('[data-center-name]');
    var centerBio = oldStage.querySelector('[data-center-bio]');
    var centerCount = oldStage.querySelector('[data-center-count]');
    var centerUpdated = oldStage.querySelector('[data-center-updated]');
    var centerLink = oldStage.querySelector('[data-center-link]');

    oldStage.className = 'slv2004-stage slv2007-stage';
    oldStage.setAttribute('data-slv2004-stage', '');
    shell.setAttribute('data-friend-galaxy-ready', VERSION);
    oldStage.innerHTML = '';

    var lines = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    lines.setAttribute('class', 'slv2004-lines');
    lines.setAttribute('data-slv2004-lines', '');
    lines.setAttribute('aria-hidden', 'true');

    var nodes = document.createElement('div');
    nodes.className = 'slv2004-nodes';
    nodes.setAttribute('data-slv2004-nodes', '');

    if(!centerOpen){
      centerOpen = document.createElement('button');
      centerOpen.type = 'button';
      centerOpen.setAttribute('data-center-open', '');
      centerOpen.setAttribute('aria-label', '进入当前朋友主页');
    }
    // v20.0.8：清掉旧模板遗留的 friend-core-orbit / 旧头像结构，避免返回上一页时闪旧样式，也避免旧圆层造成错位。
    var oldAvatar = centerAvatar || centerOpen.querySelector('[data-center-avatar]');
    var avatarSrc = oldAvatar ? oldAvatar.getAttribute('src') : '';
    var avatarAlt = oldAvatar ? oldAvatar.getAttribute('alt') : '';
    centerOpen.className = 'slv2004-core';
    centerOpen.setAttribute('data-slv2004-core', '');
    centerOpen.type = 'button';
    centerOpen.innerHTML = '<span class="slv2007-core-frame" aria-hidden="true"><img data-center-avatar alt=""></span>';
    centerAvatar = centerOpen.querySelector('[data-center-avatar]');
    if(avatarSrc) centerAvatar.src = avatarSrc;
    if(avatarAlt) centerAvatar.alt = avatarAlt;

    if(!profile){
      profile = document.createElement('aside');
      profile.setAttribute('data-galaxy-profile', '');
      profile.innerHTML = '<h2 data-center-name></h2><p data-center-bio></p><div class="meta-row"><span data-center-count></span><span data-center-updated></span></div><a data-center-link href="/friends/">进入主页</a>';
      centerName = profile.querySelector('[data-center-name]');
      centerBio = profile.querySelector('[data-center-bio]');
      centerCount = profile.querySelector('[data-center-count]');
      centerUpdated = profile.querySelector('[data-center-updated]');
      centerLink = profile.querySelector('[data-center-link]');
    }
    profile.className = 'slv2004-profile';
    if(centerLink) centerLink.className = 'btn slv2004-center-link';

    oldStage.appendChild(lines);
    oldStage.appendChild(nodes);
    oldStage.appendChild(centerOpen);
    oldStage.appendChild(profile);

    return {stage:oldStage, lineSvg:lines, nodeLayer:nodes, centerOpen:centerOpen, centerAvatar:centerAvatar || centerOpen.querySelector('[data-center-avatar]'), centerName:centerName || profile.querySelector('[data-center-name]'), centerBio:centerBio || profile.querySelector('[data-center-bio]'), centerCount:centerCount || profile.querySelector('[data-center-count]'), centerUpdated:centerUpdated || profile.querySelector('[data-center-updated]'), centerLink:centerLink || profile.querySelector('[data-center-link]')};
  }

  function initWithRaw(shell, raw){
    var parts = installStage(shell);
    if(!parts) return;

    var stage = parts.stage;
    var nodeLayer = parts.nodeLayer;
    var lineSvg = parts.lineSvg;
    var results = shell.querySelector('[data-galaxy-results]');
    var input = shell.querySelector('#friendGalaxySearch');
    var submitBtn = shell.querySelector('[data-friend-search-submit], .friend-search-submit');
    var centerOpen = parts.centerOpen;
    var centerAvatar = parts.centerAvatar;
    var centerName = parts.centerName;
    var centerBio = parts.centerBio;
    var centerCount = parts.centerCount;
    var centerUpdated = parts.centerUpdated;
    var centerLink = parts.centerLink;

    var friends = normalizeFriends(raw);
    console.info('[friend-galaxy:' + VERSION + '] friends count =', friends.length);
    shell.dataset.friendCount = String(friends.length);

    var byKey = Object.create(null);
    friends.forEach(function(f){
      [f.id, f.slug, f.username, f.name].forEach(function(k){
        var key = slugify(k);
        if(key) byKey[key] = f.index;
      });
    });

    var active = 0;
    var nodes = [];
    var positions = [];

    function stageSize(){
      var rect = stage.getBoundingClientRect();
      var viewportMobile = window.matchMedia && window.matchMedia('(max-width: 760px)').matches;
      var w = Math.max(300, Math.round(rect.width || stage.clientWidth || 980));
      var h = Math.max(viewportMobile ? 330 : 560, Math.round(rect.height || stage.clientHeight || (viewportMobile ? 320 : 700)));
      var desktop = !viewportMobile && w >= 900;
      return {
        w:w,
        h:h,
        desktop:desktop,
        mobile:viewportMobile,
        cx:desktop ? w * 0.36 : w * 0.50,
        cy:desktop ? h * 0.46 : (viewportMobile ? h * 0.33 : h * 0.31),
        reserveRight:desktop ? Math.min(430, Math.max(320, w * 0.36)) : 0
      };
    }

    function setStatus(message, kind){
      if(!results) return;
      results.innerHTML = '';
      var div = document.createElement('div');
      div.className = 'friend-search-status' + (kind ? ' is-' + kind : '');
      div.textContent = message;
      results.appendChild(div);
    }

    function showEmpty(message){
      nodeLayer.innerHTML = '<div class="slv2004-empty">' + escapeHtml(message) + '</div>';
      setStatus(message, 'empty');
    }

    if(!friends.length){
      showEmpty('还没有朋友数据。请检查 data/friends.json 或 /friends-data.json。');
      return;
    }

    function makeLine(x1, y1, x2, y2, cls){
      var l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      l.setAttribute('x1', String(Math.round(x1)));
      l.setAttribute('y1', String(Math.round(y1)));
      l.setAttribute('x2', String(Math.round(x2)));
      l.setAttribute('y2', String(Math.round(y2)));
      l.setAttribute('class', cls || 'slv2004-line slv2004-center-line');
      lineSvg.appendChild(l);
    }

    function explicitEdges(arr){
      var allow = Object.create(null);
      arr.forEach(function(i){ allow[i] = true; });
      var edges = [];
      var seen = Object.create(null);
      function add(a, b, cls){
        if(a === b || !allow[a] || !allow[b]) return;
        var k = a < b ? a + ':' + b : b + ':' + a;
        if(seen[k]) return;
        seen[k] = true;
        edges.push([a, b, cls || 'slv2004-line slv2004-web-line is-explicit']);
      }
      friends.forEach(function(f, i){
        if(!f.links || !f.links.length) return;
        f.links.forEach(function(link){
          var target = byKey[slugify(link)];
          if(typeof target === 'number') add(i, target, 'slv2004-line slv2004-web-line is-explicit');
        });
      });
      return edges;
    }

    function createNodes(){
      nodeLayer.innerHTML = '';
      nodes = friends.map(function(f){
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'slv2004-node';
        btn.dataset.index = String(f.index);
        btn.dataset.friendId = f.id;
        btn.dataset.friendName = f.name;
        btn.dataset.friendUsername = f.username;
        btn.setAttribute('aria-label', '聚焦朋友：' + f.name);
        btn.innerHTML = '<span class="slv2004-node-ring" aria-hidden="true"></span><img alt=""><span class="slv2004-node-name"></span>';
        safeImg(btn.querySelector('img'), f.avatar);
        btn.querySelector('.slv2004-node-name').textContent = f.name;
        btn.addEventListener('click', function(e){
          e.preventDefault();
          e.stopPropagation();
          if(active === f.index) window.location.href = f.href;
          else setCenter(f.index, {result:true});
        });
        nodeLayer.appendChild(btn);
        return btn;
      });
    }

    function layout(){
      var s = stageSize();
      lineSvg.setAttribute('viewBox', '0 0 ' + s.w + ' ' + s.h);
      lineSvg.setAttribute('width', String(s.w));
      lineSvg.setAttribute('height', String(s.h));
      lineSvg.innerHTML = '';
      positions = friends.map(function(){ return {x:s.cx, y:s.cy}; });
      centerOpen.style.left = Math.round(s.cx) + 'px';
      centerOpen.style.top = Math.round(s.cy) + 'px';

      var arr = friends.map(function(f){ return f.index; }).filter(function(i){ return i !== active; });
      var count = arr.length;
      var usableW = Math.max(260, s.w - s.reserveRight);
      var base = Math.min(usableW, s.h);
      var rx = base * (s.desktop ? 0.34 : (s.mobile ? 0.30 : 0.30));
      var ry = base * (s.desktop ? 0.30 : (s.mobile ? 0.22 : 0.25));

      function hashSeed(str){
        var h = 2166136261;
        str = String(str || '');
        for(var i = 0; i < str.length; i++){
          h ^= str.charCodeAt(i);
          h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
        }
        return (h >>> 0) / 4294967295;
      }

      var anchorsDesktop = [-2.34, -1.82, -1.28, -0.76, -0.18, 0.56, 1.18, 1.82, 2.44];
      var anchorsMobile  = [-2.18, -1.52, -0.96, -0.42, 0.28, 0.92, 1.46, 2.08];
      var anchors = (s.desktop ? anchorsDesktop : anchorsMobile).slice();
      if(count > anchors.length){
        for(var extra = anchors.length; extra < count; extra++){
          anchors.push(-Math.PI + (Math.PI * 2 * (extra + 0.5) / count));
        }
      }
      arr.sort(function(a, b){
        var sa = hashSeed(friends[a].id + ':' + friends[a].name);
        var sb = hashSeed(friends[b].id + ':' + friends[b].name);
        return sa - sb;
      });
      arr.forEach(function(index, pos){
        var f = friends[index];
        var seed = hashSeed(f.id + ':' + f.name + ':' + pos);
        var angle = anchors[pos % anchors.length];
        angle += (seed - 0.5) * (s.desktop ? 0.30 : 0.22);
        var radial = 0.84 + seed * 0.28 + ((pos % 3) - 1) * 0.04;
        var localRx = rx * radial;
        var localRy = ry * (0.88 + (1 - seed) * 0.22);
        var driftX = (seed - 0.5) * (s.desktop ? 22 : 14);
        var driftY = (0.5 - seed) * (s.desktop ? 18 : 12) + (pos % 2 ? 8 : -6);
        var x = s.cx + Math.cos(angle) * localRx + driftX;
        var y = s.cy + Math.sin(angle) * localRy + driftY;
        var maxX = Math.max(88, s.w - 88 - s.reserveRight);
        x = Math.max(84, Math.min(maxX, x));
        y = Math.max(82, Math.min(s.h - 118, y));
        positions[index] = {x:x, y:y};
      });

      nodes.forEach(function(el, index){
        var isActive = index === active;
        var p = positions[index] || {x:s.cx, y:s.cy};
        el.classList.toggle('is-active', isActive);
        el.classList.remove('is-search-hit');
        if(isActive){
          el.style.display = 'none';
          el.style.visibility = 'hidden';
          el.style.opacity = '0';
          el.style.pointerEvents = 'none';
        }else{
          el.style.display = 'flex';
          el.style.visibility = 'visible';
          el.style.opacity = '1';
          el.style.pointerEvents = 'auto';
          el.style.left = Math.round(p.x) + 'px';
          el.style.top = Math.round(p.y) + 'px';
          el.style.transform = 'translate(-50%,-50%) scale(' + (s.mobile ? '0.46' : '1') + ')';
        }
      });

      arr.forEach(function(index){
        var p = positions[index];
        if(p) makeLine(s.cx, s.cy, p.x, p.y, 'slv2004-line slv2004-center-line');
      });
      explicitEdges(arr.concat([active])).forEach(function(edge){
        var a = positions[edge[0]], b = positions[edge[1]];
        if(a && b) makeLine(a.x, a.y, b.x, b.y, edge[2]);
      });
      if(arr.length > 2){
        arr.forEach(function(index, i){
          var next = arr[(i + 1) % arr.length];
          var a = positions[index], b = positions[next];
          if(a && b) makeLine(a.x, a.y, b.x, b.y, 'slv2004-line slv2004-web-line is-fallback');
        });
      }
      if(arr.length > 4){
        arr.forEach(function(index, i){
          if(i % 2) return;
          var next = arr[(i + 2) % arr.length];
          var a = positions[index], b = positions[next];
          if(a && b) makeLine(a.x, a.y, b.x, b.y, 'slv2004-line slv2004-web-line is-dim is-fallback');
        });
      }
    }

    function setCenter(index, opts){
      opts = opts || {};
      index = Math.max(0, Math.min(friends.length - 1, Number(index) || 0));
      active = index;
      var f = friends[active];
      safeImg(centerAvatar, f.avatar);
      if(centerAvatar) centerAvatar.alt = f.name;
      if(centerName) centerName.textContent = f.name;
      if(centerBio){ centerBio.textContent = shortText(f.bio, 88); centerBio.title = f.bio; }
      if(centerCount) centerCount.textContent = '文章 ' + (f.count || 0) + ' 篇';
      if(centerUpdated) centerUpdated.textContent = dateText(f.updated);
      if(centerLink) centerLink.href = f.href;
      centerOpen.onclick = function(e){ e.preventDefault(); window.location.href = f.href; };
      shell.classList.remove('friend-search-not-found');
      stage.classList.remove('is-switching');
      void stage.offsetWidth;
      stage.classList.add('is-switching');
      window.clearTimeout(stage.__switchTimer);
      stage.__switchTimer = window.setTimeout(function(){ stage.classList.remove('is-switching'); }, 360);
      layout();
      if(opts.result !== false) renderDefaultResults();
    }

    function scoreFriend(q){
      var phrase = normalize(q);
      if(!phrase) return [];
      var terms = phrase.split(' ').filter(Boolean);
      return friends.map(function(f){
        var name = normalize(f.name);
        var username = normalize(f.username);
        var id = normalize(f.id + ' ' + f.slug);
        var hay = [name, username, id].join(' ');
        var score = 0;
        if(name === phrase) score += 1200;
        if(username === phrase) score += 1100;
        if(id === phrase) score += 1000;
        if(name.indexOf(phrase) >= 0) score += 800;
        if(username.indexOf(phrase) >= 0) score += 760;
        if(id.indexOf(phrase) >= 0) score += 720;
        if(terms.length && terms.every(function(t){ return hay.indexOf(t) >= 0; })) score += 450;
        return {friend:f, score:score};
      }).filter(function(x){ return x.score > 0; }).sort(function(a,b){
        return b.score - a.score || b.friend.count - a.friend.count || a.friend.index - b.friend.index;
      });
    }

    function renderResultList(matches, q){
      if(!results) return;
      results.innerHTML = '';
      var status = document.createElement('div');
      status.className = 'friend-search-status';
      status.textContent = q ? ('搜索“' + clean(q) + '”：找到 ' + matches.length + ' 位朋友') : ('共 ' + friends.length + ' 位朋友');
      results.appendChild(status);
      matches.forEach(function(item){
        var f = item.friend || item;
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'friend-result' + (f.index === active ? ' is-current' : '');
        btn.innerHTML = '<img alt=""><span><b></b><small></small></span><em></em>';
        safeImg(btn.querySelector('img'), f.avatar);
        btn.querySelector('b').textContent = f.name;
        btn.querySelector('small').textContent = shortText(f.bio, 28) + ' · ' + f.count + ' 篇文章';
        btn.querySelector('em').textContent = f.index === active ? '当前' : '聚焦';
        btn.addEventListener('click', function(e){ e.preventDefault(); setCenter(f.index, {result:true}); });
        results.appendChild(btn);
      });
    }

    function renderDefaultResults(){
      renderResultList(friends.map(function(f){ return {friend:f, score:1}; }), '');
    }

    function notFound(){
      shell.classList.add('friend-search-not-found');
      nodes.forEach(function(n){ n.classList.remove('is-search-hit'); });
      if(results) results.innerHTML = '<div class="friend-search-status is-not-found">不存在该用户</div>';
      layout();
    }

    function doSearch(e){
      if(e){ e.preventDefault(); e.stopPropagation(); }
      var q = input ? input.value : '';
      if(window.SonglineSearchRefresh) window.SonglineSearchRefresh('搜索朋友中');
      shell.classList.remove('friend-search-not-found');
      nodes.forEach(function(n){ n.classList.remove('is-search-hit'); });
      if(!normalize(q)){
        setCenter(active, {result:false});
        renderDefaultResults();
        return;
      }
      var found = scoreFriend(q);
      if(!found.length){ notFound(); return; }
      var f = found[0].friend;
      if(nodes[f.index]) nodes[f.index].classList.add('is-search-hit');
      setCenter(f.index, {result:false});
      renderResultList(found, q);
      if(results) results.scrollIntoView({behavior:'smooth', block:'nearest'});
    }

    function reset(e){
      if(e){ e.preventDefault(); e.stopPropagation(); }
      if(input) input.value = '';
      shell.classList.remove('friend-search-not-found');
      nodes.forEach(function(n){ n.classList.remove('is-search-hit'); });
      setCenter(active, {result:false});
      renderDefaultResults();
      if(window.SonglineSearchRefresh) window.SonglineSearchRefresh('已重置');
    }

    if(submitBtn){
      submitBtn.setAttribute('data-no-page-loading', '');
      submitBtn.onclick = doSearch;
    }
    if(input){
      input.onkeydown = function(e){
        if(e.key === 'Enter') doSearch(e);
        else if(e.key === 'Escape') reset(e);
      };
      input.onsearch = function(e){ if(!input.value) reset(e); };
    }

    createNodes();
    setCenter(0, {result:false});
    renderDefaultResults();

    function revealAfterStableLayout(){
      layout();
      if(window.requestAnimationFrame){
        window.requestAnimationFrame(function(){
          layout();
          window.requestAnimationFrame(function(){
            layout();
            shell.classList.remove('slv2010-booting');
            shell.classList.add('slv2010-ready');
          });
        });
      }else{
        window.setTimeout(function(){
          layout();
          shell.classList.remove('slv2010-booting');
          shell.classList.add('slv2010-ready');
        }, 80);
      }
    }

    revealAfterStableLayout();
    window.addEventListener('resize', layout);
    window.addEventListener('pageshow', function(evt){
      if(evt && evt.persisted){
        shell.classList.add('slv2010-booting');
        shell.classList.remove('slv2010-ready');
        revealAfterStableLayout();
      }
    });
    window.setTimeout(layout, 240);

    window.SonglineFriendGalaxySearch = doSearch;
    window.SonglineFriendGalaxyReset = reset;
  }

  function init(){
    var shell = document.querySelector('[data-friend-galaxy]');
    if(!shell) return;
    if(shell.dataset.friendGalaxyReady === VERSION) return;
    shell.dataset.friendGalaxyReady = VERSION;
    shell.classList.add('slv2010-booting');
    shell.classList.remove('slv2010-ready');

    var inline = parseInlineFriends();
    var src = shell.getAttribute('data-friends-src') || '/friends-data.json?v=20.3.5';
    fetchJson(src).then(function(publicData){
      var raw = publicData.length >= inline.length ? publicData : inline;
      console.info('[friend-galaxy:' + VERSION + '] 数据选择 public=', publicData.length, 'inline=', inline.length, 'using=', raw.length);
      initWithRaw(shell, raw);
    });
  }

  window.SonglineInitFriendGalaxy = init;
  ready(init);
  window.setTimeout(init, 160);

  window.addEventListener('pageshow', function(){
    init();
  });

  window.addEventListener('songline:page-swap', function(){
    window.setTimeout(init, 40);
    window.setTimeout(init, 180);
  });
})();
