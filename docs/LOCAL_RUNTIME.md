# 本地运行与配置

推荐通过 Docker Compose 运行完整网站：Caddy 提供公开页面，Go 提供创作后台、API 与媒体。以下命令从仓库根目录执行；首次启动需要网络拉取镜像和安装 Hugo，Go 模块编译使用仓库内的 `vendor/`。

## 首次启动

需要 Docker 与 Compose。Windows 或已安装 PowerShell 的环境运行：

```powershell
./deploy/init-local.ps1
docker compose up --build -d
```

初始化脚本创建 `.env` 与运行目录，生成管理员密码和会话密钥，默认管理员用户名为 `admin`。保存脚本输出的密码；已有 `.env` 时脚本会停止，不覆盖配置。

### Linux/macOS 手动初始化

未安装 PowerShell 时，复制环境示例并编辑必填项：

```sh
cp .env.example .env
chmod 600 .env
```

示例中的 `BLOG_DATA_DIR=./runtime/data`、`BLOG_CONTENT_DIR=./runtime/content` 指定新实例的 Docker 数据目录。

在 `.env` 填写 `ADMIN_USER`、`ADMIN_PASS` 和 `SESSION_SECRET`，保留 `ADMIN_BASE_PATH=/write`。密码和会话密钥分别使用随机值；会话密钥至少 32 个字符。若已安装 OpenSSL，可分别执行以下命令生成候选值，再写入文件：

```sh
openssl rand -hex 18
openssl rand -hex 32
```

完成配置后运行 `docker compose up --build -d`。Compose 的绑定目录和服务启动流程会创建所需的运行目录。

### 打开与检查

- 公开站：`http://127.0.0.1:8080/`
- 创作后台：`http://127.0.0.1:8080/write/`
- 健康检查：`http://127.0.0.1:8080/healthz`

Go 仅暴露在 Docker 内网，主机的 8080 入口由 Caddy 提供。首次访问前可检查状态和构建日志：

```sh
docker compose ps
docker compose logs --tail=100 blog-admin
```

之后使用 `docker compose up -d` 启动，`docker compose stop` 暂停。代码更新后使用 `docker compose up --build -d` 重建。

## 配置参考

真实值只放 `.env` 或服务器环境，不提交到 Git。Go 进程环境优先于 `.env`；Compose 只向容器传入 `docker-compose.yml` 明确声明的变量。

| 变量 | 用途与当前默认 |
| --- | --- |
| `ADMIN_USER`、`ADMIN_PASS` | 必填的配置管理员账号与密码；启动时同步该管理员密码哈希 |
| `SESSION_SECRET` | 必填，至少 32 字符的随机会话密钥 |
| `ADMIN_BASE_PATH` | 后台外部路径；本地初始化和 Compose 默认 `/write` |
| `BLOG_DATA_DIR`、`BLOG_CONTENT_DIR` | Compose 主机绑定目录；新实例用 `./runtime/data`、`./runtime/content`，旧 `.env` 未设置时保留 `./data`、`./content` |
| `DATA_DIR`、`HUGO_CONTENT_DIR` | 直接运行 Go 时的数据和生成文章目录；默认使用 runtime，发现旧目录时继续使用旧路径 |
| `PUBLIC_DIR` | 直接运行 Go 默认输出 `./build/public`；显式设置仍优先 |
| `PUBLIC_BASE_URL` | 公开站路径，默认 `/`；仓库子路径部署需对应调整 |
| `PUBLIC_SITE_URL` | 公开站完整 URL，用于生成链接与来源配置 |
| `PUBLIC_API_URL` | API 完整 URL；同域部署通常与公开站相同 |
| `PUBLIC_CORS_ORIGINS` | 允许跨域调用公开接口的额外来源，英文逗号分隔；同源请求直接允许 |
| `HUGO_BUILD_TIMEOUT_SECONDS` | 单次构建上限，默认 180 秒 |
| `MAX_UPLOAD_BYTES` | Go 默认及 `.env.example` 为 536870912（512 MiB）；初始化脚本和 Compose 未配置时为 104857600（100 MiB） |
| `HTTP_READ_TIMEOUT_SECONDS`、`HTTP_WRITE_TIMEOUT_SECONDS` | Go 默认各 900 秒；用于上传和重建，Compose 未显式转发这两个变量 |

