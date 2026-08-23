# v20.18.5 页面级脚本按需加载优化

这版目标：**不改变视觉效果和交互行为，把只在特定页面使用的 JS 从全站加载改为按需加载。**

## 为什么做

之前很多脚本在所有页面都会加载，例如：

- 首页星球动画
- 朋友星图
- 标签流
- 贪吃蛇
- 手机文章目录

这些脚本多数页面并不需要。虽然单个文件不大，但长期叠加会导致：

- 普通页面执行无意义初始化
- AJAX 切页时更容易出现重复绑定
- 后续维护不清楚“哪个页面依赖哪个脚本”
- 手机端性能压力增加

## 本次改动

新增：

- `layouts/partials/page-specific-scripts.html`

在 `layouts/_default/baseof.html` 中统一引入该 partial。

## 当前按需加载规则

### 首页

```go
{{ if .IsHome }}
<script defer src="/js/home-orbit-waapi.js?v=20.18.5"></script>
{{ end }}
```

### 朋友页

```go
{{ if or (eq .Section "friends") (hasPrefix .RelPermalink "/friends/") }}
<script defer src="/js/friend-galaxy.js?v=20.18.5"></script>
{{ end }}
```

### 标签页

```go
{{ if or (eq .Section "tags") (hasPrefix .RelPermalink "/tags/") (eq .Kind "taxonomy") (eq .Kind "term") }}
<script defer src="/js/tag-flow.js?v=20.18.5"></script>
{{ end }}
```

### 贪吃蛇

```go
{{ if hasPrefix .RelPermalink "/tools/snake/" }}
<script defer src="/js/tools/snake.js?v=20.18.5"></script>
{{ end }}
```

### 文章详情页

```go
{{ if and .IsPage (eq .Section "posts") }}
<script defer src="/js/mobile-toc.js?v=20.18.5"></script>
{{ end }}
```

## 仍然全站加载的核心脚本

这些仍保留全站加载：

- `site.js`
- `search.js`
- `page-transition.js`
- `mobile-adapt.js`
- `mobile-fixed-nav.js`
- `space-ribbons.js`
- `icon-system.js`

原因：它们影响全站导航、搜索、换页动画、移动端适配、背景和图标系统。

## 后续方向

下一轮可以继续做：

1. 把 `site.css` 拆为更清晰的文件结构。
2. 给页面级 CSS 也做按需加载。
3. 对公开站输出的 CSS/JS 做 minify，同时保留源码版本。
4. 给后台也拆分页面级脚本。
