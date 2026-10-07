# 档案整合后的旧页面清理（2026-10-07）

用户明确确认：独立文章列表、标签页面已合并到档案，它们不是需要保留的现用界面。上一轮将“旧网址仍能访问”当成保留页面的依据，本轮按产品实际入口纠正该边界。单篇文章阅读和朋友资料中的文章卡片仍然保留。

## 路由与资源边界

| 路由 | 当前职责 |
| --- | --- |
| `/posts/` | 唯一文章/项目档案，保留原布局、搜索、词条、hover 和抽屉。 |
| `/posts/<slug>/` | 单篇文章阅读，保留正文、目录、返回和阅读操作。 |
| `/tags/site-notice/` | 现用全部公告，复用档案设计，不属于旧标签 UI。 |
| `/tags/`、其他标签详情 | 仅轻量兼容跳转到 `/posts/?search=1`，详情附带编码后的原始 `tag`。 |

- 删除独立标签的 `terms.html`、`taxonomy.html`、`tag-detail-generated.html`，以及漂浮标签 CSS/JS、预加载、模块注册和隐藏导航项。
- 删除旧文章列表兜底模板；将现有档案模板统一到 `_default/list.html`，不再维护两套文章索引。
- 当前档案 CSS/JS 从 `pages/posts/list.*` 迁到 `pages/archive/index.*`，改用 `content-archive` 模块和 `SonglineInitContentArchive`；直开和切页由同一调度器初始化，不再额外绑定 DOMContentLoaded / page-swap。
- 清理公共 CSS 中旧列表、旧标签/搜索和旧相关推荐卡片选择器；移除共享搜索脚本中的旧文章搜索、分类/排序、标签搜索等分支。朋友卡片及其 `[data-card-link]` 委托保留，不按“文章卡片”名称误删。
- 后台移除标签页标题、Hero 和默认详情图等无效设置项。保存当前设置时不再写入这些旧字段，已有配置值不清空。

旧标签跳转文档不加载全站样式、动画、场景或页面模块，包含 canonical、noindex、立即 replace 和无 JavaScript 的 meta refresh/链接兜底。中文、大小写、`C++` 与生成的冲突 slug 均依据 `tag_raw`（没有时用原标题）编码，不用 slug 反推标签。站内 AJAX 在同一幕布下跟随一次跳转，验证目标同源且仅允许 `/posts/`，浏览器历史只记录最终档案页面。

`content/tags/` 中旧生成的索引不是被删除的用户数据：它们现在只用于承接旧链接，不再生成旧界面。原 `tag_urls.json` 运行数据也保留，但停止复制到 Hugo 公共快照，并清理旧 `hugo-data/tag_urls.json` 生成副本；下次重建即可更新。删除的模板、脚本和样式均可从 Git 恢复，没有删除文章、媒体、账号或运行数据。此变更尚未部署，也没有修改端口、Docker 基础镜像或新增依赖。

## 一并修复的档案问题

旧标签链接原本能施加看不见的标签过滤，用户清空搜索也无法解除。本轮让筛选词显示在现有搜索框里，并在清空、Escape、输入新词和点击词条时解除旧精确过滤，同步 URL；刷新可恢复当前查询。使用 replaceState 保留既有导航状态，不为每次输入增加历史条目。没有新增装饰小字或另一个标签面板。

公告兼容按路由和布局共同识别；即使自定义公告 `_index.md` 缺失、由 taxonomy 自动生成，仍采用现用公告模板、档案样式和正确场景，不重新露出旧标签界面。

## 结果与验证

同内容离线 Hugo 构建前后：

- 静态 CSS：647,865 → 612,399 字节，减少 **35,466 字节**。
- 静态 JS：601,246 → 575,394 字节，减少 **25,852 字节**；合计减少 **61,318 字节**源码。
- `public/tags/` 输出：1,465,592 → 119,561 字节，减少 **1,346,031 字节**。56 个旧网址保留轻量别名，而不是 56 个旧 UI。
- 每个受测现用页面额外少加载 **12,510–21,545 字节（约 12.2–21.0 KiB）**唯一 JS/CSS 源码；72 对页面的主要几何和可见样式一致，最大平均像素差约 0.0002/255（装饰动画冻结、Canvas 屏蔽，实际交互另测）。

以上为未压缩的文件体积，不是网络延迟、缓存命中率或手机 FPS；构建中的标签目录仍保留兼容输出，不以“删除生成页数量”冒充性能收益。

回归入口：

- `tests/archive-consolidation.test.cjs`：防止旧模板、资源、模块和设置入口复活，校验阅读和朋友卡片仍存在。
- `tests/archive-consolidation.browser.cjs`：静态核对全部 56 个别名，桌面/手机、深色/浅色下检查普通/中文/冲突标签、直开、准确筛选、清空、刷新、AJAX 不刷新、返回/前进、公告与无 JavaScript 跳转；拦截全部请求，不写线上数据。
- `tests/cleanup-performance.browser.cjs`：18 个现用路由 × 两种视口 × 两种主题，共 72 对同内容布局、样式、截图和资源体积比较；不再把退役标签界面当作现用页面进行视觉回归。
- `tests/reading-polish.browser.cjs`：实际 Markdown 导入、文章目录、返回 hover/焦点和刷新场景。
- `tests/home-notices.browser.cjs`：0/1/4/13 条公告、本机隔离 Hugo 夹具，以及无自定义公告索引的 taxonomy 兜底。
- `tests/runtime-optimization.browser.cjs` 生命周期模式：桌面/手机切页三轮，节点和监听器稳定；`tests/stability.browser.cjs` 手机正常动画模式：全部工具三轮重入、资源释放和历史导航稳定。
- Go vendor 模式测试与 21 个 Node 单元测试文件通过；Go 测试额外验证公共标签快照移除、运行数据保留、重复构建安全。

```sh
node --test tests/*.test.cjs
GOPROXY=off GOTOOLCHAIN=local go test -mod=vendor ./...
BLOG_UI_BUILD=local-only/archive-consolidation/after/public \
node tests/archive-consolidation.browser.cjs
BLOG_UI_BASELINE=local-only/archive-consolidation/before/public \
BLOG_UI_BUILD=local-only/archive-consolidation/after/public \
CLEANUP_REPORT_DIR=local-only/archive-consolidation \
node tests/cleanup-performance.browser.cjs
```

浏览器测试依赖本机 Playwright、Sharp 和 Edge，需要设置其 `NODE_PATH`；公告夹具额外需要已缓存的 Hugo Docker 镜像。构建、旧后台资源快照、报告与截图放在忽略的 `local-only/archive-consolidation/`；不会随网站发布。历史清理记录保留当时的测量结果，当前回归路线以本记录为准。
