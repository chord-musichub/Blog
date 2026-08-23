# v20.18.5 音频可视化边框与控制按钮修复

## 修复 1：删除旧方形外框

用户截图中仍可见外层方形底板/旧容器边界，与内部圆角舞台形成双边框。

本版处理：

- `audio-visualizer-page` 自身完全透明
- 清除 tool-page / page shell / content shell 的 border、shadow、background
- 只保留 `.av-stage` 一个圆角舞台边框
- `.av-stage::before/after` 强制隐藏
- `.av-stage` 使用 round clip-path 保持圆角裁切

## 修复 2：授权后鼠标保持可见

移除 live 状态下的 `cursor:none`，避免用户授权音频后找不到鼠标。

## 修复 3：授权后控制按钮保持可见

live 状态下 `.av-controls` 现在保持 0.92 opacity，并固定右下角显示。  
全屏显示 / 停止按钮不会再淡到几乎看不见。

## 修改范围

- `static/css/site.css`
- `static/js/tools/audio-visualizer.js`
- `layouts/tools/audio-visualizer.html`
- 本地助手下载包版本号同步
