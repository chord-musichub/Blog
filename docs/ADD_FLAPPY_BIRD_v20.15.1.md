# v20.18.5 新增管道鸟小游戏

## 新增页面

- `/tools/flappy-bird/`

## 玩法

- 点击屏幕 / 按空格：小鸟上飞
- 穿过管道：得 1 分
- 撞管道、撞地、撞顶：游戏结束

## 排行榜

新增服务器前三名排行榜，分数越高越好。

### API

- `/api/tools/flappy-scores`
- `/write/api/tools/flappy-scores`
- `/static/api/flappy-scores`
- `/api/flappy-scores`

### 数据文件

```text
data/flappy_scores.json
```

## 音效

使用 Web Audio API 合成，不新增音频文件。

包含：

- 起飞音
- 得分音
- 撞击音
- 开始音
- 按钮音

## 新增文件

- `content/tools/flappy-bird/_index.md`
- `layouts/tools/flappy-bird.html`
- `static/js/tools/flappy-bird.js`

## 修改文件

- `cmd/server/main.go`
- `layouts/tools/tools.html`
- `deploy/rebuild.sh`
- `static/js/page-modules.js`
- `layouts/partials/page-specific-scripts.html`
- `layouts/partials/resource-hints.html`
- `static/css/site.css`
