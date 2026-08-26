#!/usr/bin/env bash
# 服务器一键迭代脚本：拉取指定版本，构建候选版本，并可选切换为正式版本。
#
# 首次将本文件部署到服务器后执行：
#   sudo install -m 0755 /opt/songline-blog/current/deploy/server-update.sh /usr/local/sbin/songline-blog-update
#
# 日常使用：
#   sudo songline-blog-update                    # 仅构建候选版本，手动确认后切换
#   sudo songline-blog-update --promote          # 构建通过后直接切换为正式版本
#   sudo songline-blog-update --ref develop      # 构建指定分支或标签

set -euo pipefail

APP_ROOT="${BLOG_APP_ROOT:-/opt/songline-blog}"
REPOSITORY_URL="${BLOG_REPOSITORY_URL:-git@github.com:chord-musichub/Blog.git}"
RELEASE_REF="${BLOG_RELEASE_REF:-main}"
SSH_COMMAND="${GIT_SSH_COMMAND:-ssh -i /root/.ssh/id_ed25519_blog_deploy -o IdentitiesOnly=yes}"
PROMOTE=false

# sudo 的 secure_path 经常不包含手动安装的 Go；构建脚本需要它。
if [[ -x /usr/local/go/bin/go && ":$PATH:" != *":/usr/local/go/bin:"* ]]; then
    export PATH="/usr/local/go/bin:$PATH"
fi

usage() {
    cat <<'EOF'
用法：songline-blog-update [选项]

选项：
  --ref <分支或标签>  指定要部署的 Git 分支或标签（默认：main）
  --promote           候选版本健康检查通过后，自动切换为正式版本
  -h, --help          显示此帮助

可通过环境变量覆盖默认值：BLOG_APP_ROOT、BLOG_REPOSITORY_URL、
BLOG_RELEASE_REF、GIT_SSH_COMMAND。
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --ref)
            [[ $# -ge 2 ]] || { echo "--ref 缺少分支或标签名" >&2; exit 2; }
            RELEASE_REF="$2"
            shift 2
            ;;
        --promote)
            PROMOTE=true
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "未知选项：$1" >&2
            usage >&2
            exit 2
            ;;
    esac
done

if [[ ${EUID} -ne 0 ]]; then
    echo "请使用 sudo 运行此脚本。" >&2
    exit 1
fi

for command in git curl systemctl; do
    command -v "$command" >/dev/null 2>&1 || {
        echo "缺少命令：$command" >&2
        exit 1
    }
done

WORK_DIR="$(mktemp -d /tmp/songline-blog-update.XXXXXX)"
cleanup() {
    rm -rf -- "$WORK_DIR"
}
trap cleanup EXIT

SOURCE_DIR="$WORK_DIR/source"
echo "正在拉取 $REPOSITORY_URL 的 $RELEASE_REF…"
GIT_SSH_COMMAND="$SSH_COMMAND" git clone --quiet --depth 1 --single-branch \
    --branch "$RELEASE_REF" "$REPOSITORY_URL" "$SOURCE_DIR"

DEPLOY_SCRIPT="$SOURCE_DIR/deploy/release-deploy.sh"
[[ -f "$DEPLOY_SCRIPT" ]] || {
    echo "仓库中缺少 deploy/release-deploy.sh，已取消。" >&2
    exit 1
}

echo "开始构建候选版本…"
BLOG_APP_ROOT="$APP_ROOT" \
BLOG_REPOSITORY_URL="$REPOSITORY_URL" \
GIT_SSH_COMMAND="$SSH_COMMAND" \
bash "$DEPLOY_SCRIPT" "$RELEASE_REF"

echo "正在检查候选版本…"
curl --fail --silent --show-error http://127.0.0.1:8081/healthz >/dev/null
echo "候选版本健康检查通过。"

if [[ "$PROMOTE" != true ]]; then
    echo "尚未切换线上版本。确认页面正常后执行："
    echo "  sudo bash $APP_ROOT/next/deploy/release-promote.sh"
    exit 0
fi

CANDIDATE_DIR="$(readlink -f "$APP_ROOT/next")"
PROMOTE_SCRIPT="$CANDIDATE_DIR/deploy/release-promote.sh"
[[ -f "$PROMOTE_SCRIPT" ]] || {
    echo "候选版本中缺少切换脚本，已取消。" >&2
    exit 1
}

echo "正在切换为正式版本…"
bash "$PROMOTE_SCRIPT"
curl --fail --silent --show-error http://127.0.0.1:8080/healthz >/dev/null

# 版本切换成功后，顺带更新系统中的入口脚本；下一次迭代便会使用最新逻辑。
CURRENT_SCRIPT="$APP_ROOT/current/deploy/server-update.sh"
if [[ -f "$CURRENT_SCRIPT" ]]; then
    install -m 0755 "$CURRENT_SCRIPT" /usr/local/sbin/songline-blog-update
fi

if command -v nginx >/dev/null 2>&1 && systemctl is-active --quiet nginx; then
    if ! nginx -T 2>/dev/null | grep -qE 'location \^~ /md-source/'; then
        echo "提示：Nginx 尚未配置 /md-source/ 反向代理；请按 nginx 示例配置补充后 reload。" >&2
    fi
fi

echo "部署完成，当前正式版本：$(readlink -f "$APP_ROOT/current")"
