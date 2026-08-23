# v20.18.5 样式结构保守整理说明

这版的目标是：**在不改变现有效果的前提下，减少历史 override 叠加，降低后续迭代出现莫名其妙冲突的概率。**

## 整理原则

1. 不重做视觉设计。
2. 不改主要 HTML 结构。
3. 不删除仍在承担当前效果的样式入口。
4. 只删除已经被新版明确替代的历史实验段。
5. 对关键交互保留唯一最终入口，后续修改优先改最终入口，而不是继续追加新覆盖。

## 已收束的客户端 CSS

文件：`static/css/site.css`

整理前约：`513,739` bytes  
整理后约：`485,042` bytes

移除的历史段：

- 旧的正文流折叠目录样式
- 旧的左下角目录按钮定位
- 旧的 sticky 手机导航方案
- 旧的随机飘带线条背景
- 旧的常驻慢漂/防闪/白线实验背景
- 旧的阅读浮动按钮 fixed 覆盖层
- 旧的 `:has(...)` 手机/电脑端按钮对齐覆盖层

保留的当前入口：

- 手机导航：`mobile-fixed-nav.js` + `static/css/site.css` 中 fixed nav 规则
- 星轨背景：`space-ribbons.js` + `.songline-starstream-layer` / `.starstream-*`
- 手机目录：`mobile-toc.js` + `.mobile-toc-drawer` / `.mobile-toc-fab`
- 阅读浮动按钮：`site.js` 的 body portal + `body > .songline-reading-float-button`
- 首页星球：`home-orbit-waapi.js` + `.waapi-*`

## 已收束的后台 CSS

文件：`web/static/style.css`

整理前约：`101,645` bytes  
整理后约：`93,096` bytes

移除的历史段：

- 后台旧飘带线条背景
- 后台旧飘带增强版
- 后台旧慢漂版
- 后台旧防闪版
- 后台旧白线版

保留的当前入口：

- 后台星轨背景：`.songline-starstream-layer`
- 后台星轨流动：`adminStarstreamDashFlow`
- 后台轨迹变形：`adminStarstreamGroupDrift`

## 已收束的 JS

文件：`static/js/site.js`

整理前约：`22,932` bytes  
整理后约：`22,354` bytes

移除：

- 旧的阅读按钮 class 标记脚本
- 旧的 inline 定位清理脚本

保留：

- `SonglineNormalizeFloatReadingButtons`
- body portal 逻辑
- AJAX 切页后自动重新接管浮动按钮

## 后续修改建议

### 1. 需要改置顶/置底按钮

优先改：

- `static/js/site.js` 里的 `SonglineNormalizeFloatReadingButtons`
- `static/css/site.css` 里的 `body > .back-to-top-button.songline-reading-float-button`

不要再新增 `.article-shell .back-to-top-button` 这类容器内定位覆盖。

### 2. 需要改手机目录

优先改：

- `static/js/mobile-toc.js`
- `.mobile-toc-drawer`
- `.mobile-toc-fab`

不要恢复旧的正文流目录卡片方案。

### 3. 需要改背景线条

优先改：

- `static/js/space-ribbons.js`
- `web/static/space-ribbons.js`
- `.songline-starstream-layer`
- `.starstream-flow`

不要恢复旧的 `songline-ribbon-layer` / `slow-ribbon` / `white-flow-ribbon` 方案。

### 4. 需要进一步提升加载速度

下一步可以做：

- 将 `site.css` 拆成 `base.css` / `components.css` / `pages.css` / `responsive.css`
- 将历史朋友星图、星球模块、标签模块样式按页面分文件
- 给 Hugo 模板按页面条件加载对应 CSS
- 对发布产物进行轻量压缩，但保留源码文件方便维护

这版先做保守清理，不做激进拆分，避免视觉回归。
