# v20.18.5 基础安全响应头优化

## 目标

给公开站补一组基础安全响应头，让站点更接近正式上线配置。

## 新增文件

- `deploy/nginx-security-headers-v20.18.5.conf`
- `deploy/install_security_headers_v20.18.5.sh`
- `deploy/install_nginx_performance_v20.18.5.sh`

## 响应头说明

### X-Content-Type-Options

```http
X-Content-Type-Options: nosniff
```

防止浏览器错误猜测资源 MIME 类型。

### X-Frame-Options

```http
X-Frame-Options: SAMEORIGIN
```

避免公开站被其他网站 iframe 嵌套。

### Referrer-Policy

```http
Referrer-Policy: strict-origin-when-cross-origin
```

跨站跳转时只发送来源域名，不泄露完整路径。

### Permissions-Policy

```http
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=(), magnetometer=(), gyroscope=(), accelerometer=()
```

公开博客一般不需要摄像头、麦克风、定位、支付等能力，默认关闭。

### X-Songline-Site-Version

```http
X-Songline-Site-Version: 20.18.5
```

方便你用 `curl -I` 检查当前 Nginx 是否已经加载了这版片段。

## 安装

```bash
cd /opt/gexian-blog-mvp
chmod +x deploy/install_security_headers_v20.18.5.sh
./deploy/install_security_headers_v20.18.5.sh
```

或者安装缓存 + gzip + 安全响应头：

```bash
cd /opt/gexian-blog-mvp
chmod +x deploy/install_nginx_performance_v20.18.5.sh
./deploy/install_nginx_performance_v20.18.5.sh
```

## 验证

```bash
curl -I https://blog.songline-blog.com/
```

应该能看到类似：

```text
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), ...
X-Songline-Site-Version: 20.18.5
```

## 注意

这版暂时没有加入强 CSP。

原因是站点目前有较多内联脚本、动态模块和动画脚本。  
强 CSP 很容易误伤现有功能，后续可以单独做一版 CSP 梳理。
