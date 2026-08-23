# v20.18.5 修复 2048 数字块巨大化

## 问题

v20.14.1 部署后，2048 一开始可能出现一个巨大的 `2`，占据多个格子。

## 根因

v20.14.1 把 2048 重做成：

- 背景格子层
- absolute 数字块层
- JS 计算每个 tile 的 transform / width / height

但 v20.14.0 里为了解决旧版网格比例问题，留下了：

```css
.game-2048-tile{
  width:100%!important;
  height:100%!important;
}
```

这条规则带有 `!important`，会压过 JS 写入的普通 inline width/height。  
于是 absolute 数字块被撑成整块棋盘大小，看起来像一个巨大贴图。

## 修复

### 1. JS 里用 important 写入单格尺寸

```js
node.style.setProperty('width', m.cell + 'px', 'important');
node.style.setProperty('height', m.cell + 'px', 'important');
```

### 2. CSS 明确 tile layer 下数字块不继承旧网格行为

新增：

```css
.game-2048-tile-layer > .game-2048-tile{
  position:absolute!important;
  max-width:none!important;
  max-height:none!important;
  min-width:0!important;
  min-height:0!important;
  flex:none!important;
}
```

## 影响范围

只修复 2048 数字块尺寸冲突，不改玩法和动画逻辑。
