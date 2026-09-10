(function () {
  'use strict';

  var input = document.getElementById('mdImport');
  if (!input) return;

  var status = document.getElementById('mdImportStatus');
  var maxBytes = 1024 * 1024;

  function field(name) {
    return document.querySelector('[name="' + name + '"]');
  }

  function setIfBlank(name, value) {
    var target = field(name);
    if (target && !target.value.trim() && value) target.value = value;
  }

  function parseFrontMatter(text) {
    var match = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?/);
    if (!match) return { data: {}, body: text };

    var data = {};
    match[1].split(/\r?\n/).forEach(function (line) {
      var item = line.match(/^\s*([A-Za-z_][\w-]*)\s*:\s*(.*?)\s*$/);
      if (!item) return;
      data[item[1].toLowerCase()] = item[2].replace(/^['"]|['"]$/g, '');
    });
    return { data: data, body: text.slice(match[0].length) };
  }

  function updateFields(text, filename) {
    var parsed = parseFrontMatter(text);
    var data = parsed.data;
    var body = parsed.body.trim();
    var firstHeading = body.match(/^\s{0,3}#\s+(.+)$/m);
    var title = data.title || (firstHeading && firstHeading[1].trim()) || filename.replace(/\.(md|markdown)$/i, '');

    setIfBlank('title', title);
    setIfBlank('summary', data.summary || data.description || '');
    setIfBlank('cover', data.cover || data.image || data.banner || '');
    setIfBlank('tags', data.tags || data.tag || '');
    setIfBlank('slug', data.slug || '');

    var bodyField = field('body');
    if (bodyField) {
      bodyField.value = body;
      bodyField.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  input.addEventListener('change', function () {
    var file = input.files && input.files[0];
    if (!file) return;
    if (!/\.(md|markdown)$/i.test(file.name)) {
      status.textContent = '请选择 .md 或 .markdown 文件。';
      input.value = '';
      return;
    }
    if (file.size > maxBytes) {
      status.textContent = '文件超过 1 MB，请精简后再导入。';
      input.value = '';
      return;
    }
    var reader = new FileReader();
    reader.onerror = function () { status.textContent = '读取文件失败，请重试。'; };
    reader.onload = function () {
      updateFields(String(reader.result || ''), file.name);
      status.textContent = '已导入「' + file.name + '」，确认后保存或发布即可。';
      input.value = '';
    };
    reader.readAsText(file, 'UTF-8');
  });

  if (new URLSearchParams(window.location.search).get('import') === '1') {
    status.textContent = '请选择一个 Markdown 文件开始导入。';
    input.closest('.editor-import-card').scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}());
