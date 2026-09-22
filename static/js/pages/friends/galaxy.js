/* Friends 星座场景：数据、节点、连线与轻量交互相互独立。 */
(function(){
  'use strict';

  var VERSION = '22.15.0';
  // 新朋友没有配置位置时会顺序使用这些预设，保持构图可预测而不是随机散点。
  // A wide outer ring plus a loose inner ring keeps the growing friend list
  // readable.  The old presets clustered around the core (especially the
  // 38/44, 43/63 and 57/62 points), which made portraits and links stack up.
  var DESKTOP_POSITIONS = [[20,20],[37,14],[56,14],[74,21],[82,37],[84,56],[78,74],[64,86],[46,88],[28,82],[18,68],[17,47],[31,34],[43,28],[61,29],[72,48],[63,68],[37,68]];
  // 手机星图本身比视窗更大；把预设铺满一整圈，初始视野保持清爽，
  // 其余星位仍可以通过拖动到达，避免头像和点击区相互挤压。
  var MOBILE_POSITIONS = [[20,24],[40,14],[60,16],[78,25],[84,43],[80,62],[70,80],[52,87],[32,82],[17,68],[14,48],[20,35],[35,31],[50,38],[65,48],[59,68],[45,76],[30,59]];
  // 历史默认关系只用于尚未在公开 links.json 配置星链的旧数据；
  // 一旦配置了关系图，连线完全由 JSON 驱动，避免前端写死的线无法修改。
  var DEFAULT_CONSTELLATION_EDGES = [
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
  function normalize(raw, linkConfig){
    return (raw || []).map(function(item, index){
      item = item || {};
      var name = clean(item.name || item.display_name || item.displayName || item.username || ('朋友 ' + (index + 1)));
      var id = key(item.id || item.slug || item.username || name);
      var username = clean(item.username);
      // 外部节点没有填写第三方地址时，只作为星图卡片存在；不能伪造一个
      // /friends/... 的本地地址，否则第二次点击会进入不存在的资料页。
      var explicitHref = clean(item.url || item.href);
      // links.json 同时支持站内 username 和第三方节点 id；
      // hasOwnProperty 允许显式写 [] 来清空某位成员的全部连线。
      var linkOwner = username && Object.prototype.hasOwnProperty.call(linkConfig || {}, username) ? username : id;
      var hasConfiguredLinks = !!linkOwner && Object.prototype.hasOwnProperty.call(linkConfig || {}, linkOwner);
      return {
        id:id,
        index:index,
        username:username,
        name:name,
        bio:clean(item.bio) || '这个朋友还没有写简介。',
        avatar:url(item.avatar, '/uploads/admin/friends/user-null.png'),
        href:explicitHref ? profileURL(explicitHref) : '',
        count:Number(item.post_count || item.postCount || 0),
        updated:date(item.updated_at || item.updatedAt),
        configuredLinks:hasConfiguredLinks,
        links:hasConfiguredLinks ? toArray(linkConfig[linkOwner]) : toArray(item.links || item.relations)
      };
    }).filter(function(friend){ return friend.id && !/^(admin|root|system|test|demo)$/.test(friend.id); });
  }
  function inlineData(){
    var node = document.getElementById('friend-galaxy-data');
    if(!node) return [];
    try{ return JSON.parse(node.textContent || '[]'); }catch(e){ return []; }
  }
  function inlineLinkConfig(){
    var node = document.getElementById('friend-galaxy-link-data');
    if(!node) return {};
    try{
      var value = JSON.parse(node.textContent || '{}');
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    }catch(e){ return {}; }
  }
  // 内嵌数据是构建期合并后的唯一来源：不能再让旧静态快照覆盖第三方节点。
  function friendData(){
    // 数据已经由 Hugo 内嵌到当前页面，不需要再经过 Promise 微任务。
    // 公开站某些导航/过场时序下，异步回调会在页面完成前被跳过，导致只保留
    // 服务端的头像保底节点，而星链和悬浮卡片从未开始构建。
    return { friends:inlineData(), linkConfig:inlineLinkConfig() };
  }
  function escapeHtml(value){ return clean(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  function init(root){
    root = root || document;
    var shell = root.querySelector ? root.querySelector('[data-friend-galaxy]') : null;
    if(!shell || shell.dataset.friendGalaxyReady === VERSION) return;
    // 无刷新回到朋友页时，先释放上一份已被替换的星图运行时。
    if(typeof window.__songlineFriendGalaxyCleanup === 'function') window.__songlineFriendGalaxyCleanup();
    shell.dataset.friendGalaxyReady = VERSION;

    // 页面内 JSON 与 Hugo 本次构建使用同一份合并结果。
    var data = friendData();
    // 初始直开和站内换页会处于不同的文档/过场时机；线上环境中此处的
    // isConnected/version 二次判断曾错误地把刚标记为 ready 的星图跳过。
    // 首层去重已经完成，拿到内嵌数据后直接构建即可。
    build(shell, normalize(data.friends, data.linkConfig));
  }

  function build(shell, friends){
    var stage = shell.querySelector('[data-galaxy-stage], .friends-constellation__sky');
    var zoomControls = shell.querySelector('.friends-constellation__zoom');
    var world = shell.querySelector('[data-galaxy-world], .friends-constellation__world');
    // 线上旧版 Hugo 的 HTML 压缩器会移除 SVG 上的空 data-* 属性，
    // 但 class 会完整保留；这里以 class 作为兼容回退，不能再只依赖 data 属性。
    var lines = shell.querySelector('[data-galaxy-lines], .friends-constellation__lines');
    var nodeLayer = shell.querySelector('[data-galaxy-nodes], .friends-constellation__nodes');
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
    if(!stage || !world || !lines || !nodeLayer || !core) return;

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
    var settleTimer = 0;
    var zoomFrame = 0;
    var zoomAnimation = null;
    var stageObserver = null;
    var lineFrame = 0;
    var compactQuery = window.matchMedia('(max-width: 980px)');
    // 工作区比视窗更大；只平移这个世界层，背景、回忆入口和 hover 卡片保持固定。
    var pan = { x:0, y:0, targetX:0, targetY:0, zoom:1, inertiaFrame:0, inertiaLast:0, inertiaX:0, inertiaY:0, dragFrame:0, drag:null, nextX:0, nextY:0, suppressUntil:0 };
    var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var lens = {items:[],edges:[],width:0,height:0,worldWidth:0,worldHeight:0,left:0,top:0};

    // One coordinate projection for the real hit targets and SVG edges. No cloned
    // scene or per-frame DOM measurements; only the resize/layout pass reads geometry.
    function paintLens(){
      if(!lens.width || !lens.items.length) return;
      // Focus is a position, not a velocity: tying it to per-frame dx/dy made
      // identical positions alternate in size as pointer events sped up/slowed.
      var focusX=lens.width/2, focusY=lens.height/2;
      // 遮罩使用 CSS 中原来的固定中心和模糊半径。只投影头像和连线，
      // 避免拖动/惯性期间每帧改变全屏 backdrop-filter 与 mask 的纹理。
      var centers=Object.create(null);
      lens.items.forEach(function(item){
        var screenX=lens.left+lens.worldWidth/2+(item.x-lens.worldWidth/2)*pan.zoom+pan.x;
        var screenY=lens.top+lens.worldHeight/2+(item.y-lens.worldHeight/2)*pan.zoom+pan.y;
        var vx=screenX-focusX, vy=screenY-focusY;
        var distance=Math.hypot(vx/(lens.width*.54),vy/(lens.height*.54));
        var influence=Math.pow(Math.max(0,1-distance*distance),2);
        // Make the lens unmistakable without changing the world geometry:
        // the avatar at the focus reaches roughly 1.48x, while the reduced
        // motion path still provides a quieter but visible 1.28x emphasis.
        var gain=reducedMotion ? .28 : .48;
        var ox=vx*influence*.16/pan.zoom, oy=vy*influence*.16/pan.zoom;
        setStyle(item.element, '--lens-x',ox.toFixed(2)+'px');
        setStyle(item.element, '--lens-y',oy.toFixed(2)+'px');
        setStyle(item.element, '--lens-scale',(1+gain*influence).toFixed(3));
        centers[item.id]={x:item.x+ox,y:item.y+oy};
      });
      lens.edges.forEach(function(edge){
        var a=centers[edge.a],b=centers[edge.b];
        setCoordinate(edge, 'x1',a.x);setCoordinate(edge, 'y1',a.y);
        setCoordinate(edge, 'x2',b.x);setCoordinate(edge, 'y2',b.y);
      });
    }
    function setStyle(element, name, value){
      if(element.style.getPropertyValue(name) !== value) element.style.setProperty(name, value);
    }
    function setCoordinate(edge, name, value){
      value = value.toFixed(2);
      if(edge[name] === value) return;
      edge[name] = value;
      edge.line.setAttribute(name, value);
    }

    // 星图通过百分比定位，但图片、字体和移动端可视视口会在首帧后继续稳定。
    // 统一收敛到同一轮布局，保证 SVG 线端永远读取头像的最终圆心。
    function scheduleLayout(){
      if(!stage.isConnected || resizeFrame) return;
      resizeFrame = window.requestAnimationFrame(function(){ resizeFrame = 0; layout(); });
    }
    function settleLayout(){
      if(!stage.isConnected) return;
      scheduleLayout();
      window.requestAnimationFrame(scheduleLayout);
    }

    function panBounds(){
      return {
        x:Math.max(0, (lens.worldWidth * pan.zoom - lens.width) / 2),
        y:Math.max(0, (lens.worldHeight * pan.zoom - lens.height) / 2)
      };
    }
    function clampPan(x, y){
      var bounds = panBounds();
      return { x:Math.max(-bounds.x, Math.min(bounds.x, x)), y:Math.max(-bounds.y, Math.min(bounds.y, y)) };
    }
    function paintPan(){
      world.style.transform = 'translate3d(' + pan.x.toFixed(2) + 'px,' + pan.y.toFixed(2) + 'px,0) scale(' + pan.zoom.toFixed(3) + ')';
      // 透镜必须随画布平移实时更新，否则手机端经过中心的头像不会被放大。
      // 性能削减改由移动端关闭流星、星云漂移与高强度模糊承担。
      paintLens();
    }
    function isMoving(){ return !!(pan.drag || pan.inertiaFrame || zoomAnimation); }
    function syncMotionState(){ stage.classList.toggle('is-moving', isMoving()); }
    function movePan(x, y){
      var next = clampPan(x, y);
      pan.targetX = next.x; pan.targetY = next.y;
      pan.x = next.x; pan.y = next.y; paintPan();
    }
    function stopInertia(){
      if(pan.inertiaFrame) window.cancelAnimationFrame(pan.inertiaFrame);
      pan.inertiaFrame = 0; pan.inertiaLast = 0; pan.inertiaX = 0; pan.inertiaY = 0;
      paintLens();
      syncMotionState();
    }
    function coastPan(now){
      var elapsed = Math.min(32, Math.max(8, now - pan.inertiaLast));
      pan.inertiaLast = now;
      var next = clampPan(pan.x + pan.inertiaX * elapsed, pan.y + pan.inertiaY * elapsed);
      if(Math.abs(next.x - pan.x) < .01) pan.inertiaX = 0;
      if(Math.abs(next.y - pan.y) < .01) pan.inertiaY = 0;
      pan.x = next.x; pan.y = next.y; pan.targetX = next.x; pan.targetY = next.y;
      paintPan();
      var friction = Math.pow(.90, elapsed / 16.67);
      pan.inertiaX *= friction; pan.inertiaY *= friction;
      if(Math.abs(pan.inertiaX) + Math.abs(pan.inertiaY) < .018){ stopInertia(); return; }
      pan.inertiaFrame = window.requestAnimationFrame(coastPan);
    }
    function startInertia(velocityX, velocityY){
      stopInertia();
      if(reducedMotion || Math.abs(velocityX) + Math.abs(velocityY) < .05) return;
      pan.inertiaX = velocityX; pan.inertiaY = velocityY;
      pan.inertiaLast = performance.now();
      pan.inertiaFrame = window.requestAnimationFrame(coastPan);
      syncMotionState();
    }
    function onPointerDown(event){
      if(event.button !== undefined && event.button !== 0) return;
      // 头像也是画布的一部分：先记录起点，跨过阈值才接管为拖动；
      // 因此密集头像不会抢走拖拽，轻点仍保留为查看资料。
      if(pan.drag || event.isPrimary === false) return;
      var isGalaxyAvatar = event.target.closest && event.target.closest('.friends-constellation__node, .friends-constellation__core');
      if(event.target.closest && event.target.closest('a, button, input, textarea, select') && !isGalaxyAvatar) return;
      stopZoom(); stopInertia();
      hideHoverCard(); setProfile(selected);
      pan.drag = { id:event.pointerId, threshold:event.pointerType === 'touch' ? 10 : 5, x:event.clientX, y:event.clientY, originX:pan.targetX, originY:pan.targetY, lastX:event.clientX, lastY:event.clientY, lastAt:performance.now(), velocityX:0, velocityY:0, moved:false };
      syncMotionState();
      // 所有指针都在跨过拖动阈值后捕获，保留头像的原生点击目标。
    }
    function onPointerMove(event){
      if(!pan.drag || event.pointerId !== pan.drag.id) return;
      var dx = event.clientX - pan.drag.x, dy = event.clientY - pan.drag.y;
      if(!pan.drag.moved){
        if(Math.hypot(dx,dy) < pan.drag.threshold) return;
        pan.drag.moved = true;
        stage.setPointerCapture && stage.setPointerCapture(event.pointerId);
        stage.classList.add('is-dragging'); world.classList.add('is-dragging');
        event.preventDefault();
        hideHoverCard();
      }
      // 记录最近一段手势速度；松开后将其折算成有限距离的惯性目标。
      var now = performance.now();
      var elapsed = Math.max(8, now - pan.drag.lastAt);
      var instantX = (event.clientX - pan.drag.lastX) / elapsed;
      var instantY = (event.clientY - pan.drag.lastY) / elapsed;
      pan.drag.velocityX = pan.drag.velocityX * .68 + instantX * .32;
      pan.drag.velocityY = pan.drag.velocityY * .68 + instantY * .32;
      pan.drag.lastX = event.clientX; pan.drag.lastY = event.clientY; pan.drag.lastAt = now;
      pan.nextX = pan.drag.originX + dx; pan.nextY = pan.drag.originY + dy;
      // 高频移动每帧只绘制一次，节点增多后也不触发重复布局。
      if(!pan.dragFrame) pan.dragFrame = window.requestAnimationFrame(function(){
        pan.dragFrame = 0;
        if(pan.drag) movePan(pan.nextX, pan.nextY);
      });
    }
    function stopPan(event){
      if(!pan.drag || event && event.pointerId !== pan.drag.id) return;
      var moved = pan.drag.moved;
      var recent = performance.now() - pan.drag.lastAt < 100;
      var velocityX = recent ? Math.max(-1.8, Math.min(1.8, pan.drag.velocityX)) : 0;
      var velocityY = recent ? Math.max(-1.8, Math.min(1.8, pan.drag.velocityY)) : 0;
      if(pan.dragFrame){ window.cancelAnimationFrame(pan.dragFrame); pan.dragFrame = 0; movePan(pan.nextX, pan.nextY); }
      pan.drag = null;
      stage.classList.remove('is-dragging'); world.classList.remove('is-dragging');
      if(event && stage.releasePointerCapture && event.pointerId != null){ try{ stage.releasePointerCapture(event.pointerId); }catch(error){} }
      if(moved) pan.suppressUntil = Date.now() + 450;
      if(moved && (!event || event.type === 'pointerup')) startInertia(velocityX, velocityY);
      else paintLens();
      syncMotionState();
    }
    function preventNativeDrag(event){ event.preventDefault(); }
    function cancelPan(){
      if(pan.drag) stopPan({type:'pointercancel', pointerId:pan.drag.id});
      stopZoom();
      stopInertia();
    }
    function blockDragClick(event){
      if(Date.now() < pan.suppressUntil){ event.preventDefault(); event.stopPropagation(); }
    }
    function stopZoom(){
      if(zoomFrame) window.cancelAnimationFrame(zoomFrame);
      zoomFrame = 0; zoomAnimation = null;
      syncMotionState();
    }
    function animateZoom(zoom, x, y){
      stopZoom();
      if(reducedMotion){ pan.zoom = zoom; movePan(x, y); return; }
      zoomAnimation = {start:performance.now(), zoom:pan.zoom, x:pan.x, y:pan.y, toZoom:zoom, toX:x, toY:y};
      function step(now){
        if(!stage.isConnected){ stopZoom(); return; }
        var motion = zoomAnimation;
        var progress = Math.min(1, Math.max(0, (now - motion.start) / 260));
        var eased = 1 - Math.pow(1 - progress, 3);
        pan.zoom = motion.zoom + (motion.toZoom - motion.zoom) * eased;
        movePan(motion.x + (motion.toX - motion.x) * eased, motion.y + (motion.toY - motion.y) * eased);
        if(progress < 1) zoomFrame = window.requestAnimationFrame(step);
        else { zoomFrame = 0; zoomAnimation = null; syncMotionState(); }
      }
      zoomFrame = window.requestAnimationFrame(step);
      syncMotionState();
    }
    function onZoomControl(event){
      var button = event.target.closest('[data-galaxy-zoom]');
      if(!button) return;
      if(pan.drag) return;
      stopInertia(); hideHoverCard(); setProfile(selected);
      var action = button.dataset.galaxyZoom;
      var targetZoom = zoomAnimation ? zoomAnimation.toZoom : pan.zoom;
      var zoom = action === 'reset' ? 1 : Math.max(.72, Math.min(1.58, targetZoom * (action === 'in' ? 1.15 : 1/1.15)));
      var ratio = zoom / pan.zoom;
      animateZoom(zoom, action === 'reset' ? 0 : pan.x * ratio, action === 'reset' ? 0 : pan.y * ratio);
    }
    function onWheel(event){
      var delta = event.deltaY || event.deltaX;
      if(!delta) return;
      // Friends 是全屏画布，没有页面内纵向阅读内容；滚轮专门用于地图缩放。
      event.preventDefault();
      if(pan.drag) return;
      stopInertia(); hideHoverCard(); setProfile(selected);
      if(event.deltaMode === 1) delta *= 16;
      else if(event.deltaMode === 2) delta *= stage.clientHeight;
      var targetZoom = zoomAnimation ? zoomAnimation.toZoom : pan.zoom;
      var nextZoom = Math.max(.72, Math.min(1.58, targetZoom * Math.exp(-delta * .0015)));
      // Compare with the pending target, not the current frame: an opposite
      // wheel tick may cancel a zoom before its first animation frame runs.
      if(Math.abs(nextZoom - targetZoom) < .00001) return;
      // 在鼠标所在处缩放：计算缩放前该点相对世界中心的位置，并补偿平移。
      var stageRect = stage.getBoundingClientRect();
      var pointX = event.clientX - stageRect.left - stage.clientWidth / 2;
      var pointY = event.clientY - stageRect.top - stage.clientHeight / 2;
      var ratio = nextZoom / pan.zoom;
      var nextX = pointX - (pointX - pan.x) * ratio;
      var nextY = pointY - (pointY - pan.y) * ratio;
      animateZoom(nextZoom, nextX, nextY);
    }

    function safeImage(image, source){
      if(!image) return;
      image.onerror = function(){ if(image.src.indexOf('/uploads/admin/friends/user-null.png') < 0) image.src = '/uploads/admin/friends/user-null.png'; };
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
      if(!hoverCard || !anchor || isMoving()) return;
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
      core.addEventListener('pointerenter', function(event){ if(event.pointerType !== 'touch') showHoverCard(host, core); });
      core.addEventListener('pointerleave', hideHoverCard);
      core.addEventListener('focus', function(){ showHoverCard(host, core); });
      core.addEventListener('blur', hideHoverCard);
    }
    function edgeFor(a, b){ return [a.id, b.id].sort().join(':'); }
    function configuredEdges(){
      var edges = [];
      var seen = Object.create(null);
      var hasConfiguredGraphLinks = false;
      function add(a, b){
        if(!a || !b || a === b) return;
        var edge = edgeFor(a,b);
        if(seen[edge]) return;
        seen[edge] = true;
        edges.push([a,b]);
      }
      friends.forEach(function(friend){
        if(friend.configuredLinks && friend.links.length) hasConfiguredGraphLinks = true;
        friend.links.forEach(function(target){ add(friend, byKey[key(target)]); });
      });
      if(!hasConfiguredGraphLinks){
        DEFAULT_CONSTELLATION_EDGES.forEach(function(pair){ add(byKey[key(pair[0])], byKey[key(pair[1])]); });
      }
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
        node.querySelector('img').draggable = false;
        safeImage(node.querySelector('img'), friend.avatar);
        node.querySelector('.friends-constellation__node-name').textContent = friend.name;
        // 不以 hover media query 判断设备：二合一设备也可能连接鼠标。
        node.addEventListener('pointerenter', function(event){ if(!isMoving() && event.pointerType !== 'touch' && !isCompact()){ setProfile(friend); showHoverCard(friend, node); } });
        node.addEventListener('pointerleave', function(){ if(!isMoving()) setProfile(selected); hideHoverCard(); });
        node.addEventListener('focus', function(){ if(!isMoving()){ setProfile(friend); showHoverCard(friend, node); } });
        node.addEventListener('blur', function(){ if(!isMoving() && !isTouch() && !isCompact()){ setProfile(selected); hideHoverCard(); } });
        node.addEventListener('click', function(event){
          event.preventDefault();
          // 已选中节点只有在明确配置了地址时才可跳转；未填第三方连接的
          // 节点仍可查看悬浮信息和关系线，但不会发生空白/404 跳转。
          if(selected === friend){ if(friend.href) window.location.href = friend.href; return; }
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
    function isCompact(){ return compactQuery.matches; }
    function presetFor(index){
      var presets = window.matchMedia && window.matchMedia('(max-width: 760px)').matches ? MOBILE_POSITIONS : DESKTOP_POSITIONS;
      if(index < presets.length) return presets[index];
      var overflowIndex = index - presets.length;
      var overflowCount = Math.max(1, visibleFriends.length - presets.length);
      var angle = (-Math.PI / 2) + (overflowIndex * (Math.PI * 2 / overflowCount));
      return [50 + Math.cos(angle) * 43, 50 + Math.sin(angle) * 40];
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
      lineFrame = 0;
      if(!stage.isConnected) return;
      lens.items=[];lens.edges=[];
      var elements=[{id:host.id,element:core}].concat(visibleFriends.map(function(friend){return {id:friend.id,element:nodeById[friend.id]};}));
      // 先批量读取图片与按钮位置，再写入 transform-origin，避免读写交错。
      elements.forEach(function(item){
        item.element.style.setProperty('--lens-x','0px');item.element.style.setProperty('--lens-y','0px');item.element.style.setProperty('--lens-scale','1');
      });
      var worldRect = world.getBoundingClientRect();
      // 过场期间 main 会缩放；getBoundingClientRect 会得到缩放后的视觉尺寸，
      // 而 SVG viewBox 必须使用未缩放的布局尺寸。否则过场结束后节点已回到
      // 正常大小，连线仍停留在缩小后的坐标系中。
      var layoutWidth = world.clientWidth || worldRect.width;
      var layoutHeight = world.clientHeight || worldRect.height;
      if(!worldRect.width || !worldRect.height || !layoutWidth || !layoutHeight) return;
      lines.setAttribute('viewBox', '0 0 ' + Math.round(layoutWidth) + ' ' + Math.round(layoutHeight));
      lines.innerHTML = '';
      var centers = Object.create(null);
      centers[host.id] = centerOf(core, worldRect, layoutWidth, layoutHeight);
      visibleFriends.forEach(function(friend){ centers[friend.id] = centerOf(nodeById[friend.id], worldRect, layoutWidth, layoutHeight); });
      lens.width=stage.clientWidth;lens.height=stage.clientHeight;
      lens.worldWidth=layoutWidth;lens.worldHeight=layoutHeight;lens.left=world.offsetLeft;lens.top=world.offsetTop;
      elements.forEach(function(item){
        var img=item.element.querySelector('img');
        // The node's transform is centered on the avatar, not on the full
        // button (which also contains the name).  offsetTop is relative to
        // the image's own offset parent and was therefore wrong for the
        // absolutely-positioned core.  Use the two visual boxes while the
        // lens transform is reset so the scale keeps the avatar center fixed.
        var elementRect=item.element.getBoundingClientRect();
        var imageRect=img && img.getBoundingClientRect();
        var visualScale = worldRect.height / layoutHeight;
        var originY=(imageRect ? imageRect.top + imageRect.height/2 - elementRect.top : elementRect.height/2) / visualScale;
        item.originY = originY;
        lens.items.push({id:item.id,element:item.element,x:centers[item.id].x,y:centers[item.id].y});
      });
      elements.forEach(function(item){ setStyle(item.element, '--lens-origin-y',item.originY.toFixed(2)+'px'); });
      edges.forEach(function(edge){
        var from = centers[edge[0].id], to = centers[edge[1].id];
        if(!from || !to) return;
        var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', Math.round(from.x)); line.setAttribute('y1', Math.round(from.y));
        line.setAttribute('x2', Math.round(to.x)); line.setAttribute('y2', Math.round(to.y));
        line.setAttribute('data-edge', edgeFor(edge[0], edge[1]));
        line.setAttribute('class', 'friends-constellation__line');
        lines.appendChild(line);
        lens.edges.push({line:line,a:edge[0].id,b:edge[1].id});
      });
      paintLens();
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
      lens.width=stage.clientWidth;lens.height=stage.clientHeight;
      lens.worldWidth=world.clientWidth;lens.worldHeight=world.clientHeight;
      lens.left=world.offsetLeft;lens.top=world.offsetTop;
      movePan(pan.targetX, pan.targetY);
      positionNodes();
      window.cancelAnimationFrame(lineFrame);
      lineFrame = window.requestAnimationFrame(drawLines);
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

    function onWindowLoad(){ settleLayout(); }
    function onTransitionEnd(){
      if(!stage.isConnected) return;
      window.requestAnimationFrame(function(){
        window.requestAnimationFrame(function(){
          layout();
          window.clearTimeout(settleTimer);
          settleTimer = window.setTimeout(layout, 48);
        });
      });
    }
    function cleanup(){
      window.cancelAnimationFrame(resizeFrame);
      window.cancelAnimationFrame(lineFrame);
      window.clearTimeout(settleTimer);
      stopZoom();
      stopInertia();
      if(pan.dragFrame) window.cancelAnimationFrame(pan.dragFrame);
      pan.dragFrame = 0; pan.drag = null;
      syncMotionState();
      stage.classList.remove('is-dragging'); world.classList.remove('is-dragging');
      if(stageObserver) stageObserver.disconnect();
      window.removeEventListener('resize', scheduleLayout);
      if(window.visualViewport) window.visualViewport.removeEventListener('resize', scheduleLayout);
      window.removeEventListener('load', onWindowLoad);
      window.removeEventListener('songline:page-transition-end', onTransitionEnd);
      window.removeEventListener('songline:page-transition-start', onTransitionStart);
      stage.removeEventListener('pointerdown', onPointerDown);
      stage.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', stopPan, true);
      window.removeEventListener('pointercancel', stopPan, true);
      window.removeEventListener('blur', cancelPan);
      stage.removeEventListener('lostpointercapture', stopPan);
      stage.removeEventListener('dragstart', preventNativeDrag);
      stage.removeEventListener('click', blockDragClick, true);
      stage.removeEventListener('wheel', onWheel);
      if(zoomControls) zoomControls.removeEventListener('click', onZoomControl);
      if(window.__songlineFriendGalaxyCleanup === cleanup) window.__songlineFriendGalaxyCleanup = null;
    }
    function onTransitionStart(event){
      var from = event.detail && event.detail.from || '';
      if(from.indexOf('/friends/') === 0) cleanup();
    }

    createNodes();
    setHost();
    setProfile(host);
    // Publish positions synchronously so the shared loader can identify visible avatars.
    layout();
    settleLayout();
    if(window.ResizeObserver){
      stageObserver = new ResizeObserver(scheduleLayout);
      stageObserver.observe(stage);
    }
    else window.addEventListener('resize', scheduleLayout, {passive:true});
    if(window.visualViewport) window.visualViewport.addEventListener('resize', scheduleLayout, {passive:true});
    if(document.fonts && document.fonts.ready) document.fonts.ready.then(settleLayout);
    if(document.readyState === 'complete') settleLayout();
    else window.addEventListener('load', onWindowLoad, {once:true});
    // main 的入场只影响合成层，ResizeObserver 不会感知它结束；在最终帧再对齐一次。
    window.addEventListener('songline:page-transition-end', onTransitionEnd);
    window.addEventListener('songline:page-transition-start', onTransitionStart);
    stage.addEventListener('pointerdown', onPointerDown);
    stage.addEventListener('pointermove', onPointerMove);
    // Before crossing the drag threshold the stage does not capture pointers;
    // releases elsewhere (including controls that stop bubbling) still end it.
    window.addEventListener('pointerup', stopPan, true);
    window.addEventListener('pointercancel', stopPan, true);
    window.addEventListener('blur', cancelPan);
    stage.addEventListener('lostpointercapture', stopPan);
    stage.addEventListener('dragstart', preventNativeDrag);
    stage.addEventListener('click', blockDragClick, true);
    stage.addEventListener('wheel', onWheel, {passive:false});
    if(zoomControls){ zoomControls.hidden = false; zoomControls.addEventListener('click', onZoomControl); }
    window.__songlineFriendGalaxyCleanup = cleanup;
    if(submit) submit.addEventListener('click', renderSearch);
    if(input){ input.addEventListener('input', renderSearch); input.addEventListener('keydown', function(event){ if(event.key === 'Enter') renderSearch(); }); }
  }

  window.SonglineInitFriendGalaxy = init;
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){ init(document); }, {once:true});
  else init(document);
  window.addEventListener('songline:page-swap', function(event){ init((event.detail && event.detail.root) || document); });
})();