修改 `.env` 中 Compose 支持的参数后执行 `docker compose up -d`，让 Compose 按变化重建容器；`docker compose restart` 不会重新应用 Compose 环境配置。直接运行 Go 或 systemd 时，更新对应环境后重启服务。

管理员密码以 `ADMIN_PASS` 为准；其他用户通过后台账号流程管理。公开站与 API 同域部署时通常将三个 URL/来源变量填为同一站点地址。本地默认留空即可通过同源入口访问。

## 数据与备份

| 路径 | 内容 |
| --- | --- |
| `.env` | 本实例凭据、会话密钥和 URL 配置 |
| `runtime/data/`（或原 `data/`） | 账号、稿件、设置、留言、阅读量、排行、上传媒体与 Markdown 源 |
| `runtime/content/`（或原 `content/`） | 后台生成的公开内容 |
| `build/public/` | 可重新构建的公开输出 |
| `frontend/site/assets/`、`frontend/site/static/uploads/admin/` | 仓库提供的公开配置与默认素材 |

新克隆可使用默认页面与素材，但没有旧实例的账号和文章。迁移时先恢复 `.env`、`data/` 及动态内容目录，再启动；源码仓库不能替代实例备份。旧安装升级时保留原 `.env`，不要用新示例覆盖；未设置 BLOG_DATA_DIR/BLOG_CONTENT_DIR 的 Compose 继续挂载原目录。旧版上传目录的迁移说明见[数据边界](REPLICA_AND_PRIVACY.md)。

`data/media/.deleted/` 保存媒体删除/重命名标记，阻止默认素材重新补回，必须随运行数据备份；不要当作缓存清空。该目录不通过 `/uploads/` 暴露。

## 常见问题

| 现象 | 检查方法 |
| --- | --- |
| Compose 提示缺少管理员配置 | 确认根目录 `.env` 的三个必填值已设置 |
| 后台可访问，公开页不完整 | 检查 `blog-admin` 日志中的首次 Hugo 构建结果，不以 HTTP 服务启动代表构建成功 |
| 更换密码或 URL 后仍是旧值 | 确认 Compose 容器已按新环境重建；systemd 更新的是服务器环境文件 |
| 镜像拉取失败 | 检查 Docker 服务网络与代理，区别于 Go 模块构建 |
| `apk add` 下载失败 | 检查构建步骤的网络；Linux 本机代理可使用下方 overlay |

### Linux 构建代理

仅适用于本机 Linux Docker Engine；保持 HTTP/mixed 代理开启，端口按实际配置调整：

```sh
BLOG_BUILD_PROXY=http://127.0.0.1:7897 docker compose \
  -f docker-compose.yml -f deploy/compose.build-proxy.yml build blog-admin

docker compose up -d --no-build
```

该 overlay 使用宿主机网络访问回环代理，代理仅作为构建参数，不改变网站容器网络。Docker Desktop 与远程构建器不直接照搬。日常 Go 编译无需更换下载源，依赖更新见[构建指南](BUILD_DEPENDENCIES.md)。

## 服务器运行

Docker/Caddy 的生产模板在 `deploy/Caddyfile`，使用同域的 `SITE_HOST` 与 `/write` 后台路径。Nginx/systemd 的完整发布、候选验证及回滚流程见[服务器指南](SERVER_DEPLOYMENT.md)。

### 正在运行旧版容器的工作区

源码整理不会重启现有容器。旧容器挂载的根目录 `content/` 可暂留固定页面副本供旧版本使用，这些副本与动态文章一样不再纳入 Git。新版本的固定页面唯一源码位于 `frontend/site/content/`；构建只从旧目录合并文章、朋友和标签内容，不让旧工具副本覆盖新模板。准备切换时再重新构建并启动容器。
