/* Friends 星座场景：数据、节点、连线与轻量交互相互独立。 */
(function(){
  'use strict';

  var VERSION = '22.3.0';
  // 新朋友没有配置位置时会顺序使用这些预设，保持构图可预测而不是随机散点。
  var DESKTOP_POSITIONS = [[15,28],[31,17],[58,24],[75,43],[68,71],[29,72],[12,57],[47,82]];
  var MOBILE_POSITIONS = [[16,29],[67,21],[82,45],[60,60],[20,66],[43,82],[82,83],[12,48]];
  // 以稳定 key 描述关系；数据新增后仍可在这里显式补边，不依赖 DOM 顺序。
  var CONSTELLATION_EDGES = [
    ['mxbt','three'], ['three','songline'], ['songline','mishi'],
    ['mishi','scanf'], ['scanf','zxlyzq'], ['mxbt','scanf']
  ];

  function clean(value){ return String(value == null ? '' : value).trim().replace(/^['"]|['"]$/g, ''); }
  function key(value){ return clean(value).toLowerCase().replace(/[\s\u3000]+/g, '-').replace(/[^\w\-\u4e00-\u9fff]/g, ''); }
  function url(value, fallback){
    value = clean(value);
    if(!value) return fallback || '';
    return /^(https?:\/\/|\/)/.test(value) ? value : '/' + value.replace(/^\/+/, '');
  }
  function profileURL(value, fallback){
    value = url(value, fallback);
    if(/^https?:\/\//.test(value)) return value;
    // 旧数据可能是中文裸路径，也可能已经是 %E5... 形式。
    // 逐段先解码再编码，避免 encodeURI 将已有的 % 变成 %25（双重编码）。
    return value.split('/').map(function(segment){
      if(!segment) return segment;
      try{ return encodeURIComponent(decodeURIComponent(segment)); }
      catch(e){ return encodeURIComponent(segment).replace(/%25/g, '%'); }
    }).join('/');
  }
  function toArray(value){
    if(Array.isArray(value)) return value.map(clean).filter(Boolean);
    if(typeof value !== 'string') return [];
    try{ var parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.map(clean).filter(Boolean) : []; }catch(e){}
    return value.split(/[\s,，;；|]+/).map(clean).filter(Boolean);
  }
  function date(value){
    var found = clean(value).match(/\d{4}-\d{2}-\d{2}/);
    return found ? found[0].replace(/-/g, '.') : '—';
  }
  function normalize(raw){
    return (raw || []).map(function(item, index){
      item = item || {};
      var name = clean(item.name || item.display_name || item.displayName || item.username || ('朋友 ' + (index + 1)));
      var id = key(item.id || item.slug || item.username || name);
      return {
        id:id,
        index:index,
        username:clean(item.username),
        name:name,
        bio:clean(item.bio) || '这个朋友还没有写简介。',
        avatar:url(item.avatar, '/uploads/admin/main_logo.png'),
        href:profileURL(item.url || item.href, '/friends/' + encodeURIComponent(clean(item.slug || name)) + '/'),
        count:Number(item.post_count || item.postCount || 0),
        updated:date(item.updated_at || item.updatedAt),
        links:toArray(item.links || item.relations)
      };
    }).filter(function(friend){ return friend.id && !/^(admin|root|system|test|demo)$/.test(friend.id); });
  }
  function inlineData(){
    var node = document.getElementById('friend-galaxy-data');
    if(!node) return [];
    try{ return JSON.parse(node.textContent || '[]'); }catch(e){ return []; }
  }
  // 内嵌数据是构建期合并后的唯一来源：不能再让旧静态快照覆盖第三方节点。
  function friendData(){
    // 数据已经由 Hugo 内嵌到当前页面，不需要再经过 Promise 微任务。
    // 公开站某些导航/过场时序下，异步回调会在页面完成前被跳过，导致只保留
    // 服务端的头像保底节点，而星链和悬浮卡片从未开始构建。
    return inlineData();
  }
  function escapeHtml(value){ return clean(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  function init(root){
    root = root || document;
    var shell = root.querySelector ? root.querySelector('[data-friend-galaxy]') : null;
    if(!shell || shell.dataset.friendGalaxyReady === VERSION) return;
    shell.dataset.friendGalaxyReady = VERSION;

    // 页面内 JSON 与 Hugo 本次构建使用同一份合并结果。
    var data = friendData();
    // 初始直开和站内换页会处于不同的文档/过场时机；线上环境中此处的
    // isConnected/version 二次判断曾错误地把刚标记为 ready 的星图跳过。
    // 首层去重已经完成，拿到内嵌数据后直接构建即可。
    build(shell, normalize(data));
  }

  function build(shell, friends){
    var stage = shell.querySelector('[data-galaxy-stage]');
    var lines = shell.querySelector('[data-galaxy-lines]');
    var nodeLayer = shell.querySelector('[data-galaxy-nodes]');
    var hoverCard = shell.querySelector('[data-galaxy-hover-card]');
    var hoverAvatar = shell.querySelector('[data-hover-avatar]');
    var hoverName = shell.querySelector('[data-hover-name]');
    var hoverBio = shell.querySelector('[data-hover-bio]');
    var core = shell.querySelector('[data-center-open]');
    var coreImage = shell.querySelector('[data-center-avatar]');
    var coreName = shell.querySelector('[data-center-name]');
    var profile = shell.querySelector('[data-galaxy-profile]');
    var profileName = shell.querySelector('[data-center-name-display]');
    var profileBio = shell.querySelector('[data-center-bio]');
    var profileCount = shell.querySelector('[data-center-count]');
    var profileUpdated = shell.querySelector('[data-center-updated]');
    var profileLink = shell.querySelector('[data-center-link]');
    var empty = shell.querySelector('[data-galaxy-empty]');
    var input = shell.querySelector('#friendGalaxySearch');
    var submit = shell.querySelector('[data-friend-search-submit]');
    var results = shell.querySelector('[data-galaxy-results]');
    if(!stage || !lines || !nodeLayer || !core) return;

    if(!friends.length){
      if(empty){ empty.hidden = false; empty.textContent = '还没有可显示的朋友数据。'; }
      return;
    }

    var host = friends.filter(function(friend){ return /^(songline|song-line)$/.test(friend.id) || friend.username.toLowerCase() === 'songline'; })[0] || friends[0];
    var visibleFriends = friends.filter(function(friend){ return friend !== host; });
    var byKey = Object.create(null);
    friends.forEach(function(friend){ [friend.id, friend.username, friend.name].forEach(function(value){ if(key(value)) byKey[key(value)] = friend; }); });
    var focused = host;
    var selected = host;
    var nodeById = Object.create(null);
    var resizeFrame = 0;

    // 星图通过百分比定位，但图片、字体和移动端可视视口会在首帧后继续稳定。
    // 统一收敛到同一轮布局，保证 SVG 线端永远读取头像的最终圆心。
    function scheduleLayout(){
      window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(layout);
    }
    function settleLayout(){
      scheduleLayout();
      window.requestAnimationFrame(scheduleLayout);
    }

    function safeImage(image, source){
      if(!image) return;
      image.onerror = function(){ if(image.src.indexOf('/uploads/admin/main_logo.png') < 0) image.src = '/uploads/admin/main_logo.png'; };
      image.onload = settleLayout;
      image.src = source;
    }
    function setProfile(friend){
      if(!friend) return;
      focused = friend;
      if(profileName) profileName.textContent = friend.name;
      if(profileBio) profileBio.textContent = friend.bio;
      if(profileCount) profileCount.textContent = friend.count + (friend.count === 1 ? ' POST' : ' POSTS');
      if(profileUpdated) profileUpdated.textContent = 'LAST UPDATE · ' + friend.updated;
      if(profileLink) profileLink.href = friend.href;
      shell.dataset.focusedFriend = friend.id;
      updateLineState(friend);
    }
    function showHoverCard(friend, anchor){
      if(!hoverCard || !anchor) return;
      safeImage(hoverAvatar, friend.avatar);
      hoverAvatar.alt = friend.name;
      hoverName.textContent = friend.name;
      hoverBio.textContent = friend.bio;
      hoverCard.hidden = false;
      var stageRect = stage.getBoundingClientRect();
      var anchorRect = anchor.getBoundingClientRect();
      var cardWidth = hoverCard.offsetWidth || 280;
      var cardHeight = hoverCard.offsetHeight || 98;
      var onRight = anchorRect.left - stageRect.left > stageRect.width * 0.57;
      var x = onRight ? anchorRect.left - stageRect.left - cardWidth - 18 : anchorRect.right - stageRect.left + 18;
      var y = anchorRect.top - stageRect.top + anchorRect.height * .5 - cardHeight * .5;
      x = Math.max(16, Math.min(stageRect.width - cardWidth - 16, x));
      y = Math.max(16, Math.min(stageRect.height - cardHeight - 16, y));
      hoverCard.style.left = Math.round(x) + 'px';
      hoverCard.style.top = Math.round(y) + 'px';
    }
    function hideHoverCard(){ if(hoverCard) hoverCard.hidden = true; }
    function setHost(){
      safeImage(coreImage, host.avatar);
      if(coreName) coreName.textContent = host.name;
      core.onclick = function(){ window.location.href = host.href; };
      core.addEventListener('pointerenter', function(){ showHoverCard(host, core); });
      core.addEventListener('pointerleave', hideHoverCard);
      core.addEventListener('focus', function(){ showHoverCard(host, core); });
      core.addEventListener('blur', hideHoverCard);
    }
    function edgeFor(a, b){ return [a.id, b.id].sort().join(':'); }
    function configuredEdges(){
      var edges = [];
      var seen = Object.create(null);
      function add(a, b){
        if(!a || !b || a === b) return;
        var edge = edgeFor(a,b);
        if(seen[edge]) return;
        seen[edge] = true;
        edges.push([a,b]);
      }
      CONSTELLATION_EDGES.forEach(function(pair){ add(byKey[key(pair[0])], byKey[key(pair[1])]); });
      friends.forEach(function(friend){ friend.links.forEach(function(target){ add(friend, byKey[key(target)]); }); });
      // 没有关系数据时，维持一个稀疏、非放射的星座链。
      if(!edges.length){
        var chain = [host].concat(visibleFriends);
        chain.forEach(function(friend, index){ if(index) add(chain[index - 1], friend); });
        if(chain.length > 3) add(chain[0], chain[Math.min(3, chain.length - 1)]);
      }
      return edges;
    }
    var edges = configuredEdges();

    function createNodes(){
      nodeLayer.innerHTML = '';
      visibleFriends.forEach(function(friend, index){
        var node = document.createElement('button');
        node.type = 'button';
        node.className = 'friends-constellation__node';
        node.dataset.friendId = friend.id;
        node.dataset.position = String(index);
        node.setAttribute('aria-label', '查看 ' + friend.name + ' 的星图标注');
        node.innerHTML = '<span class="friends-constellation__node-halo" aria-hidden="true"></span><img alt=""><span class="friends-constellation__node-name"></span>';
        safeImage(node.querySelector('img'), friend.avatar);
        node.querySelector('.friends-constellation__node-name').textContent = friend.name;
        // 不以 hover media query 判断设备：二合一设备也可能连接鼠标。
        node.addEventListener('pointerenter', function(){ setProfile(friend); showHoverCard(friend, node); });
        node.addEventListener('pointerleave', function(){ setProfile(selected); hideHoverCard(); });
        node.addEventListener('focus', function(){ setProfile(friend); showHoverCard(friend, node); });
        node.addEventListener('blur', function(){ if(!isTouch()){ setProfile(selected); hideHoverCard(); } });
        node.addEventListener('click', function(event){
          event.preventDefault();
          if(selected === friend){ window.location.href = friend.href; return; }
          selected = friend;
          setProfile(friend);
          showHoverCard(friend, node);
          node.classList.add('is-selected');
          Object.keys(nodeById).forEach(function(id){ nodeById[id].classList.toggle('is-selected', id === friend.id); });
        });
        nodeLayer.appendChild(node);
        nodeById[friend.id] = node;
      });
    }
    function isTouch(){ return window.matchMedia && window.matchMedia('(hover: none)').matches; }
    function presetFor(index){
      var presets = window.matchMedia && window.matchMedia('(max-width: 760px)').matches ? MOBILE_POSITIONS : DESKTOP_POSITIONS;
      if(index < presets.length) return presets[index];
      var angle = (-Math.PI / 2) + (index * (Math.PI * 2 / Math.max(visibleFriends.length, 1)));
      return [50 + Math.cos(angle) * 34, 50 + Math.sin(angle) * 32];
    }
    function positionNodes(){
      visibleFriends.forEach(function(friend, index){
        var node = nodeById[friend.id];
        var point = presetFor(index);
        node.style.left = point[0] + '%';
        node.style.top = point[1] + '%';
      });
    }
    function drawLines(){
      var stageRect = stage.getBoundingClientRect();
      // 过场期间 main 会缩放；getBoundingClientRect 会得到缩放后的视觉尺寸，
      // 而 SVG viewBox 必须使用未缩放的布局尺寸。否则过场结束后节点已回到
      // 正常大小，连线仍停留在缩小后的坐标系中。
      var layoutWidth = stage.clientWidth || stageRect.width;
      var layoutHeight = stage.clientHeight || stageRect.height;
      if(!stageRect.width || !stageRect.height || !layoutWidth || !layoutHeight) return;
      lines.setAttribute('viewBox', '0 0 ' + Math.round(layoutWidth) + ' ' + Math.round(layoutHeight));
      lines.innerHTML = '';
      var centers = Object.create(null);
      centers[host.id] = centerOf(core, stageRect, layoutWidth, layoutHeight);
      visibleFriends.forEach(function(friend){ centers[friend.id] = centerOf(nodeById[friend.id], stageRect, layoutWidth, layoutHeight); });
      edges.forEach(function(edge){
        var from = centers[edge[0].id], to = centers[edge[1].id];
        if(!from || !to) return;
        var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', Math.round(from.x)); line.setAttribute('y1', Math.round(from.y));
        line.setAttribute('x2', Math.round(to.x)); line.setAttribute('y2', Math.round(to.y));
        line.setAttribute('data-edge', edgeFor(edge[0], edge[1]));
        line.setAttribute('class', 'friends-constellation__line');
        lines.appendChild(line);
      });
      updateLineState(focused);
    }
    function centerOf(element, container, layoutWidth, layoutHeight){
      if(!element) return null;
      // 线必须命中可见头像圆心，而不是包含文字标签的 button 外框中心。
      var visual = element.querySelector('img') || element;
      var rect = visual.getBoundingClientRect();
      return {
        x:(rect.left - container.left + rect.width / 2) * layoutWidth / container.width,
        y:(rect.top - container.top + rect.height / 2) * layoutHeight / container.height
      };
    }
    function updateLineState(friend){
      Array.prototype.forEach.call(lines.querySelectorAll('[data-edge]'), function(line){
        var related = line.getAttribute('data-edge').split(':').indexOf(friend.id) >= 0;
        line.classList.toggle('is-related', related);
      });
      Object.keys(nodeById).forEach(function(id){ nodeById[id].classList.toggle('is-related', id === friend.id); });
    }
    function layout(){
      if(!stage.isConnected) return;
      positionNodes();
      window.requestAnimationFrame(drawLines);
    }
    function renderSearch(){
      var query = clean(input && input.value).toLowerCase();
      if(!results) return;
      results.innerHTML = '';
      if(!query) return;
      var matches = friends.filter(function(friend){ return [friend.name, friend.username, friend.id].join(' ').toLowerCase().indexOf(query) >= 0; });
      var status = document.createElement('p');
      status.textContent = matches.length ? ('定位到 ' + matches.length + ' 颗星') : '没有找到对应的星';
      results.appendChild(status);
      matches.forEach(function(friend){
        var item = document.createElement('button');
        item.type = 'button'; item.className = 'friends-constellation__search-result';
        item.innerHTML = '<span></span><small></small>';
        item.querySelector('span').textContent = friend.name;
        item.querySelector('small').textContent = friend.username || 'FRIEND';
        item.onclick = function(){
          selected = friend;
          setProfile(friend);
          if(nodeById[friend.id]) nodeById[friend.id].focus();
        };
        results.appendChild(item);
      });
    }

    createNodes();
    setHost();
    setProfile(host);
    settleLayout();
    if(window.ResizeObserver) new ResizeObserver(scheduleLayout).observe(stage);
    else window.addEventListener('resize', scheduleLayout, {passive:true});
    if(window.visualViewport) window.visualViewport.addEventListener('resize', scheduleLayout, {passive:true});
    if(document.fonts && document.fonts.ready) document.fonts.ready.then(settleLayout);
    if(document.readyState === 'complete') settleLayout();
    else window.addEventListener('load', settleLayout, {once:true});
    // main 的入场只影响合成层，ResizeObserver 不会感知它结束；在最终帧再对齐一次。
    window.addEventListener('songline:page-transition-end', function(){
      if(!stage.isConnected) return;
      window.requestAnimationFrame(function(){
        window.requestAnimationFrame(function(){
          layout();
          window.setTimeout(layout, 48);
        });
      });
    });
    if(submit) submit.addEventListener('click', renderSearch);
    if(input){ input.addEventListener('input', renderSearch); input.addEventListener('keydown', function(event){ if(event.key === 'Enter') renderSearch(); }); }
  }

  window.SonglineInitFriendGalaxy = init;
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){ init(document); }, {once:true});
  else init(document);
  window.addEventListener('songline:page-swap', function(event){ init((event.detail && event.detail.root) || document); });
})();
