# 前端架构

公开站由 Hugo 模板生成页面，共享壳管理主题、导航、资源与切页；页面模块负责各自组件。创作后台使用独立模板和样式，并复用语言与跨文档资源就绪组件。页面功能见[使用指南](FEATURES.md)，性能规则见[加载与性能维护](PERFORMANCE.md)。

共用模块的唯一源码位于 `frontend/shared/`，Go 直接提供后台资源，Hugo 工作区复制同一份文件供公开站使用。

## 资源与样式入口

| 入口 | 职责 |
| --- | --- |
| `frontend/site/layouts/partials/assets/page-styles.html` | 页面实际 CSS 清单与层叠顺序 |
| `frontend/site/layouts/partials/assets/core-scripts.html` | 全站核心脚本 |
| `frontend/site/layouts/partials/page-specific-scripts.html` | 页面专用脚本及依赖顺序 |
| `frontend/site/static/js/page-modules.js` | 按实际 DOM 补载样式、等待依赖与初始化组件 |
| `frontend/site/layouts/partials/page-navigation-data.html` | route、priority 和小地图坐标的统一配置 |
| `frontend/admin/templates/admin_shared.html` | 后台导航、主题与公共资源 |

CSS 加载顺序是层叠契约，不能按文件名或大小重排。基础 token 和公共兼容层先加载，页面样式随后，触屏布局与返回控件按照样式入口中的顺序覆盖。局部更新与直开必须恢复同样的顺序和完整资源版本 URL。

公开页专用代码放在 `frontend/site/static/js/pages/<页面>/` 与 `frontend/site/static/css/pages/<页面>/`，工具代码放在 `tools/` 子目录，新增需要随仓库保存的第三方 JS 时使用 `frontend/site/static/js/vendor/`。公共逻辑才放根目录。后台主样式为 `frontend/admin/static/creator-center.css`。

修改组件时同步维护模板、模块注册和样式。检查六级目录、游戏数字和异步状态等动态生成规则；公共 `space-ribbons.js` 提供页面背景轨迹。

## 切页与导航

`page-transition-nav.js` 管理小地图，`page-transition-priority.js` 读取路由优先级，`page-transition-system.js` 管理链接拦截、请求、幕布、内容替换与历史。新增主页面在 `page-navigation-data.html` 配置 route、priority、可见性和网格字段，不维护第二份地图清单。

仅替换 `main.container`，共享导航根据当前页面同步名称与高亮。需要完整文档导航的链接或容器设置 `data-no-page-transition`。公开站到后台使用 `frontend/shared/js/document-transition.js` 的跨文档过渡，后台内部导航保持自身规则。

切页预热可以并行解析目标 HTML、预热目标主题场景与同源 CSS，但覆盖前不能应用目标样式、替换正文或初始化模块。预加载保留完整版本 URL、去重，完成或失败后释放。请求失败保留完整文档回退。

只允许一套转场状态与遮罩。浏览器历史遍历优先于排队导航，不能在 Back/Forward 后用迟到请求覆盖 history。恢复滚动使用 `instant`，用户点击目录保持缓动；异步 Markdown 初始化检查滚动所有权，不能用迟到锚点跳转覆盖历史位置。

## 模块生命周期

1. 在 `page-modules.js` 的 `exports` 与 `dependencies` 中声明就绪 API 和依赖，依赖先于控制器执行。存在 script 标签不等于脚本成功就绪。
2. 页面脚本暴露重复安全的初始化入口，由调度器统一调用；不同时自启动和调度初始化。
3. DOM 判断仅在本次同步扫描内复用；不同待扫描区域合并时保留全部目标，迟到扫描检查代次与节点连接状态。
4. `songline:page-transition-start` 释放离场组件的计时器、帧任务、观察器、全局监听及不能复用的媒体/文件 URL。取消任务使用与创建时配对的 API。
5. `pagehide.persisted` 暂停可恢复任务并保留缓存 DOM 的绑定，`pageshow.persisted` 恢复；永久离开才彻底销毁。
6. 异步下载、FileReader 和渲染回调检查当前任务有效性。Markdown 加入代码块后可扫描阅读区域，但不应误取消区域外仍连接的简介动画。

全站委托使用单例，局部绑定使用 DOM 标记；初始化不能堆积监听。隐藏页面停止视觉循环，恢复仅启动一条帧链。首页推荐、阅读浮动控件、代码复制、音频播放列表和 giscus 都遵循这一边界。

## 阅读、档案与工具

- `article-reading.js` 与 `article-toc-controls.js` 是文章和 Markdown 预览器共用的目录实现，支持六级标题、安全标签、唯一锚点及重复初始化。
- 预览器仍是工具路由与地下场景，本地文件只在浏览器读取；正文、目录和浮动阅读操作复用文章设计。
- 档案与公告共用列表/抽屉，普通档案分页与搜索状态保存在 URL 和 history，公告保留独立内容边界。输入法 composition 期间不筛选、不处理 Escape。
- 音频工具用 `data-page-scene="audio"` 隔离场景，不补载玻璃工具外框或地下背景。`audio-visualizer.js` 编排音源与界面，renderer 管理 Canvas；元数据和绘制依赖先加载。
- 贪吃蛇分离规则与 Canvas 绘制；2048 分离无副作用棋盘引擎、DOM renderer 与控制器。跨模块通过明确 API 协作。
- 朋友星图、回忆时间线与公共轨迹由调度器管理。透镜头像和连线共用投影，拖动/缩放不能造成端点分离。

## 键盘、焦点与布局

地图收起时不参与正文命中和键盘焦点，展开后接收自身交互；拖拽不当作点击。目录与工具按键不能抢占子链接、表单、输入法或 Ctrl/Meta/Alt 快捷键，失焦清除按住状态。

弹窗关闭和页面离场都释放状态；迟到的 close 事件不能隐藏重新打开的弹窗。音频来源面板隐藏、进入或退出纯净展示时将焦点交给可见控件。指针打开手机目录不强制聚焦搜索，键盘打开保留焦点管理。

顶栏与地图桌面/手机共用 DOM，`touch-layout.css` 负责紧凑排布；共享返回控件使用 44px 命中区，文章有局部吸顶样式。公共样式变化应检查深浅主题、桌面/手机、直开/切页、历史返回和减少动态效果，专项入口见[测试指南](TESTING.md)。
