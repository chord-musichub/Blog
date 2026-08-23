# v20.18.5 本地助手可见启动器修复

## 问题

用户反馈双击后窗口弹出但没有任何内容。

## 修复

### 1. 新增明确入口

```text
Start-Here-双击这个.cmd
```

这个脚本会先在 CMD 中打印说明、当前目录和日志位置，再调用 `Run-Bridge.cmd`。

### 2. 新增日志

所有启动过程会写入：

```text
bridge-launch.log
```

如果启动异常，可以直接查看或发送该日志。

### 3. Run-Bridge.cmd 更可见

启动前会显示：

- PowerShell 检查
- 当前目录
- 启动步骤
- 失败退出码
- 日志内容

### 4. PowerShell 异常捕获

`Run-Bridge.ps1` 新增 try/catch，失败时写入日志并返回明确退出码。

### 5. 下载包更新

```text
/downloads/SonglineMusicBridge-v20.18.5-oneclick.zip
```
