#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if ! command -v hugo >/dev/null 2>&1; then
  echo "Hugo 未安装。可以先 apt install -y hugo"
  exit 1
fi
hugo --minify --source . --destination ./published
echo "published/ 已更新"
