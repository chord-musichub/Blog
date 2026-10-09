(function(){
  'use strict';
  if(window.SonglineI18n) return;
  var KEY = 'songline-language', catalog = window.SonglineI18nCatalog || {};
  var language = 'zh', textSources = new WeakMap(), attributeSources = new WeakMap();
  var prefixKeys=Object.keys(catalog).filter(function(key){return /[：:]$/.test(key);});
  var observer, pending = new Set(), scheduled = false;
  try{ if(localStorage.getItem(KEY) === 'en') language = 'en'; }catch(error){}
  // These patterns contain interface copy around a captured value. Captures
  // (including filenames) stay verbatim; never replace substrings in content.
  var patterns = [
    [/^(.+) · 创作中心$/, function(m){return t(m[1])+' · Creator center';}],
    [/^共\s*(\d+)\s*篇稿件$/, function(m){return m[1]+' articles';}],
    [/^(\d+) 字$/, function(m){return m[1]+' characters';}],
    [/^(\d+) 个标题$/, function(m){return m[1]+' headings';}],
    [/^当前：(.*)$/, function(m){return 'Current: '+t(m[1]);}],
    [/^当前页面：(首页|档案|朋友|回忆|工具|公告|地图)，(打开|关闭)站点地图$/, function(m){return 'Current page: '+t(m[1])+'; '+(m[2]==='打开'?'open':'close')+' site map';}],
    [/^前往(首页|档案|朋友|回忆|工具)，(.+)层$/, function(m){return 'Go to '+t(m[1])+'; level '+m[2];}],
    [/^查看第 (\d+) 篇推荐文章$/, function(m){return 'View featured article '+m[1];}],
    [/^共 (\d+) (个工具|位朋友)$/, function(m){return m[1]+' '+(m[2]==='个工具'?'tools':'friends');}],
    [/^找到 (\d+) \/ (\d+) (个工具|位朋友)$/, function(m){return 'Found '+m[1]+' / '+m[2]+' '+(m[3]==='个工具'?'tools':'friends');}],
    [/^(搜索 \/ )?(文章|项目|公告) \/ (\d+) \/ (\d+)(?: \/ 第 (\d+) 页，共 (\d+) 页)?$/, function(m){return (m[1]?'Search / ':'')+t(m[2])+' / '+m[3]+' / '+m[4]+(m[5]?' / Page '+m[5]+' of '+m[6]:'');}],
    [/^项目 \/ (\d+) →$/, function(m){return 'Projects / '+m[1]+' →';}],
    [/^第 (\d+) 页，共 (\d+) 页$/, function(m){return 'Page '+m[1]+' of '+m[2];}],
    [/^连击 x(\d+)$/, function(m){return 'Combo x'+m[1];}],
    [/^护盾 (\d+)$/, function(m){return 'Shield '+m[1];}],
    [/^缓速 ([\d.]+)s$/, function(m){return 'Slow '+m[1]+'s';}],
    [/^临时豆 (.+)$/, function(m){return 'Timed fruit '+t(m[1]);}],
    [/^得分 (\d+)$/, function(m){return 'Score '+m[1];}],
    [/^(.+) 分钟$/, function(m){return m[1]+' minutes';}],
    [/^区间：(.+)$/, function(m){return 'Range: '+m[1];}],
    [/^播放模式：(.+)$/, function(m){return 'Playback mode: '+t(m[1]);}],
    [/^播放 (.+)$/, function(m){return 'Play '+m[1];}],
    [/^从列表移出 (.+)$/, function(m){return 'Remove '+m[1]+' from playlist';}],
    [/^本地播放列表 · (.+)$/, function(m){return 'Local playlist · '+m[1];}],
    [/^浏览器音频授权被取消或失败：(.+)$/, function(m){return 'Audio permission canceled or failed: '+m[1];}],
    [/^已导入「(.+)」，确认后保存或发布即可。$/, function(m){return 'Imported “'+m[1]+'”. Review, then save or publish.';}],
    [/^#(\d+) · (.+)$/, function(m){return '#'+m[1]+' · '+t(m[2]);}],
    [/^本次 (\d+) 抽：最高稀有 (\d+) 个，UP (\d+) 个。$/, function(m){return m[1]+' pulls: '+m[2]+' top-rarity, '+m[3]+' rate-up.';}],
    [/^本次 (\d+) 抽：最高稀有 (\d+) 个。常驻池不判定 UP。$/, function(m){return m[1]+' pulls: '+m[2]+' top-rarity. Standard banners have no rate-up.';}],
    [/^裁剪(.+)（(.+)）$/, function(m){return 'Crop '+t(m[1])+' ('+m[2]+')';}],
    [/^保存 (.+) 图片$/, function(m){return 'Save '+t(m[1])+' image';}]
  ];
  function t(value){
    var source = String(value == null ? '' : value);
    if(language !== 'en') return source;
    if(Object.prototype.hasOwnProperty.call(catalog, source)) return catalog[source];
    var trimmed = source.trim();
    if(Object.prototype.hasOwnProperty.call(catalog, trimmed)) return source.replace(trimmed, function(){return catalog[trimmed];});
    for(var i=0;i<patterns.length;i++){
      var match = trimmed.match(patterns[i][0]);
      if(match) return source.replace(trimmed, function(){return patterns[i][1](match);});
    }
    var prefix = prefixKeys.find(function(key){return trimmed.indexOf(key)===0;});
    if(prefix) return source.replace(trimmed,function(){return catalog[prefix]+trimmed.slice(prefix.length);});
    return source;
  }
  function ignored(node){
    var element = node.nodeType===1 ? node : node.parentElement;
    return !element || !!element.closest('[data-i18n-ignore],script,style,textarea,input,[contenteditable="true"]');
  }
  function translateText(node){
    if(ignored(node)) return;
    var value = node.nodeValue, saved = textSources.get(node);
    if(!saved || value !== saved.rendered) saved = {source:value};
    var next = t(saved.source);
    saved.rendered = next; textSources.set(node,saved);
    if(value !== next) node.nodeValue = next;
  }
  function translateAttribute(element, name){
    if(name === 'value' || element.closest('[data-i18n-ignore]')) return;
    var value = element.getAttribute(name);
    if(value === null) return;
    var records = attributeSources.get(element) || {}, saved = records[name];
    if(!saved || value !== saved.rendered) saved = {source:value};
    var next = t(saved.source); saved.rendered = next; records[name] = saved;
    attributeSources.set(element,records);
    if(value !== next) element.setAttribute(name,next);
  }
  function apply(root){
    if(!root) return;
    if(root.nodeType===3){
      if(textSources.has(root) || root.previousSibling && root.previousSibling.nodeType===8 && root.previousSibling.data==='ui' || root.parentElement && root.parentElement.closest('[data-i18n-ui]')) translateText(root);
      return;
    }
    if(root.nodeType!==1 && root.nodeType!==9) return;
    var elements = [];
    if(root.nodeType===1) elements.push(root);
    elements = elements.concat(Array.from(root.querySelectorAll('[data-i18n-text],[data-i18n-attrs],[data-i18n-ui],[data-language-toggle]')));
    elements.forEach(function(element){
      if(element.hasAttribute('data-language-toggle')){
        var next = language==='en' ? 'en' : '中';
        if(element.textContent!==next) element.textContent=next;
        var label = language==='en' ? 'Switch to Chinese' : '切换为英文';
        if(element.getAttribute('aria-label')!==label) element.setAttribute('aria-label',label);
        if(element.title!==label) element.title=label;
        element.setAttribute('lang', language==='en'?'en':'zh-CN');
        return;
      }
      if(element.closest('[data-i18n-ignore]')) return;
      if(element.hasAttribute('data-i18n-text')){
        var saved = textSources.get(element);
        if(!saved || element.textContent !== saved.rendered) saved={source:element.textContent};
        var translated = t(saved.source); saved.rendered=translated; textSources.set(element,saved);
        if(element.textContent!==translated) element.textContent=translated;
      }
      (element.getAttribute('data-i18n-attrs') || '').split(/\s+/).filter(Boolean).forEach(function(name){translateAttribute(element,name);});
    });
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while(walker.nextNode()) apply(walker.currentNode);
  }
  function observe(){
    observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-label','title','placeholder','alt','data-i18n-text','data-i18n-attrs','data-i18n-ui']});
  }
  function flush(){
    scheduled=false; observer.disconnect();
    var roots=Array.from(pending);pending.clear();
    roots.filter(function(root,index){return root.isConnected && !roots.some(function(other,j){return j!==index && other!==root && other.contains && other.contains(root);});}).forEach(apply);
    observe();
  }
  function refresh(root){
    if(observer) observer.disconnect();
    var title=document.querySelector('title');
    if(title && !document.documentElement.hasAttribute('data-admin-theme') && /^(?:\/posts\/?|\/friends\/?|\/friends\/memories\/?|\/tools(?:\/[^/]+)?\/?|\/tags\/site-notice\/?)$/.test(location.pathname)){
      var titleRecord=textSources.get(title), original=titleRecord && titleRecord.rendered===title.textContent ? titleRecord.source : title.textContent;
      var parts=original.split(' - '), name=parts[0];
      if(Object.prototype.hasOwnProperty.call(catalog,name)){
        titleRecord={source:original,rendered:(language==='en'?catalog[name]:name)+(parts.length>1?' - '+parts.slice(1).join(' - '):'')};
        textSources.set(title,titleRecord);title.textContent=titleRecord.rendered;
      }
    }
    apply(root || document);
    if(observer) observe();
  }
  function setText(node, source){
    if(!node) return;
    var original = String(source == null ? '' : source), rendered=t(original);
    textSources.set(node,{source:original,rendered:rendered});
    node.setAttribute('data-i18n-text','');
    if(node.textContent!==rendered) node.textContent=rendered;
  }
  function setLanguage(next, persist){
    language = next==='en'?'en':'zh';
    if(persist!==false){try{localStorage.setItem(KEY,language);}catch(error){}}
    document.documentElement.lang = language==='en'?'en':'zh-CN';
    document.documentElement.dataset.language=language;
    refresh();
    window.dispatchEvent(new CustomEvent('songline:language-change',{detail:{language:language}}));
  }
  function sourceText(node){
    if(!node) return '';
    var saved=textSources.get(node);
    if(saved && node.textContent===saved.rendered) return saved.source;
    return Array.from(node.childNodes).map(function(child){
      var record=textSources.get(child);
      return record && child.nodeValue===record.rendered ? record.source : child.nodeType===1 ? sourceText(child) : child.nodeType===3 ? child.nodeValue : '';
    }).join('');
  }
  function setContent(node, value){
    if(!node) return;
    textSources.delete(node);node.removeAttribute('data-i18n-text');
    node.removeAttribute('data-i18n-ui');node.textContent=String(value == null ? '' : value);
  }
  window.SonglineI18n={t:t,sourceText:sourceText,setContent:setContent,english:function(value){return Object.prototype.hasOwnProperty.call(catalog,value)?catalog[value]:value;},setText:setText,refresh:refresh,setLanguage:setLanguage,getLanguage:function(){return language;}};
  function initialize(){
    observer=new MutationObserver(function(records){
      records.forEach(function(record){
        if(record.type==='attributes' && !record.target.hasAttribute('data-i18n-attrs') && !record.target.hasAttribute('data-i18n-text') && !record.target.hasAttribute('data-i18n-ui')) return;
        pending.add(record.target);
      });
      if(pending.size && !scheduled){scheduled=true;queueMicrotask(flush);}
    });
    setLanguage(language,false);
    document.addEventListener('click',function(event){
      var button=event.target.closest && event.target.closest('[data-language-toggle]');
      if(!button) return;
      event.preventDefault();setLanguage(language==='en'?'zh':'en');
    });
    window.addEventListener('storage',function(event){if(event.key===KEY) setLanguage(event.newValue,false);});
    window.addEventListener('pageshow',function(){var next='zh';try{if(localStorage.getItem(KEY)==='en')next='en';}catch(error){next=language;}setLanguage(next,false);});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});
  else initialize();
})();
