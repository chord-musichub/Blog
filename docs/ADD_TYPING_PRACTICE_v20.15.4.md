# v20.18.5 新增打字练习工具

## 新增页面

- `/tools/typing-practice/`

## 模式

1. 英文
2. 中文 / 中英混打

两种模式分开随机文章、分开本地最佳、分开服务器排行榜。

## 文章来源

当前使用内置短文池随机抽取，不依赖外部资源。  
这样避免版权、网络失败、内容格式不可控等问题。

后续可以做后台维护的“练习文本库”，由站点管理员添加或替换文章。

## 排行榜

- 以完成整篇文章的时间为成绩
- 单位为 ms，前端显示为秒
- 越低越好
- 英文和中英混打分开排行
- 登录账号 / 游客设备只保留各自最好成绩

## API

- `/api/tools/typing-scores?mode=english`
- `/write/api/tools/typing-scores?mode=english`
- `/static/api/typing-scores?mode=english`
- `/api/typing-scores?mode=english`

`mode=mixed` 为中文/中英混打。

## 数据文件

```text
data/typing_scores.json
```

## 音效

使用 Web Audio API 合成，不新增音频文件。

包含：

- 正确按键音
- 错误按键音
- 完成音
- 按钮音

## 防误刷

- 完成整篇文章才提交
- 粘贴被拦截
- 成绩有效范围：1s ~ 1h
