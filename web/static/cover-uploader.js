(function () {
  'use strict';

  var input = document.getElementById('coverUpload');
  var cover = document.getElementById('coverInput');
  var status = document.getElementById('coverCropStatus');
  var launch = document.querySelector('.cover-crop-launch[data-media-url]');
  if (!input || !cover || !launch) return;

  function setStatus(message, isError) {
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('error', !!isError);
  }

  input.addEventListener('change', function () {
    var file = input.files && input.files[0];
    if (!file) return;
    if (!/^image\/(jpeg|png|webp|gif|svg\+xml)$/i.test(file.type) && !/\.(jpe?g|png|webp|gif|svg)$/i.test(file.name)) {
      setStatus('请选择 JPG、PNG、WebP、GIF 或 SVG 图片。', true);
      input.value = '';
      return;
    }
    if (file.size > 16 * 1024 * 1024) {
      setStatus('封面不能超过 16 MB。', true);
      input.value = '';
      return;
    }
    var form = new FormData();
    form.append('cover', file);
    setStatus('正在上传封面…');
    fetch(launch.getAttribute('data-media-url') + '?action=cover-upload', {
      method: 'POST', credentials: 'same-origin', body: form
    })
      .then(function (response) {
        return response.json().catch(function () { return { ok: false, error: '上传服务返回了无效响应' }; });
      })
      .then(function (result) {
        if (!result || !result.ok || !result.path) throw new Error((result && result.error) || '上传封面失败');
        cover.value = result.path;
        document.querySelectorAll('.cover-option').forEach(function (option) {
          option.classList.toggle('active', option.getAttribute('data-cover') === result.path);
        });
        setStatus('封面已上传并选中；继续裁剪或保存文章即可。');
      })
      .catch(function (error) {
        setStatus(error && error.message ? error.message : '上传封面失败', true);
      })
      .finally(function () { input.value = ''; });
  });
}());
