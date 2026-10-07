# 前端残余清理与性能优化（2026-10-07）

## 范围与删除依据

目标是保持现有主题、布局和交互，减少确认废弃的加载与运行时开销。本次没有修改文章、媒体、用户数据、部署端口或依赖，也没有部署到服务器。

删除前交叉核对模板、公共/后台脚本、Go 服务端、配置与 Markdown 内容中的引用，并检查同内容 Hugo 构建生成的 178 个页面。删除以已退役组件为边界，不根据首屏 CSS 覆盖率或文件名推断无用。保留规则的相对顺序和动态状态选择器，包括六级目录、Markdown 缩进、2048 数字配色和封面模式。

- 清理旧首页推荐卡片、旧工具按钮/说明/同步栏、旧音频桥接界面、旧朋友包装层、横向换页和轨道导航等组件样式，以及它们的空响应式块。
- 删除无交付入口的 `web/static/admin-control-polish.js`、`web/static/admin-mobile.js`、`web/static/space-ribbons.js`。仍在使用的公共背景实现 `static/js/space-ribbons.js` 保留；用户进一步明确只删除旧标签漂流带，不删除现用行星轨迹，边界见[清理范围说明](RIBBON_CLEANUP_2026-10-07.md)。
- 删除 `navigation-motion.css` 及其模板入口；仍有效的链接、焦点、投稿按钮反馈合并到紧邻其前的 `navigation.css` 末尾，保持层叠顺序，每页少一个请求。
- `site-runtime.css` 只保留当前首页开机遮罩基础，删除旧分门开场的面板、读数和进度样式。仅首页加载，非首页再少一个请求；进入/离开首页时通过带 ID 的样式链接准确恢复/移除。

删除的是版本控制中的代码，可从 Git 恢复；没有清理上传目录、内容目录或运行数据。混合选择器和伪类参数中少数历史名称保守保留，不声称所有残余都已删除。

## 运行时变化

- 打字练习在更换文章时才创建字符节点；输入、删除和修改只更新变化字符的状态，光标复用缓存节点，统计值未变时不写 DOM。保留输入法组合、滚动跟随、计分、模式切换和排行榜逻辑。
- 同时修复打字练习重新开始后参考文本仍停在底部的问题。
- 首屏渐显观察器在全部目标可见或页面离开时断开，移除自己的切页监听，释放未进入视口的旧节点。

## 测量结果

测量使用同内容的清理前后离线构建，API 和外部图片由本地夹具代替；结果反映脚本/样式源码体积和 DOM 工作量，不代表公网下载耗时或实际手机 FPS。

- 全部静态 CSS：752,177 → 647,865 字节，减少 **104,312 字节（13.9%）**。
- 20 个路由 × 桌面/手机 × 深色/浅色，共 **80 对**页面；实际请求的唯一 JS/CSS 源码每页减少 **82,216–93,136 字节（80.3–91.0 KiB）**，约为各页原加载量的 15%–22%。不包含 gzip/Brotli 压缩、字体、图片或已缓存资源。
- 几何与主要可见样式逐项一致，无横向溢出。截图冻结装饰动画、屏蔽 Canvas；标签河流的 JavaScript 漂移固定到相同相位，防止采样时刻差异被误判为样式变化。最大平均像素差约 0.028/255。Canvas 的真实交互由工具专项测试验证。
- 396 字符练习中连续输入 80 次：文本子节点替换 **80 → 0**，清理后原节点全部保留，仅 240 次字符状态属性变化。重新开始后滚动位置 **75 → 0**。
- 手机/桌面各连续切页三轮：节点数分别稳定为 824/854，监听器均稳定为 195；首页专用样式能移除、恢复且加载顺序不变。

## 回归与复现

已通过离线 Hugo 构建（178 页）、Go vendor 模式测试、20 个 Node 单元测试文件，以及以下浏览器回归：

- `tests/cleanup-performance.browser.cjs`：上述 80 对布局、样式、截图、请求体积和打字练习输入/删除/组合输入/完成/重置。
- `tests/tool-detail-layout.browser.cjs`：9 个非 Markdown 工具 × 6 组视口/主题，共 54 组布局与实际交互，包含排行榜、帮助弹窗、音频全屏和站内重入。
- `tests/reading-polish.browser.cjs`：文章与 Markdown 预览器、实际文件导入/替换、六级目录、返回键 hover/焦点、手机布局、刷新与场景准备。
- `tests/privacy.browser.cjs`：Cookie 抽屉、主题、过期/不可用存储、跨标签页同步及正常动画下的首页首访开机。
- `tests/runtime-optimization.browser.cjs` 的生命周期模式：桌面和手机重复切页、资源恢复、DOM/监听器计数。
- `tests/stability.browser.cjs` 的手机模式：正常动画下连续进入全部工具三轮，目录、音乐、游戏、文件导入、回忆弹窗和浏览器前进/后退正常；每轮节点数均为 1,808、监听器均为 485，离开工具后的音频上下文和本地文件 URL 为零。计数与上面的简化切页夹具不同，不能直接互相比较。

新增 `tests/frontend-cleanup.test.cjs` 防止退役资源入口复活，并覆盖动态配色/目录规则和渐显观察器清理；既有打字练习断言同步更新。稳定性测试中旧文字按钮和已移除的模式小字断言同步到图标按钮的无障碍标签、模式按钮选中态，不把测试维护误记为新的界面修改。

浏览器回归需要可用的 Playwright、Sharp 和本机 Edge。典型命令（设置依赖目录的 `NODE_PATH` 后）：

```sh
node --test tests/*.test.cjs
GOPROXY=off GOTOOLCHAIN=local go test -mod=vendor ./...
BLOG_UI_BASELINE=local-only/cleanup-performance/before/public \
BLOG_UI_BUILD=local-only/cleanup-performance/after/public \
node tests/cleanup-performance.browser.cjs
BLOG_UI_BASELINE=local-only/cleanup-performance/before/public \
BLOG_UI_BUILD=local-only/cleanup-performance/after/public \
BLOG_UI_LIFECYCLE_ONLY=1 node tests/runtime-optimization.browser.cjs
BLOG_UI_BUILD=local-only/cleanup-performance/after/public \
node tests/tool-detail-layout.browser.cjs
BLOG_UI_BUILD=local-only/cleanup-performance/after/public \
node tests/reading-polish.browser.cjs
BLOG_UI_BUILD=local-only/cleanup-performance/after/public \
node tests/privacy.browser.cjs
BLOG_UI_BUILD=local-only/cleanup-performance/after/public \
BLOG_STABILITY_MOBILE_ONLY=1 node tests/stability.browser.cjs
```

前后构建和旧后台资源快照位于忽略的 `local-only/cleanup-performance/`，报告、截图不进入发布内容。重跑比较前须保留清理前的 `before/public` 与 `before/admin-static`，并更新清理后的 `after/public`；不可用两个相同的新构建冒充前后对比。
