# Blog

一个结合 Hugo 静态页面与 Go 创作后台的个人博客。公开站包含文章与项目档案、朋友、回忆、小工具；后台负责稿件、审核、素材与站点设置。

## 从这里开始

| 你想做什么 | 阅读入口 |
| --- | --- |
| 在本机运行网站 | [本地运行与配置](docs/LOCAL_RUNTIME.md) |
| 了解页面功能与后台操作 | [功能与使用指南](docs/FEATURES.md) |
| 部署、升级或回滚服务器 | [服务器发布与回滚](docs/SERVER_DEPLOYMENT.md) |
| 修改代码或添加资源 | [项目结构](docs/PROJECT_STRUCTURE.md)、[服务端架构](docs/ARCHITECTURE.md)、[前端架构](docs/FRONTEND_ARCHITECTURE.md) |
| 查找全部文档 | [文档导航](docs/README.md) |

## 本地启动

需要 Docker 与 Docker Compose。使用 PowerShell 初始化本地配置；脚本会生成管理员密码和会话密钥，请保存输出的密码。

```powershell
./deploy/init-local.ps1
docker compose up --build -d
```

启动后打开 [公开站](http://127.0.0.1:8080/) 或 [创作后台](http://127.0.0.1:8080/write/)。首次构建需要等待镜像拉取、Hugo 安装与页面生成；已有 `.env` 时直接启动即可，初始化脚本不会覆盖它。Linux/macOS 未安装 PowerShell 时，可按[本地运行指南](docs/LOCAL_RUNTIME.md)手动配置。

仓库提供公开页面的默认配置与素材。账号、草稿、上传媒体和互动数据由每个部署实例独立保存；新克隆没有已有实例的文章或账号。备份与迁移范围见[公开资源与私有数据](docs/REPLICA_AND_PRIVACY.md)。

## 技术与目录

| 目录 | 内容 |
| --- | --- |
| `cmd/server/` | Go HTTP 服务、权限、数据持久化与 Hugo 构建 |
| `layouts/`、`content/`、`hugo.toml` | Hugo 模板、固定页面与构建配置 |
| `assets/`、`static/` | 公开配置、前端代码与默认素材 |
| `web/` | 创作后台模板及共享加载组件 |
| `deploy/` | Docker/Caddy、Nginx/systemd 与发布脚本 |
| `tests/` | 前端单元测试与浏览器专项检查 |
| `docs/` | 项目介绍、使用、部署与开发指南 |

本机开发使用 Go 1.22 或更新版本、Hugo 和 Node.js；常规检查及浏览器测试的额外依赖见[测试与验证](docs/TESTING.md)。Go 依赖随 `vendor/` 保存，编译无需下载模块。

## 许可

代码许可见 [LICENSE](LICENSE)；公开图片、音频及第三方素材的使用范围见 [MEDIA-LICENSE.md](MEDIA-LICENSE.md)。
