/* v20.2.1：Songline Markdown 渲染器：单换行 + 轻量代码高亮 + 文内锚点跳转 + 冒号缩进语法 */
(function(){
  function escapeHtml(str){
    return String(str || '').replace(/[&<>"']/g, function(ch){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];
    });
  }

  function unescapeMarkdownEscapes(s){
    return String(s || '').replace(/\\([\\`*_{}\[\]()#+\-.!|>:])/g, '$1');
  }

  function sanitizeHtmlTag(tag){
    tag = String(tag || '');
    if(/^<\s*\/?\s*(script|iframe|object|embed|style|link|meta|base|form|input|button|textarea|select|option)\b/i.test(tag)) return escapeHtml(tag);
    tag = tag.replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
    tag = tag.replace(/javascript\s*:/gi, '');
    return tag;
  }

  function protectRawHtml(s, stash){
    return String(s || '').replace(/<\/?[A-Za-z][^>\n]*>/g, function(tag){
      var key = '\uE000HTML' + stash.length + '\uE001';
      stash.push(sanitizeHtmlTag(tag));
      return key;
    });
  }

  function restoreRawHtml(s, stash){
    return String(s || '').replace(/\uE000HTML(\d+)\uE001/g, function(_, i){
      return stash[Number(i)] || '';
    });
  }

  function renderLink(labelHtml, href, opts){
    opts = opts || {};
    var raw = String(href || '').trim();
    if(!raw) return labelHtml;
    var safe = raw.replace(/[\u0000-\u001F\u007F]/g, '');
    if(/^javascript\s*:/i.test(safe) || /^data\s*:/i.test(safe)) return labelHtml;
    var attr = escapeHtml(safe);
    var isExternal = /^(https?:)?\/\//i.test(safe) || /^www\./i.test(safe);
    var isAnchor = safe.charAt(0) === '#';
    var cls = isAnchor ? ' class="md-anchor-link"' : '';
    if(/^www\./i.test(safe)) attr = 'https://' + attr;
    if(isExternal && !isAnchor){
      return '<a href="' + attr + '" target="_blank" rel="noopener noreferrer"' + cls + '>' + labelHtml + '</a>';
    }
    return '<a href="' + attr + '"' + cls + '>' + labelHtml + '</a>';
  }

  function applyAutoLinks(s){
    s = s.replace(/(^|[\s(])((?:https?:\/\/|www\.)[^\s<]+)/g, function(_, lead, url){
      var clean = url, tail = '';
      while(/[),.!?，。！？）]$/.test(clean)){
        tail = clean.slice(-1) + tail;
        clean = clean.slice(0, -1);
      }
      return lead + renderLink(clean, clean) + tail;
    });
    s = s.replace(/(^|[\s(])([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, function(_, lead, email){
      return lead + renderLink(email, 'mailto:' + email);
    });
    return s;
  }

  function slugifyHeading(text, used){
    var base = String(text || '')
      .replace(/<[^>]*>/g, '')
      .replace(/&[#A-Za-z0-9]+;/g, '')
      .replace(/[^\p{L}\p{N}\s_-]/gu, '')
      .trim()
      .replace(/\s+/g, '-')
      .toLowerCase();
    if(!base) base = 'heading';
    var slug = base;
    var i = 2;
    used = used || {};
    while(used[slug]) slug = base + '-' + i++;
    used[slug] = true;
    return slug;
  }

  function inlineMarkdown(text, ctx){
    var rawStash = [];
    var s = unescapeMarkdownEscapes(text);
    s = protectRawHtml(s, rawStash);
    s = escapeHtml(s);

    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, function(_, alt, src){
      if(/^javascript\s*:/i.test(src) || /^data\s*:/i.test(src)) return '';
      return '<img src="' + escapeHtml(src) + '" alt="' + escapeHtml(alt) + '">';
    });
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, function(_, label, href){
      return renderLink(label, href);
    });
    s = applyAutoLinks(s);

    var codeStash = [];
    s = s.replace(/`([^`]+)`/g, function(_, code){
      var key = '\uE000CODE' + codeStash.length + '\uE001';
      codeStash.push('<code>' + code + '</code>');
      return key;
    });

    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^\*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');

    if(ctx){
      s = s.replace(/\[\^([^\]]+)\]/g, function(_, id){
        var safe = String(id).replace(/[^A-Za-z0-9_-]/g, '-');
        if(ctx.usedFootnotes.indexOf(id) < 0) ctx.usedFootnotes.push(id);
        return '<sup class="footnote-ref" id="fnref-' + safe + '"><a href="#fn-' + safe + '">[' + escapeHtml(id) + ']</a></sup>';
      });
    }

    s = s.replace(/\uE000CODE(\d+)\uE001/g, function(_, i){ return codeStash[Number(i)] || ''; });
    return restoreRawHtml(s, rawStash);
  }


  /* v20.0.1: 轻量语法高亮。无需外部 CDN，支持阅读页与后台预览的常见代码块。 */
  function normalizeLang(lang){
    lang = String(lang || 'code').toLowerCase().replace(/^language-/, '').trim();
    var map = {
      'py':'python', 'python3':'python',
      'golang':'go',
      'js':'javascript', 'jsx':'javascript',
      'ts':'typescript', 'tsx':'typescript',
      'c++':'cpp', 'cc':'cpp', 'cxx':'cpp',
      'shell':'bash', 'sh':'bash', 'zsh':'bash', 'powershell':'ps',
      'md':'markdown', 'yml':'yaml'
    };
    return map[lang] || lang || 'code';
  }

  function highlightCode(code, lang){
    lang = normalizeLang(lang);
    var raw = String(code == null ? '' : code).replace(/\uFEFF/g, '');
    if(raw.normalize){
      try{ raw = raw.normalize('NFC'); }catch(e){}
    }
    var stash = [];

    // v20.0.1：占位符递归还原，避免“注释中含字符串”时私有区标记泄漏成乱码。
    function marker(index){
      var hi = Math.floor(index / 256);
      var lo = index % 256;
      return '\uE010' + String.fromCharCode(0xE100 + hi) + String.fromCharCode(0xE200 + lo) + '\uE011';
    }
    function save(kind, value){
      var key = marker(stash.length);
      stash.push('<span class="tok-' + kind + '">' + escapeHtml(value) + '</span>');
      return key;
    }
    function saveEscaped(kind, value){
      var key = marker(stash.length);
      stash.push('<span class="tok-' + kind + '">' + value + '</span>');
      return key;
    }
    function protect(re, kind){ raw = raw.replace(re, function(m){ return save(kind, m); }); }

    if(lang === 'python'){
      protect(/("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g, 'string');
      protect(/#.*$/gm, 'comment');
    }else if(lang === 'sql'){
      protect(/'(?:''|[^'])*'|"(?:\\.|[^"\\])*"/g, 'string');
      protect(/\/\*[\s\S]*?\*\//g, 'comment');
      protect(/--.*$/gm, 'comment');
    }else if(lang === 'html' || lang === 'xml'){
      protect(/<!--[\s\S]*?-->/g, 'comment');
      protect(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g, 'string');
    }else if(lang === 'bash' || lang === 'ps'){
      protect(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g, 'string');
      protect(/#.*$/gm, 'comment');
    }else if(lang === 'json'){
      protect(/"(?:\\.|[^"\\])*"/g, 'string');
    }else{
      protect(/(`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g, 'string');
      protect(/\/\*[\s\S]*?\*\//g, 'comment');
      protect(/\/\/.*$/gm, 'comment');
    }

    var s = escapeHtml(raw);

    var keywordMap = {
      python: ['False','None','True','and','as','assert','async','await','break','class','continue','def','del','elif','else','except','finally','for','from','global','if','import','in','is','lambda','nonlocal','not','or','pass','raise','return','try','while','with','yield','match','case'],
      go: ['break','default','func','interface','select','case','defer','go','map','struct','chan','else','goto','package','switch','const','fallthrough','if','range','type','continue','for','import','return','var','nil','true','false','iota'],
      javascript: ['async','await','break','case','catch','class','const','continue','debugger','default','delete','do','else','export','extends','finally','for','from','function','if','import','in','instanceof','let','new','null','return','super','switch','this','throw','true','false','try','typeof','undefined','var','void','while','with','yield'],
      typescript: ['abstract','any','as','async','await','boolean','break','case','catch','class','const','continue','debugger','default','delete','do','else','enum','export','extends','finally','for','from','function','if','implements','import','in','infer','instanceof','interface','keyof','let','module','namespace','never','new','null','number','private','protected','public','readonly','return','string','super','switch','this','throw','true','false','try','type','typeof','undefined','var','void','while','with','yield'],
      c: ['auto','break','case','char','const','continue','default','do','double','else','enum','extern','float','for','goto','if','inline','int','long','register','restrict','return','short','signed','sizeof','static','struct','switch','typedef','union','unsigned','void','volatile','while','true','false','NULL'],
      cpp: ['alignas','alignof','auto','bool','break','case','catch','char','class','const','constexpr','continue','decltype','default','delete','do','double','else','enum','explicit','export','extern','false','float','for','friend','if','inline','int','long','namespace','new','nullptr','operator','private','protected','public','return','short','signed','sizeof','static','struct','switch','template','this','throw','true','try','typedef','typename','union','unsigned','using','virtual','void','volatile','while'],
      java: ['abstract','assert','boolean','break','byte','case','catch','char','class','const','continue','default','do','double','else','enum','extends','final','finally','float','for','if','implements','import','instanceof','int','interface','long','native','new','null','package','private','protected','public','return','short','static','strictfp','super','switch','synchronized','this','throw','throws','transient','true','false','try','void','volatile','while'],
      sql: ['ADD','ALL','ALTER','AND','AS','ASC','BETWEEN','BY','CASE','CREATE','DELETE','DESC','DISTINCT','DROP','ELSE','EXISTS','FROM','GROUP','HAVING','IN','INDEX','INNER','INSERT','INTO','IS','JOIN','LEFT','LIKE','LIMIT','NOT','NULL','ON','OR','ORDER','OUTER','PRIMARY','RIGHT','SELECT','SET','TABLE','THEN','UNION','UPDATE','VALUES','VIEW','WHEN','WHERE'],
      bash: ['if','then','else','elif','fi','for','while','do','done','case','esac','function','in','echo','exit','export','local','read','return','shift','test','true','false'],
      ps: ['function','param','begin','process','end','if','else','elseif','foreach','for','while','do','switch','return','break','continue','try','catch','finally','throw','class','using','namespace','true','false','null'],
      css: ['color','background','display','position','absolute','relative','fixed','grid','flex','block','inline','none','margin','padding','border','font','width','height','transform','transition','animation'],
      markdown: ['TODO','NOTE','IMPORTANT','WARNING']
    };
    var keys = keywordMap[lang] || [];
    if(lang === 'json'){
      s = s.replace(/\b(true|false|null)\b/g, function(m){ return saveEscaped('keyword', m); });
    }else if(keys.length){
      var re = new RegExp('\\b(' + keys.map(function(k){ return k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|') + ')\\b', lang === 'sql' ? 'gi' : 'g');
      s = s.replace(re, function(m){ return saveEscaped('keyword', m); });
    }

    s = s.replace(/\b(0x[0-9a-fA-F]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b/g, function(m){ return saveEscaped('number', m); });
    function restoreTokenMarkers(input){
      var output = String(input || '');
      var markerRE = /\uE010([\uE100-\uE1FF])([\uE200-\uE2FF])\uE011/g;
      // 有些语言会先保护字符串、再保护注释；如果注释里包含字符串占位符，
      // 单次 replace 会把内层占位符留在页面上，看起来像  这种乱码。
      // 递归几轮即可把嵌套占位符全部还原，且正常代码块不会受影响。
      for(var pass = 0; pass < 8; pass++){
        var changed = false;
        output = output.replace(markerRE, function(_, hi, lo){
          changed = true;
          var idx = (hi.charCodeAt(0) - 0xE100) * 256 + (lo.charCodeAt(0) - 0xE200);
          return stash[idx] || '';
        });
        if(!changed) break;
      }
      // 理论上不应再有私有区占位符；兜底清理，避免浏览器显示奇怪方块。
      return output.replace(/[\uE000-\uF8FF]/g, '');
    }
    return restoreTokenMarkers(s);
  }

  
  function listInfo(line){
    var m = String(line || '').match(/^(\s*)([-*+]|\d+\.)\s+(.+)$/);
    if(!m) return null;
    return {indent:m[1].replace(/\t/g,'    ').length, ordered:/\d+\./.test(m[2]), text:m[3]};
  }

  function renderList(lines, index, baseIndent, ctx){
    var first = listInfo(lines[index]);
    var ordered = first && first.ordered;
    var tag = ordered ? 'ol' : 'ul';
    var html = '<' + tag + '>';

    while(index < lines.length){
      var info = listInfo(lines[index]);
      if(!info || info.indent < baseIndent || info.ordered !== ordered) break;
      if(info.indent > baseIndent) break;

      html += '<li>' + inlineMarkdown(info.text, ctx);
      index++;

      var continuation = [];
      while(index < lines.length){
        var raw = lines[index] || '';
        var next = listInfo(raw);

        if(!raw.trim()){
          index++;
          if(continuation.length){
            html += '<p>' + continuation.map(function(x){ return inlineMarkdown(String(x || '').trim(), ctx); }).join('<br>\n') + '</p>';
            continuation = [];
          }
          continue;
        }

        if(next){
          if(next.indent > baseIndent){
            if(continuation.length){
              html += '<p>' + continuation.map(function(x){ return inlineMarkdown(String(x || '').trim(), ctx); }).join('<br>\n') + '</p>';
              continuation = [];
            }
            var nested = renderList(lines, index, next.indent, ctx);
            html += nested.html;
            index = nested.index;
            continue;
          }
          break;
        }

        var indent = raw.match(/^\s*/)[0].replace(/\t/g,'    ').length;
        if(indent > baseIndent){
          continuation.push(raw.trim());
          index++;
          continue;
        }
        break;
      }

      if(continuation.length){
        html += '<p>' + continuation.map(function(x){ return inlineMarkdown(String(x || '').trim(), ctx); }).join('<br>\n') + '</p>';
      }
      html += '</li>';
    }

    html += '</' + tag + '>';
    return {html:html, index:index};
  }

  function splitTableRow(row){
    return String(row || '').trim().replace(/^\||\|$/g,'').split('|').map(function(c){
      return c.trim();
    });
  }

  function alignmentFromSeparator(row, count){
    var cells = splitTableRow(row);
    var align = [];
    for(var i = 0; i < count; i++){
      var c = cells[i] || '';
      if(/^:-+:$/.test(c)) align[i] = 'center';
      else if(/^-+:$/.test(c)) align[i] = 'right';
      else if(/^:-+$/.test(c)) align[i] = 'left';
      else align[i] = '';
    }
    return align;
  }

  function renderTable(rows, ctx){
    var separatorIndex = -1;
    for(var i = 0; i < rows.length; i++){
      if(/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(rows[i])){
        separatorIndex = i;
        break;
      }
    }

    var rawRows = rows.filter(function(r, idx){ return idx !== separatorIndex; }).map(splitTableRow);
    if(!rawRows.length) return '';

    var colCount = rawRows.reduce(function(max, r){ return Math.max(max, r.length); }, 0);
    var align = separatorIndex >= 0 ? alignmentFromSeparator(rows[separatorIndex], colCount) : [];

    // 裁掉“全空列”，尤其是 Markdown 表格末尾多写了 | | 时，不再撑出大片空白。
    var keep = [];
    for(var c = 0; c < colCount; c++){
      var hasContent = rawRows.some(function(r){ return String(r[c] || '').trim() !== ''; });
      if(hasContent) keep.push(c);
    }
    if(!keep.length) keep = rawRows[0].map(function(_, i){ return i; });

    // 按内容长度给列一个温和比例，短列不再平均占满，长列也不会无限撑爆。
    var weights = keep.map(function(c){
      var maxLen = rawRows.reduce(function(max, r){
        return Math.max(max, String(r[c] || '').replace(/<[^>]+>/g, '').length);
      }, 0);
      return Math.max(8, Math.min(34, maxLen + 4));
    });
    var total = weights.reduce(function(a,b){ return a + b; }, 0) || 1;

    var colgroup = '<colgroup>' + weights.map(function(w){
      return '<col style="width:' + Math.max(8, Math.round(w / total * 100)) + '%">';
    }).join('') + '</colgroup>';

    var htmlRows = rawRows.map(function(r, idx){
      var tag = idx === 0 ? 'th' : 'td';
      var cells = keep.map(function(c){
        var style = align[c] ? ' style="text-align:' + align[c] + '"' : '';
        return '<' + tag + style + '>' + inlineMarkdown(r[c] || '', ctx) + '</' + tag + '>';
      }).join('');
      return '<tr>' + cells + '</tr>';
    }).join('');

    return '<div class="md-table-wrap"><table class="md-table">' + colgroup + htmlRows + '</table></div>';
  }

  function parseFootnotes(lines){
    var notes = {};
    var body = [];
    for(var i=0;i<lines.length;i++){
      var m = lines[i].match(/^\[\^([^\]]+)\]:\s*(.*)$/);
      if(m){
        var id = m[1];
        var text = [m[2] || ''];
        i++;
        while(i < lines.length && (/^\s{2,}\S/.test(lines[i]) || !lines[i].trim())){
          if(lines[i].trim()) text.push(lines[i].trim());
          i++;
        }
        i--;
        notes[id] = text.join(' ');
      }else{
        body.push(lines[i]);
      }
    }
    return {lines:body, notes:notes};
  }

  function renderMarkdown(md, opts){
    opts = opts || {};
    var parsed = parseFootnotes(String(md || '').replace(/\r\n?/g, '\n').split('\n'));
    var lines = parsed.lines;
    var ctx = {footnotes: parsed.notes, usedFootnotes: []};
    var out = [];
    var headingIds = {};
    var paragraph = [];
    var quote = [];
    var tableRows = [];
    var htmlBlock = [];

    function renderSoftBreakLines(items){
      return items.map(function(x){ return inlineMarkdown(String(x || '').trim(), ctx); }).join('<br>\n');
    }
    function readIndentParagraph(items){
      var lines = (items || []).slice();
      if(!lines.length) return {level:0, lines:lines};
      var first = String(lines[0] || '');
      // v20.2.1：行首冒号缩进语法。
      // : 文本    => 首行缩进 1em
      // :: 文本   => 首行缩进 2em
      // ::: 文本  => 首行缩进 3em，最多 6em
      // \: 文本  => 字面量冒号开头，不触发缩进
      var escapedIndent = first.match(/^\\(:{1,6})([ \t]+.*)$/);
      if(escapedIndent){
        lines[0] = escapedIndent[1] + escapedIndent[2];
        return {level:0, lines:lines};
      }
      var m = first.match(/^(:{1,6})[ \t]+(.+)$/);
      if(!m) return {level:0, lines:lines};
      lines[0] = m[2];
      return {level:m[1].length, lines:lines};
    }
    function isIndentParagraphStart(line){
      var raw = String(line || '').trim();
      if(!raw) return false;
      if(/^\\:{1,6}[ \t]+/.test(raw)) return false;
      return /^:{1,6}[ \t]+.+$/.test(raw);
    }
    function flushParagraph(){
      if(paragraph.length){
        var indent = readIndentParagraph(paragraph);
        var cls = indent.level ? ' class="md-indent md-indent-' + indent.level + '"' : '';
        out.push('<p' + cls + '>' + renderSoftBreakLines(indent.lines) + '</p>');
        paragraph = [];
      }
    }
    function flushQuote(){
      if(quote.length){
        out.push('<blockquote><p>' + renderSoftBreakLines(quote) + '</p></blockquote>');
        quote = [];
      }
    }
    function flushTable(){
      if(tableRows.length){
        out.push(renderTable(tableRows, ctx));
        tableRows = [];
      }
    }
    function flushHtmlBlock(){
      if(htmlBlock.length){
        out.push(htmlBlock.map(sanitizeHtmlTag).join('\n'));
        htmlBlock = [];
      }
    }
    function flushAll(){
      flushParagraph(); flushQuote(); flushTable(); flushHtmlBlock();
    }

    for(var i=0; i<lines.length; i++){
      var line = lines[i];

      var codeMark = line.match(/^(```|~~~)([A-Za-z0-9_+#.-]*)\s*$/);
      if(codeMark){
        flushAll();
        var fence = codeMark[1];
        var lang = codeMark[2] || 'code';
        var codeLines = [];
        i++;
        var closeRE = fence === '```' ? /^```\s*$/ : /^~~~\s*$/;
        while(i < lines.length && !closeRE.test(lines[i])){
          codeLines.push(lines[i]);
          i++;
        }
        out.push('<pre data-lang="' + escapeHtml(lang) + '"><code class="language-' + escapeHtml(lang) + '">' + highlightCode(codeLines.join('\n'), lang) + '</code></pre>');
        continue;
      }

      if(/^<\/?[A-Za-z][^>]*>\s*$/.test(line.trim()) || /^<([A-Za-z][A-Za-z0-9-]*)(\s[^>]*)?>/.test(line.trim())){
        flushParagraph(); flushQuote(); flushTable();
        htmlBlock.push(line.trim());
        continue;
      }else{
        flushHtmlBlock();
      }

      if(/^\s*\|.+\|\s*$/.test(line)){
        flushParagraph(); flushQuote();
        tableRows.push(line);
        continue;
      }else{
        flushTable();
      }

      if(!line.trim()){
        flushAll();
        continue;
      }

      var heading = line.match(/^(#{1,6})\s+(.+)$/);
      if(heading){
        flushAll();
        var level = heading[1].length;
        var headingText = heading[2].trim();
        var id = slugifyHeading(headingText, headingIds);
        out.push('<h' + level + ' id="' + escapeHtml(id) + '">' + inlineMarkdown(headingText, ctx) + '</h' + level + '>');
        continue;
      }

      if(/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)){
        flushAll();
        out.push('<hr>');
        continue;
      }

      var quoteMatch = line.match(/^>\s?(.*)$/);
      if(quoteMatch){
        flushParagraph();
        quote.push(quoteMatch[1]);
        continue;
      }

      var info = listInfo(line);
      if(info){
        flushAll();
        var list = renderList(lines, i, info.indent, ctx);
        out.push(list.html);
        i = list.index - 1;
        continue;
      }

      flushQuote();
      if(isIndentParagraphStart(line) && paragraph.length){
        // v20.2.1：连续的 : / :: / ::: 缩进行不再被合并成同一个段落。
        // 这样 :: 有效之后，下一行 ::: 仍会作为新的缩进段落解析。
        flushParagraph();
      }
      paragraph.push(line.trim());
    }

    flushAll();

    if(ctx.usedFootnotes.length){
      var lis = ctx.usedFootnotes.map(function(id){
        var safe = String(id).replace(/[^A-Za-z0-9_-]/g, '-');
        var text = ctx.footnotes[id] || '';
        return '<li id="fn-' + safe + '">' + inlineMarkdown(text, ctx) + ' <a href="#fnref-' + safe + '" class="footnote-backref">↩</a></li>';
      }).join('');
      out.push('<section class="footnotes"><hr><ol>' + lis + '</ol></section>');
    }

    return out.join('\n') || '<p class="meta">预览会显示在这里。</p>';
  }

  window.SonglineMarkdown = {
    render: renderMarkdown,
    escapeHtml: escapeHtml
  };
})();
