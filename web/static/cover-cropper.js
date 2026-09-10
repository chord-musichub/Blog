// 后台文章封面裁剪：浏览器负责取景和 WebP 编码，服务端只保存新文件。
// 这样不会改变媒体库里的原图，也无需引入重量级图片处理依赖。
(function(){
  var coverInput = document.getElementById('coverInput');
  var openButton = document.getElementById('coverCropOpen');
  var status = document.getElementById('coverCropStatus');
  var dialog = document.getElementById('coverCropDialog');
  var canvas = document.getElementById('coverCropCanvas');
  var zoomInput = document.getElementById('coverCropZoom');
  var saveButton = document.getElementById('coverCropSave');
  var coverModeInput = document.getElementById('coverModeInput');
  var launch = document.querySelector('.cover-crop-launch[data-media-url]');
  if(!coverInput || !openButton || !dialog || !canvas || !zoomInput || !saveButton) return;

  var ctx = canvas.getContext('2d');
  var image = null;
  var sourcePath = '';
  var baseScale = 1;
  var x = 0;
  var y = 0;
  var dragging = null;

  function setStatus(message, isError){
    if(!status) return;
    status.textContent = message;
    status.classList.toggle('error', !!isError);
  }

  function draw(){
    if(!image || !image.naturalWidth || !image.naturalHeight) return;
    var zoom = Number(zoomInput.value) || 1;
    var width = image.naturalWidth * baseScale * zoom;
    var height = image.naturalHeight * baseScale * zoom;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#17243a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, x, y, width, height);
  }

  function clampPosition(){
    if(!image) return;
    var zoom = Number(zoomInput.value) || 1;
    var width = image.naturalWidth * baseScale * zoom;
    var height = image.naturalHeight * baseScale * zoom;
    x = Math.min(0, Math.max(canvas.width - width, x));
    y = Math.min(0, Math.max(canvas.height - height, y));
  }

  function resetCrop(){
    if(!image) return;
    baseScale = Math.max(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
    zoomInput.value = '1';
    x = (canvas.width - image.naturalWidth * baseScale) / 2;
    y = (canvas.height - image.naturalHeight * baseScale) / 2;
    clampPosition();
    draw();
  }

  function setZoom(next){
    if(!image) return;
    var oldZoom = Number(zoomInput.value) || 1;
    next = Math.max(Number(zoomInput.min) || 1, Math.min(Number(zoomInput.max) || 3, next));
    if(next === oldZoom) return;
    var oldWidth = image.naturalWidth * baseScale * oldZoom;
    var oldHeight = image.naturalHeight * baseScale * oldZoom;
    var focusX = (canvas.width / 2 - x) / oldWidth;
    var focusY = (canvas.height / 2 - y) / oldHeight;
    zoomInput.value = String(next);
    var newWidth = image.naturalWidth * baseScale * next;
    var newHeight = image.naturalHeight * baseScale * next;
    x = canvas.width / 2 - focusX * newWidth;
    y = canvas.height / 2 - focusY * newHeight;
    clampPosition();
    draw();
  }

  function openCropper(){
    sourcePath = (coverInput.value || '').trim();
    if(!sourcePath){
      setStatus('请先从下方媒体库选择一张图片，再裁剪。', true);
      return;
    }
    if(!/^\/uploads\//.test(sourcePath)){
      setStatus('只能裁剪自己媒体库中的 JPG、PNG 或 WebP 图片。', true);
      return;
    }
    setStatus('正在读取原图…');
    image = new Image();
    image.decoding = 'async';
    image.onload = function(){
      resetCrop();
      if(typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
      setStatus('拖动和缩放后，保存一张独立的 16:9 封面。');
    };
    image.onerror = function(){
      image = null;
      setStatus('图片无法读取。请确认它是你媒体库里的 JPG、PNG 或 WebP。', true);
    };
    image.src = sourcePath;
  }

  openButton.addEventListener('click', openCropper);
  zoomInput.addEventListener('input', function(){ setZoom(Number(zoomInput.value)); });
  canvas.addEventListener('wheel', function(event){
    if(!image) return;
    event.preventDefault();
    setZoom((Number(zoomInput.value) || 1) + (event.deltaY < 0 ? .08 : -.08));
  }, {passive:false});
  canvas.addEventListener('pointerdown', function(event){
    if(!image) return;
    dragging = {id:event.pointerId, x:event.clientX, y:event.clientY, imageX:x, imageY:y};
    canvas.classList.add('is-dragging');
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', function(event){
    if(!dragging || dragging.id !== event.pointerId || !image) return;
    var rect = canvas.getBoundingClientRect();
    x = dragging.imageX + (event.clientX - dragging.x) * canvas.width / rect.width;
    y = dragging.imageY + (event.clientY - dragging.y) * canvas.height / rect.height;
    clampPosition();
    draw();
  });
  function stopDrag(event){
    if(!dragging || (event && event.pointerId !== dragging.id)) return;
    dragging = null;
    canvas.classList.remove('is-dragging');
  }
  canvas.addEventListener('pointerup', stopDrag);
  canvas.addEventListener('pointercancel', stopDrag);

  saveButton.addEventListener('click', function(){
    if(!image || !sourcePath) return;
    saveButton.disabled = true;
    setStatus('正在导出 16:9 封面…');
    canvas.toBlob(function(blob){
      if(!blob){
        saveButton.disabled = false;
        setStatus('浏览器无法导出 WebP，请更换现代浏览器后重试。', true);
        return;
      }
      var form = new FormData();
      form.append('source', sourcePath);
      form.append('crop', new File([blob], 'cover-16x9.webp', {type:'image/webp'}));
      fetch((launch ? launch.getAttribute('data-media-url') : '/admin/media') + '?action=cover-crop', {method:'POST', credentials:'same-origin', body:form})
        .then(function(response){ return response.json().catch(function(){ return {ok:false, error:'裁剪服务返回了无效响应'}; }); })
        .then(function(result){
          if(!result || !result.ok || !result.path) throw new Error((result && result.error) || '保存裁剪封面失败');
          coverInput.value = result.path;
          if(coverModeInput) coverModeInput.value = 'cover';
          document.querySelectorAll('.cover-option').forEach(function(option){ option.classList.toggle('active', option.getAttribute('data-cover') === result.path); });
          if(typeof dialog.close === 'function') dialog.close(); else dialog.removeAttribute('open');
          setStatus('已生成 16:9 封面，发布或更新文章后会同步到公开站。');
        })
        .catch(function(error){ setStatus(error && error.message ? error.message : '保存裁剪封面失败', true); })
        .finally(function(){ saveButton.disabled = false; });
    }, 'image/webp', .9);
  });
})();
