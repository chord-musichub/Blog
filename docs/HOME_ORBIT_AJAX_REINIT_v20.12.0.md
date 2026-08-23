# v20.18.5 首页星球 AJAX 回页重初始化

## 问题

从别的子页通过 AJAX 导航回到首页后，首页星球部分的小球会消失，刷新后才恢复。

## 根因

`home-orbit-waapi.js` 之前是“脚本首次加载时自动初始化”的结构：

- 首次打开首页：脚本执行，星球正常
- 切到别的子页：首页 DOM 被替换
- AJAX 回首页：新首页 DOM 被换入，但脚本已经加载过，不会再次执行
- 因为旧脚本没有导出 `window.SonglineInitHomeOrbit`，`page-modules.js` 没办法重新初始化新 DOM

## 本次修复

1. `home-orbit-waapi.js`
   - 新增 `window.SonglineInitHomeOrbit = boot`
   - 支持传入 AJAX 新换入的 root
   - 支持 `songline:page-swap` 后自动重初始化
   - 支持 `pageshow` 恢复
   - 使用 `data-orbit-booted` 防止同一个 DOM 重复绑定事件
   - 清理已经离开文档的旧实例动画

2. `page-modules.js`
   - 继续检测 `[data-waapi-orbit]`
   - 如果脚本已加载，调用 `window.SonglineInitHomeOrbit(root)`

## 预期效果

- 从任意子页返回首页，星球和小球都会自动恢复
- 不需要刷新页面
- 不重复绑定动画和事件
