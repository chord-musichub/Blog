# v20.18.5 新增反应测试工具

## 新增页面

- `/tools/reaction-test/`

## 玩法

1. 点击测试区开始。
2. 等待测试区变色。
3. 变色后立刻点击。
4. 记录反应时间，单位 ms。
5. 如果提前点击，会显示“太早了”，不计入成绩。

## 排行榜

反应测试新增服务器前三名排行榜，越低越好。

### API

- `/api/tools/reaction-scores`
- `/write/api/tools/reaction-scores`
- `/static/api/reaction-scores`
- `/api/reaction-scores`

### 数据文件

```text
data/reaction_scores.json
```

## 音效

使用 Web Audio API 合成音效，不新增音频文件。

包含：

- 开始音
- 变色提示音
- 点击成功音
- 提前点击失败音
- 按钮音

## 新增文件

- `content/tools/reaction-test/_index.md`
- `layouts/tools/reaction-test.html`
- `static/js/tools/reaction-test.js`

## 修改文件

- `cmd/server/main.go`
- `layouts/tools/tools.html`
- `deploy/rebuild.sh`
- `static/js/page-modules.js`
- `layouts/partials/page-specific-scripts.html`
- `layouts/partials/resource-hints.html`
- `static/css/site.css`
