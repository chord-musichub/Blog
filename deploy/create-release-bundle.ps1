[CmdletBinding()]
param(
    [string]$OutputDirectory = "local-only/server-release",
    [string]$PythonPath = "E:\code\py-compiler\python.exe"
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

if (-not (Test-Path -LiteralPath $PythonPath -PathType Leaf)) {
    throw "Python not found: $PythonPath. Pass a valid path with -PythonPath."
}

# Source comes from a committed local revision. This excludes .git, .env,
# local-only, and Docker build artifacts from the server bundle.
& git diff --quiet
if ($LASTEXITCODE -ne 0) {
    throw "Working tree has uncommitted changes. Commit source changes before creating a release bundle."
}
& git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
    throw "Index has staged but uncommitted changes. Commit source changes before creating a release bundle."
}

$trackedRuntime = & git ls-files -- data content/posts content/friends content/tags static/md-source
if ($trackedRuntime) {
    throw "Tracked runtime files cannot be included in a release bundle:`n$($trackedRuntime -join "`n")"
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
        throw "Runtime data is incomplete. Missing: $relativePath"
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
        throw "Unable to create a source archive from HEAD."
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
        throw "Unable to create the release bundle."
    }

    Get-FileHash -LiteralPath $bundlePath -Algorithm SHA256
    Write-Host "Release bundle created: $bundlePath"
    Write-Host "Verify it on the server with: tar -tzf ARCHIVE.tar.gz >/dev/null"
}
finally {
    Remove-Item -LiteralPath $sourceArchive -Force -ErrorAction SilentlyContinue
}
