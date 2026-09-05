# 素材登记册

此登记册只记录由代码仓库维护、可以随版本发布的视觉素材；用户上传和后台配置图片不在此表中。

## 当前受版本控制的场景素材

| 当前路径 | 使用处 | 归属与后续处理 |
| --- | --- | --- |
| `static/uploads/admin/under-ground.png` | 工具页日间地下场景 | 兼容旧 URL；后续有明确兼容方案后迁到 `static/media/tools/underground/`。 |
| `static/uploads/admin/under-ground-black.png` | 工具页夜间地下场景 | 同上。 |
| `static/uploads/admin/tools-underground-soil-light-v1.png` | 工具页日间可延展土层 | 同上。 |
| `static/uploads/admin/tools-underground-soil-dark-v1.png` | 工具页夜间可延展土层 | 同上。 |

## 不进入此表的文件

- `static/uploads/<用户或用途>/`：后台上传的运行时媒体，路径可能被文章、站点设置或用户资料直接引用，不能批量移动。
- `static/md-source/`：用户提交的 Markdown 源文件。

## 新增素材规则

新建、由代码维护的插图与场景素材直接放到 `static/media/<模块>/`，并在本文件登记用途与引用页面。只要某个旧上传路径还可能被数据库或公开链接引用，就保留其兼容 URL。
