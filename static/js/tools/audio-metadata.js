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
  else if(key === 'ARTIST') result.artist = result.artist || value;
  else if(key === 'ALBUMARTIST') result.albumArtist = result.albumArtist || value;
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

function parseFlacTags(bytes, result, options){
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

    if(type === 0 && length === 34){
      result.sampleRate = (bytes[start + 10] << 12) | (bytes[start + 11] << 4) | (bytes[start + 12] >> 4);
    }else if(type === 4){
      parseVorbisCommentBlock(bytes, start, length, result);
    }else if(type === 6 && !result.cover && options.cover !== false){
      var pic = parseFlacPictureBlock(bytes, start, length);
      if(pic && pic.bytes && pic.bytes.length){
        if(!options.independent && coverUrl){
          try{ URL.revokeObjectURL(coverUrl); }catch(err){}
        }
        result.cover = URL.createObjectURL(new Blob([pic.bytes], {type:pic.mime || 'image/jpeg'}));
        if(!options.independent) coverUrl = result.cover;
      }
    }

    offset = start + length;
  }
}

function fourCC(bytes, pos){
  return String.fromCharCode(bytes[pos], bytes[pos + 1], bytes[pos + 2], bytes[pos + 3]);
}

function parseWave(bytes, result){
  var end = Math.min(bytes.length, 8 + readUint32LE(bytes, 4));
  for(var pos = 12; pos + 8 <= end;){
    var id = fourCC(bytes, pos), size = readUint32LE(bytes, pos + 4), start = pos + 8;
    if(id === 'fmt ' && size >= 16 && start + 16 <= end){
      result.sampleRate = readUint32LE(bytes, start + 4);
    }else if(id === 'LIST' && start + size <= end && size >= 4 && fourCC(bytes, start) === 'INFO'){
      for(var item = start + 4; item + 8 <= start + size;){
        var key = fourCC(bytes, item), len = readUint32LE(bytes, item + 4);
        if(item + 8 + len > start + size) break;
        if(key === 'INAM') result.title = result.title || readUtf8(bytes, item + 8, len);
        else if(key === 'IART') result.artist = result.artist || readUtf8(bytes, item + 8, len);
        else if(key === 'IPRD') result.album = result.album || readUtf8(bytes, item + 8, len);
        item += 8 + len + (len & 1);
      }
    }
    pos = start + size + (size & 1);
  }
}

function parseMpegRate(bytes, start, result){
  var end = Math.min(bytes.length - 3, start + 4096);
  for(var pos = start; pos < end; pos++){
    if(bytes[pos] !== 255 || (bytes[pos + 1] & 224) !== 224) continue;
    var version = (bytes[pos + 1] >> 3) & 3, layer = (bytes[pos + 1] >> 1) & 3;
    var bitrate = bytes[pos + 2] >> 4, rate = (bytes[pos + 2] >> 2) & 3;
    if(version === 1 || !layer || !bitrate || bitrate === 15 || rate === 3) continue;
    result.sampleRate = [44100,48000,32000][rate] / (version === 3 ? 1 : version === 2 ? 2 : 4);
    return;
  }
}

// Only metadata containers are traversed, never media payloads. Bound depth and
// atom count even for malformed files; the moov container can live after mdat.
function parseMp4Atoms(bytes, start, end, result, options, depth, budget){
  if(depth > 10) return;
  for(var pos = start; pos + 8 <= end && budget.left-- > 0;){
    var size = readUint32BE(bytes, pos), id = fourCC(bytes, pos + 4), header = 8;
    if(size === 1){
      if(pos + 16 > end) break;
      size = readUint32BE(bytes, pos + 8) * 4294967296 + readUint32BE(bytes, pos + 12);
      header = 16;
    }else if(size === 0) size = end - pos;
    if(!Number.isSafeInteger(size) || size < header || pos + size > end) break;
    var payload = pos + header, finish = pos + size;
    if(/^(moov|udta|ilst|trak|mdia|minf|stbl)$/.test(id)){
      parseMp4Atoms(bytes, payload, finish, result, options, depth + 1, budget);
    }else if(id === 'meta' && payload + 4 <= finish){
      parseMp4Atoms(bytes, payload + 4, finish, result, options, depth + 1, budget);
    }else if(id === 'stsd' && payload + 8 <= finish){
      parseMp4Atoms(bytes, payload + 8, finish, result, options, depth + 1, budget);
    }else if(id === 'mp4a' && payload + 28 <= finish){
      // Version-zero sound sample entry stores a 16.16 fixed-point rate.
      if(bytes[payload + 8] === 0 && bytes[payload + 9] === 0){
        result.sampleRate = readUint32BE(bytes, payload + 24) / 65536;
      }
    }else if(id === '©nam' || id === '©ART' || id === 'aART' || id === '©alb' || id === 'covr'){
      for(var item = payload; item + 16 <= finish;){
        var length = readUint32BE(bytes, item);
        if(length < 16 || item + length > finish) break;
        if(fourCC(bytes, item + 4) === 'data'){
          var value = id === 'covr' ? '' : readUtf8(bytes, item + 16, length - 16);
          if(id === '©nam') result.title = result.title || value;
          else if(id === '©ART') result.artist = result.artist || value;
          else if(id === 'aART') result.albumArtist = result.albumArtist || value;
          else if(id === '©alb') result.album = result.album || value;
          else if(id === 'covr' && !result.cover && options.cover !== false){
            storePicture({bytes:bytes.slice(item + 16, item + length)}, result, options);
          }
        }
        item += length;
      }
    }
    pos = finish;
  }
}

