# 项目结构与资源归档

项目把“可公开构建的配置”和“运行时私有数据”分开维护。新增文件请按下面的边界放置，避免再次把不同生命周期的数据堆到同一个目录。

## `data/`：运行时私有 JSON

这些文件由后台服务读写，Git 与 Docker 构建上下文都不会收录。当前线上仍使用 `data/*.json` 的扁平结构；在源码、展示配置和素材边界全部稳定前，不自动移动或复制运行时数据。

下表是后续统一迁移的目标结构。迁移时会先完整备份 `shared/data`，停止旧实例，再一次性切换读写路径并验证；不会在候选版本与线上版本并行期间产生两套业务数据。

| 目录 | 内容 |
| --- | --- |
| `data/settings/` | `site.json`、`theme.json`，站点与主题设置。 |
| `data/content/` | `articles.json`、`tag_urls.json`，文章元数据与标签链接。 |
| `data/community/` | `friends.json`，站内朋友资料。 |
| `data/auth/` | `users.json`、`password_resets.json`，账号与重置请求。 |
| `data/metrics/` | `views.json`，阅读量。 |
| `data/games/` | 各小游戏排行榜。 |

`data/build.json` 保留在根目录：它只提供 Hugo 的构建版本号，不是后台业务数据。

## `assets/data/`：随 Hugo 构建的公开配置

这类 JSON 会被模板通过 `resources.Get` 读取，并参与前台静态构建：

- `assets/data/friends/external.json`：外部朋友节点；
- `assets/data/tools/local.json`：本站工具卡片；
- `assets/data/tools/external.json`：外部工具卡片。

这里不要放私密资料、后台账号数据或运行时统计。

## `static/`：浏览器直接请求的素材

- `static/uploads/` 是后台上传的运行时媒体，按上传者或用途保留现有子目录；不要将新的前端源码素材继续放进这里。
- 后续新增、受版本控制的站点视觉素材应放在 `static/media/<页面或场景>/`，例如 `static/media/tools/` 或 `static/media/home/`；模板与 CSS 通过 `/media/...` 引用。
- 当前 `static/uploads/admin/` 的既有图片继续使用原 URL，以免破坏文章、后台设置或已经公开的链接。迁移旧素材应当逐项更新引用并保留兼容路径，而不是批量移动。

### 前端脚本分层

- `static/js/` 根目录仅保留全站运行时、导航、搜索和页面模块调度；
- `static/js/pages/<页面>/` 放对应页面的脚本，例如首页启动场景、朋友星图、标签漂流和文章列表；
- `static/js/tools/` 放单个工具及其引擎、渲染器和排行榜依赖；
- `static/js/vendor/` 只放第三方库，不混入本站业务逻辑。

页面专用样式使用同样的边界：`static/css/pages/<页面>/`；工具维持在 `static/css/tools/`；全站基础和兼容层保留在 `static/css/` 根目录。实际加载顺序由 `layouts/partials/assets/page-styles.html` 统一维护。

## `web/templates/`：后台页面骨架

- `admin_shared.html` 提供后台共用的 `admin-head` 与 `admin-client-nav` 模板；
- 登录、后台、设置、编辑与媒体页面只保留各自正文和少量页面特有脚本；
- 修改后台全局主题变量、导航项或公共脚本时，只改 `admin_shared.html`。

## 新增时的判断

1. 当前后台会修改、部署后应持久化的 JSON：仍放现有 `data/*.json`；统一迁移完成后才改为 `data/<职责>/`。
2. 公开页面构建时读取的清单 JSON：放 `assets/data/<模块>/`。
3. 代码库维护的图片、音频或插图：放 `static/media/<模块>/`。
4. 用户上传或后台配置指定的文件：留在 `static/uploads/`。
