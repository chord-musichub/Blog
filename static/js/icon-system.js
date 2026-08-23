/* v20.3.5: unified public icon interface.
   Change icon shapes here; every element with data-ui-icon will refresh from this registry. */
(function(){
  var VERSION = 'v20.3.5';
  var base = 'class="ui-line-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false"';
  function svg(body, cls){
    var attr = base;
    if(cls) attr = attr.replace('ui-line-icon', 'ui-line-icon ' + cls);
    return '<svg ' + attr + '>' + body + '</svg>';
  }
  var icons = {
    logo: svg('<path d="M12 3.2c4.7 0 8.8 3.3 8.8 8.2 0 4.7-3.7 8.4-8.8 8.4-5.1 0-8.8-3.7-8.8-8.4 0-4.9 4.1-8.2 8.8-8.2Z"/><path d="M15.6 8.3c-.8-.8-1.9-1.2-3.2-1.2-1.7 0-3.1.8-3.1 2.3 0 1.4 1.2 2 3.1 2.5 2 .5 3.4 1.2 3.4 2.8 0 1.7-1.5 2.7-3.6 2.7-1.5 0-2.8-.5-3.7-1.4"/>','logo-line-icon'),
    search: svg('<circle cx="11" cy="11" r="6.4"/><path d="m16.2 16.2 4 4"/>'),
    moon: svg('<path d="M20.2 15.2A8.1 8.1 0 0 1 8.8 3.8 7.2 7.2 0 1 0 20.2 15.2Z"/>'),
    sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2.8v2M12 19.2v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2.8 12h2M19.2 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    back: svg('<path d="M15 5 8 12l7 7"/><path d="M8.5 12H21"/>'),
    'arrow-right': svg('<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>'),
    'arrow-left': svg('<path d="M19 12H5"/><path d="m11 6-6 6 6 6"/>'),
    'arrow-up': svg('<path d="M12 19V5"/><path d="m6 11 6-6 6 6"/>'),
    'arrow-down': svg('<path d="M12 5v14"/><path d="m6 13 6 6 6-6"/>'),
    menu: svg('<path d="M5 7h14M5 12h14M5 17h14"/>'),
    calendar: svg('<rect x="4" y="5" width="16" height="15" rx="2.4"/><path d="M8 3.5v3M16 3.5v3M4 9h16"/>'),
    user: svg('<circle cx="12" cy="8" r="3.2"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/>'),
    users: svg('<circle cx="9" cy="8.4" r="3"/><path d="M3.8 19a5.2 5.2 0 0 1 10.4 0"/><path d="M15 6.3a3 3 0 0 1 0 5.8M17.2 14.2a5.2 5.2 0 0 1 3 4.8"/>'),
    eye: svg('<path d="M2.8 12s3.2-6 9.2-6 9.2 6 9.2 6-3.2 6-9.2 6-9.2-6-9.2-6Z"/><circle cx="12" cy="12" r="2.4"/>'),
    article: svg('<path d="M7 3.8h7l3.5 3.6v12.8H7a2.5 2.5 0 0 1-2.5-2.5V6.3A2.5 2.5 0 0 1 7 3.8Z"/><path d="M14 3.8v4h3.8M8 12h8M8 15.5h6"/>'),
    tag: svg('<path d="M20.2 12.8 12.8 20.2a2 2 0 0 1-2.8 0L3.8 14V4h10l6.4 6.4a1.7 1.7 0 0 1 0 2.4Z"/><circle cx="8.3" cy="8.3" r=".8"/>'),
    tool: svg('<path d="M14.7 5.3a4.5 4.5 0 0 0 4.9 5L10 19.9a2.4 2.4 0 0 1-3.4-3.4l9.6-9.6a4.6 4.6 0 0 0-1.5-1.6Z"/>'),
    grid: svg('<rect x="4" y="4" width="6" height="6" rx="1.4"/><rect x="14" y="4" width="6" height="6" rx="1.4"/><rect x="4" y="14" width="6" height="6" rx="1.4"/><rect x="14" y="14" width="6" height="6" rx="1.4"/>'),
    code: svg('<path d="m9 18-6-6 6-6M15 6l6 6-6 6"/>'),
    pen: svg('<path d="M12 20h8M16.5 4.1a2.1 2.1 0 0 1 3 3L8 18.6 4 20l1.4-4Z"/>'),
    folder: svg('<path d="M3.8 7.2A2.4 2.4 0 0 1 6.2 5h4l2 2h5.6a2.4 2.4 0 0 1 2.4 2.4v7.4a2.4 2.4 0 0 1-2.4 2.4H6.2a2.4 2.4 0 0 1-2.4-2.4Z"/>'),
    cup: svg('<path d="M5 7.5h10v6.2a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4Z"/><path d="M15 9h2.2a2.8 2.8 0 0 1 0 5.6H15M6 20h12"/>'),
    mail: svg('<rect x="4" y="6" width="16" height="12" rx="2.2"/><path d="m5 7.5 7 5.3 7-5.3"/>'),
    github: svg('<path d="M12 2.8a9.2 9.2 0 0 0-2.9 17.9c.5.1.7-.2.7-.5v-1.7c-2.9.6-3.5-1.2-3.5-1.2-.5-1.1-1.1-1.4-1.1-1.4-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.3 1.1 2.9.8.1-.7.4-1.1.7-1.4-2.3-.3-4.8-1.2-4.8-5.1 0-1.1.4-2 1-2.8-.1-.3-.4-1.4.1-2.7 0 0 .9-.3 2.9 1.1a9.8 9.8 0 0 1 5.2 0c2-1.4 2.9-1.1 2.9-1.1.5 1.3.2 2.4.1 2.7.6.8 1 1.7 1 2.8 0 3.9-2.5 4.8-4.8 5.1.4.3.7 1 .7 1.9v2.6c0 .3.2.6.7.5A9.2 9.2 0 0 0 12 2.8Z"/>'),
    bilibili: svg('<rect x="4" y="7" width="16" height="12" rx="3"/><path d="M9 4.5 11 7M15 4.5 13 7M9 12.5v1M15 12.5v1M9.5 16.5h5"/>'),
    fire: svg('<path d="M13.2 3.5c.4 3-1.8 4.2-1.8 6.2 0 1.1.7 2 1.9 2 .9 0 1.8-.7 2-1.8 1.4 1.3 2.4 2.9 2.4 5a5.7 5.7 0 0 1-11.4 0c0-2.7 1.9-4.4 3.2-6.2 1-1.4 1.5-2.8 1.4-4.8.9.4 1.7.9 2.3 1.6Z"/>'),
    check: svg('<path d="m5 12.5 4 4L19 6.5"/>'),
    close: svg('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>'),
    upload: svg('<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 18.5h14"/>'),
    trash: svg('<path d="M4.5 7h15M9 7V4.8h6V7M7 7l.8 13h8.4L17 7M10 10.5v6M14 10.5v6"/>'),
    image: svg('<rect x="4" y="5" width="16" height="14" rx="2.2"/><circle cx="9" cy="10" r="1.3"/><path d="m6.5 17 4.3-4.3 3 3 1.7-1.7 2 3"/>'),
    settings: svg('<circle cx="12" cy="12" r="3"/><path d="M19 12a7.3 7.3 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a7.5 7.5 0 0 0-1.8-1L14.4 3h-4.8l-.3 3.1a7.5 7.5 0 0 0-1.8 1l-2.4-1-2 3.4 2 1.5a7.3 7.3 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a7.5 7.5 0 0 0 1.8 1l.3 3.1h4.8l.3-3.1a7.5 7.5 0 0 0 1.8-1l2.4 1 2-3.4-2-1.5a7.3 7.3 0 0 0 .1-1Z"/>'),
    circle: svg('<circle cx="12" cy="12" r="8.5"/>')
  };
  function get(name){
    name = String(name || '').trim().toLowerCase();
    return icons[name] || icons.circle;
  }
  function replace(root){
    root = root || document;
    var nodes = root.querySelectorAll ? root.querySelectorAll('[data-ui-icon]') : [];
    nodes.forEach(function(el){
      var name = el.getAttribute('data-ui-icon');
      var html = get(name);
      if(el.innerHTML !== html) el.innerHTML = html;
      el.classList.add('ui-icon');
    });
  }
  window.SonglineIcons = {
    version: VERSION,
    svg: get,
    render: get,
    replace: replace,
    register: function(name, markup){ if(name && markup) icons[String(name).trim().toLowerCase()] = String(markup); }
  };
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){ replace(document); });
  else replace(document);

  window.addEventListener('pageshow', function(){
    replace(document);
  });

  window.addEventListener('songline:page-swap', function(event){
    var root = event.detail && event.detail.root ? event.detail.root : document;
    window.setTimeout(function(){ replace(root); }, 20);
    window.setTimeout(function(){ replace(document); }, 120);
  });
})();
