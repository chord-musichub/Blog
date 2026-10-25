# 测试与验证

所有命令从仓库根目录运行。按修改范围选择检查；文档整理检查本地链接和源码引用，业务变更运行对应测试，样式和交互变更还需新构建与浏览器检查。

## 常规检查

需要 Go 1.22 或更新版本，以及支持内置测试运行器的 Node.js。前端单元测试只使用 Node 内置模块，不需要安装浏览器依赖。

```sh
go test -mod=vendor ./...
go vet -mod=vendor ./...
node --test tests/*.test.cjs
```

修改并发持久化、异步任务或共享状态时追加 `go test -race -mod=vendor ./...`。无模块网络环境的检查方法见[Go 依赖构建](BUILD_DEPENDENCIES.md)。检查结果以当前命令输出为准。

`tests/deployment.integration.cjs` 额外需要 Git、Bash、Python 3、tar 与 rsync；它只使用本地临时仓库，服务和权限命令由替身拦截，检查源码只拉取一次、发布引用一致、失败回滚、旧媒体配置幂等及同秒发布/导入的版本和备份隔离，不连接真实服务器，独立运行命令为 `node --test tests/deployment.integration.cjs`。

## 浏览器检查的前提

`tests/*.browser.cjs` 是专项脚本，额外依赖 Playwright；部分脚本需要 Sharp、多媒体工具或指定浏览器。先阅读所选文件顶部的依赖和环境变量。部分脚本使用 Edge 的 `msedge` 通道，部分接受 `BLOG_BROWSER_PATH`，并非全部通用。

使用拦截请求的离线浏览器测试时，公共文件、共享后台资源和模拟 API 由 `tests/helpers/offline-site.cjs` 统一响应；需要延迟、失败或第三方 widget 的专项仍保留各自控制逻辑。键盘交互与星图稳定性专项默认检查当前构建；`BLOG_UI_BASELINE` 可选提供历史对照，不要求旧版本保留已修复的缺陷。真实 HTTP 缓存测试使用 `tests/helpers/interaction-fixture.cjs`，两者用途不同。

测试所用 HTML 必须来自最新模板的隔离 Hugo 构建；只覆盖 JS/CSS 不能验证模板变化。浏览器测试按专项脚本分别运行。各脚本的 `*_BUILD` 参数有的要求源目录、有的要求 `public/`，应按脚本读取逻辑设置，不能互换。

在临时目录准备固定内容、公开 bootstrap 配置与媒体，输出到独立 `public/`，不要覆盖正在运行的 `build/public/`。公开站配置位于 `frontend/site/hugo.toml`；仅对这个目录执行 `hugo` 不包含 Go 服务生成的数据快照和全部后台文章；完整运行流程见[服务端架构](ARCHITECTURE.md)。

例如，文章留言脚本使用含固定文章的构建输出，并将第三方 widget 替换成本地 fixture：

```sh
BLOG_UI_BUILD=/absolute/path/to/fresh/public node tests/article-comments.browser.cjs
```

样式前后对照使用 `BLOG_UI_BASELINE=/before/public BLOG_UI_BUILD=/after/public node tests/style-cleanup.browser.cjs`，覆盖文章、工具、朋友等 11 类页面的深浅主题及三种宽度，并检查表格、高亮和搜索交互状态。

为工具或性能脚本提供 `BLOG_TEST_URL` 前，检查是否需要合成测试服务。不要将会保存、删除、计数或改密码的检查指向真实实例；API 与第三方请求应由测试替身处理。

## 按修改范围选择

| 范围 | 单元测试入口 | 浏览器入口 |
| --- | --- | --- |
| 切页、历史与样式 | `back-navigation`、`transition-preparation`、`stylesheet-order` | `page-lifecycle`、`navigation-origin`、`interaction-regressions` |
| 场景与图片 | `scene-entry`、`markdown-images`、Go 的 `media_preview` 测试 | `scene-readiness`、`resource-readiness`、`external-resources`、`media-preview` |
| 样式归属与层叠清理 | `stylesheet-order` | `style-cleanup`（同时提供前后两份 public 构建）、`reading-polish` |
| 阅读与简介 | `article-heading`、`article-source`、`reading-polish` | `article-album`、`article-heading-hydration`、`article-back-scroll` |
| 档案与公告 | `archive-pagination`、`archive-consolidation` | `archive-return`、`archive-pagination`、`notice-isolation` |
| giscus | `article-comments`、Go 的 `article_comments` 测试 | `article-comments` |
| 语言与隐私 | `language-switch`、`views` | `language-switch`、`language-work`、`privacy` |
| 音频与游戏 | `audio-renderer`、`audio-metadata`、`gacha-efficiency`、`reaction-lifecycle`；Go 的 `score_api`、`score_repository` 测试 | `audio-redesign`、`tool-reuse`、`human-interaction` |
| 创作与媒体 | Go 的 `creator_center`、`content_delete`、`media_library`、`role_permissions` 测试 | `content-delete`、`media-library`、`cover-cropper` |

表中的前端单元入口对应 `tests/<名称>.test.cjs`，浏览器入口对应 `tests/<名称>.browser.cjs`；Go 测试位于 `internal/server/<名称>_test.go`。专项通常需要自己的 fixture，具体准备方法见对应脚本顶部的说明与环境变量。

## 交互与结果记录

公共样式或导航变化至少覆盖首页、档案/公告、文章、朋友与工具，检查深浅主题、桌面/手机、减少动态效果、直开/切页、Back/Forward。动画和页面组件还应检查隐藏与恢复、离场后迟到回调，以及连续多轮操作是否累积节点、监听或任务。

测试截图和 JSON 放在 `local-only/` 或临时目录；记录使用的源码版本、构建路径、浏览器与条件。性能指标的含义与测量条件见[加载与性能维护](PERFORMANCE.md)。
