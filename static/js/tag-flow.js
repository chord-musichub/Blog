/* v20.3.5：标签漂流横幅；使用双段无缝动画，避免循环时整行错位跳帧 */
(function(){
  'use strict';
  var VERSION = 'v20.3.5';
  var STYLE_ID = 'songline-tags-style';
  var assetVersion = VERSION;
  try{
    var sourceURL = new URL((document.currentScript && document.currentScript.src) || '', window.location.href);
    assetVersion = sourceURL.searchParams.get('v') || assetVersion;
  }catch(e){}

  function ensureStylesheet(){
    if(document.getElementById(STYLE_ID)) return;
    var style = document.createElement('link');
    style.id = STYLE_ID;
    style.rel = 'stylesheet';
    style.href = '/css/tags.css?v=' + encodeURIComponent(assetVersion);
    document.head.appendChild(style);
  }

  function clean(value){
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function cleanUrl(value){
    var s = clean(value)
      .replace(/&quot;/g, '"')
      .replace(/&#34;/g, '"')
      .replace(/&#x22;/gi, '"')
      .replace(/%22/gi, '"')
      .trim();

    // 旧版 tag_urls / JSON 数据有机会把路径作为字符串再包一层引号：
    //   "/tags/tag-xxx/"
    // 浏览器会把它解析成 /tags/%22/tags/tag-xxx/%22，所以这里统一剥掉。
    for(var i = 0; i < 4; i++){
      s = s.trim();
      if(s.length >= 2 && ((s[0] === '"' && s[s.length - 1] === '"') || (s[0] === "'" && s[s.length - 1] === "'"))){
        s = s.slice(1, -1).trim();
        continue;
      }
      break;
    }

    // 如果坏值已经变成 /tags/"/tags/tag-xxx/"，直接取里面真正的 /tags/...。
    var nested = s.match(/\/tags\/[A-Za-z0-9._~%+\-]+\//);
    if(nested) s = nested[0];

    if(!s) return '/tags/';
    if(/^https?:\/\//i.test(s) || s[0] === '/') return s;
    return '/' + s.replace(/^\/+/, '');
  }

  function normalize(value){
    return clean(value)
      .toLowerCase()
      .replace(/[，。！？、；：,.!?;:|/\\()[\]{}<>《》“”‘’`~@#$%^&*_+=-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function escapeHtml(value){
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function hashSeed(value){
    var h = 2166136261;
    var s = String(value == null ? '' : value);
    for(var i = 0; i < s.length; i++){
      h ^= s.charCodeAt(i);
      h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
    }
    return (h >>> 0) / 4294967295;
  }


  function tagKey(title, display){
    return normalize([title, display].filter(Boolean).join(' '));
  }

  function readLinkRegistry(){
    var map = Object.create(null);
    var nodes = document.querySelectorAll('[data-tag-link-registry] a[data-tag-link]');
    Array.prototype.forEach.call(nodes, function(a){
      var title = clean(a.getAttribute('data-title') || '');
      var display = clean(a.getAttribute('data-display') || a.textContent || title);
      var href = cleanUrl(a.getAttribute('href') || '');
      if(!href) return;
      var keys = [
        tagKey(title, display),
        normalize(title),
        normalize(display)
      ];
      keys.forEach(function(key){ if(key) map[key] = href; });
    });
    return map;
  }

  function parseTags(){
    var registryURLs = readLinkRegistry();
    var el = document.getElementById('tag-river-data');
    if(!el) return [];
    try{
      var parsed = JSON.parse(el.textContent || '[]');
      if(!Array.isArray(parsed)) return [];
      return parsed.map(function(t, index){
        var title = clean(t.title || t.name || t.display);
        var display = clean(t.display || t.name || t.title || '未命名标签');
        var jsonUrl = cleanUrl(t.url || t.href || '/tags/');
        var registryUrl = registryURLs[tagKey(title, display)] || registryURLs[normalize(title)] || registryURLs[normalize(display)];
        var url = cleanUrl(registryUrl || jsonUrl || '/tags/');
        var count = Number(t.count || 0);
        var articles = Array.isArray(t.articles) ? t.articles.map(clean).filter(Boolean) : [];
        return {
          index:index,
          title:title,
          display:display,
          url:url,
          count:count,
          articles:articles,
          key:normalize([title, display].join(' '))
        };
      }).filter(function(t){ return t.display && t.url; });
    }catch(e){
      console.warn('[tag-flow:' + VERSION + '] 标签数据解析失败', e);
      return [];
    }
  }

  function tagWeight(tag, maxCount){
    if(!maxCount) return 1;
    return 1 + Math.min(0.18, Math.log((tag.count || 0) + 1) / Math.log(maxCount + 1) * 0.18);
  }

  function createTagAnchor(tag, maxCount, copyIndex, laneIndex, orderIndex){
    var a = document.createElement('a');
    var seed = hashSeed(tag.title + ':' + tag.display + ':' + copyIndex + ':' + laneIndex + ':' + orderIndex);
    var floatY = Math.round((seed - 0.5) * 34); // 纵向散开，不再像固定三条直线
    var drift = Math.round((hashSeed(tag.display + ':gap:' + orderIndex) - 0.5) * 16);
    var tilt = ((seed - 0.5) * 4.2).toFixed(2) + 'deg';
    a.className = 'tag-river-chip';
    a.setAttribute('href', cleanUrl(tag.url));
    a.setAttribute('data-tag-source', 'hugo-taxonomy-link');
    a.setAttribute('data-tag-title', tag.title);
    a.setAttribute('data-tag-display', tag.display);
    a.style.setProperty('--tag-scale', tagWeight(tag, maxCount).toFixed(3));
    a.style.setProperty('--tag-tilt', tilt);
    a.style.setProperty('--tag-float-y', floatY + 'px');
    a.style.setProperty('--tag-local-drift', drift + 'px');
    a.innerHTML = '<span># ' + escapeHtml(tag.display) + '</span><b>' + escapeHtml(tag.count) + '</b>';
    return a;
  }

  function makeLane(stage, laneIndex, laneCount){
    var lane = document.createElement('div');
    lane.className = 'tag-river-lane tag-river-lane-free lane-free-' + laneIndex;
    lane.setAttribute('data-tag-lane', String(laneIndex));
    var tops = [24, 62, 104, 151, 202, 232];
    var top = tops[laneIndex] != null ? tops[laneIndex] : 32 + laneIndex * 42;
    if(laneCount <= 4) top += laneIndex % 2 ? 10 : 0;
    lane.style.setProperty('--tag-lane-top', top + 'px');
    lane.style.setProperty('--tag-lane-depth', (0.86 + laneIndex * 0.035).toFixed(2));
    stage.appendChild(lane);
    return lane;
  }

  function bucketTags(tags, laneCount){
    var buckets = Array.from({length:laneCount}, function(){ return []; });
    var shuffled = tags.slice().sort(function(a, b){
      return hashSeed(a.title + a.display) - hashSeed(b.title + b.display);
    });
    shuffled.forEach(function(tag, index){
      // 不是机械 index % 3，而是偏随机地丢进不同轨道，再保证大致均衡。
      var preferred = Math.floor(hashSeed(tag.display + ':' + tag.title) * laneCount);
      var best = preferred;
      for(var i = 0; i < laneCount; i++){
        var candidate = (preferred + i) % laneCount;
        if(buckets[candidate].length < buckets[best].length) best = candidate;
      }
      buckets[best].push(tag);
    });
    return buckets;
  }

  function addSpacer(strip, laneIndex, groupIndex){
    var spacer = document.createElement('span');
    var seed = hashSeed('spacer:' + laneIndex + ':' + groupIndex);
    spacer.className = 'tag-river-spacer';
    spacer.setAttribute('aria-hidden', 'true');
    spacer.style.setProperty('--tag-gap-width', Math.round(52 + seed * 110) + 'px');
    strip.appendChild(spacer);
  }

  // v20.3.5：CSS 里历史 transform:none !important 会压住 keyframes，
  // 所以这里用 requestAnimationFrame 写入 inline important transform，保证漂流带一定会动。
  function startTagRiverMotion(stage){
    if(!stage || !window.requestAnimationFrame) return;

    var strips = Array.prototype.slice.call(stage.querySelectorAll('.tag-river-strip-seamless'));
    if(!strips.length) return;

    // v20.18.5：漂流带 DOM 会在 AJAX 回页/重新初始化时被重建。
    // 旧版用 __tagRiverMotionStarted 锁死，导致新 DOM 创建后动画不再启动。
    // 这里改成 token：每次 render 都启动新 token，旧 RAF 循环自动失效。
    var token = (stage.__tagRiverMotionToken || 0) + 1;
    stage.__tagRiverMotionToken = token;
    stage.__tagRiverMotionStarted = true;

    strips.forEach(function(strip, index){
      var styles = window.getComputedStyle(strip);
      var dur = parseFloat(styles.getPropertyValue('--tag-river-duration')) || parseFloat(styles.animationDuration) || 56;
      if(dur < 8) dur = 56;
      var delay = parseFloat(styles.getPropertyValue('--tag-river-delay')) || 0;
      var seed = hashSeed('motion:' + index + ':' + (strip.textContent || '').slice(0, 32));
      strip.__tagRiverMotion = {
        duration: dur * 1000,
        offset: ((-delay * 1000) + seed * dur * 1000) % (dur * 1000)
      };
      strip.style.setProperty('animation', 'none', 'important');
      strip.style.setProperty('will-change', 'transform', 'important');
      strip.style.setProperty('transform', 'translate3d(0,0,0)', 'important');
    });

    var start = 0;
    function tick(now){
      if(stage.__tagRiverMotionToken !== token) return;
      if(!document.documentElement.contains(stage)) return;
      if(!start) start = now;
      strips.forEach(function(strip){
        if(!document.documentElement.contains(strip)) return;
        var meta = strip.__tagRiverMotion;
        if(!meta) return;
        var progress = ((now - start + meta.offset) % meta.duration) / meta.duration;
        var x = -(progress * 50);
        strip.style.setProperty('transform', 'translate3d(' + x.toFixed(4) + '%,0,0)', 'important');
      });
      window.requestAnimationFrame(tick);
    }
    window.requestAnimationFrame(tick);
  }

  function renderRiver(tags){
    var shell = document.querySelector('[data-tag-river]');
    if(!shell) return;
    var stage = shell.querySelector('[data-tag-river-stage]') || shell.querySelector('.tag-river-stage');
    if(!stage) return;
    stage.innerHTML = '';
    stage.removeAttribute('data-tag-river-motion-stale');
    if(!tags.length){
      stage.innerHTML = '<div class="tag-river-empty">暂无标签，发布文章后会自动生成。</div>';
      return;
    }

    var maxCount = tags.reduce(function(m, t){ return Math.max(m, t.count || 0); }, 0);
    var laneCount = Math.min(5, Math.max(4, Math.ceil(tags.length / 2.8)));
    if(tags.length <= 4) laneCount = Math.min(3, tags.length || 1);
    var lanes = [];
    for(var i = 0; i < laneCount; i++) lanes.push(makeLane(stage, i, laneCount));
    var buckets = bucketTags(tags, laneCount);
    var durations = [42, 57, 48, 66, 53];

    function buildSegment(bucket, laneIndex, maxCount){
      var segment = document.createElement('div');
      segment.className = 'tag-river-segment';
      segment.setAttribute('aria-hidden', 'false');
      var repeats = Math.max(3, Math.ceil(18 / Math.max(1, bucket.length)));
      var order = 0;
      for(var copy = 0; copy < repeats; copy++){
        var ordered = bucket.slice().sort(function(a, b){
          return hashSeed(a.display + ':' + copy) - hashSeed(b.display + ':' + copy);
        });
        var cursor = 0;
        while(cursor < ordered.length){
          var groupSize = 1 + Math.floor(hashSeed('group:' + laneIndex + ':' + copy + ':' + cursor) * 3);
          for(var g = 0; g < groupSize && cursor < ordered.length; g++, cursor++, order++){
            segment.appendChild(createTagAnchor(ordered[cursor], maxCount, copy, laneIndex, order));
          }
          addSpacer(segment, laneIndex, copy + '-' + cursor);
        }
      }
      return segment;
    }

    lanes.forEach(function(lane, laneIndex){
      var bucket = buckets[laneIndex] && buckets[laneIndex].length ? buckets[laneIndex] : tags;
      var strip = document.createElement('div');
      strip.className = 'tag-river-strip tag-river-strip-scattered tag-river-strip-seamless';
      var duration = durations[laneIndex % durations.length] + Math.min(bucket.length * 2.2, 12);
      strip.style.setProperty('--tag-river-duration', duration + 's');
      strip.style.setProperty('--tag-river-delay', '-' + Math.round(duration * (0.12 + hashSeed('delay:' + laneIndex) * 0.42)) + 's');

      var first = buildSegment(bucket, laneIndex, maxCount);
      var second = first.cloneNode(true);
      second.setAttribute('aria-hidden', 'true');
      strip.appendChild(first);
      strip.appendChild(second);
      lane.appendChild(strip);
    });
    shell.classList.add('is-ready', 'is-scattered');
    startTagRiverMotion(stage);
  }

  function scoreTags(tags, query){
    var q = normalize(query);
    if(!q) return tags.slice(0, 8).map(function(tag){ return {tag:tag, score:1}; });
    var terms = q.split(' ').filter(Boolean);
    return tags.map(function(tag){
      var display = normalize(tag.display);
      var title = normalize(tag.title);
      var tagName = normalize([display, title].join(' '));
      var score = 0;
      if(display === q) score += 1000;
      if(title === q) score += 980;
      if(display.indexOf(q) >= 0) score += 700;
      if(title.indexOf(q) >= 0) score += 680;
      if(terms.length && terms.every(function(t){ return tagName.indexOf(t) >= 0; })) score += 320;
      return {tag:tag, score:score};
    }).filter(function(item){ return item.score > 0; }).sort(function(a, b){
      return b.score - a.score || a.tag.index - b.tag.index;
    });
  }

  function renderResults(list, query){
    var results = document.querySelector('[data-tag-search-results]');
    var status = document.querySelector('[data-tag-search-status]');
    if(!results || !status) return;
    var q = clean(query);
    results.innerHTML = '';
    if(!list.length){
      status.textContent = '没有找到这个标签。';
      status.classList.add('is-empty');
      results.innerHTML = '<div class="tag-river-empty-card">没有找到匹配的标签，可以换个关键词试试。</div>';
      return;
    }
    status.classList.remove('is-empty');
    status.textContent = q ? ('找到 ' + list.length + ' 个标签') : (list.length + ' 个标签');
    list.slice(0, q ? 16 : 8).forEach(function(item){
      var tag = item.tag || item;
      var a = document.createElement('a');
      a.className = 'tag-river-result';
      a.setAttribute('href', cleanUrl(tag.url));
      a.setAttribute('data-tag-source', 'hugo-taxonomy-link');
      var articles = tag.articles && tag.articles.length ? tag.articles.join(' / ') : '暂无文章标题摘要';
      a.innerHTML = '<span class="tag-river-result-mark">#</span><span class="tag-river-result-main"><b>' + escapeHtml(tag.display) + '</b><small>' + escapeHtml(articles) + '</small></span><em>' + escapeHtml(tag.count) + ' 篇 · 进入</em>';
      results.appendChild(a);
    });
  }

  function bindSearch(tags){
    var input = document.getElementById('tagRiverSearch');
    var btn = document.getElementById('tagRiverSearchSubmit');
    if(!input) return;

    if(input.dataset && input.dataset.tagRiverSearchBound === VERSION){
      renderResults(scoreTags(tags, input.value), input.value);
      return;
    }
    if(input.dataset) input.dataset.tagRiverSearchBound = VERSION;

    function apply(e){
      if(e){ e.preventDefault(); e.stopPropagation(); }
      if(window.SonglineSearchRefresh) window.SonglineSearchRefresh('搜索标签中');
      renderResults(scoreTags(tags, input.value), input.value);
    }
    function reset(){
      input.value = '';
      renderResults(scoreTags(tags, ''), '');
      if(window.SonglineSearchRefresh) window.SonglineSearchRefresh('已重置');
    }
    input.addEventListener('keydown', function(e){
      if(e.key === 'Enter') apply(e);
      else if(e.key === 'Escape') reset();
    });
    input.addEventListener('search', function(){ if(!input.value) reset(); });
    if(btn){
      btn.setAttribute('data-no-page-loading', '');
      btn.addEventListener('click', apply);
    }
    renderResults(scoreTags(tags, ''), '');
    window.SonglineTagRiverSearch = apply;
  }

  function init(root){
    // root 参数用于和 page-modules.js 的生命周期接口保持一致；
    // 当前标签数据使用全局唯一 DOM id，因此这里仍从 document 读取。
    if(!document.querySelector('[data-tag-river]')) return;
    ensureStylesheet();
    var tags = parseTags();
    renderRiver(tags);
    bindSearch(tags);
    document.documentElement.setAttribute('data-tag-river-version', VERSION);
  }

  window.SonglineInitTagFlow = init;
})();
