# v20.18.5 修复 2048 工具页不可见 / 未生成

## 问题

v20.13.8 新增了：

- `layouts/tools/2048.html`
- `content/tools/2048/_index.md`
- `static/js/tools/game-2048.js`
- 工具页 2048 卡片

但项目的 `deploy/rebuild.sh` 里有一段历史兜底逻辑：

```bash
mkdir -p content/tools/markdown-previewer content/tools/random-number content/tools/snake content/tools/gacha
```

它每次构建前会自动补齐工具页 content，占位列表里原本没有 2048。

所以部署后执行：

```bash
./deploy/rebuild.sh
```

可能导致 `/tools/2048/` 没有被正常生成，用户在工具页也不容易确认是否已经生效。

## 修复

### 1. rebuild.sh 工具页兜底加入 2048

新增：

```bash
mkdir -p content/tools/2048
cat > content/tools/2048/_index.md <<'EOF'
---
title: "2048"
layout: "2048"
generated_by: "songline-tools-fallback"
draft: false
---
EOF
```

### 2. 保留工具页卡片

工具页卡片增加 `data-tool-id="2048"`，方便验证。

## 验证

部署后执行：

```bash
cd /opt/gexian-blog-mvp
./deploy/rebuild.sh
grep -R "/tools/2048/\|data-tool-id=\"2048\"" -n published/tools/index.html
ls -l published/tools/2048/index.html
```
