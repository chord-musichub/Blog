# v20.18.5 Nginx gzip 传输压缩优化

## 目标

在不改变网页视觉和业务逻辑的前提下，减少文本类静态资源的传输体积。

适合 gzip 压缩的资源：

- HTML
- CSS
- JS
- JSON
- XML
- RSS / Atom
- SVG
- manifest

不适合重复压缩的资源：

- JPG / PNG / WebP / AVIF
- MP4 / WebM
- ZIP / PDF 等已经压缩或二进制资源

## 新增文件

- `deploy/nginx-gzip-compression-v20.18.5.conf`
- `deploy/install_gzip_compression_v20.18.5.sh`
- `deploy/install_nginx_performance_v20.18.5.sh`

## 单独安装 gzip

```bash
cd /opt/gexian-blog-mvp
chmod +x deploy/install_gzip_compression_v20.18.5.sh
./deploy/install_gzip_compression_v20.18.5.sh
```

## 一起安装缓存 + gzip

```bash
cd /opt/gexian-blog-mvp
chmod +x deploy/install_nginx_performance_v20.18.5.sh
./deploy/install_nginx_performance_v20.18.5.sh
```

## 验证 gzip 是否生效

```bash
curl -H "Accept-Encoding: gzip" -I https://blog.songline-blog.com/css/site.css?v=20.18.5
curl -H "Accept-Encoding: gzip" -I https://blog.songline-blog.com/js/site.js?v=20.18.5
```

应该看到类似：

```text
Content-Encoding: gzip
Vary: Accept-Encoding
```

如果只看到 `Vary: Accept-Encoding`，但没有 `Content-Encoding: gzip`，可能是：

1. Nginx 配置没有 include 到对应 server。
2. CDN/代理层解压了内容。
3. 文件太小，低于 `gzip_min_length 1024`。
4. Nginx 其他配置覆盖了 gzip。
