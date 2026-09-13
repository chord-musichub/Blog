#!/usr/bin/env bash
set -euo pipefail

# 从本地完整发布包构建候选版本，不依赖 GitHub 或服务器上的 Git 认证。
# 包内必须同时含有 source/（已提交源码）和 runtime/（data 与动态 content）。

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo "请使用 sudo 运行此脚本。" >&2
  exit 1
fi

if [[ $# -ne 1 ]]; then
  echo "用法：sudo bash release-from-bundle.sh <发布包.tar.gz>" >&2
  exit 2
fi

APP_ROOT="${BLOG_APP_ROOT:-/opt/songline-blog}"
BUNDLE="$1"
RELEASES_DIR="$APP_ROOT/releases"
SHARED_DIR="$APP_ROOT/shared"
STAMP="$(date -u +%Y%m%d%H%M%S)"
HEALTH_WAIT_SECONDS="${BLOG_HEALTH_WAIT_SECONDS:-240}"
WORK_DIR="$(mktemp -d "$RELEASES_DIR/.bundle-${STAMP}-XXXXXX")"
SOURCE_DIR="$WORK_DIR/source"
RUNTIME_DIR="$WORK_DIR/runtime"
RELEASE_DIR="$RELEASES_DIR/${STAMP}-bundle"
BACKUP_PATH="$APP_ROOT/backups/runtime-before-bundle-${STAMP}.tar.gz"

cleanup() {
  local status=$?
  [[ -d "$WORK_DIR" ]] && rm -rf -- "$WORK_DIR"
  exit "$status"
}
trap cleanup EXIT

for command_name in tar go hugo systemctl curl install rsync; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "缺少命令：$command_name" >&2
    exit 1
  }
done

[[ -f "$BUNDLE" ]] || { echo "找不到发布包：$BUNDLE" >&2; exit 1; }
install -d -o blog -g blog -m 0755 "$RELEASES_DIR" "$SHARED_DIR"
install -d -o blog -g blog -m 0700 "$SHARED_DIR/data" "$APP_ROOT/backups"
install -d -o blog -g blog -m 0755 \
  "$SHARED_DIR/content/posts" \
  "$SHARED_DIR/content/friends" \
  "$SHARED_DIR/content/tags"

tar -tzf "$BUNDLE" >/dev/null
tar -C "$WORK_DIR" -xzf "$BUNDLE"

# Windows-created archives can carry CRLF shell scripts. Normalize the release
# scripts before candidate startup so Bash does not interpret `pipefail\r` as
# an invalid option.
find "$SOURCE_DIR/deploy" -maxdepth 1 -type f -name '*.sh' -exec sed -i 's/\r$//' {} +

for path in \
  "$SOURCE_DIR/go.mod" \
  "$SOURCE_DIR/cmd/server" \
  "$SOURCE_DIR/deploy/release-promote.sh" \
  "$RUNTIME_DIR/data/auth/users.json" \
  "$RUNTIME_DIR/data/content/articles.json" \
  "$RUNTIME_DIR/data/community/friends.json" \
  "$RUNTIME_DIR/data/settings/site.json" \
  "$RUNTIME_DIR/content/posts" \
  "$RUNTIME_DIR/content/friends" \
  "$RUNTIME_DIR/content/tags"; do
  [[ -e "$path" ]] || { echo "发布包不完整，缺少：$path" >&2; exit 1; }
done

# 编译不依赖线上运行数据；先完成此步骤，尽量缩短服务暂停时间。
echo "正在编译本地发布包…"
(cd "$SOURCE_DIR" && go build -buildvcs=false -trimpath -ldflags='-s -w' -o blog-admin ./cmd/server)
install -d -m 0755 "$SOURCE_DIR/published"

# 源码中不得携带运行时目录，以免发布版本和 shared 出现两份数据。
for relative_path in data content/posts content/friends content/tags; do
  if [[ -e "$SOURCE_DIR/$relative_path" || -L "$SOURCE_DIR/$relative_path" ]]; then
    echo "发布包源码意外包含运行目录：$relative_path" >&2
    exit 1
  fi
done

systemctl stop blog-admin.service
systemctl stop blog-admin-next.service || true

# 覆盖前备份当前服务器数据；发布包中的本地数据为唯一替换来源。
tar --numeric-owner -C "$SHARED_DIR" -czf "$BACKUP_PATH" \
  data content/posts content/friends content/tags

rsync -a --delete "$RUNTIME_DIR/data/" "$SHARED_DIR/data/"
rsync -a --delete "$RUNTIME_DIR/content/posts/" "$SHARED_DIR/content/posts/"
rsync -a --delete "$RUNTIME_DIR/content/friends/" "$SHARED_DIR/content/friends/"
rsync -a --delete "$RUNTIME_DIR/content/tags/" "$SHARED_DIR/content/tags/"
chown -R blog:blog "$SHARED_DIR/data" "$SHARED_DIR/content"

mv "$SOURCE_DIR" "$RELEASE_DIR"
for relative_path in data content/posts content/friends content/tags; do
  target_path="$RELEASE_DIR/$relative_path"
  install -d -o blog -g blog -m 0755 "$(dirname "$target_path")"
  ln -s "$SHARED_DIR/$relative_path" "$target_path"
done

revision="bundle-${STAMP}"
printf '{"asset_version":"%s"}\n' "$revision" > "$RELEASE_DIR/data/build.json"
chown -R blog:blog "$RELEASE_DIR"
ln -sfn "$RELEASE_DIR" "$APP_ROOT/next"
systemctl restart blog-admin-next.service

for ((attempt = 1; attempt <= HEALTH_WAIT_SECONDS; attempt++)); do
  if curl --fail --silent --show-error http://127.0.0.1:8081/healthz >/dev/null; then
    echo "候选版本已就绪：$RELEASE_DIR"
    echo "线上数据备份：$BACKUP_PATH"
    echo "确认后执行：sudo bash $RELEASE_DIR/deploy/release-promote.sh"
    trap - EXIT
    rm -rf -- "$WORK_DIR"
    exit 0
  fi
  sleep 1
done

echo "候选版本未通过健康检查；运行数据已保留在 $BACKUP_PATH，可据此恢复。" >&2
exit 1
