// 统一媒体裁剪器：每个入口通过 data-crop-* 声明输入、输出与比例。
(function(){
  'use strict';
  var buttons = Array.prototype.slice.call(document.querySelectorAll('[data-crop-source][data-crop-target]'));
  var dialog = document.getElementById('coverCropDialog');
  var canvas = document.getElementById('coverCropCanvas');
  var zoomInput = document.getElementById('coverCropZoom');
  var saveButton = document.getElementById('coverCropSave');
  var sizeLabel = document.getElementById('coverCropSize');
  var title = document.getElementById('coverCropTitle');
  if(!buttons.length || !dialog || !canvas || !zoomInput || !saveButton) return;

  var ratios = {'1x1':[1200,1200], '3x2':[1500,1000], '4x3':[1600,1200], '16x9':[1600,900]};
  var ctx = canvas.getContext('2d');
  var image = null, sourcePath = '', sourceInput = null, targetInput = null, activeButton = null;
  var variant = '16x9', baseScale = 1, x = 0, y = 0, dragging = null;

  function activeStatus(){
    if(!activeButton) return null;
    var selector = activeButton.getAttribute('data-crop-status');
    return selector ? document.querySelector(selector) : document.getElementById('coverCropStatus');
  }
  function setStatus(message, isError){
    var status = activeStatus();
    if(!status) return;
    status.textContent = message;
    status.classList.toggle('error', !!isError);
  }
  function currentSize(){ return ratios[variant] || ratios['16x9']; }
  function configureCanvas(){
    var size = currentSize();
    canvas.width = size[0]; canvas.height = size[1];
    canvas.style.aspectRatio = size[0] + ' / ' + size[1];
    if(sizeLabel) sizeLabel.textContent = size[0] + ' × ' + size[1];
  }
  function draw(){
    if(!image || !image.naturalWidth || !image.naturalHeight) return;
    var zoom = Number(zoomInput.value) || 1;
    var width = image.naturalWidth * baseScale * zoom;
    var height = image.naturalHeight * baseScale * zoom;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#17243a'; ctx.fillRect(0, 0, canvas.width, canvas.height);
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
    clampPosition(); draw();
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
    x = canvas.width / 2 - focusX * image.naturalWidth * baseScale * next;
    y = canvas.height / 2 - focusY * image.naturalHeight * baseScale * next;
    clampPosition(); draw();
  }
  function openCropper(button){
    activeButton = button;
    sourceInput = document.querySelector(button.getAttribute('data-crop-source'));
    targetInput = document.querySelector(button.getAttribute('data-crop-target'));
    variant = ratios[button.getAttribute('data-crop-ratio')] ? button.getAttribute('data-crop-ratio') : '16x9';
    if(!sourceInput || !targetInput){ setStatus('裁剪入口配置错误，请刷新后重试。', true); return; }
    sourcePath = (sourceInput.value || '').trim();
    if(!sourcePath){ setStatus('请先上传或从媒体库选择一张图片。', true); return; }
    if(/^\/media\/(projects|memories)\//.test(sourcePath)){
      importLegacySource(button, sourcePath);
      return;
    }
    if(!/^\/uploads\//.test(sourcePath)){ setStatus('只能裁剪自己媒体库中的 JPG、PNG 或 WebP 图片。', true); return; }
    loadImage();
  }
  function importLegacySource(button, legacyPath){
    setStatus('正在把旧图片迁入媒体库…');
    var holder = button.closest('[data-media-url]');
    var mediaURL = button.getAttribute('data-media-url') || (holder && holder.getAttribute('data-media-url')) || '/admin/media';
    var form = new FormData(); form.append('source', legacyPath);
    fetch(mediaURL + '?action=media-import', {method:'POST', credentials:'same-origin', body:form})
      .then(function(response){ return response.json().catch(function(){ return {ok:false,error:'迁移服务返回了无效响应'}; }); })
      .then(function(result){
        if(!result || !result.ok || !result.path) throw new Error((result && result.error) || '迁移旧图片失败');
        sourcePath = result.path; sourceInput.value = result.path; targetInput.value = result.path;
        setStatus('旧图片已迁入媒体库，正在读取…'); loadImage();
      })
      .catch(function(error){ setStatus(error && error.message ? error.message : '迁移旧图片失败', true); });
  }
  function loadImage(){
    configureCanvas();
    if(title) title.textContent = '裁剪' + (button.getAttribute('data-crop-label') || '图片') + '（' + variant.replace('x', ':') + '）';
    saveButton.textContent = '保存 ' + variant.replace('x', ':') + ' 图片';
    setStatus('正在读取原图…');
    image = new Image(); image.decoding = 'async';
    image.onload = function(){
      resetCrop();
      if(typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
      setStatus('拖动或缩放后保存，原图会保留。');
    };
    image.onerror = function(){ image = null; setStatus('图片无法读取。请确认它位于自己的媒体库，且是 JPG、PNG 或 WebP。', true); };
    image.src = sourcePath;
  }

  buttons.forEach(function(button){ button.addEventListener('click', function(){ openCropper(button); }); });
  zoomInput.addEventListener('input', function(){ setZoom(Number(zoomInput.value)); });
  canvas.addEventListener('wheel', function(event){ if(!image) return; event.preventDefault(); setZoom((Number(zoomInput.value) || 1) + (event.deltaY < 0 ? .08 : -.08)); }, {passive:false});
  canvas.addEventListener('pointerdown', function(event){ if(!image) return; dragging = {id:event.pointerId,x:event.clientX,y:event.clientY,imageX:x,imageY:y}; canvas.classList.add('is-dragging'); canvas.setPointerCapture(event.pointerId); });
  canvas.addEventListener('pointermove', function(event){
    if(!dragging || dragging.id !== event.pointerId || !image) return;
    var rect = canvas.getBoundingClientRect();
    x = dragging.imageX + (event.clientX - dragging.x) * canvas.width / rect.width;
    y = dragging.imageY + (event.clientY - dragging.y) * canvas.height / rect.height;
    clampPosition(); draw();
  });
  function stopDrag(event){ if(!dragging || (event && event.pointerId !== dragging.id)) return; dragging = null; canvas.classList.remove('is-dragging'); }
  canvas.addEventListener('pointerup', stopDrag); canvas.addEventListener('pointercancel', stopDrag);

  saveButton.addEventListener('click', function(){
    if(!image || !sourcePath || !targetInput || !activeButton) return;
    saveButton.disabled = true; setStatus('正在导出裁剪图片…');
    canvas.toBlob(function(blob){
      if(!blob){ saveButton.disabled = false; setStatus('浏览器无法导出 WebP，请换用现代浏览器后重试。', true); return; }
      var form = new FormData();
      form.append('source', sourcePath); form.append('variant', variant); form.append('crop', new File([blob], 'crop-'+variant+'.webp', {type:'image/webp'}));
      var holder = activeButton.closest('[data-media-url]');
      var mediaURL = activeButton.getAttribute('data-media-url') || (holder && holder.getAttribute('data-media-url'));
      fetch((mediaURL || '/admin/media') + '?action=media-crop', {method:'POST', credentials:'same-origin', body:form})
        .then(function(response){ return response.json().catch(function(){ return {ok:false,error:'裁剪服务返回了无效响应'}; }); })
        .then(function(result){
          if(!result || !result.ok || !result.path) throw new Error((result && result.error) || '保存裁剪图片失败');
          targetInput.value = result.path;
          targetInput.dispatchEvent(new Event('input', {bubbles:true})); targetInput.dispatchEvent(new Event('change', {bubbles:true}));
          var modeSelector = activeButton.getAttribute('data-crop-mode');
          var mode = modeSelector && document.querySelector(modeSelector); if(mode) mode.value = 'cover';
          document.querySelectorAll('.cover-option').forEach(function(option){ option.classList.toggle('active', option.getAttribute('data-cover') === result.path); });
          if(typeof dialog.close === 'function') dialog.close(); else dialog.removeAttribute('open');
          setStatus('已生成裁剪图片，保存当前内容后即可生效。');
        })
        .catch(function(error){ setStatus(error && error.message ? error.message : '保存裁剪图片失败', true); })
        .finally(function(){ saveButton.disabled = false; });
    }, 'image/webp', .9);
  });
})();
