# 创作中心（v21）

后台采用独立的创作中心界面，不修改公开网站的视觉样式。

## 操作入口

- 工作台：稿件统计、状态筛选、标题搜索、分页、继续编辑。
- 投稿：标题与 Markdown 正文优先；侧边集中封面、摘要、标签；底部保存或提交审核。
- 素材管理：上传、分类、搜索、预览和裁剪；重命名与删除收在「管理」中。
- 项目与回忆：站主专用，默认紧凑列表，点击展开编辑，「新建」展开新增表单。
- 设置：左侧分类、右侧配置；站点外观只保留一个配置入口。
- 个人资料：更换头像/横幅后即时预览，也可以从素材库选取并裁剪。

管理员保留审核、留言、用户和密码管理，不显示投稿、项目、回忆入口。普通用户仍只能管理自己的内容。后端权限、存储路径和裁剪原图保留机制不变。

## 实现入口

- `web/templates/admin_shared.html`：顶部账号区、角色侧栏、公共资源入口。
- `web/static/creator-center.css`：后台唯一主样式入口，含深浅主题及响应式布局；不再加载历史 `style.css`。
- `web/static/creator-center.js`：列表筛选分页、编辑状态、即时预览、管理列表展开。
- `web/static/admin-nav.js`：路径前缀、当前导航、管理分区与移动侧栏焦点处理。
- `web/templates/home.html`、`editor.html`、`media.html`、`account.html`：主要操作页。
- `web/static/cover-uploader.js`、`editor-import.js`、`editor.js`、`media-admin.js`：上传、导入、预览与素材交互。
- `cmd/server/creator_center_test.go`：角色导航、模板渲染、保存/提交和隔离的视觉预览。

## 验证与本地查看

### 21.1 界面整合

- 账号设置直接包含资料和密码；旧 `/settings` 地址跳转到该表单。普通用户不再看到重复分类栏，站主的站点/外观/文章配置保留为平级入口。
- 后台与展示页共用 `songline-theme` 偏好，采用淡灰绿 / 夜空蓝灰配色；站点 Logo 和个人头像读取实际配置。
- 登录页左上角返回主页，密码申请在密码输入区旁。两端通过 `document-transition.js` 完成整页黑幕交接，等待首屏资源后揭幕；减少动态效果、失败资源和浏览器后退均有退出处理。
- 移除已无前台消费者的旧星际入口、首页简介、关于卡片及旧档案/工具标题设置；历史配置值不清空。

### Git 与部署数据边界

`assets/data/` 与 `static/uploads/admin/` 是可提交的站点内容和构建素材。`data/`、`content/posts/`、`content/friends/`、`content/tags/`、旧 `static/uploads/` 下的非 admin 用户目录、`static/md-source/` 均不提交，也不进入 Docker 镜像。

服务器迭代仍使用 `shared/data` 和 `shared/content`，不是用仓库覆盖运行数据。发布脚本会检查候选提交：如果其中已跟踪动态数据，则在接触共享数据前停止。`.gitignore` 不会自动取消历史跟踪；提交前运行 `git ls-files --cached --ignored --exclude-standard`，正常应为空。不要用 `git clean -xfd` 清理部署目录，也不要用镜像里的空目录覆盖数据卷。首次安装没有用户文章属于正常空状态，站点固定页面和构建素材仍可使用。

生产升级前应对共享数据做独立备份；忽略规则不能代替备份，也不会撤销已推送的隐私文件历史。本站这次修改不执行服务器部署或数据搬迁。

公开朋友种子原先引用用户目录的 9 张头像/横幅，现在有独立副本放在 `static/uploads/admin/friends/profiles/`，仅更新公开种子引用。原用户媒体和运行时资料均保留，新克隆不再依赖这些用户的私有媒体库。测试会检查公开朋友种子引用的本地图片是否属于构建素材且真实存在。

```powershell
go test ./...
docker compose up -d --build blog-admin
```

默认本地后台：`http://127.0.0.1:8080/write/`，使用现有账号登录。

只读示例页面可独立启动，不读取真实账号、不注册任何保存接口：

```powershell
$env:CREATOR_CENTER_PREVIEW='1'
go test ./cmd/server -run TestCreatorCenterVisualPreview -timeout 2h -v
```

入口：`http://127.0.0.1:8091/write/`。仅监听本机，默认站主示例；`?role=user` / `?role=admin` 用于单页角色预览。Ctrl+C 停止；预览服务器不是实际后台。

浏览器已检查桌面与手机宽度下的工作台、投稿、项目/回忆、资料、素材和设置；验证了筛选分页、主题切换、Markdown 预览、选图与裁剪弹窗。真实账号的发布、删除、密码操作未通过浏览器执行，以免改变现有数据；保存/提交、权限与媒体操作由隔离测试覆盖。
