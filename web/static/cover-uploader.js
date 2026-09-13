(function () {
  'use strict';

  var inputs = Array.prototype.slice.call(document.querySelectorAll('[data-cover-upload], #coverUpload'));
  if (!inputs.length) return;

  inputs.forEach(function (input) {
    var targetSelector = input.getAttribute('data-cover-target') || '#coverInput';
    var cover = document.querySelector(targetSelector);
    var statusSelector = input.getAttribute('data-cover-status') || '#coverCropStatus';
    var status = document.querySelector(statusSelector);
    var launch = input.closest('[data-media-url]') || document.querySelector('.cover-crop-launch[data-media-url]');
    if (!cover || !launch) return;
    var uploading = false;
    input.closest('form')?.addEventListener('submit', function(event){
      if(uploading){event.preventDefault();setStatus('图片正在上传，请完成后再保存。',true);}
    }, true);

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
    uploading = true;
    input.disabled = true;
    form.append('cover', file);
    var category = launch.getAttribute('data-media-category') || '';
    if (category) form.append('category', category);
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
        cover.dispatchEvent(new Event('input', { bubbles: true }));
        document.querySelectorAll('.cover-option').forEach(function (option) {
          option.classList.toggle('active', option.getAttribute('data-cover') === result.path);
        });
        setStatus('已上传，可继续裁剪。');
      })
      .catch(function (error) {
        setStatus(error && error.message ? error.message : '上传封面失败', true);
      })
      .finally(function () { input.value = ''; input.disabled = false; uploading = false; });
    });
  });
}());
