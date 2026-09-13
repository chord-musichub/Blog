# 素材登记册

此登记册只记录由代码仓库维护、可以随版本发布的视觉素材；用户上传和后台配置图片不在此表中。站点拥有著作权的媒体默认采用 [CC BY-NC-SA 4.0](../MEDIA-LICENSE.md)，第三方图标、朋友头像和用户上传内容不自动获得该授权。

## 当前受版本控制的场景素材

| 当前路径 | 使用处 | 归属与后续处理 |
| --- | --- | --- |
| `static/uploads/admin/background/under-ground.png` | 工具页日间地下场景 | `/uploads` 为统一公开媒体根目录。 |
| `static/uploads/admin/background/under-ground-black.png` | 工具页夜间地下场景 | 同上。 |
| `static/uploads/admin/background/tools-underground-soil-light-v1.png` | 工具页日间可延展土层 | 同上。 |
| `static/uploads/admin/background/tools-underground-soil-dark-v1.png` | 工具页夜间可延展土层 | 同上。 |

## 不进入此表的文件

- `static/uploads/<用户或用途>/`：可提交的公开媒体种子；运行时上传文件写入 `data/media/<用户或用途>/`，由同一 `/uploads/` URL 提供。
- `static/md-source/`：用户提交的 Markdown 源文件。
- `local-only/`：只在本机存在的私密原图或备份，不应成为页面资源。

## 新增素材规则

新建、由代码或后台维护的公开插图与场景素材直接放到 `static/uploads/<归属或模块>/`，并在本文件登记用途与引用页面。只要某个旧上传路径还可能被数据库或公开链接引用，就保留其兼容 URL。
