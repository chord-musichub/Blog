#!/usr/bin/env bash
set -euo pipefail

# 将已通过本机健康检查的 next 版本切换为 current；失败时 current 链接不会变更。

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo "请使用 sudo 运行此脚本。" >&2
  exit 1
fi

APP_ROOT="${BLOG_APP_ROOT:-/opt/songline-blog}"
NEXT_LINK="$APP_ROOT/next"
CURRENT_LINK="$APP_ROOT/current"

if [[ ! -x "$NEXT_LINK/blog-admin" ]]; then
  echo "没有可提升的 next 版本：$NEXT_LINK/blog-admin 不存在。" >&2
  exit 1
fi

if ! curl --fail --silent --show-error http://127.0.0.1:8081/healthz >/dev/null; then
  echo "next 版本健康检查失败，未切换。" >&2
  exit 1
fi

NEXT_TARGET="$(readlink -f "$NEXT_LINK")"
PREVIOUS_TARGET=""
if [[ -L "$CURRENT_LINK" ]]; then
  PREVIOUS_TARGET="$(readlink -f "$CURRENT_LINK")"
fi

systemctl stop blog-admin-next.service
ln -sfn "$NEXT_TARGET" "$CURRENT_LINK"

if systemctl restart blog-admin.service && curl --fail --silent --show-error http://127.0.0.1:8080/healthz >/dev/null; then
  echo "已切换到 $NEXT_TARGET"
  [[ -n "$PREVIOUS_TARGET" ]] && echo "上一版本：$PREVIOUS_TARGET"
  exit 0
fi

echo "新稳定版本未通过健康检查，正在回滚…" >&2
if [[ -n "$PREVIOUS_TARGET" ]]; then
  ln -sfn "$PREVIOUS_TARGET" "$CURRENT_LINK"
  systemctl restart blog-admin.service
fi
exit 1
