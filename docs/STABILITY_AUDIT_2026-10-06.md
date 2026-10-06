# 前端稳定性审查（2026-10-06）

范围：保留现有视觉与功能，修复局部切页后的交互失效、初始化与释放边界，以及阅读目录 hover 抖动。没有部署、修改线上内容或清理用户资源。

## 原因与处理

| 问题 | 原因 | 修复 |
| --- | --- | --- |
| 工具切页后不响应 | 旧工具只在首次 DOMContentLoaded 自启动；写入 main 的 script 不执行，但标签会被误当作加载成功 | 统一注册具名、可重复调用的初始化入口；以导出 API 判断就绪；显式等待依赖，加载失败保留文档导航回退 |
| 从文章进入首页缺少交互 | 首页视差、桌宠只在初始页面模板载入 | 注册为按需页面模块，兼容手机桌宠与减少动画设置 |
| 反复切页越来越重 | 专注计时器增加帧链；Markdown 工具另设全局定位监听；贪吃蛇、播放器延迟到再次访问才释放 | 单一初始化/定位所有者；离开即取消帧、轮询、全局监听，关闭音频上下文并回收 Blob URL |
| 浏览器缓存恢复后工具失灵 | 把 persisted pagehide 当永久销毁，保留 DOM 标记却移除键盘监听 | Flappy Bird 与音频可视化对缓存暂停/恢复和永久清理分别处理 |
| 目录边缘 hover 反复跳动 | 链接 hover 横移会移出自己的命中区域 | 保留颜色等反馈，取消目录及链接的 hover 位移；子链接键盘操作不触发容器折叠 |
| 手机目录重复初始化丢失状态 | 重建抽屉清空搜索/展开状态，旧延时回调仍可能聚焦 | 重用抽屉；离开时清理延时和状态；失效 DOM 不再执行聚焦/滚动 |
| Markdown 异步内容缺少代码操作 | 第一次扫描时尚无代码块，增强脚本未载入 | 异步渲染完成再次按需扫描，工具使用共享阅读按钮定位 |
| 阅读下载或迟到任务越界 | 远端正文可能一直等待，离开后回调仍更新旧页面 | 2.5 秒请求/正文期限与内嵌源兜底；FileReader、hash 滚动、下载及模块初始化检查任务/DOM 有效性 |

删除的残留仅为 `static/js/tools/index.js`，其工具搜索功能合入共享搜索，实时筛选、Enter、Escape 与分层空状态保留；没有删除图片、文章或其他用户数据。源文件可从 Git 恢复。

## 验证方法

- 单元测试：模块惰性标签、加载失败重试、依赖乱序、缺失 API、迟到响应、初始化入口、单帧计时器与音频销毁；下载测试覆盖响应头和正文超时、离开后的回调。
- 离线 Edge 集成：主页与十个工具直开；桌面浅/深主题及手机反复经过首页、朋友、回忆、档案、标签、工具和阅读页；实际点击、鼠标边缘 hover、键盘、文件输入、前进返回。
- 资源验证：三轮访问后比较全局监听、DOM 节点、文档与 DOM 监听数；离开媒体/游戏页面后断言音频上下文关闭、本地文件 URL 回收。
- 样式验证：九条路由 × 两种宽度 × 两个主题，共 36 组修改前后主要布局比较；触屏拖拽连续采样、视口扩展页脚覆盖、历史 query/scroll 恢复、隐私抽屉与场景加载另行回归。

所有浏览器请求均拦截至本地构建或模拟响应，不访问第三方、不写入线上 API。文件上传直开用真实浏览器上传命令；重复访问堆检查用等价 FileList 输入事件，避免 Chromium inspector 持有上传节点。等待元素采用不保留 ElementHandle 的 locator，以免测试本身制造假内存泄漏。故障分析用堆快照确认引用链后才调整测试，不放宽泄漏门槛。

测试报告留在被 Git 忽略的 `local-only/stability/` 等回归目录。浏览器缓存恢复采用 persisted PageTransitionEvent 生命周期模拟，不等同于物理手机或线上浏览器的真实跨站 bfcache 测试；第三方网络、线上鉴权及服务器负载不在本次离线验证结论内。

## 当前结果

当前工作树新构建通过上述回归与 Go 测试。新增单测逐项运行为 7 项生命周期检查和 2 项下载检查；全套 `tests/*.test.cjs` 的 15 个测试文件通过。布局比较 36 组通过，手机触屏拖拽的十次连续采样均有效，隐私抽屉六组视口/主题及存储异常、跨标签撤回通过，动态场景回归通过。

完整稳定性测试的每组均执行三轮，三轮计数一致，且没有 pageerror：

| 配置 | 文档数 | DOM 节点数 | DOM 监听数 |
| --- | ---: | ---: | ---: |
| 1440px 深色 | 28 | 3162 | 511 |
| 1440px 浅色 | 28 | 3163 | 511 |
| 390px 深色 | 27 | 3135 | 504 |

桌面目录容器与链接边缘采样位移均为 0；旧版本链接边缘约 1.8px 的反复位移已复现后消除。媒体离页后 Blob URL 和打开的 AudioContext 均为 0。以上是该离线样本的结果，不代表任意浏览器、第三方服务或线上环境绝无故障。

## 重跑

```sh
node --test tests/*.test.cjs
BLOG_UI_BUILD=local-only/stability/after/public node tests/stability.browser.cjs
BLOG_UI_BASELINE=local-only/stability/before/public BLOG_UI_BUILD=local-only/stability/after/public node tests/runtime-optimization.browser.cjs
BLOG_UI_BUILD=local-only/stability/after/public node tests/mobile-navigation-regressions.browser.cjs
BLOG_UI_BUILD=local-only/stability/after/public node tests/privacy.browser.cjs
BLOG_UI_BUILD=local-only/stability/after/public BLOG_SCENE_PHASE=dynamic node tests/scene-readiness.browser.cjs
GOPROXY=off GOTOOLCHAIN=local go test -mod=vendor ./...
```

浏览器脚本需要 Playwright 与本地 Edge；使用环境中既有依赖路径设置 `NODE_PATH`。构建目录必须来自当前工作树的新 Hugo 构建。无需拉取 Docker 镜像或 Go 依赖。
