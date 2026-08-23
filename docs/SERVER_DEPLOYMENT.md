# 服务器发布与回滚

本文针对当前的 Ubuntu 服务器：Nginx 继续负责 HTTPS，博客后台由 systemd 运行。公开站和后台统一使用 `blog.songline-blog.com`：公开内容在 `/`，后台在 `/write/`。旧的 `write.songline-blog.com` 只负责跳转。

## 目录与数据边界

```text
/opt/songline-blog/
├── releases/                 # GitHub 每次拉取并构建出的不可变版本
├── current -> releases/...   # 正在对外服务的稳定版本
├── next -> releases/...      # 仅监听 127.0.0.1:8081 的候选版本
└── shared/                   # 永不提交、不会被发布覆盖的私有运行数据
    ├── blog-admin.env
    ├── data/
    ├── content/{posts,friends,tags}/
    └── static/{uploads,md-source}/
```

不要把 `shared/` 放入 Git 仓库，也不要删除旧站 `/opt/gexian-blog-mvp`，直到新版本已稳定运行一段时间。

## 首次准备

以下命令以 root 或 `sudo -i` 执行。先检查编译工具；Go 必须不低于 1.22，Hugo 必须可用：

```bash
git --version
go version
hugo version
```

创建受限运行账号和目录：

```bash
id blog >/dev/null 2>&1 || sudo useradd --system --home /opt/songline-blog --shell /usr/sbin/nologin blog
sudo install -d -o blog -g blog -m 0755 /opt/songline-blog/releases /opt/songline-blog/shared
sudo install -d -o blog -g blog -m 0700 /opt/songline-blog/shared/data
sudo install -d -o blog -g blog -m 0755 /opt/songline-blog/shared/content/posts /opt/songline-blog/shared/content/friends /opt/songline-blog/shared/content/tags
sudo install -d -o blog -g blog -m 0755 /opt/songline-blog/shared/static/uploads /opt/songline-blog/shared/static/md-source
```

将当前线上数据复制到 `shared/`。这是复制，不会改变旧站：

```bash
sudo rsync -a /opt/gexian-blog-mvp/data/ /opt/songline-blog/shared/data/
sudo rsync -a /opt/gexian-blog-mvp/content/posts/ /opt/songline-blog/shared/content/posts/
sudo rsync -a /opt/gexian-blog-mvp/content/friends/ /opt/songline-blog/shared/content/friends/
sudo rsync -a /opt/gexian-blog-mvp/content/tags/ /opt/songline-blog/shared/content/tags/
sudo rsync -a /opt/gexian-blog-mvp/static/uploads/ /opt/songline-blog/shared/static/uploads/
sudo rsync -a /opt/gexian-blog-mvp/static/md-source/ /opt/songline-blog/shared/static/md-source/
sudo chown -R blog:blog /opt/songline-blog/shared/data /opt/songline-blog/shared/content /opt/songline-blog/shared/static
```

若其中某个旧目录不存在，先跳过对应的一行即可。

从仓库复制环境示例，填写真实管理员账号、密码与会话密钥。不要把真实文件贴到聊天或提交到 Git：

```bash
git clone https://github.com/chord-musichub/Blog.git /tmp/songline-blog-source
sudo install -o root -g blog -m 0640 /tmp/songline-blog-source/deploy/blog-admin.env.example /opt/songline-blog/shared/blog-admin.env
sudo rm -rf /tmp/songline-blog-source
sudo nano /opt/songline-blog/shared/blog-admin.env
```

`ADMIN_USER` 与 `ADMIN_PASS` 要填写当前仍可登录的管理员凭据；如果故意换成新密码，服务首次启动会同步管理员密码哈希，旧密码将失效。`SESSION_SECRET` 最好沿用旧值以避免所有已登录会话立刻失效；若旧值不可取得，换成新的随机长字符串也可以。

其中域名相关项保持如下即可：

```dotenv
ADMIN_BASE_PATH=/write
PUBLIC_BASE_URL=/
PUBLIC_SITE_URL=https://blog.songline-blog.com
PUBLIC_API_URL=https://blog.songline-blog.com
PUBLIC_CORS_ORIGINS=https://blog.songline-blog.com
```

## 安装 systemd 服务

从刚刚克隆的仓库，或任意已下载的源码副本，复制两个模板并重载 systemd：

```bash
sudo install -m 0644 deploy/blog-admin.service.example /etc/systemd/system/blog-admin.service
sudo install -m 0644 deploy/blog-admin-next.service.example /etc/systemd/system/blog-admin-next.service
sudo systemctl daemon-reload
```

首次发布前，旧的 `blog-admin.service` 仍在占用 `127.0.0.1:8080`；不要启用新稳定服务，先发布候选版本。

## 构建候选版本

在 GitHub 克隆的源码目录中运行：

```bash
sudo BLOG_REPOSITORY_URL=https://github.com/chord-musichub/Blog.git bash ./deploy/release-deploy.sh main
sudo systemctl status blog-admin-next.service --no-pager
curl -I http://127.0.0.1:8081/healthz
```

候选实例只监听回环地址的 `8081`，外网无法访问。若失败，查看：

```bash
sudo journalctl -u blog-admin-next.service -n 100 --no-pager
```

首次 Hugo 构建可能需要一到三分钟；发布脚本默认等待四分钟。若服务器较慢，可临时加上 `BLOG_HEALTH_WAIT_SECONDS=360`。

## 配置 Nginx 与首次切换

将 `deploy/nginx-blog.songline-blog.com.conf.example` 的路由部分合并到当前 Nginx 配置。务必保留现有已经生效的 `ssl_certificate` 与 `ssl_certificate_key` 路径；此时只测试配置，先不要 reload，因为 `current` 尚未建立：

```bash
sudo nginx -t
```

配置中公开站的根目录必须为：

```nginx
root /opt/songline-blog/current/published;
```

随后在候选版本目录中执行提升脚本。它会停止候选服务、原子切换 `current` 链接、重启新稳定服务并执行健康检查；启动失败会自动回到上一稳定版本。新服务健康后，再 reload Nginx：

```bash
sudo bash /opt/songline-blog/next/deploy/release-promote.sh
sudo systemctl reload nginx
curl -I http://127.0.0.1:8080/healthz
```

首次切换时不要手动停止旧服务；提升脚本会在新的 `current` 链接准备好后，通过同名的 `blog-admin.service` 完成重启，因此公开站只会有一次很短的切换。

完成首次提升后启用开机自启：

```bash
sudo systemctl enable blog-admin.service
```

最后验证：

```bash
curl -I https://blog.songline-blog.com/
curl -I https://blog.songline-blog.com/write/login
```

## 日常更新与回滚

每次更新都从仓库最新源码启动候选版本：

```bash
sudo BLOG_REPOSITORY_URL=https://github.com/chord-musichub/Blog.git bash ./deploy/release-deploy.sh main
sudo bash /opt/songline-blog/next/deploy/release-promote.sh
```

若新版本上线后发现问题，找出上一版本目录并切回：

```bash
readlink -f /opt/songline-blog/current
ls -1dt /opt/songline-blog/releases/*
sudo ln -sfn /opt/songline-blog/releases/<上一版本目录> /opt/songline-blog/current
sudo systemctl restart blog-admin.service
sudo systemctl reload nginx
```

运行数据位于 `shared/`，所以回滚程序版本不会回滚文章或用户数据。上线前仍建议打包一次 `/opt/songline-blog/shared/` 备份。
