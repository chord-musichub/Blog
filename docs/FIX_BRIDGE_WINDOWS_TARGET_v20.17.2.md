# v20.18.5 本地助手 Windows TargetPlatform 修复

## 问题

本地助手构建时报错：

```text
error NETSDK1135: SupportedOSPlatformVersion 10.0.22621.0 不能高于 TargetPlatformVersion 10.0.19041.0
```

原因是 Windows 目标平台版本和最低支持版本配置不一致。

## 修复

`SonglineMusicBridge.csproj` 改为：

```xml
<TargetFramework>net8.0-windows10.0.22621.0</TargetFramework>
<SupportedOSPlatformVersion>10.0.19041.0</SupportedOSPlatformVersion>
<TargetPlatformMinVersion>10.0.19041.0</TargetPlatformMinVersion>
```

## 下载包

```text
/downloads/SonglineMusicBridge-v20.18.5-oneclick.zip
```
