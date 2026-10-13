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

## 维护与验证

界面范围扫描与局部插入采用批处理，避免反复遍历正文。语言按钮的无障碍名称描述点击后的切换目标。

新增文案后检查中英文、窄屏、动态状态、存储禁用、刷新与站内切页，确认用户内容和正在编辑的输入值保持原样。单元入口为 `tests/language-switch.test.cjs`，浏览器入口为 `tests/language-switch.browser.cjs` 与 `tests/language-work.browser.cjs`；构建与隔离环境准备见[测试指南](TESTING.md)。
