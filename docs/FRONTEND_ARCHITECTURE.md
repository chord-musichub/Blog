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
| `site-home-compat.css` | 首页欢迎区与统计项的兼容规则。 |
| `site-tools-compat.css` | 工具页浮动阅读控制的兼容规则。 |
| `site-friends-compat.css` | 朋友星图、资料展示与相关交互兼容规则。 |
| `site-markdown-compat.css` | Markdown 代码高亮、注释字体与目录锚点兼容规则。 |
| `site-navigation-overrides.css` | 导航滑块、轨道入口、页面切换与锚点反馈。 |
| `site-article-overrides.css` | 阅读页目录定位反馈。 |
| `mobile-foundation.css`、`responsive.css` | 断点与移动端覆盖规则。 |

页面专用样式（首页、朋友、标签、文章和工具）在公共层之后按页面条件加载。新增规则应优先落到对应页面文件；只有需要作用于多个页面时才放入公共层。

`page-modules.js` 负责站内换页后的样式补载与页面级初始化。阅读量、首页推荐、Markdown 代码工具和搜索不应再由页脚全站加载；它们必须通过该调度器按实际 DOM 特征载入。服务端页级脚本必须排在该调度器之前，并且只暴露初始化函数：直开与站内换页都由调度器调用同一个入口。

音频可视化工具的脚本也按边界拆分：`audio-visualizer.js` 管理音频来源、播放列表、元数据、界面与事件；`audio-visualizer-renderer.js` 封装 Canvas 尺寸、频谱采样、帧循环与全部绘制状态。两个文件必须以该顺序使用 `defer` 加载。

小游戏遵循同一原则。`snake.js` 管理规则、输入、音效与排行榜，`snake-renderer.js` 专门绘制 Canvas；`game-2048-engine.js` 提供无副作用的棋盘运算，`game-2048-renderer.js` 管理棋盘 DOM 和过渡，`game-2048.js` 编排回合、输入、音效和排行榜。各工具的依赖脚本必须先于其控制器加载。

## 维护规则

- 迁移既有 CSS 时使用连续区块，并在模板中保持原有的相对加载顺序，以避免改变同优先级选择器的胜负关系。
- 新建功能不要继续向 `site.css` 追加版本补丁；归入最窄的现有职责文件，必要时新建明确命名的模块。
- 页面级脚本只暴露初始化函数；不要同时注册 `DOMContentLoaded`、页面切换监听和模块调度三套入口。
- 修改公共样式后，至少检查首页、文章页、朋友页、标签页、工具页的浅色与深色模式。
