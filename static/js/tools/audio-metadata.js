(function(){
  'use strict';

  // 音频元数据解析不依赖页面状态，可被播放器或其他工具复用。
  var coverUrl = '';

function readTextFrame(bytes, start, size){
  if(size <= 1) return '';
  var enc = bytes[start];
  var data = bytes.slice(start + 1, start + size);
  try{
    if(enc === 1){
      if(data.length >= 2 && data[0] === 0xFE && data[1] === 0xFF){
        return new TextDecoder('utf-16be').decode(data.slice(2)).replace(/\0+$/g, '').trim();
      }
      if(data.length >= 2 && data[0] === 0xFF && data[1] === 0xFE){
        return new TextDecoder('utf-16le').decode(data.slice(2)).replace(/\0+$/g, '').trim();
      }
      return new TextDecoder('utf-16le').decode(data).replace(/\0+$/g, '').trim();
    }
    if(enc === 2) return new TextDecoder('utf-16be').decode(data).replace(/\0+$/g, '').trim();
    if(enc === 3) return new TextDecoder('utf-8').decode(data).replace(/\0+$/g, '').trim();
    return new TextDecoder('iso-8859-1').decode(data).replace(/\0+$/g, '').trim();
  }catch(err){
    try{
      return new TextDecoder('utf-8').decode(data).replace(/\0+$/g, '').trim();
    }catch(e){
      return '';
    }
  }
}

function syncSafe(b0, b1, b2, b3){
  return ((b0 & 0x7f) << 21) | ((b1 & 0x7f) << 14) | ((b2 & 0x7f) << 7) | (b3 & 0x7f);
}

function normalSize(b0, b1, b2, b3){
  return ((b0 << 24) >>> 0) + (b1 << 16) + (b2 << 8) + b3;
}

function findTextTerminator(bytes, pos, end, enc){
  if(enc === 1 || enc === 2){
    for(var i = pos; i + 1 < end; i += 2){
      if(bytes[i] === 0 && bytes[i + 1] === 0) return i + 2;
    }
    return pos;
  }
  for(var j = pos; j < end; j++){
    if(bytes[j] === 0) return j + 1;
  }
  return pos;
}

function parseApic(bytes, start, size){
  if(size <= 8) return null;
  var end = start + size;
  var enc = bytes[start];
  var pos = start + 1;
  var mimeEnd = pos;

  while(mimeEnd < end && bytes[mimeEnd] !== 0) mimeEnd++;

  var mime = 'image/jpeg';
  try{
    mime = new TextDecoder('ascii').decode(bytes.slice(pos, mimeEnd)) || 'image/jpeg';
  }catch(err){}

  pos = mimeEnd + 1;
  pos += 1; // picture type
  pos = findTextTerminator(bytes, pos, end, enc);

  if(pos <= start || pos >= end) return null;

  var imageBytes = bytes.slice(pos, end);
  if(!imageBytes.length) return null;

  return {mime:mime, bytes:imageBytes};
}


function readUint32BE(bytes, pos){
  return ((bytes[pos] << 24) >>> 0) + (bytes[pos + 1] << 16) + (bytes[pos + 2] << 8) + bytes[pos + 3];
}

function readUint32LE(bytes, pos){
  return (bytes[pos] >>> 0) + (bytes[pos + 1] << 8) + (bytes[pos + 2] << 16) + ((bytes[pos + 3] << 24) >>> 0);
}

function readUtf8(bytes, start, size){
  if(size <= 0) return '';
  try{
    return new TextDecoder('utf-8').decode(bytes.slice(start, start + size)).replace(/\0+$/g, '').trim();
  }catch(err){
    return '';
  }
}

function applyVorbisComment(result, raw){
  if(!raw) return;
  var eq = raw.indexOf('=');
  if(eq <= 0) return;
  var key = raw.slice(0, eq).toUpperCase();
  var value = raw.slice(eq + 1).trim();
  if(!value) return;
  if(key === 'TITLE') result.title = result.title || value;
  else if(key === 'ARTIST' || key === 'ALBUMARTIST') result.artist = result.artist || value;
  else if(key === 'ALBUM') result.album = result.album || value;
}

function parseVorbisCommentBlock(bytes, start, size, result){
  var end = start + size;
  var pos = start;
  if(pos + 8 > end) return;

  var vendorLen = readUint32LE(bytes, pos);
  pos += 4 + vendorLen;
  if(pos + 4 > end) return;

  var commentCount = readUint32LE(bytes, pos);
  pos += 4;

  for(var i = 0; i < commentCount && pos + 4 <= end; i++){
    var len = readUint32LE(bytes, pos);
    pos += 4;
    if(len <= 0 || pos + len > end) break;
    applyVorbisComment(result, readUtf8(bytes, pos, len));
    pos += len;
  }
}

function guessImageMime(imageBytes, fallback){
  if(imageBytes && imageBytes.length >= 12){
    if(imageBytes[0] === 0xff && imageBytes[1] === 0xd8) return 'image/jpeg';
    if(imageBytes[0] === 0x89 && imageBytes[1] === 0x50 && imageBytes[2] === 0x4e && imageBytes[3] === 0x47) return 'image/png';
    if(imageBytes[0] === 0x47 && imageBytes[1] === 0x49 && imageBytes[2] === 0x46) return 'image/gif';
    if(imageBytes[0] === 0x52 && imageBytes[1] === 0x49 && imageBytes[2] === 0x46 && imageBytes[3] === 0x46 && imageBytes[8] === 0x57 && imageBytes[9] === 0x45 && imageBytes[10] === 0x42 && imageBytes[11] === 0x50) return 'image/webp';
  }
  return fallback || 'image/jpeg';
}

function parseFlacPictureBlock(bytes, start, size){
  var end = start + size;
  var pos = start;
  if(pos + 8 > end) return null;

  pos += 4; // picture type
  var mimeLen = readUint32BE(bytes, pos);
  pos += 4;
  if(mimeLen < 0 || pos + mimeLen + 20 > end) return null;

  var mime = readUtf8(bytes, pos, mimeLen) || 'image/jpeg';
  pos += mimeLen;

  if(pos + 4 > end) return null;
  var descLen = readUint32BE(bytes, pos);
  pos += 4 + descLen;
  if(pos + 20 > end) return null;

  pos += 16; // width, height, depth, indexed colors
  var dataLen = readUint32BE(bytes, pos);
  pos += 4;
  if(dataLen <= 0 || pos + dataLen > end) return null;

  var imageBytes = bytes.slice(pos, pos + dataLen);
  return {mime:guessImageMime(imageBytes, mime), bytes:imageBytes};
}

function parseFlacTags(bytes, result){
  if(bytes.length < 8) return;
  if(!(bytes[0] === 0x66 && bytes[1] === 0x4c && bytes[2] === 0x61 && bytes[3] === 0x43)) return;

  var offset = 4;
  var last = false;
  var blockGuard = 0;
  while(!last && offset + 4 <= bytes.length && blockGuard++ < 64){
    var header = bytes[offset];
    last = !!(header & 0x80);
    var type = header & 0x7f;
    var length = (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3];
    var start = offset + 4;
    if(length < 0 || start + length > bytes.length) break;

    if(type === 4){
      parseVorbisCommentBlock(bytes, start, length, result);
    }else if(type === 6 && !result.cover){
      var pic = parseFlacPictureBlock(bytes, start, length);
      if(pic && pic.bytes && pic.bytes.length){
        if(coverUrl){
          try{ URL.revokeObjectURL(coverUrl); }catch(err){}
        }
        coverUrl = URL.createObjectURL(new Blob([pic.bytes], {type:pic.mime || 'image/jpeg'}));
        result.cover = coverUrl;
      }
    }

    offset = start + length;
  }
}

async function readAudioTags(file){
  var result = {title:'', artist:'', album:'', cover:''};
  try{
    var buf = await file.arrayBuffer();
    var bytes = new Uint8Array(buf);
    if(bytes.length < 16) return result;

    if(bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33){
      var version = bytes[3];
      var tagSize = syncSafe(bytes[6], bytes[7], bytes[8], bytes[9]);
      var offset = 10;
      var limit = Math.min(bytes.length, 10 + tagSize);

      while(offset + 10 <= limit){
        var id = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
        if(!/^[A-Z0-9]{4}$/.test(id)) break;

        var size = version === 4
          ? syncSafe(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7])
          : normalSize(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);

        if(size <= 0 || offset + 10 + size > limit) break;

        var frameStart = offset + 10;
        if(id === 'TIT2') result.title = result.title || readTextFrame(bytes, frameStart, size);
        else if(id === 'TPE1') result.artist = result.artist || readTextFrame(bytes, frameStart, size);
        else if(id === 'TALB') result.album = result.album || readTextFrame(bytes, frameStart, size);
        else if(id === 'APIC' && !result.cover){
          var pic = parseApic(bytes, frameStart, size);
          if(pic){
            if(coverUrl){
              try{ URL.revokeObjectURL(coverUrl); }catch(err){}
            }
            coverUrl = URL.createObjectURL(new Blob([pic.bytes], {type:pic.mime || 'image/jpeg'}));
            result.cover = coverUrl;
          }
        }

        offset += 10 + size;
      }
    }else if(bytes[0] === 0x66 && bytes[1] === 0x4c && bytes[2] === 0x61 && bytes[3] === 0x43){
      parseFlacTags(bytes, result);
    }
  }catch(err){
    console.warn('[audio-visualizer] failed to parse audio tags', err);
  }
  return result;
}


  function revokeLastCover(){
    if(!coverUrl) return;
    try{ URL.revokeObjectURL(coverUrl); }catch(err){}
    coverUrl = '';
  }

  window.SonglineAudioMetadata = {
    read: readAudioTags,
    revokeLastCover: revokeLastCover
  };
})();
