# v20.18.5 修复 2048 左上角闪现方块

## 问题

2048 移动结束后，有时会有方块在左上角闪现一下，然后消失。

## 根因

新版 2048 使用 absolute tile layer：

- 外层 `.game-2048-tile` 负责位置：`transform: translate3d(x, y, 0)`
- 内层 `span` 显示数字

但 v20.14.3 的新块出现 / 合成动画写在外层 tile 上：

```css
.game-2048-tile.is-new {
  animation: ... transform: scale(...)
}
```

CSS 动画里的 `transform: scale(...)` 会临时覆盖外层 tile 的 `transform: translate3d(...)`。  
于是方块在动画期间失去定位，只剩下：

```css
left: 0;
top: 0;
transform: scale(...);
```

看起来就是左上角闪现一个方块。

## 修复

1. 外层 tile 永远只负责定位。
2. 新块出现 / 合成弹出动画挪到内层数字层。
3. 新增 `.game-2048-tile-inner`。
4. 不改玩法，不动贪吃蛇。
