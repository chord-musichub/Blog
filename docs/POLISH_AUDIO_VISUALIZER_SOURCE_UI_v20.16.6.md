# v20.18.5 音频可视化来源区与边框优化

## 优化 1：删除重复边框

问题：音频可视化页同时存在旧外框和新圆角舞台边框，看起来像两个边框叠在一起。

处理：

- 清空 `main.tool-page.audio-visualizer-page` 的 border / shadow / radius
- 隐藏 `.audio-visualizer-page::before/after`
- 隐藏 `.av-stage::before/after`
- 只保留 `.av-stage` 一个圆角边框

## 优化 2：删除底部本地桥接助手重复卡片

底部 `av-bridge-card` 和“系统声音”来源卡片功能重复，已从模板移除，并在 CSS 中强制隐藏旧残留。

## 优化 3：新增网页端系统声音授权按钮

新增按钮：

```text
授权系统声音
```

前端使用：

```js
navigator.mediaDevices.getDisplayMedia({
  video: true,
  audio: {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    systemAudio: 'include',
    suppressLocalAudioPlayback: false
  }
})
```

说明：

- 浏览器权限模型通常仍需要选择屏幕/窗口/标签页
- 页面会停止视频轨道，只保留音频轨道
- 如果浏览器没有返回音频轨道，会提示改用本地助手
- 此模式只做频谱，不读取歌曲名/封面

## 下载包

```text
/downloads/SonglineMusicBridge-v20.18.5-oneclick.zip
```
