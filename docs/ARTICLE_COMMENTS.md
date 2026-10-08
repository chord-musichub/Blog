# 文章留言（giscus）

文章底部使用 GitHub Discussions，每篇文章独立留言，默认公开、事后管理。首页留言板不受影响。当前公开配置由站长提供，仓库为 `chord-musichub/Blog-comments`，分类为 `Announcements`；不包含 Token、OAuth 密钥或密码。

## 设置和上线

- 站长后台「站点设置 → 文章留言」可修改仓库/分类及其公开 ID，或关闭留言。保存后重建公开站。
- 仓库必须公开、开启 Discussions，且 giscus GitHub App 已获得该仓库权限。在 <https://giscus.app/zh-CN> 可检查并取得 ID。
- 旧持久化 `site.json` 没有 `comments` 字段时，后端加载默认配置，构建时仅补入公开快照，不覆盖旧运行数据。显式 `enabled:false` 始终保留。更新需同时部署新后端、模板和前端资源；只复制模板不会给旧服务器配置补字段。
- 首次留言/回应时 giscus 自动创建对应讨论；无需手动给每篇文章开帖。不支持发布前人工审批。删除、屏蔽、锁定通过 GitHub 管理，不是本站后台。
- 配置页的 `article-comments` 只是生成配置的占位串，实际绑定项为 `songline:article:<ID>`。不要用这个占位串手动创建公共留言主题。

## 文章身份

绑定优先级：front matter 的 `comment_id` → 后台生成的 `article_id` → Hugo 的 `.File.UniqueID`。后台文章改标题、slug、内容时保留 `article_id`，不会另开评论区。删除文章后重新新建则是新 ID，不继承旧留言。

手写旧文章若没有 `article_id`，文件路径身份会随移动而变化；首次启用前可补一个永久且独一的 `comment_id`，以后不要再改。已产生留言后再补 ID 会切换讨论，需要沿用旧身份或手动迁移讨论。不要让两篇文章共用同一 ID。

## 前端契约

- 仅真实 posts 单篇包含留言；档案、工具 Markdown 预览器和首页不初始化或请求 giscus。
- 局部模块由 `page-modules.js` 调度，不等待第三方加载。容器距视口 300px 时才请求 iframe；不支持 IntersectionObserver 时可点「加载留言」。20 秒无有效高度消息则显示重试/GitHub 入口。
- 通过官方 widget URL/消息协议的轻量适配器嵌入，不重复注入无法卸载监听的 `client.js`。协议参考：<https://github.com/giscus/giscus/blob/main/client.ts> 与 <https://github.com/giscus/giscus-component/blob/main/web/src/giscus.ts>。上游协议变化需核对此适配器。
- 消息必须来自 `https://giscus.app` 且 source 为当前 iframe；合法高度才显示 iframe，避免空白闪屏。`Discussion not found` 是首评前正常状态；错误、过期登录和限流有独立处理。
- 登录使用 giscus 的 `giscus-session` 存储约定。OAuth 返回立即去掉网址中的 `giscus` 参数，保留原 history.state、其他查询参数和锚点。禁用浏览器存储时本页面内存仍可用；刷新后需再次登录。
- 深色使用 `transparent_dark`，浅色使用 `light`，网站切换主题时通过 `setConfig` 同步。离页/pagehide 释放 iframe、监听、观察器和 timer；离场 DOM 标记防止过场中的迟到扫描重新绑定，BFCache 回来由调度器重新初始化。
- iframe 使用官方 `default.css` 的 `color-scheme:light dark`，允许透明画布。不能改成 `normal` 或仅指定网站当前配色；浏览器偏好与网站主题不同时可能强制绘制黑/白底，遮住外层玻璃面板。测试需覆盖系统深色下的网站浅色及相反组合。
- 阅读统计开关不控制第三方留言请求。国内网络可能无法连接 giscus/GitHub；错误降级不代表网络问题已经消除，不代理登录、不自动重试轰炸服务。

## 验证

`go test -mod=vendor ./...`、`node --test tests/*.test.cjs`；构建后运行 `tests/article-comments.browser.cjs`（`BLOG_UI_BUILD` 指定 public 目录）。浏览器测试使用真实本地构建与隔离的 giscus iframe fixture，不向 GitHub 发布评论，也不执行真实 OAuth。可设置 `RUN_GISCUS_LIVE=1` 额外只读加载真实 giscus 页面；该测试拦截真实第三方非 GET 请求，仍不登录、点赞或提交评论。
