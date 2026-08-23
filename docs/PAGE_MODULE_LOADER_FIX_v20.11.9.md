# v20.18.5 页面模块加载修复

## 问题

v20.11.8 将首页星球、朋友星图、标签漂流带、贪吃蛇、文章目录等脚本收口到 `page-specific-scripts.html`。

但站点使用了 AJAX 页面切换。很多情况下页面切换只替换正文 DOM，不会重新执行新页面 HTML 里的 `<script>`，导致：

- 首页星球消失
- 朋友星图消失
- 标签漂流带消失
- 工具页/文章页的页面级功能可能初始化失败

## 本次修复

新增全站轻量模块加载器：

- `static/js/page-modules.js`

它会在以下时机扫描页面 DOM：

- 首次 DOMContentLoaded
- pageshow
- `songline:page-swap`

根据页面中实际 DOM 特征加载对应模块：

- `[data-waapi-orbit]` / `.waapi-orbit-stage` → `home-orbit-waapi.js`
- `.friend-galaxy` 等 → `friend-galaxy.js`
- `.tag-river` / `.tag-flow` 等 → `tag-flow.js`
- `.snake-game` 等 → `tools/snake.js`
- `#TableOfContents` / `.article-shell` 等 → `mobile-toc.js`

## 为什么这样更稳

不再只依赖 Hugo 的 `.Section` / `.RelPermalink` 判断，也不依赖 AJAX 换页时执行 script 标签。

页面上出现什么模块 DOM，就补加载什么脚本。

## 当前脚本状态

```json
{
  "home": {
    "has_page_swap": false,
    "has_export": false,
    "size": 13122
  },
  "friend": {
    "has_page_swap": false,
    "has_export": true,
    "size": 27340
  },
  "tag": {
    "has_page_swap": false,
    "has_export": false,
    "size": 14491
  },
  "snake": {
    "has_page_swap": false,
    "has_export": false,
    "size": 20351
  },
  "toc": {
    "has_page_swap": true,
    "has_export": true,
    "size": 10777
  }
}
```

## 后续建议

后续页面级功能建议都走这个模式：

1. 模板输出稳定的 DOM 标记，例如 `data-page-module="xxx"`
2. `page-modules.js` 根据标记加载 JS
3. JS 自身支持 `songline:page-swap` 或导出 `window.SonglineInitXxx`
