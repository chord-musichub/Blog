# 项目结构与资源管理

源码、实例数据和构建结果分别维护。目录按职责组织；以下路径均相对于项目根目录。

| 目录 | 职责 |
| --- | --- |
| `frontend/site/` | Hugo 网站：`layouts/` 模板、`content/` 固定页面、`static/` 浏览器资源、`assets/` 公开配置，以及 `hugo.toml` |
| `frontend/admin/` | Go 后台模板 `templates/` 和后台 JS/CSS `static/` |
| `frontend/shared/` | 共用 JS/CSS 唯一源码：语言、Markdown 渲染、资源就绪与跨文档过渡 |
| `cmd/server/` | 启动程序，不承载业务实现 |
| `internal/server/` | HTTP 服务、权限、业务、存储、构建与 Go 测试 |
| `runtime/` | 新实例的持久数据与后台生成的内容 |
| `build/` | 公开输出与可重新生成的 Hugo 工作文件 |
| `deploy/`、`tests/`、`docs/` | 部署、前端测试与文档 |

## 公开网站与后台

`frontend/site/layouts/partials/assets/` 统一维护公开页面的脚本与样式入口。页面专用代码放在 `static/js/pages/`、`static/css/pages/`，工具代码放在相应 `tools/` 子目录。全站导航配置在 `frontend/site/layouts/partials/page-navigation-data.html`，route、priority 与地图坐标只维护一份。

`frontend/admin/templates/admin_shared.html` 维护后台公共页头和导航；后台样式位于 `frontend/admin/static/creator-center.css`。

共用脚本不在前后台分别保留副本。Go 直接通过原有 `/static/` URL 提供 `frontend/shared/` 文件；构建公开站时，将同一份源文件复制到隔离工作区的 `static/js/` 和 `static/css/`，保持原有 `/js/`、`/css/` 地址。

## 公开配置与素材

- `frontend/site/assets/bootstrap/`：新实例的初始站点和主题配置。
- `frontend/site/assets/data/`：项目、朋友、关系和工具清单等可提交的公开配置。
- `frontend/site/static/uploads/admin/`：可随版本发布的公开素材。

本站工具图标在工具清单中使用 `/uploads/admin/tool/<文件名>`，对应公开素材目录。外部图标使用完整 HTTPS 地址。不应公开的原图或个人备份放在 `local-only/`，不能被页面 URL 引用。素材许可见 [MEDIA-LICENSE.md](../MEDIA-LICENSE.md)。

## 实例数据

新实例默认使用 `runtime/data/`：

| 子目录 | 内容 |
| --- | --- |
| `auth/` | 账号与密码重置 |
| `content/` | 稿件、项目、回忆和兼容标签信息 |
| `community/` | 朋友覆盖资料与首页留言 |
| `settings/` | 当前实例站点与主题设置 |
| `metrics/`、`games/` | 阅读量与游戏排行 |
| `media/`、`md-source/` | 上传原文件与 Markdown 下载源 |
| `media-previews/` | 可再生图片预览缓存 |

动态文章、朋友资料页和公告入口生成到 `runtime/content/`。固定工具页面仍在前端源码目录；构建时合并固定页面和动态内容。`data/build.json`（相对于所配置的 DATA_DIR）保存资源版本号。

已有根目录 `data/` 和 `content/posts/` 会继续作为默认运行路径；明确配置的 `DATA_DIR`、`HUGO_CONTENT_DIR` 始终优先。不会因为更新代码而移动或覆盖已有数据。

## 构建结果

- `build/public/`：网站最终 HTML、CSS、JS 等公开文件。
- `build/hugo/data/`：仅包含允许公开字段的 Hugo 数据快照。
- `build/hugo/static/`：运行时生成的配置和主题 CSS。
- `build/hugo/workspace/`：由固定页面、动态内容、共享资源和公开快照组成的完整 Hugo 输入。

构建不向源码目录写入主题或运行配置。私有账号、草稿和互动记录不复制到 Hugo 工作区。`runtime/` 与 `build/` 的实际内容均不提交 Git、不进入 Docker 镜像。

新增文件时，先判断它是源码、实例数据还是构建结果，再放入对应目录；备份范围见[数据边界](REPLICA_AND_PRIVACY.md)。
