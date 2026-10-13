# 服务端架构

后端位于 `cmd/server/`，保持单一 Go package，按业务职责拆分文件。Hugo 生成公开 HTML，Go 提供创作后台、公开 API、上传媒体和 Markdown 源文件；Docker 的 Caddy 或服务器 Nginx 将它们组合为同一个网站入口。

## 请求与发布流程

1. `main.go` 读取 `.env` 与进程环境，创建运行目录、数据仓储和应用。
2. `application.go` 装配模板与依赖，`routes.go` 注册页面、媒体及 API 路由。
3. 服务启动或内容更新时，通过 `runHugo` 同步已发布文章、公开配置与资源，并执行构建。
4. 公开 HTML 写入 `published/`，代理提供静态页面；`/uploads/`、`/md-source/`、后台和 API 由 Go 处理。

构建使用隔离 Hugo 工作区和专用的公开数据快照。账号、草稿、密码重置与 Markdown 下载源不能直接成为 Hugo 的 data namespace。后台业务 JSON 和公开生成文件的关系见[项目结构](PROJECT_STRUCTURE.md)。

## 代码入口

| 文件或模块 | 职责 |
| --- | --- |
| `main.go`、`application.go`、`app_helpers.go` | 启动、依赖、模板函数与应用级 URL/目录辅助 |
| `config.go`、`runtime_models.go` | 环境变量校验、共享运行模型、角色和状态常量 |
| `routes.go`、`page_handlers.go` | HTTP 配置、路由、公共页面渲染与健康检查 |
| `auth_handlers.go`、`security.go`、`http_security.go` | 登录、会话与 HTTP 安全边界 |
| `account_*`、`user_*`、`password_*` | 账号资料、用户管理与密码流程 |
| `article_*`、`hugo_articles.go` | 稿件编辑、审核、权限、持久化与发布文件 |
| `publisher.go`、`public_snapshot.go`、`runtime_layout.go` | 串行构建、公开默认配置与运行数据分类迁移 |
| `creator_content.go`、`site_*`、`theme_*` | 项目、回忆、站点与主题设置 |
| `media_*` | 素材库、上传、裁剪、迁移和派生预览 |
| `views_api.go`、`messages_api.go`、`score_repository.go`、`*_scores.go` | 阅读量、首页留言和游戏积分 |
| `json_file.go`、`store.go`、`article_store.go` | JSON 原子写入与数据仓储 |
| `language_assets.go`、`article_comments.go` | 前后台共享语言资源与文章留言配置 |

表中的模块前缀对应同目录多份文件，测试与实现一起维护；无需将所有新业务继续堆到入口文件。

## 配置与数据约定

真实配置保存在本地 `.env` 或服务器环境中，仓库提供 `.env.example` 和 `deploy/blog-admin.env.example`。进程环境优先于 `.env`。管理员凭据、URL 和运行参数详见[本地运行与配置](LOCAL_RUNTIME.md)。

`ADMIN_PASS` 会在服务启动时同步对应管理员的密码哈希。其他用户仍由数据仓储和后台流程管理。角色决定后台能力，账号类型决定公开朋友资料的展示，两者不能混用。

JSON 更新使用同目录临时文件和原子替换；需要并发保护的业务通过相应应用锁处理。项目和回忆的删除校验列表快照，防止过期表单误删相邻项。构建失败必须保留明确反馈，不能将后台已保存的数据假装回滚成功。

## 新增功能时

- 环境变量在 `config.go` 集中读取，并同步环境示例与配置指南。
- 路由在 `routes.go` 注册；兼容 URL 使用集中登记，避免重复处理函数。
- 触发公开重建统一调用 `runHugo`，不绕过构建锁并发写入 `published/`。
- 私有运行数据放入 `data/<职责>/`，构建仅导出公开字段；迁移不得覆盖已有实例数据。
- 账号权限、持久化和构建失败使用临时目录测试，命令见[测试与验证](TESTING.md)。

部署拓扑与发布回滚见[服务器指南](SERVER_DEPLOYMENT.md)，图片预览限制见[性能维护](PERFORMANCE.md)。
