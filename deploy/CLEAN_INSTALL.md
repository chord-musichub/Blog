# v6 干净安装 / 升级说明

如果服务器上已经有旧版：

```bash
systemctl stop blog-admin 2>/dev/null || true
pkill -f blog-admin || true
cd /opt
rm -rf gexian-blog-mvp
unzip gexian-blog-mvp-v6.zip -d gexian-blog-mvp
cd gexian-blog-mvp
go build -o blog-admin ./cmd/server
chmod +x deploy/rebuild.sh
cp deploy/blog-admin.service /etc/systemd/system/blog-admin.service
nano /etc/systemd/system/blog-admin.service
systemctl daemon-reload
systemctl enable --now blog-admin
```

如果 zip 解压后没有自动包一层目录，而是散开了，请把文件移动到 `/opt/gexian-blog-mvp`。


## v6 说明

公开站主题与首页文案、图片、联系方式可以在 admin 的「站点设置」和「媒体库」中维护。
