# v20.18.5 核心脚本加载优化

## 目标

减少首屏阶段不必要的同步脚本阻塞，同时保持现有交互和视觉效果不变。

## 本次优化

### 1. icon-system.js 从 head 同步脚本改为 footer defer

之前：

```html
<script src="/js/icon-system.js?v=20.12.3"></script>
```

位置在 `<head>`，属于同步阻塞脚本。

现在：

```html
<script defer data-core-script="icon-system" src="/js/icon-system.js?v=20.18.5"></script>
```

位置在 footer，且使用 defer。

### 2. site.js / search.js 改为 defer

现在核心脚本执行顺序为：

```text
icon-system.js
site.js
search.js
page-modules.js
page-specific-scripts.html 里的页面级脚本
```

这样 `site.js/search.js` 仍然可以使用 `window.SonglineIcons`。

### 3. icon-system 补 AJAX 生命周期

`icon-system.js` 新增：

- `pageshow` 重渲染图标
- `songline:page-swap` 后重渲染新页面 DOM

避免 AJAX 切页后新插入的 `data-ui-icon` 没被替换。

## 为什么这版安全

- 不改 CSS
- 不改页面结构
- 不改已有交互逻辑
- 只调整脚本加载位置和 defer
- 保持核心脚本执行顺序

## 后续可继续优化

下一步可以考虑：

1. 给 Nginx 增加 gzip/brotli 和静态资源缓存配置。
2. 对发布产物进行 CSS/JS 压缩，但保留源码版本。
3. 把超大的 `site.css` 拆成页面级 CSS。
