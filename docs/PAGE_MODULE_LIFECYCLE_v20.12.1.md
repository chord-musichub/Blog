# v20.18.5 页面模块生命周期补强

## 目标

继续 v20.12.0 的修复思路，把页面级模块的 AJAX 生命周期补完整，降低“切到别的页面再回来，模块消失，刷新才恢复”的风险。

## 本次补强

### 标签漂流带

文件：`static/js/tag-flow.js`

新增：

- `window.SonglineInitTagFlow`
- `pageshow` 重新初始化
- `songline:page-swap` 后延迟重新初始化
- 搜索框绑定去重，避免同一个 DOM 重复绑定 keydown/click

### 朋友星图

文件：`static/js/friend-galaxy.js`

新增：

- `pageshow` 重新初始化
- `songline:page-swap` 后延迟重新初始化

原本已经有：

- `window.SonglineInitFriendGalaxy`

### 页面模块加载器

文件：`static/js/page-modules.js`

小增强：

- `window.SonglinePageModules.lastScanAt`
- 方便在控制台确认模块扫描是否发生

## 控制台自查

打开浏览器控制台可以看：

```js
window.SonglinePageModules
window.SonglineInitHomeOrbit
window.SonglineInitTagFlow
window.SonglineInitFriendGalaxy
```

如果从别的页面返回标签页/朋友页，对应内容应该不需要刷新就恢复。
