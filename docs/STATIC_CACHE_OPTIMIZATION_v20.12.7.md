# v20.18.5 静态资源缓存优化

## 目标

提升重复访问速度，让浏览器更好地缓存 CSS、JS、字体、站点图片等静态资源。

## 新增文件

- `deploy/nginx-static-cache-v20.18.5.conf`
- `deploy/install_static_cache_v20.18.5.sh`

## 缓存策略

### CSS / JS / 字体 / 站点静态图片

```nginx
expires 30d;
Cache-Control: public, max-age=2592000, stale-while-revalidate=86400
```

这些资源大多带版本号，例如：

```text
/js/site.js?v=20.18.5
/css/site.css?v=20.18.5
```

版本号变化后浏览器会重新拉取新资源，因此可以相对放心缓存久一点。

### sitemap / RSS / robots

```nginx
expires 10m;
Cache-Control: public, max-age=600, must-revalidate
```

这些内容可能随文章更新变化，所以只做短缓存。

### 用户上传内容

```nginx
expires 1h;
Cache-Control: public, max-age=3600, must-revalidate
```

不使用 immutable，避免你替换同名上传图片后，用户长时间看到旧图。

### HTML

```nginx
Cache-Control: no-cache, must-revalidate
```

HTML 不做长缓存，保证文章和导航变化能尽快生效。

## 安装方式

部署 v20.18.5 后执行：

```bash
cd /opt/gexian-blog-mvp
chmod +x deploy/install_static_cache_v20.18.5.sh
./deploy/install_static_cache_v20.18.5.sh
```

脚本会：

1. 复制缓存片段到 `/etc/nginx/snippets/gexian-static-cache.conf`
2. 尝试找到 `blog.songline-blog.com` 的 Nginx 配置
3. 自动插入 include
4. 执行 `nginx -t`
5. reload Nginx

如果没找到配置文件，会提示你手动加入：

```nginx
include /etc/nginx/snippets/gexian-static-cache.conf;
```

## 验证

```bash
curl -I https://blog.songline-blog.com/js/site.js?v=20.18.5
curl -I https://blog.songline-blog.com/css/site.css?v=20.18.5
```

应看到类似：

```text
Cache-Control: public, max-age=2592000, stale-while-revalidate=86400
```
