# v20.18.5 动画性能守卫

## 目标

不改变用户可见视觉效果，在页面不可见时减少无意义动画消耗。

站点当前包含较多动画：

- 首页星球 WAAPI 动画
- 星轨背景 CSS/SVG 动画
- 标签漂流带
- 朋友星图
- 页面切换动效
- 按钮/卡片 hover 动效

当用户切到其他标签页、最小化浏览器或手机进入后台时，这些动画继续运行没有意义。

## 本次新增

### 1. `static/js/performance-guard.js`

功能：

- 监听 `visibilitychange`
- 页面不可见时：
  - 给 `html` 加 `songline-page-hidden`
  - 暂停正在运行的 WAAPI 动画
- 页面恢复可见时：
  - 移除隐藏状态
  - 恢复由它暂停的 WAAPI 动画
  - 轻量触发 `SonglinePageModules.scan(document)`
  - 轻量刷新桌面固定导航高度

### 2. CSS 动画暂停

文件：`static/css/site.css`

```css
html.songline-page-hidden *,
html.songline-page-hidden *::before,
html.songline-page-hidden *::after{
  animation-play-state:paused!important;
}
```

只在页面不可见时生效，用户正在看的时候不会影响视觉。

## 安全性

这版不会：

- 改变布局
- 改变颜色
- 改变动画速度
- 改变页面结构
- 改变后台数据
- 修改文章内容

它只在页面不可见时暂停动画，页面恢复可见后恢复。
