# 手机拖拽、视口覆盖及返回逻辑（2026-09-27）

保留当前场景、透镜、柔焦、惯性和交互，不部署、不修改运行数据。

## 1. 拖动只走第一帧

朋友和回忆页共享同一原因：触摸图片时浏览器先隐式捕获指针；越过拖动阈值后，脚本将捕获转交画布。图片的 `lostpointercapture` 会冒泡到画布，原处理器把它误认为整个手势结束。

修复只处理画布自身的捕获丢失，仍保留 `pointerup`、`pointercancel`、离页清理及点击防误触。没有改变头像、连线投影和图片样式，也没有用更长的动画掩盖输入中断。

Edge 原生 CDP 触摸复现：同一 120px 手势、10 次移动采样，修复前两个页面都只移动最初 12px，第二次采样起 `is-dragging=false`；修复后每次持续移动，最终 120px，松手正常结束。规范依据：[W3C Pointer Events](https://www.w3.org/TR/pointerevents/)。

## 2. 底栏隐藏及加载期间露底

- 首页、文章和朋友背景之前使用 `100svh`，只保证工具栏展开时的最小视口。移动端背景现覆盖 `100lvh`，全屏过场也使用大视口高度及一致的进出距离；内容控件仍按原可见区域布局。
- 开机/跨文档幕布也覆盖最大视口，保留原色彩和动画。
- 初始场景底色以小段内联 CSS 在阻塞脚本前提供，并先初始化主题；不再对全部手机页面强制统一深黑底。根节点的场景属性在站内切换时同步，不残留上一页底色。
- 使用 `viewport-fit=cover` 配合已有 safe-area 间距。不通过每次视口事件写 CSS 高度，避免额外布局循环。

依据：[MDN 视口长度单位](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/length)。自动化通过 Chromium 的 `Emulation.setSmallViewportHeightDifferenceOverride` 设置 120px 大小视口差异，而非只调整窗口尺寸：844px 可见高度下全屏背景覆盖到底；过场中扩到 920px 仍全覆盖。阻塞首次外部脚本时，浅色首页已得到场景底色 `rgb(243,195,173)`。

这验证网页可控制的视口，不代表替换或控制 Edge 自己的工具栏。没有连接实体手机，仍建议在实际设备上复测底栏收放。

## 3. 返回上一页

- 通用返回箭头、回忆返回及专注工具返回，优先遍历当前标签页的真实站内历史，不再直接访问写死的父级地址。
- 优先采用 [Navigation API 的同源连续历史](https://html.spec.whatwg.org/dev/nav-history-apis.html)。旧浏览器使用我们实际创建的 History 状态；整页跳转只在新文档首次初始化时检查同源来源，且排除新标签页、外部来源及刷新猜测。
- 未知历史或直接访问时保留 HTML 原有目标作为兜底；禁用 JavaScript 时也仍可返回默认上级。明确标注“全部文章”“返回首页”等目的地链接不改为历史返回。
- 桌面/手机目录跳转均保留当前历史状态，不再把目录章节作为独立页面压入历史。返回后保留前一页查询参数和滚动位置，浏览器前进仍可回到文章。
- 同时修复工具详情的 `padding:0!important` 覆盖手机顶部避让规则的问题：返回按钮和内容不再被固定顶栏遮住。桌面样式不变。

## 验证

- Hugo 隔离构建：178 页。使用仓库公开 `assets/bootstrap` 作为 Hugo `data/`，真实生成背景层；不将账号等运行目录挂入构建。
- `node --test tests/*.test.cjs`：10 个测试文件通过，含返回策略、同源首次到达、新标签页和目录状态保存约束。
- `GOPROXY=off GOTOOLCHAIN=local go test -mod=vendor ./...` 通过。
- `mobile-navigation-regressions.browser.cjs`：原生触摸连续采样、视口差异、扩展时的加载幕布、首次加载底色、真实上一页、目录、刷新、滚动恢复、前进/后退、回忆返回、直接访问兜底及旧 API 路径。
- `reader-layout.browser.cjs`、`page-lifecycle.browser.cjs`、`galaxy-lens.browser.cjs` 通过：目录、透镜几何与连续换页保留。
- `mobile-gestures.browser.cjs` 的 390×844 原生触摸回归通过，包含照片打开、纵向滚动、头像/照片拖动、缩放和堆叠回忆。
- `mobile-surfaces.browser.cjs`：17 个公开页面 × 竖屏/横屏，共 34 项通过。

新增回归测试使用隔离 HTML/JS/CSS、确定性图片及 API 替身，不写真实浏览量。运行时设置 `BLOG_UI_BUILD` 为公开配置齐全的 Hugo 输出，Node 环境需有 Playwright 和 Edge。复现旧拖拽行为可将该变量指向修复前构建并设置 `MOBILE_FIX_BASELINE=1`；旧构建也须包含背景配置以运行完整视口检查。

测量和截图留在 Git 忽略的 `local-only/mobile-navigation/`，不随网站发布。
