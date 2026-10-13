# 公开资源与私有数据

仓库保存代码、公开默认配置和构建素材；每个实例的账号、文章和互动数据独立持久化。新克隆可以展示默认页面、朋友星图和工具，但不会复制原实例的用户账号或文章库。启动步骤见[本地运行指南](LOCAL_RUNTIME.md)。

## 哪些内容进入 Git

| 位置 | 内容 | 是否提交 |
| --- | --- | --- |
| `assets/bootstrap/` | 首次启动的站点与主题默认配置 | 是 |
| `assets/data/` | 公开朋友资料/关系、项目与工具清单 | 是 |
| `content/` 中的固定页面 | 回忆和工具等页面骨架 | 是 |
| `static/uploads/admin/` | 公开场景、图标和默认媒体 | 是 |
| `.env.example`、`deploy/blog-admin.env.example` | 不含真实凭据的配置模板 | 是 |
| `data/` | 账号、草稿、内容、留言、统计、排行、设置、上传和下载源 | 否 |
| `content/posts/`、`content/friends/`、`content/tags/` | 实例生成的公开内容 | 否 |
| `static/uploads/` 下非 admin 目录、`static/md-source/` | 旧版实例上传与 Markdown 源目录 | 默认忽略 |
| `.env`、`local-only/`、构建输出 | 凭据、私有备份、审计材料与可再生文件 | 否 |

`.gitignore` 不会取消历史跟踪，Docker 构建另有 `.dockerignore`。公开媒体目录会被浏览器请求，不应用来保存私密文件；素材授权见 [MEDIA-LICENSE.md](../MEDIA-LICENSE.md)。

## 默认内容如何初始化

首次启动时从 `assets/bootstrap/site.json`、`theme.json` 补入缺失设置，从 `assets/data/friends/` 读取公开朋友种子，并将仓库默认媒体补入 `data/media/`。已有站点/主题文件保留，媒体不覆盖同路径的实例文件；朋友资料按种子与运行时覆盖层合并，保留实例修改。

新增文章、用户上传和互动记录写入运行目录。项目与回忆如果已经保存为空数组，表示用户清空了内容，不能再按“没有数据文件”补回种子。公开输出仅包含发布流程允许的内容，未发布草稿保留在运行数据中。

## 备份与迁移

Docker 本地实例至少保留 `.env`、完整 `data/` 和动态 `content/posts/`、`content/friends/`、`content/tags/`；systemd 实例保留 `shared/` 中的环境文件、数据和动态内容。复制期间暂停写入，避免多个 JSON 和媒体文件来自不同状态。

旧实例还应保留未迁移的 `static/uploads/`、`static/md-source/` 或 `shared/static/`。升级可通过 `RUNTIME_STATIC_DIR` 指定旧目录，程序只补入新运行目录中缺失的文件；确认迁移后再移除旧配置。平铺业务 JSON 的分类迁移和冲突处理见[服务器指南](SERVER_DEPLOYMENT.md)。

媒体删除标记 `data/media/.deleted/` 属于备份的一部分。`published/` 与图片预览缓存可以重新生成，不能用它们代替账号、原媒体和稿件备份。根目录 `local-only/` 中需要保留的原图或导出文件自行备份，不通过网站 URL 引用。

## 提交前检查

```sh
git status --short
git diff --cached
git ls-files --cached --ignored --exclude-standard
```

最后一个命令正常应无输出。检查没有真实凭据、实例数据或私有备份进入提交；公开素材按当前目录规则维护，不将用户目录整体加入仓库。忽略规则不代替备份，也不会移除已推送的文件历史。

具体目录职责见[项目结构](PROJECT_STRUCTURE.md)，前端统计与存储偏好见[使用指南](FEATURES.md)。
