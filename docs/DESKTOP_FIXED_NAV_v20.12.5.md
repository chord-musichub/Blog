# v20.18.5 桌面端导航固定顶部

## 问题

桌面端导航栏只在页面原始位置显示，滚动后不会跟随屏幕停在顶部。  
用户在阅读长页面时切换导航不方便。

## 本次修复

新增：

- `static/js/desktop-fixed-nav.js`

它负责：

1. 查找前台顶部导航：
   - `.modern-site-header`
   - `.site-header`
   - `header[role="banner"]`
   - `body > header`

2. 桌面端启用：
   - 给 `html` 添加 `has-desktop-fixed-nav`
   - 给导航加 `data-desktop-fixed-nav`
   - 测量导航高度，写入 `--desktop-fixed-nav-height`

3. 自动刷新：
   - DOMContentLoaded
   - load
   - pageshow
   - resize
   - orientationchange
   - songline:page-swap

4. 内容让位：
   - `body` 自动增加顶部 padding
   - 防止 fixed 导航遮住页面内容

## CSS 入口

文件：`static/css/site.css`

主要规则：

```css
@media(min-width:821px){
  html.has-desktop-fixed-nav body{
    padding-top:var(--desktop-fixed-nav-height, 72px)!important;
  }

  html.has-desktop-fixed-nav .modern-site-header,
  html.has-desktop-fixed-nav .site-header,
  html.has-desktop-fixed-nav body > header[data-desktop-fixed-nav]{
    position:fixed!important;
    top:0!important;
    left:0!important;
    right:0!important;
  }
}
```

## 不影响手机端

手机端继续沿用已有 `mobile-fixed-nav.js` 逻辑。  
桌面 fixed nav 只在 `min-width:821px` 下启用。
