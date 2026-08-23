# v20.18.5 本地助手 .NET SDK 检测修复

## 问题

用户运行 `Run-Bridge.cmd` 后报错：

```text
No .NET SDKs were found.
The application 'restore' does not exist.
The application 'publish' does not exist.
```

原因是本机没有安装 .NET SDK，导致源码无法构建成 `SonglineMusicBridge.exe`。

## 修复

### 1. build.ps1 严格检测 SDK

新增：

- 检测 `dotnet`
- 检测 `dotnet --list-sdks`
- 如果没有 SDK，明确提示安装 .NET 8 SDK
- dotnet restore / publish 失败时立即退出
- 不再出现“失败了还显示 Done”的假成功

### 2. Run-Bridge.ps1 增强

新增：

- 自动检测 .NET SDK
- 如果没有 SDK，尝试使用 winget 安装 `Microsoft.DotNet.SDK.8`
- 没有 winget 时打开官方下载页面
- 构建失败时不再继续启动不存在的 exe

### 3. 新增 Install-DotNet-SDK.cmd

可手动运行此文件，通过 winget 安装 .NET 8 SDK。

## 新下载包

```text
/downloads/SonglineMusicBridge-v20.18.5-oneclick.zip
```
