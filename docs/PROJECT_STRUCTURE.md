# 项目结构与资源归档

项目把“可公开构建的配置”和“运行时私有数据”分开维护。新增文件请按下面的边界放置，避免再次把不同生命周期的数据堆到同一个目录。

## `data/`：运行时私有 JSON

这些文件由后台服务读写，Git 与 Docker 构建上下文都不会收录。JSON 继续使用 `data/*.json` 的稳定兼容路径，媒体和 Markdown 已不再和 `static/` 混放：

| 路径 | 内容 |
| --- | --- |
| `data/users.json`、`password_resets.json` | 账号、密码哈希与重置请求。 |
| `data/articles.json` | 用户文章、草稿与投稿状态。 |
| `data/friends.json` | 当前实例的可修改朋友资料；首次从公开种子补入。 |
| `data/messages.json`、`views.json`、`*_scores.json` | 留言、统计和小游戏排行榜。 |
| `data/media/<用户>/` | 所有运行时上传媒体，由 `/uploads/` 提供。 |
| `data/md-source/` | Markdown 下载源文件。 |

`data/build.json` 保留在根目录：它只提供 Hugo 的构建版本号，不是后台业务数据。

站内朋友的星链由管理员维护 `assets/data/friends/links.json`：键为本站朋友的用户名或第三方朋友 ID，值为朋友用户名或第三方朋友 ID 的数组，例如 `"songline": ["mxbt", "shoper"]`。该文件随 Git 发布；关系线只需任一端配置。公开朋友基础资料维护在同目录的 `friends.json`；部署后的资料修改只写入 `data/friends.json`。

## `assets/data/`：随 Hugo 构建的公开配置

这类 JSON 会被模板通过 `resources.Get` 读取，并参与前台静态构建：

- `assets/data/friends/friends.json`：朋友星图的公开种子，包含本站用户的基础资料与第三方节点；
- `assets/data/projects.json`：内容归档页的项目清单；
- `assets/data/tools/local.json`：本站工具卡片；
- `assets/data/tools/external.json`：外部工具卡片。

这里不要放私密资料、后台账号数据或运行时统计。

## `assets/bootstrap/`：首次启动的公开快照

空白克隆第一次启动时，服务会从这里初始化 `site.json` 与 `theme.json`。这些文件用于复刻公开呈现，不包含账号、密码、留言、草稿或统计；已存在的 `data/` 永远优先，不会被覆盖。朋友星图种子单独放在 `assets/data/friends/friends.json`。

## `layouts/partials/page-navigation-data.html`：全站空间导航配置

页面的 route、priority、楼层电梯和 SITE MAP 共用这一份配置，不能为地图再维护第二张页面清单。

- `visible`：是否出现在 Elevator；
- `map_visible`：是否出现在 SITE MAP；
- `map_column`、`map_row`、`map_column_span`、`map_row_span`：8 × 8 固定网格中的稳定矩形位置；
- `route` 与 `priority`：继续由现有全站转场读取，地图链接只使用普通链接，不自行计算切页方向。

新增主页面时，在该 partial 增加一项并补齐上述地图字段；电梯、地图、当前页高亮和页面过场会自动读取新配置。

### 工具卡片图标

两份工具清单均支持 `icon_url`。本站工具优先使用以 `/` 开头的站内素材 URL，例如 `"icon_url": "/uploads/admin/markdown-logo.png"`；外部工具使用完整的 `https://` 图标地址。`icon` 是文字兜底，只有未填写 `icon_url` 时才显示。本站图标放入 `static/uploads/admin/tools/` 后，只需把路径写为 `/uploads/admin/tools/<文件名>`，不需要改模板。

## `static/`：浏览器直接请求的素材

- `/uploads/` 是唯一的公开媒体 URL 根目录，但实际读取的是 `data/media/`。后台新上传的文件只会写入这里，不会污染 Git 工作区。
- `static/uploads/` 是随仓库发布的公开媒体种子；首次部署会补入 `data/media/`，但不会覆盖服务器已有文件。
- 已发布页面引用的媒体可以随仓库提交。`static/uploads/` 始终按公开资源处理；不应公开的原图应放在仓库根目录 `local-only/`，该目录不会进入 Git 或 Docker 镜像。
- 站点自有公开媒体采用 [CC BY-NC-SA 4.0](../MEDIA-LICENSE.md)；第三方商标、用户上传和朋友提供的素材不因仓库收录而改变其原有权利归属。

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
3. 代码库维护或后台配置指定的公开图片、音频和插图：放 `static/uploads/<归属或模块>/`。
4. 用户上传的公开文件：运行时写入 `data/media/<用户>/`；需要作为新安装默认内容时，再人工挑选并加入 `static/uploads/<用户>/`。
5. 只供本机保留、绝不能公开的原图或备份：放 `local-only/`，不得由页面 URL 引用。