function storePicture(pic, result, options){
  if(!pic || !pic.bytes.length) return;
  if(!options.independent && coverUrl){
    try{ URL.revokeObjectURL(coverUrl); }catch(err){}
  }
  result.cover = URL.createObjectURL(new Blob([pic.bytes], {type:guessImageMime(pic.bytes, pic.mime)}));
  if(!options.independent) coverUrl = result.cover;
}

async function readMp4Tags(file, bytes, result, options){
  var pos = 0, fileSize = file.size || bytes.length;
  for(var guard = 0; guard < 128 && pos + 8 <= fileSize; guard++){
    var head = pos + 16 <= bytes.length ? bytes.subarray(pos, pos + 16) : new Uint8Array(await file.slice(pos, pos + 16).arrayBuffer());
    if(head.length < 8) break;
    var size = readUint32BE(head, 0), header = 8;
    if(size === 1){
      if(head.length < 16) break;
      size = readUint32BE(head, 8) * 4294967296 + readUint32BE(head, 12);header = 16;
    }else if(size === 0) size = fileSize - pos;
    if(!Number.isSafeInteger(size) || size < header || pos + size > fileSize) break;
    if(fourCC(head, 4) === 'moov'){
      if(size > 16 * 1024 * 1024) break;
      var moov = pos + size <= bytes.length ? bytes.subarray(pos, pos + size) : new Uint8Array(await file.slice(pos, pos + size).arrayBuffer());
      parseMp4Atoms(moov, 0, moov.length, result, options, 0, {left:4096});
      break;
    }
    pos += size;
  }
}

async function readAudioTags(file, options){
  options = options || {};
  var result = {title:'', artist:'', album:'', cover:'', sampleRate:0};
  try{
    // Bound each read; MP4 can seek directly to a trailing metadata container.
    var buf = await file.slice(0, 16 * 1024 * 1024).arrayBuffer();
    var bytes = new Uint8Array(buf);
    if(bytes.length < 16) return result;
    var mpeg = false;

    if(bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33){
      mpeg = true;
      var version = bytes[3];
      var tagSize = syncSafe(bytes[6], bytes[7], bytes[8], bytes[9]);
      var offset = 10;
      var limit = Math.min(bytes.length, 10 + tagSize);
      var legacy = version === 2, frameHeader = legacy ? 6 : 10;
      if(version < 2 || version > 4) return result;
      if(!legacy && (bytes[5] & 64) && offset + 4 <= limit){
        offset += version === 4 ? syncSafe(bytes[10],bytes[11],bytes[12],bytes[13]) : 4 + readUint32BE(bytes,10);
      }

      while(offset + frameHeader <= limit){
        var id = legacy ? String.fromCharCode(bytes[offset],bytes[offset + 1],bytes[offset + 2]) : fourCC(bytes, offset);
        if(!(legacy ? /^[A-Z0-9]{3}$/ : /^[A-Z0-9]{4}$/).test(id)) break;

        var size = legacy ? (bytes[offset + 3] << 16) + (bytes[offset + 4] << 8) + bytes[offset + 5] : version === 4
          ? syncSafe(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7])
          : normalSize(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);

        if(size <= 0 || offset + frameHeader + size > limit) break;

        var frameStart = offset + frameHeader;
        if(id === 'TIT2' || id === 'TT2') result.title = result.title || readTextFrame(bytes, frameStart, size);
        else if(id === 'TPE1' || id === 'TP1') result.artist = result.artist || readTextFrame(bytes, frameStart, size);
        else if(id === 'TPE2' || id === 'TP2') result.albumArtist = result.albumArtist || readTextFrame(bytes, frameStart, size);
        else if(id === 'TALB' || id === 'TAL') result.album = result.album || readTextFrame(bytes, frameStart, size);
        else if(id === 'APIC' && !result.cover && options.cover !== false){
          var pic = parseApic(bytes, frameStart, size);
          storePicture(pic, result, options);
        }

        offset += frameHeader + size;
      }
      parseMpegRate(bytes, 10 + tagSize + (version === 4 && (bytes[5] & 16) ? 10 : 0), result);
    }else if(bytes[0] === 0x66 && bytes[1] === 0x4c && bytes[2] === 0x61 && bytes[3] === 0x43){
      parseFlacTags(bytes, result, options);
    }else if(fourCC(bytes, 0) === 'RIFF' && fourCC(bytes, 8) === 'WAVE'){
      parseWave(bytes, result);
    }else if(fourCC(bytes, 4) === 'ftyp'){
      await readMp4Tags(file, bytes, result, options);
    }else if(bytes[0] === 255 && (bytes[1] & 224) === 224){
      mpeg = true;
      parseMpegRate(bytes, 0, result);
    }
    result.artist = result.artist || result.albumArtist || '';
    delete result.albumArtist;
    // ID3v1 is a small fixed tail, only needed when a field is absent.
    if(mpeg && (!result.artist || !result.title) && file.size >= 128){
      var tail = new Uint8Array(await file.slice(file.size - 128, file.size).arrayBuffer());
      if(tail.length === 128 && String.fromCharCode(tail[0],tail[1],tail[2]) === 'TAG'){
        var decode = function(start){ return new TextDecoder('iso-8859-1').decode(tail.slice(start,start + 30)).replace(/\0+$/g,'').trim(); };
        result.title = result.title || decode(3);
        result.artist = result.artist || decode(33);
        result.album = result.album || decode(63);
      }
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
