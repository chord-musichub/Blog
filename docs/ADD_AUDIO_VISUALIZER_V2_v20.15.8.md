# v20.18.5 新增音频可视化工具 v2

## 新增页面

- `/tools/audio-visualizer/`

## 功能

1. 全屏音频可视化界面
2. Canvas 频谱圆环 / 波形 / 粒子 / 氛围背景
3. 支持捕获屏幕 / 标签页 / 系统音频
4. 支持上传本地音频文件播放并可视化
5. 支持连接 Windows 本地助手读取播放器媒体信息
   - 歌名
   - 歌手
   - 专辑
   - 播放状态
   - 进度
   - 封面

## 本地助手

新增源码目录：

```text
local-bridge/windows/SonglineMusicBridge/
```

新增网站可下载源码包：

```text
static/downloads/SonglineMusicBridge-v20.18.5-source.zip
```

本地助手接口：

```text
http://127.0.0.1:23333/status
http://127.0.0.1:23333/health
```

## 限制

网页不能直接读取 QQ 音乐 / 网易云音乐等桌面软件的媒体信息。  
本版通过 Windows 本地桥接助手读取系统媒体会话。  
如果播放器没有向 Windows 暴露媒体信息，则网页也无法读取完整歌名/封面。

## 修改文件

- `content/tools/audio-visualizer/_index.md`
- `layouts/tools/audio-visualizer.html`
- `static/js/tools/audio-visualizer.js`
- `static/css/site.css`
- `layouts/tools/tools.html`
- `deploy/rebuild.sh`
- `layouts/partials/page-specific-scripts.html`
- `layouts/partials/resource-hints.html`
- `static/js/page-modules.js`
- `cmd/server/main.go`
