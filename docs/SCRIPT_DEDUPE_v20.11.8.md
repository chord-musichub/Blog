# v20.18.5 页面脚本重复加载清理

## 背景

v20.11.7 新增了页面级脚本按需加载入口：

- `layouts/partials/page-specific-scripts.html`

但部分旧模板中仍保留了直接 `<script>` 引入，导致部分页面可能重复加载同一脚本。

## 本次清理

统一将以下脚本收口到 `layouts/partials/page-specific-scripts.html`：

- `home-orbit-waapi.js`
- `friend-galaxy.js`
- `tag-flow.js`
- `tools/snake.js`
- `mobile-toc.js`

## 删除的旧直接引用

```text
{'layouts/partials/home-waapi-orbit-module.html': 1, 'layouts/friends/friends-list.html': 1, 'layouts/friends/list.html': 1, 'layouts/_default/terms.html': 1, 'layouts/tags/list.html': 1, 'layouts/tags/terms.html': 1, 'layouts/tools/snake.html': 1}
```

## 当前规则

### 首页

只在首页通过 page-specific partial 加载：

```html
<script defer data-page-script="home-orbit" src="/js/home-orbit-waapi.js?v=20.18.5"></script>
```

### 朋友页

```html
<script defer data-page-script="friend-galaxy" src="/js/friend-galaxy.js?v=20.18.5"></script>
```

### 标签页

```html
<script defer data-page-script="tag-flow" src="/js/tag-flow.js?v=20.18.5"></script>
```

### 贪吃蛇页

```html
<script defer data-page-script="snake" src="/js/tools/snake.js?v=20.18.5"></script>
```

### 文章详情页

```html
<script defer data-page-script="mobile-toc" src="/js/mobile-toc.js?v=20.18.5"></script>
```

## 后续维护建议

之后如果新增页面级脚本，优先加到：

- `layouts/partials/page-specific-scripts.html`

不要散落在各个页面模板底部，除非该脚本只属于一个极独立工具页并且不参与全站 AJAX 切页逻辑。
