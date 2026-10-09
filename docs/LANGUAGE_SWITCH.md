# 中英文界面切换

默认中文。主题按钮右侧显示当前语言：中文为 `中`，英文为 `en`，点击切换语言。公开站、创作中心、登录页及密码申请页使用相同偏好；音频工具的独立舞台也有相邻的主题和语言按钮。

偏好保存在 `songline-language`，值为 `zh` / `en`。不自动采用浏览器语言。当前 Docker/Caddy 同域部署中，前后台、刷新、历史返回与 AJAX 切页都会继承选择；分开域名部署时按浏览器规则各自保存。存储被禁用时，当页仍可切换，刷新后回到默认中文。

## 翻译范围

翻译导航、工具名称与说明、按钮、表单标签及占位符、可访问性名称、状态与错误提示。保留文章和公告正文、标题、标签、项目与回忆资料、作者名称与简介、留言、文件名、音乐元数据、输入值和打字练习原文。本站设置中的自定义内容不自动翻译。

切换语言不重新加载页面、不重建表单或工具、不清除查询和工具进度。搜索索引同时保留工具名称与说明的中英文。文章留言使用 giscus 的语言配置同步组件界面，沿用已有 iframe；协议依据 [giscus 官方组件](https://github.com/giscus/giscus-component/blob/main/web/src/giscus.ts)，不改留言内容。

## 源码与新增文案

- `static/js/i18n-catalog.js`：中英文界面文案的唯一词典。
- `static/js/i18n.js`：语言存储、翻译标记处理、动态文案与单例观察器。
- `static/css/i18n.css`：共用按钮、窄屏布局与少量英文排版适配。
- Go 的 `registerLanguageAssets` 将同一份源文件提供给 `/static/`，后台在 Hugo 首次构建前即可使用；不复制词典，不增加业务 API。

只在确定属于界面的文字上添加标记：

```html
<button data-i18n-ui>保存</button>
<input placeholder="搜索工具" data-i18n-attrs="placeholder aria-label">
<label><span class="i18n-copy" data-i18n-ui>文章标题</span><input name="title"></label>
```

`data-i18n-ui` 翻译其文字节点，不能加到正文、作者资料、整页容器或含用户内容的表单上。混合模板只标记固定文案，变量留在标记外。`.i18n-copy` 使用 `display:contents`，保持原有文字流。生产压缩会删除普通 HTML 注释，因此模板使用数据标记。

动态界面文案调用 `SonglineI18n.setText(node, originalChinese)`；用户内容调用 `setContent(node, value)`，它会释放该节点的翻译归属。读取已翻译标签的中文来源使用 `sourceText(node)`，避免复制英文后无法恢复中文。仅格式化界面提示可调用 `t(source)`；含文件名的提示用明确模式保留捕获值，不对用户文本做子串替换。

中文来源与属性保存在 WeakMap。只有一个委托点击监听和一个 MutationObserver；更新批量处理，写入期间暂停观察，旧页面节点不保存在长期数组中。AJAX 在幕布覆盖时替换正文后应用语言，再初始化模块与揭幕。既有转场时长保持不变。

## 2026-10-09 验证

- 全部前端单元测试 **184 项通过**，包括默认语言、拒绝存储、格式化提示、文件名 `$&` 保留、内容归属释放与 giscus 无重建切换。
- `GOCACHE=/tmp/blog-go-cache go test ./...` 通过，包括共用资源 GET / HEAD / POST 与 Hugo 构建前的后台加载验证。
- `tests/language-switch.browser.cjs`：9 组场景通过。覆盖 1440 / 390 / 320px、深浅主题、正常和减少动态效果、慢资源及 4 倍 CPU、AJAX、Back/Forward、刷新、双语搜索、工具状态、密码可见状态、删除确认、同域偏好、拒绝存储；后台分别检查站主、admin、普通用户。
- 连续 20 次语言切换后 DOM 元素数量保持一致；编辑中的中文标题和正文、与“首页”重名的内容、中文密码及练习文本保持原值。
- 既有 `tests/home-header-layout.browser.cjs` 的 10 组布局与交互场景通过，覆盖首页留言、项目数与档案居中。
- 与上一轮固定内容构建对比 8 组中文主体截图：尺寸和基础计算样式一致，阈值像素差为 0–0.23%。截图动画冻结仅用于比较；完整交互回归保留实际转场。
- 在 11 个公开界面扫描声明为界面的文本与属性，包含抽卡结果，未发现未翻译的中文；用户内容不进入该扫描。

原始日志、截图、对比数据及主项目同步清单保存在忽略目录 `local-only/language-2026-10-09/`。浏览器使用固定 API 和只读后台演示数据；真实第三方登录和线上部署未执行。本轮没有声称提升性能，也没有进行新的跨版本性能收益验收。

验证命令：

```sh
node --test --test-isolation=none tests/*.test.cjs
GOCACHE=/tmp/blog-go-cache go test ./...
# 已准备并构建隔离站，且启动只读后台预览后：
node tests/language-switch.browser.cjs
```

本地审计目录设为独立 Go 模块，避免源码备份被 `go test ./...` 当成可编译包。

按钮显示当前语言（中文 `中`、英文 `en`），无障碍名称描述点击后的切换目标；桌面与手机已验证键盘切换、刷新、AJAX 切页和独立音频工具的显示一致性。
