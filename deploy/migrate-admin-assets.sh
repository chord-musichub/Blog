#!/usr/bin/env bash
set -euo pipefail

# 将早期位于 uploads 根目录的站点资源归档到 admin 名下，并同步运行时数据中的路径。
# 此脚本只移动文件和更新 JSON/Markdown 引用，不会删除资源；执行后重启博客服务即可重建公开页面。

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo "请使用 sudo 运行此脚本。" >&2
  exit 1
fi

APP_ROOT="${BLOG_APP_ROOT:-/opt/songline-blog}"
SHARED_DIR="$APP_ROOT/shared"
UPLOADS_DIR="$SHARED_DIR/static/uploads"
ADMIN_DIR="$UPLOADS_DIR/admin"
SITE_FILE="$SHARED_DIR/data/site.json"
FRIENDS_FILE="$SHARED_DIR/data/friends.json"
FRIENDS_CONTENT_DIR="$SHARED_DIR/content/friends"

assets=(
  article.png
  background01.png
  background02.png
  bilibili.png
  friends.png
  main_logo.png
  mainPages.png
  snowMan.png
  tag.png
)

for required in "$UPLOADS_DIR" "$SITE_FILE" "$FRIENDS_FILE"; do
  if [[ ! -e "$required" ]]; then
    echo "缺少运行时路径：$required" >&2
    exit 1
  fi
done

install -d -o blog -g blog -m 0755 "$ADMIN_DIR"

for asset in "${assets[@]}"; do
  source_path="$UPLOADS_DIR/$asset"
  target_path="$ADMIN_DIR/$asset"
  if [[ -f "$source_path" && ! -e "$target_path" ]]; then
    mv "$source_path" "$target_path"
    echo "已移动：$asset"
  elif [[ -e "$target_path" ]]; then
    echo "已存在，跳过：$asset"
  else
    echo "未找到，跳过：$asset"
  fi
done

replace_path() {
  local old_path="$1"
  local new_path="$2"
  sed -i "s|$old_path|$new_path|g" "$SITE_FILE"
}

replace_path '/uploads/main_logo.png' '/uploads/admin/main_logo.png'
replace_path '/uploads/article.png' '/uploads/admin/article.png'
replace_path '/uploads/tag.png' '/uploads/admin/tag.png'
replace_path '/uploads/friends.png' '/uploads/admin/friends.png'
replace_path '/uploads/background01.png' '/uploads/admin/background01.png'
replace_path '/uploads/snowMan.png' '/uploads/admin/snowMan.png'
replace_path '/uploads/bilibili.png' '/uploads/admin/bilibili.png'

sed -i 's|/img/avatar-default\.svg|/uploads/admin/main_logo.png|g' "$FRIENDS_FILE"
if [[ -d "$FRIENDS_CONTENT_DIR" ]]; then
  find "$FRIENDS_CONTENT_DIR" -type f -name '*.md' -exec sed -i 's|/img/avatar-default\.svg|/uploads/admin/main_logo.png|g' {} +
fi

chown -R blog:blog "$UPLOADS_DIR" "$SHARED_DIR/data" "$SHARED_DIR/content"
echo "迁移完成。请执行：systemctl restart blog-admin.service"
