# 前端样式架构

公共样式以加载顺序作为层叠契约。拆分 CSS 时，必须保留下面的顺序；不要为了按字母排序或文件大小调整它。

| 文件 | 职责 |
| --- | --- |
| `foundation.css` | 设计 token、基础排版和共享组件的初始规则。 |
| `site.css` | 早期公共站点规则与兼容基础层。 |
| `site-runtime.css` | 页面加载指示与首页开机动画。 |
| `site-modern.css` | 现代页面布局、卡片、搜索与视觉兼容规则。 |
| `site-search-overrides.css` | 搜索反馈、筛选状态与搜索相关覆盖规则。 |
| `site-article-compat.css` | 文章目录和 Markdown 表格的兼容规则。 |
| `site-friends-compat.css` | 仅朋友页加载的星图、资料展示与交互兼容规则。 |
| `site-markdown-compat.css` | Markdown 代码高亮、注释字体与目录锚点兼容规则。 |
| `site-navigation-overrides.css` | 导航滑块、页面切换与锚点反馈。 |
| `page-transition-scene.css` | 全站纵向页面过场、黑幕和 SVG 生长圆加载器；仅作用于 `main.container`。 |
| `site-article-overrides.css` | 阅读页目录定位反馈。 |
| `mobile-foundation.css` | 公共断点与移动端可用性规则。 |

页面专用样式（首页、朋友、标签、文章和工具）在公共层之后按页面条件加载。新增规则应优先落到对应页面文件；只有需要作用于多个页面时才放入公共层。历史组件被删除后，应同时删除其 CSS 与模板加载入口，不能保留“未引用但可能有用”的响应式补丁。

样式入口统一维护在 `layouts/partials/assets/page-styles.html`，其顺序就是实际层叠顺序；全站核心脚本入口在同目录的 `core-scripts.html`。`baseof.html` 只负责调用这两个入口，页面专用脚本则继续由 `page-specific-scripts.html` 和 `page-modules.js` 管理。

`page-modules.js` 负责站内换页后的样式补载与页面级初始化。阅读量、首页推荐、Markdown 代码工具和搜索不应再由页脚全站加载；它们必须通过该调度器按实际 DOM 特征载入。服务端页级脚本必须排在该调度器之前，并且只暴露初始化函数：直开与站内换页都由调度器调用同一个入口。

音频可视化工具的脚本也按边界拆分：`audio-visualizer.js` 管理音频来源、播放列表、元数据、界面与事件；`audio-visualizer-renderer.js` 封装 Canvas 尺寸、频谱采样、帧循环与全部绘制状态。元数据与 renderer 必须先于控制器加载；直开页面使用有序 `defer`，站内换页由调度器显式等待依赖。

小游戏遵循同一原则。`snake.js` 管理规则、输入、音效与排行榜，`snake-renderer.js` 专门绘制 Canvas；`game-2048-engine.js` 提供无副作用的棋盘运算，`game-2048-renderer.js` 管理棋盘 DOM 和过渡，`game-2048.js` 编排回合、输入、音效和排行榜。各工具的依赖脚本必须先于其控制器加载。

全站过场由三个独立模块组成：`page-transition-nav.js` 只维护导航滑块；`page-transition-priority.js` 保存页面路由与 priority；`page-transition-system.js` 负责拦截同源页面链接、请求目标页面、替换 `main.container`、黑幕、SVG 生长圆、进入退出动画和浏览器历史。新增页面时，优先在 `PAGE_PRIORITY` 与 `PAGE_ROUTES` 添加对应项；priority 上升为向上离场、从下进入，下降则反向，同级只淡入淡出。默认场景节奏约 3 秒：卡片离场、幕布穿屏、加载圆收束、幕布穿出与新页面进入依次衔接；目标页慢时只延长加载圆阶段。需要跳过局部换页的链接或父容器添加 `data-no-page-transition`。

## 维护规则

- 迁移既有 CSS 时使用连续区块，并在模板中保持原有的相对加载顺序，以避免改变同优先级选择器的胜负关系。
- 新建功能不要继续向 `site.css` 追加版本补丁；归入最窄的现有职责文件，必要时新建明确命名的模块。
- 页面级脚本只暴露初始化函数；不要同时注册 `DOMContentLoaded`、页面切换监听和模块调度三套入口。
- 页面过场期间不得创建第二个 overlay 或再次写 history；统一通过 `SonglinePageTransition.navigate()` 和内部锁管理。无障碍的减少动态效果会自动退化为短淡入淡出。
- 修改公共样式后，至少检查首页、文章页、朋友页、标签页、工具页的浅色与深色模式。

## 组件生命周期契约

- `page-modules.js` 的 `exports` 表声明模块就绪 API，`dependencies` 表声明依赖。存在 script 标签不代表脚本执行成功，尤其不能把写入 `main` 的惰性标签当作就绪。依赖与控制器均须导出 API，失败不能标记 loaded；页面导航仍保留完整文档回退。
- 初始化应能重复调用而不重复绑定。页面局部组件使用 DOM 标记，全站委托或全局工厂使用 singleton；不要同时让脚本自启动和调度器初始化。
- 首页视差、桌宠也属于页面模块，必须支持从文章等非首页直开后进入首页。桌宠在移动端实际存在，不应按名称把它误判为仅桌面组件。
- `songline:page-transition-start` 释放离开页面的计时器、帧循环、轮询、全局监听、音频上下文及本地文件 URL。不能等下次进入同组件才释放；迟到的 FileReader / 下载 / 渲染回调须检查当前 DOM 与任务有效性。
- `pagehide.persisted` 是暂存而非永久销毁：保留缓存 DOM 对应的输入监听，仅暂停动画与媒体；`pageshow.persisted` 恢复。永久离开才清理不能重用的控制器。
- 异步 Markdown 加入首个代码块后再次 `SonglinePageModules.scan(reader)`，避免首扫未发现代码而漏加载增强。浮动阅读控件仅由共享控制器定位，不要在工具中再设 scroll / resize 所有者。
- 阅读目录的 hover 颜色反馈可以变化，但目录和链接的命中区域不能因 hover 位移；键盘折叠只响应目录容器本身，不能拦截子链接的 Enter。

回归入口：`tests/stability.test.cjs`、`tests/article-download.test.cjs`、`tests/stability.browser.cjs`。浏览器测试需指定新构建的 `BLOG_UI_BUILD`，并使用离线请求拦截，禁止测试写入线上数据。
