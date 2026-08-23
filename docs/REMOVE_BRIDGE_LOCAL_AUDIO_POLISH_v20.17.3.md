# v20.18.5 移除本地助手与本地音频优化

## 移除本地助手

本版删除：

```text
local-bridge/
static/downloads/SonglineMusicBridge-*.zip
```

同时移除前端对本地助手的连接和轮询逻辑，不再访问：

```text
http://127.0.0.1:23333/status
http://127.0.0.1:23333/audio
```

CSP 也删除 localhost bridge 白名单。

## 本地音频封面

本版新增 MP3 ID3v2 解析：

- `APIC`：封面图片
- `TIT2`：标题
- `TPE1`：歌手
- `TALB`：专辑

如果音频文件内没有嵌入封面，则继续显示默认音符占位图。

## 音量调节

新增音量滑条：

```text
0% - 100%
```

只影响本地上传音频。音量保存到：

```text
songline-audio-visualizer-volume-v1
```
