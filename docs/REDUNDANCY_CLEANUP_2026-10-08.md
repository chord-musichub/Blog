# 冗余清理与检索效率（2026-10-08）

## 保留边界

保持页面布局与日夜主题。保留朋友行星轨迹、头像连线、回忆、文章/项目分页、评论、工具和后台媒体操作；不删除运行时 `data/`、文章、用户媒体、离线 Go 依赖或历史网址兼容入口。没有部署、提交或推送。

## 本轮清理

- 删除 `static/friends-data.json`（4,174 字节）：已退役的公开朋友快照，无代码读取；朋友星图继续使用 Hugo 合并后内嵌的 `friend-galaxy-data`。没有删除 `assets/data/friends/` 或实例的 `data/friends/`。
- 删除 `web/static/markdown-renderer.js`（23,244 字节）：后台副本已经落后于前台，缺少完整音视频块处理。统一维护 `static/js/markdown-renderer.js`，后台旧 URL `/static/markdown-renderer.js` 由 Go 直接提供同一文件，不依赖 Hugo 已构建。支持 GET、HEAD、条件缓存、文件缺失 404；拒绝写请求。编辑器版本参数更新，资源要求重新验证，避免旧副本缓存长期滞留。
- 删除全仓库及测试均无调用的 Go 方法：`ArticlesByStatus`、`ArticlesExceptStatus`、`creatorContentSummary`、`mediaNameFromPublicPath`、`cleanOrbitHref`，以及两处生成后立即丢弃的变量。仍在使用的作者查询、权限、媒体路径校验和站点设置保持不变。
- 删除朋友脚本中无调用的 `escapeHtml`；删除首页播放器无绑定、无调用的目录选择/写授权函数。保留读取旧目录授权、文件选择、文件夹输入兼容及拖入目录，未清除浏览器数据。
- 工具和兼容朋友列表的搜索在页面初始化时建立一次归一化文字索引。每次输入只解析一次查询并匹配索引；不再逐张卡片重复读文字、处理 HTML/标点或重复解析关键词。新页面重新建索引，同一 DOM 的重复扫描不重复绑定。保留搜索结果、数量、分层隐藏、清空、URL 初始查询及按键行为。
- 删除上述搜索调整后已无消费者的 `ready`、`includesAll`、`countTerm` 工具函数。

两个删除文件共 27,418 字节；这不是每页都减少的下载量。Hugo 新构建静态文件由 231 降至 230。相同内容下，压缩后首访请求的本地 CSS/JS 字节：首页减少 1,070、朋友星图减少 141、工具索引减少 160；其他对照页面无变化。后端死函数主要改善维护成本，不声称必然提升运行帧率。

删除项均为 Git 已跟踪内容，可从清理前版本恢复。服务已有 `--cleanDestinationDir`，正常重建会移除发布目录的旧快照；仅改源码但未重建的部署不会自动更新。本地历史对照产物继续放在忽略的 `local-only/`，不批量删除用户的原图/备份。

## 验证

- `node --test --test-isolation=none tests/*.test.cjs`：130 项通过。
- 离线 `go test -mod=vendor ./cmd/server` 通过；新增真实路由测试验证无 `published/`、无后台副本时仍取得同一渲染器，以及 HEAD、304、POST 和缺失资源行为。
- `go test -race -mod=vendor ./cmd/server` 与 `go vet -mod=vendor ./cmd/server` 通过。
- 新增 `search-index.test.cjs`：检索结果、分层、空结果、清空、URL、Enter、Escape、重复初始化及索引读/归一化次数。
- 使用本地既有镜像离线构建清理前/后版本：均 178 页。没有访问第三方或写线上数据。
- `cleanup-performance.browser.cjs`：9 个页面 × 1440/390 宽 × 日夜模式，共 36 组。可见组件几何与计算样式相同；截图平均通道差最大约 0.0031/255，运动 Canvas 掩码、减少动画后比较。打字工具仍复用字符节点。
- `stability.browser.cjs`：首页与十个工具直开、文章目录和全站 AJAX 功能回归通过。桌面深色、桌面浅色、手机深色分别循环三轮，节点/监听器稳定为 2346/504、2347/504、1664/484；离开播放器/游戏后，音频上下文与临时文件 URL 均为零。测试为浏览器模拟，不代替真机验收。

前后构建、截图和 JSON 报告位于 `local-only/cleanup-2026-10-08/`。对照使用相同内容与未修改的后台公共资源；不将单次构建耗时或打字测试往返耗时当作用户性能提升证明。
