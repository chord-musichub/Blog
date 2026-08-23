# v20.18.5 新增 2048 小游戏

## 新增功能

在工具页新增一个简单的 2048 小游戏。

## 路径

- `/tools/2048/`

## 操作方式

### 桌面端

- 方向键：上下左右移动
- WASD：上下左右移动

### 手机端

- 页面下方提供四个方向按键
- 同时支持在棋盘区域滑动

## 功能

- 分数统计
- 本地最高分
- 重新开始
- 达成 2048 提示
- 游戏结束提示

## 新增文件

- `content/tools/2048/_index.md`
- `layouts/tools/2048.html`
- `static/js/tools/game-2048.js`

## 修改文件

- `layouts/tools/tools.html`
- `layouts/partials/page-specific-scripts.html`
- `layouts/partials/resource-hints.html`
- `static/js/page-modules.js`
- `static/css/site.css`
