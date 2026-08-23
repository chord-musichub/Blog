# v20.18.5 本地助手 ASCII 启动器修复

## 问题

上一版 `.cmd` 文件中含有中文提示，在部分 Windows CMD 代码页下会乱码，并被当成命令执行。

用户看到类似：

```text
'褰撳墠鐩綍锛?echo' is not recognized
```

## 修复

所有会被双击执行的脚本改为 ASCII-only：

```text
Start-Here.cmd
Run-Bridge.cmd
Run-Bridge.ps1
build.ps1
Install-DotNet-SDK.cmd
README_FIRST.txt
```

同时移除中文文件名入口，改为：

```text
Start-Here.cmd
```

## 下载包

```text
/downloads/SonglineMusicBridge-v20.18.5-oneclick.zip
```
