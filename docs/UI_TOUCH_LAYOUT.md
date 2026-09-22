# 展示页交互与触屏布局

## 推荐

首页保留最多五个轮播位置。构建时输出文章池元数据，每次首页初始化保留最新一篇，其他四篇不放回随机抽取；不包含站点公告。不新增请求接口，不记录浏览历史。脚本不可用时保留服务端最近五篇。图片展示框统一 16:9，不修改原始文件。

## 搜索与导航

档案搜索词由全部文章标签及项目技术栈生成，不再截取前十项。文章、项目和搜索占三个明确入口，展开词条区支持换行和独立滚动。

电梯及地图根据完整 pointer 手势判断点击。只有在同一导航目标上按下并在 3 CSS 像素内松开才会触发导航；跨出目标、拖拽或 pointercancel 后产生的 click 会被拦截，键盘激活保留。该判断不改变原有底层控件优先机制。

朋友页星图在真实节点和 SVG 连线之上使用同一坐标投影实现中心放大镜：中心头像轻微放大，边缘内容通过遮罩和 `backdrop-filter` 柔焦。拖动/缩放时仅更新节点与连线的投影，柔焦遮罩的中心和半径保持不变，减少全屏模糊纹理的重建。不会克隆图片或额外发起资源请求，系统减少动态效果时会降低动画强度。

透镜中心固定于画布中心，不随每帧手势速度摆动，同一位置的头像和线端在拖动、停住、松手时使用相同投影。拖动、惯性和缩放过程中暂停悬停高亮切换，保留已选中状态。滚轮与缩放/复位按钮使用 260ms ease-out 插值，头像与 SVG 线端在同一帧更新；连续输入从当前帧接续，拖动、失焦或离开页面会取消未完成的缩放。启用系统减少动态效果时直接到达目标。

## 触屏布局边界

`static/css/touch-layout.css` 是公开站紧凑布局的最终入口，位于页面样式末尾。宽度不超过 760px，或不超过 980px 的无悬浮触屏设备使用该布局；较宽桌面保留原构图。

- 顶部保留标识与主题/投稿入口，底部常驻楼层名称，右侧独立地图开关。
- 首页直接展示信息终端，推荐、统计、音乐操作纵向组织；雪人继续保留。
- 工具列表单列；图标与方向提示没有额外填充、阴影或毛玻璃底。
- 朋友与回忆操作区位于页头和底部导航之间；回忆页不产生纵向滚动。
- 文章目录使用独立抽屉，阅读浮动按钮避开底部导航；触屏平板使用同一规则。

## 回归

依赖 Playwright 与本机 Edge：

```powershell
node tests/ui-layout.browser.cjs
node tests/navigation-intent.browser.cjs
node tests/navigation-origin.browser.cjs
node tests/galaxy-lens.browser.cjs
node tests/galaxy-motion.browser.cjs
node tests/theme-layout.browser.cjs
node tests/resource-readiness.browser.cjs
node tests/visual-bugs.browser.cjs
node tests/cover-cropper.browser.cjs
```

默认验证 `http://127.0.0.1:8080`，可通过 `BLOG_TEST_URL` 修改。布局测试使用 360、390、900、1440 像素视口，截图写入被忽略的 `local-only/ui-layout/`。`UI_SOURCE_CSS=1` 仅供开发迭代时拦截本地样式，正式回归不要设置，确保验证的是构建产物。

浏览器触屏模拟不等于 iOS/Android 真机验证；软键盘、系统安全区和设备手势仍需真机体验确认。

`visual-bugs.browser.cjs` 检查嵌套标题完整显示、延迟渲染后的手机目录、目录收起状态恢复，以及星图拖动/取消时的交互与柔焦一致性。开发时可设 `BLOG_TEST_SOURCE=1`，用源码中的 CSS/JS 覆盖预览服务器的旧资源；正式发布回归请去掉此选项。

`cover-cropper.browser.cjs` 使用独立页面与合成图片验证裁剪滑块重绘、缩放中心、拖动取消和重新打开时的状态重置，不读取或修改真实媒体库。
