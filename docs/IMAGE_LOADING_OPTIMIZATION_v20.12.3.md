# v20.18.5 图片加载策略优化

## 目标

在不改变现有视觉效果的前提下，优化图片加载与解码策略，减少普通页面加载压力。

## 本次做法

### 首屏关键图片

对首页欢迎图和文章详情页封面使用：

```html
loading="eager"
fetchpriority="high"
decoding="async"
```

适合首屏重要图片，浏览器可以更早安排加载。

### 非首屏和列表图片

对文章列表卡片、朋友头像、工具图、默认插图等使用：

```html
loading="lazy"
decoding="async"
```

让浏览器在接近视口时再加载，减少初次进入页面的网络压力。

## 本次影响文件

```json
{
  "layouts/index.html": {
    "before": 5,
    "after": 5
  },
  "layouts/_default/single.html": {
    "before": 1,
    "after": 1
  },
  "layouts/friends/list.html": {
    "before": 1,
    "after": 1
  },
  "layouts/friends/friends-list.html": {
    "before": 1,
    "after": 1
  }
}
```

## 为什么不做更激进的优化

这版没有做：

- 图片压缩/转 WebP
- CSS 背景图拆分
- 图片尺寸自动裁切
- CDN 改造

因为这些更容易改变显示效果或影响上传内容管理。  
这版先做浏览器原生支持的安全优化。
