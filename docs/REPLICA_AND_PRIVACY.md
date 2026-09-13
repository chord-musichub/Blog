# 可复刻公开站与隐私边界

仓库包含一份可公开复刻的站点快照。克隆后执行 `./deploy/init-local.ps1` 并启动服务时，若本地 `data/` 为空，程序会只初始化下列公开配置：

- `assets/bootstrap/site.json`：站点呈现与首页配置；
- `assets/bootstrap/theme.json`：后台与公开站主题；
- `assets/data/friends/friends.json`：公开朋友星图资料；
- `assets/data/`、`content/posts/`、`content/friends/`、`content/tags/`：公开页面的内容与清单；
- `static/uploads/`：公开页面实际引用的图片与媒体种子；首次运行复制到 `data/media/`。

`data/` 始终不会提交。它包含账号、密码哈希、草稿、留言、阅读量、排行榜、用户上传媒体和部署机上的运行状态。首次启动后，公开快照会复制到新的 `data/` 中；已有实例数据优先，绝不会被仓库中的快照覆盖。

## 平台数据边界

| 位置 | 用途 | 是否提交 |
| --- | --- | --- |
| `assets/data/friends/friends.json` | 朋友星图的公开基础节点：本站用户仅保留展示所需资料，第三方节点也在这里。 | 是 |
| `assets/data/friends/links.json` | 朋友星链关系。 | 是 |
| `static/uploads/` | 可随项目复刻的公开媒体种子；首次启动只补入缺失的 `data/media/` 文件。 | 是 |
| `data/friends.json` | 当前部署实例中可编辑的朋友资料覆盖层。 | 否 |
| `data/media/`、`data/articles.json`、`data/messages.json`、`data/*scores.json` | 用户上传、单用户内容、留言、统计与排行等易变运行数据。 | 否 |

因此，复刻者不需要先准备 `data/`：空目录也能显示仓库内的公开站。随后新增的账号、文章、媒体和互动数据只属于其自己的部署，不会污染项目仓库。

## 复刻启动

```powershell
./deploy/init-local.ps1
docker compose up --build
```

初始化脚本会生成仅本机使用的 `.env`、`data/` 与 `local-only/`。脚本输出的初始管理员密码只会显示这一次，请自行保存；它不会进入 Git。

## 需要保密的文件

- 不要把私密文章发布为公开文章；未发布草稿只存在于 `data/articles.json`，默认不会进入 Git。
- 不应公开的原图、导出文件或个人备份请放入仓库根目录 `local-only/`，该目录被 Git 与 Docker 构建忽略，也不属于静态资源目录。
- `static/uploads/` 下的文件按设计会被浏览器请求，不能存放任何真正私密的内容。
- 环境变量、`.env`、SSH 密钥和服务器运行数据继续保持忽略。

准备提交前建议执行：

```powershell
git status
git diff --cached
```

确认没有误加入 `data/`、`local-only/` 或其他个人文件后再提交。
