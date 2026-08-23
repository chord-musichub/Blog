# v20.18.5 安全部署与 rebuild 修复

## 这版主要修复

v20.18.4 的安全部署流程里，临时目录构建时调用了 `deploy/rebuild.sh`，但旧的 `rebuild.sh` 开头硬编码：

```bash
cd /opt/gexian-blog-mvp
```

这会导致“明明在临时目录构建”，实际却跑到当前线上目录去 rebuild。为了避免再次出现切换后静态输出不完整或 404，本版将 `rebuild.sh` 改为：

```bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${SONGLINE_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
cd "$PROJECT_ROOT"
```

## 新增安全部署脚本

新增：`deploy/deploy_v20.18.5_safe.sh`

它会先在临时目录构建、rebuild，并且确认以下文件存在后才切换线上目录：

- `published/index.html`
- `published/tools/index.html`
- `published/tools/audio-visualizer/index.html`

如果 node 没安装，只跳过 JS 语法检查，不中断部署。启动失败或 nginx 检查失败会自动回滚。

## 功能保留

保留 v20.18.4 的音频可视化功能：播放列表收展、移出、单曲循环 / 列表循环 / 随机播放、全隐藏纯净展示模式、浮层透明度处理和节奏响应视觉优化。
