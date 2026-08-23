# 本地运行数据与部署配置

这个仓库只保存程序源码。以下目录保留在本机或服务器备份中，不会提交到 GitHub：

- `data/`：文章数据库、账号、站点设置和访问数据。
- `content/posts/`、`content/friends/`、`content/tags/`：由后台数据生成的公开内容。
- `static/uploads/`、`static/md-source/`：文章图片、附件和 Markdown 源文件。
- `.env`：管理员密码、会话密钥和本机 URL 配置。

首次从源码仓库启动前，在项目根目录运行：

```powershell
.\deploy\init-local.ps1
docker compose up --build -d
```

脚本会创建未纳入 Git 的 `.env` 和运行目录，并显示一次随机生成的管理员密码。请把密码保存到密码管理器。

`ADMIN_PASS` 是该管理员账号的唯一配置来源：每次服务启动时，程序都会将 `data/users.json` 中对应管理员的密码哈希同步为 `.env` 里的值。因此，修改 `.env` 后重启服务即可修改管理员密码；不要再从后台修改该管理员的密码。其他用户仍完全由 `data/users.json` 和后台用户管理处理。

`PUBLIC_SITE_URL` 是公开站完整 URL（例如 `https://blog.example.com`），`PUBLIC_API_URL` 是后台/API 完整 URL（例如 `https://write.example.com`）。它们用于 Hugo 生成链接、后台 CSP 和公开工具页的成绩接口；修改后重启服务会重建公开站。`PUBLIC_CORS_ORIGINS` 是允许调用成绩接口的网页来源，多个地址用英文逗号分隔；通常填写与 `PUBLIC_SITE_URL` 相同的地址。

迁移或重装时，先恢复上述私有目录和 `.env`，再执行 `docker compose up --build -d`。只有源码仓库不足以恢复已有文章和用户。

如果部署到 GitHub Pages 的仓库子路径，请在 `.env` 中设置正确的 `PUBLIC_BASE_URL`，并按实际部署地址调整 `hugo.toml` 的 `baseURL`。

使用 systemd 部署时，将 `deploy/blog-admin.env.example` 复制为服务器上的 `/etc/gexian-blog-admin.env`，填入真实值后执行 `chmod 600 /etc/gexian-blog-admin.env`。该文件位于仓库外，不应提交。
