# v20.18.5 2048 棋盘比例 / 移动反馈 / 按键 UI 修复

## 修复点

### 1. 修复点击上键后底部格子比例失调

棋盘格子现在强制保持：

- `grid-auto-rows: 1fr`
- tile `aspect-ratio: 1 / 1`
- tile `width/height: 100%`
- `box-sizing: border-box`

避免移动端点击方向键后，浏览器布局重算导致底行格子被压缩或比例异常。

### 2. 增加移动反馈动画

上下左右移动时，棋盘会根据方向加短动画：

- `is-moving-up`
- `is-moving-down`
- `is-moving-left`
- `is-moving-right`

不再完全像瞬移。

### 3. 方向按键补 hover / focus

方向键、重新开始按钮、覆盖层按钮都增加：

- hover
- focus-visible
- active

桌面端鼠标悬停更明显，键盘 focus 也有反馈。

### 4. 返回键改为纯图标

`/tools/2048/` 页面返回键从：

```text
← 返回工具舱
```

改为纯图标：

```text
←
```

同时保留 `aria-label` 和 `title`。
