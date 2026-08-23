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
HEALTH_WAIT_SECONDS="${BLOG_HEALTH_WAIT_SECONDS:-60}"

if ! [[ "$HEALTH_WAIT_SECONDS" =~ ^[1-9][0-9]*$ ]]; then
  HEALTH_WAIT_SECONDS=60
fi

wait_for_health() {
  local address="$1"
  local attempt
  for ((attempt = 1; attempt <= HEALTH_WAIT_SECONDS; attempt++)); do
    if curl --fail --silent "$address" >/dev/null; then
      return 0
    fi
    sleep 1
  done
  return 1
}

if [[ ! -x "$NEXT_LINK/blog-admin" ]]; then
  echo "没有可提升的 next 版本：$NEXT_LINK/blog-admin 不存在。" >&2
  exit 1
fi

if ! wait_for_health http://127.0.0.1:8081/healthz; then
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

if systemctl restart blog-admin.service && wait_for_health http://127.0.0.1:8080/healthz; then
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
