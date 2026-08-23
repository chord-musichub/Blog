# 工具页代码结构

从 v16.2 开始，公开站工具页的结构做了轻量重构，方便之后继续加工具。

## 目录约定

```text
content/tools/<tool>/_index.md        # Hugo 页面入口
layouts/tools/<tool>.html             # 工具页面 HTML 结构
static/js/tools/<tool>.js              # 工具逻辑
static/css/site.css                    # 当前仍保留统一样式入口
layouts/partials/tool-card.html        # 工具首页卡片复用组件
```

## 新增工具步骤

1. 在 `content/tools/<slug>/_index.md` 新增页面入口。
2. 在 `layouts/tools/<slug>.html` 写页面结构。
3. 在 `static/js/tools/<slug>.js` 写交互逻辑，并在页面模板底部引用：
   ```html
   <script defer src="/js/tools/<slug>.js?v=版本号"></script>
   ```
4. 在 `layouts/tools/tools.html` 里用 `tool-card.html` partial 增加工具卡片。
5. 在 `deploy/rebuild.sh` 里补上 content fallback，避免升级恢复旧 content 后 404。

## 目前已拆出的 JS

```text
static/js/tools/markdown-previewer.js
static/js/tools/random-number.js
static/js/tools/snake.js
static/js/tools/gacha.js
```

这样模板负责结构，JS 负责逻辑，首页卡片用 partial 统一维护。
