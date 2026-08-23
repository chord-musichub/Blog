# v20.18.5 音频可视化返回逻辑与卡片 hover 修复

## 修复 1：返回逻辑硬修

前几版通过补丁插入 `resetToInitialView()` 时，函数被插入到了 `connectBrowserSystemAudio()` 的局部分支里，导致返回键绑定并不稳定。

本版直接重写 `static/js/tools/audio-visualizer.js`，保证：

1. 播放 / live 状态下点击返回键：
   - 阻止默认跳转
   - 停止当前音频 / 浏览器音频流
   - 回到音频可视化初始选择界面

2. 已经在初始界面时点击返回键：
   - 跳转 `/tools/`

## 修复 2：删除 stopBtn 残留

右上角仍无“停止”按钮，也没有 `stopBtn` JS 残留。

## 优化 3：内部来源卡片 hover / focus

给两个来源卡片新增：

- hover 上浮
- border 高亮
- 背景光感增强
- 阴影增强
- focus-visible
- focus-within
- active 反馈
- hover 时内部按钮同步高亮

同时 JS 中让整张卡片可点击，按 Enter / Space 也能触发内部按钮。
