[CmdletBinding()]
param(
    [string]$OutputDirectory = "local-only/server-release",
    [string]$PythonPath = "E:\code\py-compiler\python.exe"
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

if (-not (Test-Path -LiteralPath $PythonPath -PathType Leaf)) {
    throw "找不到 Python：$PythonPath。请通过 -PythonPath 指定可用的 Python。"
}

# 发布包的源码来自一个已提交的本地提交：这样包内源码可复现，且不会把 .git、.env、
# local-only、Docker 构建产物等工作目录杂项一并带到服务器。
& git diff --quiet
if ($LASTEXITCODE -ne 0) {
    throw "存在未提交的工作区修改。请先检查、提交源码，再创建发布包。"
}
& git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
    throw "存在仅暂存但未提交的修改。请先提交源码，再创建发布包。"
}

$trackedRuntime = & git ls-files -- data content/posts content/friends content/tags static/md-source
if ($trackedRuntime) {
    throw "以下运行时文件仍被 Git 跟踪，不能创建发布包：`n$($trackedRuntime -join "`n")"
}

$requiredRuntimePaths = @(
    "data/auth/users.json",
    "data/content/articles.json",
    "data/community/friends.json",
    "data/settings/site.json",
    "content/posts",
    "content/friends",
    "content/tags"
)
foreach ($relativePath in $requiredRuntimePaths) {
    if (-not (Test-Path -LiteralPath (Join-Path $projectRoot $relativePath))) {
        throw "运行数据不完整，缺少：$relativePath"
    }
}

$outputPath = Join-Path $projectRoot $OutputDirectory
New-Item -ItemType Directory -Path $outputPath -Force | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$revision = (& git rev-parse --short HEAD).Trim()
$sourceArchive = Join-Path $outputPath ".source-$stamp.tar"
$bundlePath = Join-Path $outputPath "songline-blog-$stamp-$revision.tar.gz"

try {
    & git archive --format=tar --output=$sourceArchive HEAD
    if ($LASTEXITCODE -ne 0) {
        throw "无法从当前提交创建源码归档。"
    }

    $env:SONGLINE_BUNDLE_ROOT = $projectRoot
    $env:SONGLINE_BUNDLE_SOURCE = $sourceArchive
    $env:SONGLINE_BUNDLE_OUTPUT = $bundlePath
    @'
import os
import tarfile
from pathlib import Path

root = Path(os.environ["SONGLINE_BUNDLE_ROOT"])
source_path = Path(os.environ["SONGLINE_BUNDLE_SOURCE"])
output_path = Path(os.environ["SONGLINE_BUNDLE_OUTPUT"])
runtime_paths = ("data", "content/posts", "content/friends", "content/tags")

with tarfile.open(output_path, "w:gz", format=tarfile.PAX_FORMAT) as destination:
    with tarfile.open(source_path, "r:") as source:
        for member in source.getmembers():
            payload = source.extractfile(member) if member.isfile() else None
            member.name = f"source/{member.name}"
            destination.addfile(member, payload)
    for relative in runtime_paths:
        destination.add(root / relative, arcname=f"runtime/{relative}")

print(output_path)
'@ | & $PythonPath -
    if ($LASTEXITCODE -ne 0) {
        throw "无法创建发布包。"
    }

    Get-FileHash -LiteralPath $bundlePath -Algorithm SHA256
    Write-Host "发布包已创建：$bundlePath"
    Write-Host "上传后在服务器执行：tar -tzf <发布包> >/dev/null"
}
finally {
    Remove-Item -LiteralPath $sourceArchive -Force -ErrorAction SilentlyContinue
}
