# v20.18.5 首屏资源提示优化

## 目标

在不改变页面执行逻辑和视觉效果的前提下，给浏览器更多资源优先级提示，让关键 CSS/页面级模块更早进入加载队列。

## 新增文件

- `layouts/partials/resource-hints.html`
- `docs/RESOURCE_HINTS_v20.18.5.md`

## 修改文件

- `layouts/_default/baseof.html`

## 做了什么

### 1. 全站预加载核心 CSS

```html
<link rel="preload" href="/css/site.css?v=20.18.5" as="style">
```

这不会替代原来的 stylesheet，只是提前告诉浏览器这是关键样式。

### 2. 页面级脚本预加载

根据当前页面类型，只预加载对应模块：

- 首页：`home-orbit-waapi.js`
- 朋友页：`friend-galaxy.js`
- 标签页：`tag-flow.js`
- 贪吃蛇页：`tools/snake.js`
- 文章详情页：`mobile-toc.js`

这些脚本仍然由 `page-specific-scripts.html` 和 `page-modules.js` 负责执行/补加载。  
`resource-hints.html` 只负责提示浏览器提前拉取，不改变初始化逻辑。

## 为什么这版安全

- 不改 CSS
- 不改 JS 逻辑
- 不改 HTML 主体结构
- 不修改数据
- 只在 `<head>` 增加 `<link rel="preload">`

## 注意

如果未来某个资源没有被实际使用，浏览器控制台可能提示 preload 未使用。  
所以这里没有全站预加载所有页面模块，而是按页面类型精确提示。
