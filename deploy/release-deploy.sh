#!/usr/bin/env bash
set -euo pipefail

# 在不触碰 current 稳定版本的前提下，拉取、构建并启动 next 预发布版本。
# 运行方式：sudo ./deploy/release-deploy.sh [Git 引用]

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo "请使用 sudo 运行此脚本。" >&2
  exit 1
fi

APP_ROOT="${BLOG_APP_ROOT:-/opt/songline-blog}"
REPOSITORY_URL="${BLOG_REPOSITORY_URL:-git@github.com:chord-musichub/Blog.git}"
GIT_SSH_COMMAND="${GIT_SSH_COMMAND:-ssh -i /root/.ssh/id_ed25519_blog_deploy -o IdentitiesOnly=yes}"
export GIT_SSH_COMMAND
RELEASE_REF="${1:-${BLOG_RELEASE_REF:-main}}"
RELEASES_DIR="$APP_ROOT/releases"
SHARED_DIR="$APP_ROOT/shared"
STAMP="$(date -u +%Y%m%d%H%M%S)"
HEALTH_WAIT_SECONDS="${BLOG_HEALTH_WAIT_SECONDS:-240}"
mkdir -p "$RELEASES_DIR"
WORK_DIR="$(mktemp -d "$RELEASES_DIR/.build-${STAMP}-XXXXXX")"

cleanup() {
  local status=$?
  if [[ $status -ne 0 && -d "$WORK_DIR" ]]; then
    rm -rf -- "$WORK_DIR"
  fi
  exit "$status"
}
trap cleanup EXIT

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "缺少命令：$1" >&2
    exit 1
  }
}

for command_name in git go hugo systemctl curl install; do
  require_command "$command_name"
done

install -d -o blog -g blog -m 0755 "$RELEASES_DIR" "$SHARED_DIR"
install -d -o blog -g blog -m 0700 "$SHARED_DIR/data"
install -d -o blog -g blog -m 0755 \
  "$SHARED_DIR/content/posts" \
  "$SHARED_DIR/content/friends" \
  "$SHARED_DIR/content/tags"

if [[ ! -r "$SHARED_DIR/blog-admin.env" ]]; then
  echo "找不到 $SHARED_DIR/blog-admin.env；请先按照部署文档创建私有环境文件。" >&2
  exit 1
fi

# 仅旧部署还保留 shared/static 时补充一次迁移来源。新版本全部写入 shared/data，
# 因此新安装不再创建或配置 shared/static。
if ! grep -q '^RUNTIME_STATIC_DIR=' "$SHARED_DIR/blog-admin.env" \
  && { [[ -d "$SHARED_DIR/static/uploads" ]] || [[ -d "$SHARED_DIR/static/md-source" ]]; }; then
  printf '\nRUNTIME_STATIC_DIR=%s/static\n' "$SHARED_DIR" >> "$SHARED_DIR/blog-admin.env"
fi

git clone --quiet --branch "$RELEASE_REF" --depth 1 "$REPOSITORY_URL" "$WORK_DIR/source"
# .gitignore cannot protect files that were already committed. Reject a release
# containing private/runtime payloads before linking or touching shared data.
runtime_payloads="$(git -C "$WORK_DIR/source" ls-files -- data content/posts content/friends content/tags static/md-source 'static/uploads/*' ':!static/uploads/admin/**')"
if [[ -n "$runtime_payloads" ]]; then
  echo "候选版本包含运行数据或用户媒体，已停止；请先从 Git 索引移除这些文件（保留磁盘原件）。" >&2
  printf '%s\n' "$runtime_payloads" >&2
  exit 1
fi
REVISION="$(git -C "$WORK_DIR/source" rev-parse --short HEAD)"
RELEASE_DIR="$RELEASES_DIR/${STAMP}-${REVISION}"
mv "$WORK_DIR/source" "$RELEASE_DIR"
rmdir "$WORK_DIR"

# 这些路径在 Git 中被忽略；链接到 shared 后，版本更新不会覆盖文章、用户和上传文件。
link_shared_path() {
  local relative_path="$1"
  local source_path="$SHARED_DIR/$relative_path"
  local target_path="$RELEASE_DIR/$relative_path"
  install -d -o blog -g blog -m 0755 "$(dirname "$target_path")"
  if [[ -e "$target_path" || -L "$target_path" ]]; then
    echo "候选源码包含预期之外的运行目录：$target_path；为保护源码，已停止部署。" >&2
    exit 1
  fi
  ln -s "$source_path" "$target_path"
}

link_shared_path data
link_shared_path content/posts
link_shared_path content/friends
link_shared_path content/tags

# 公开站模板统一用此版本作为静态资源缓存标识。它位于运行时 data 目录，
# 不会进入 Git，也不会覆盖文章、用户或上传文件。
printf '{"asset_version":"%s"}\n' "$REVISION" > "$RELEASE_DIR/data/build.json"

echo "构建候选版本 ${REVISION}…"
# 发布目录会切换为 blog 用户所有；禁用 Go 的 VCS 信息写入，避免构建时触发 Git 的属主安全检查。
(cd "$RELEASE_DIR" && go build -buildvcs=false -trimpath -ldflags='-s -w' -o blog-admin ./cmd/server)
install -d -o blog -g blog -m 0755 "$RELEASE_DIR/published"
chown -R blog:blog "$RELEASE_DIR"

ln -sfn "$RELEASE_DIR" "$APP_ROOT/next"
systemctl restart blog-admin-next.service

for ((attempt = 1; attempt <= HEALTH_WAIT_SECONDS; attempt++)); do
  if curl --fail --silent --show-error http://127.0.0.1:8081/healthz >/dev/null; then
    echo
    echo "候选版本已就绪：$RELEASE_DIR"
    echo "请在服务器本机检查：curl -I http://127.0.0.1:8081/healthz"
    echo "确认后执行：sudo bash $RELEASE_DIR/deploy/release-promote.sh"
    trap - EXIT
    exit 0
  fi
  sleep 1
done

echo "候选版本未在 ${HEALTH_WAIT_SECONDS} 秒内通过健康检查。请查看：journalctl -u blog-admin-next.service -n 100 --no-pager" >&2
exit 1
