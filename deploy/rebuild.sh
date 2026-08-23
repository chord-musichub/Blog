#!/usr/bin/env bash
set -euo pipefail

# v20.20.6: allow safe deployment to rebuild a temporary extracted tree before switching /opt/gexian-blog-mvp.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${SONGLINE_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
cd "$PROJECT_ROOT"


# v12.1: 手动 rebuild 时同步旧公告文章的自动 tag，并修复坏掉的 front matter delimiter。
python3 - <<'PY'
from pathlib import Path
import json
import re

root = Path("content/posts")
if not root.exists():
    raise SystemExit(0)

def split_tags(raw):
    raw = raw.strip()
    if raw.startswith("["):
        try:
            v = json.loads(raw)
            return [str(x).strip() for x in v if str(x).strip()]
        except Exception:
            pass
    raw = raw.strip("[]")
    return [x.strip().strip('"').strip("'") for x in raw.split(",") if x.strip().strip('"').strip("'")]

for md in root.rglob("index.md"):
    text = md.read_text(encoding="utf-8")

    original_text = text

    # 修复 opening delimiter 后缺少换行：---title: "xxx" -> ---\ntitle: "xxx"
    if text.startswith("---") and not text.startswith("---\n") and not text.startswith("---\r\n"):
        text = "---\n" + text[3:].lstrip("\r\n")

    # 修复 closing delimiter 前缺少换行：tags: ["site-notice"]--- -> tags: ["site-notice"]\n---
    # 这里不只匹配 tags，也匹配任何 front matter 行后面黏住的 ---。
    text = re.sub(r'(?m)^([^-\n][^\n]*?)---(\s*\n)', r'\1\n---\2', text)
    text = re.sub(r'(?m)^([^-\n][^\n]*?)---$', r'\1\n---', text)

    if text != original_text:
        md.write_text(text, encoding="utf-8")
        print(f"repaired malformed front matter delimiters: {md}")

    if not text.startswith("---"):
        continue

    # 宽松匹配 front matter：opening/closing delimiter 必须各自独立一行。
    m = re.match(r'(?s)^---\s*\n(.*?)\n---\s*\n?(.*)$', text)
    if not m:
        # 无法安全识别的文章不强改，避免进一步破坏。
        continue

    fm, body = m.group(1), m.group(2)
    if not re.search(r'(?m)^\s*is_notice:\s*true\s*$', fm):
        continue

    lines = fm.splitlines()
    found = False
    out = []
    for line in lines:
        if re.match(r'^\s*tags\s*:', line):
            found = True
            prefix, raw = line.split(":", 1)
            tags = split_tags(raw)
            tags = [t for t in tags if t and t != "站点公告"]
            if "site-notice" not in tags:
                tags.append("site-notice")
            out.append(prefix + ": " + json.dumps(tags, ensure_ascii=False))
        else:
            out.append(line)

    if not found:
        inserted = False
        new_out = []
        for line in out:
            if not inserted and re.match(r'^\s*summary\s*:', line):
                new_out.append('tags: ["site-notice"]')
                inserted = True
            new_out.append(line)
        out = new_out if inserted else out + ['tags: ["site-notice"]']

    new_text = "---\n" + "\n".join(out).strip() + "\n---\n\n" + body.lstrip("\n")
    if new_text != text:
        md.write_text(new_text, encoding="utf-8")
        print(f"synced notice tag: {md}")
PY


# v12.3: 即使暂时没有公告文章，也生成 /tags/site-notice/，避免首页入口 404。
mkdir -p content/tags/site-notice
cat > content/tags/site-notice/_index.md <<'EOF'
---
title: "站点公告"
layout: "site-notice"
generated_by: "songline-notice-fallback"
draft: false
---
EOF




# v12.9: 公开工具页是站点内置页面。升级时 content 会从旧备份恢复，
# 所以每次构建前都自动补上 /tools/ 和工具详情页，避免导航入口 404。
mkdir -p content/tools/markdown-previewer content/tools/random-number content/tools/snake content/tools/gacha content/tools/2048 content/tools/reaction-test content/tools/flappy-bird content/tools/typing-practice content/tools/audio-visualizer
cat > content/tools/_index.md <<'EOF'
---
title: "工具"
layout: "tools"
generated_by: "songline-tools-fallback"
draft: false
---
EOF

cat > content/tools/markdown-previewer/_index.md <<'EOF'
---
title: "Markdown 预览器"
layout: "markdown-previewer"
generated_by: "songline-tools-fallback"
draft: false
---
EOF

cat > content/tools/random-number/_index.md <<'EOF'
---
title: "随机数生成器"
layout: "random-number"
generated_by: "songline-tools-fallback"
draft: false
---
EOF

cat > content/tools/snake/_index.md <<'EOF'
---
title: "贪吃蛇"
layout: "snake"
generated_by: "songline-tools-fallback"
draft: false
---
EOF

cat > content/tools/gacha/_index.md <<'EOF'
---
title: "抽卡模拟器"
layout: "gacha"
generated_by: "songline-tools-fallback"
draft: false
---
EOF

cat > content/tools/2048/_index.md <<'EOF'
---
title: "2048"
layout: "2048"
generated_by: "songline-tools-fallback"
draft: false
---
EOF

cat > content/tools/reaction-test/_index.md <<'EOF'
---
title: "反应测试"
layout: "reaction-test"
generated_by: "songline-tools-fallback"
draft: false
---
EOF

cat > content/tools/flappy-bird/_index.md <<'EOF'
---
title: "管道鸟"
layout: "flappy-bird"
generated_by: "songline-tools-fallback"
draft: false
---
EOF

cat > content/tools/typing-practice/_index.md <<'EOF'
---
title: "打字练习"
layout: "typing-practice"
generated_by: "songline-tools-fallback"
draft: false
---
EOF

cat > content/tools/audio-visualizer/_index.md <<'EOF'
---
title: "音频可视化"
layout: "audio-visualizer"
generated_by: "songline-tools-fallback"
draft: false
---
EOF



# v17.3: 公开文章下载 Markdown 时生成真实静态源文件，避免大段内容塞进页面导致空文件/乱码。
python3 - <<'PY'
from pathlib import Path
import json, re, base64

articles_path = Path("data/articles.json")
content_root = Path("content/posts")
source_dir = Path("static/md-source")
source_dir.mkdir(parents=True, exist_ok=True)

articles = {}
if articles_path.exists():
    try:
        raw = json.loads(articles_path.read_text(encoding="utf-8"))
        iterable = raw.values() if isinstance(raw, dict) else raw
        for a in iterable:
            if isinstance(a, dict) and str(a.get("slug") or "").strip():
                articles[str(a.get("slug")).strip()] = a
    except Exception:
        articles = {}

def split_fm(text):
    if not text.startswith("---"):
        return None
    m = re.match(r'(?s)^---\s*\n(.*?)\n---\s*\n?(.*)$', text)
    if not m:
        return None
    return m.group(1), m.group(2)

def safe_slug(s):
    s = re.sub(r'[^a-zA-Z0-9\u4e00-\u9fff_-]+', '-', s.strip()).strip('-')
    return s or "article"

for md in content_root.glob("*/index.md"):
    slug = md.parent.name
    text = md.read_text(encoding="utf-8")
    parts = split_fm(text)
    if not parts:
        continue
    fm, body = parts
    a = articles.get(slug, {})
    # v20.0.8: 优先使用最新后台正文，避免旧 source_md 在前台 JS 渲染时覆盖新内容。
    source = str(a.get("body") or a.get("source_md") or body or "")
    file_name = safe_slug(slug) + ".md"
    url = "/md-source/" + file_name
    (source_dir / file_name).write_text(source, encoding="utf-8")

    encoded = base64.b64encode(source.encode("utf-8")).decode("ascii")

    lines = []
    has_url = False
    has_b64 = False
    for line in fm.splitlines():
        if re.match(r'^\s*source_md_url\s*:', line):
            lines.append('source_md_url: "' + url + '"')
            has_url = True
        elif re.match(r'^\s*source_md_b64\s*:', line):
            lines.append('source_md_b64: "' + encoded + '"')
            has_b64 = True
        else:
            lines.append(line)

    out = []
    inserted = False
    for line in lines:
        if not inserted and re.match(r'^\s*draft\s*:', line):
            if not has_url:
                out.append('source_md_url: "' + url + '"')
            if not has_b64:
                out.append('source_md_b64: "' + encoded + '"')
            inserted = True
        out.append(line)
    if not inserted:
        if not has_url:
            out.append('source_md_url: "' + url + '"')
        if not has_b64:
            out.append('source_md_b64: "' + encoded + '"')

    render_body = re.sub(r"(?i)(<br\\s*/?>|&lt;br\\s*/?&gt;)", "  \\n", body)
    md.write_text("---\n" + "\n".join(out).strip() + "\n---\n\n" + render_body.lstrip("\n"), encoding="utf-8")
    print(f"synced source md: {md} -> {url}")
PY


# v20.0.8: 稳定同步公开朋友页。
# 根因修复：如果 data/friends.json 只有 1 人，不再只盯着它渲染；
# 而是合并当前 friends、历史备份、content/friends 详情页、users、articles 作者。
# 这样旧数据被缩成 1 人时，星图能从其它来源恢复多朋友关系。
python3 - <<'PYFRIENDS'
from pathlib import Path
import json, re, shutil, glob

root = Path('.').resolve()
data_dir = root / 'data'
content_friends = root / 'content' / 'friends'
friends_path = data_dir / 'friends.json'
site_path = data_dir / 'site.json'
users_path = data_dir / 'users.json'
articles_path = data_dir / 'articles.json'

data_dir.mkdir(parents=True, exist_ok=True)
content_friends.mkdir(parents=True, exist_ok=True)


def load_json(path, default):
    try:
        path = Path(path)
        if not path.exists() or path.stat().st_size == 0:
            return default
        return json.loads(path.read_text(encoding='utf-8'))
    except Exception as e:
        print(f'warn: failed to read {path}: {e}')
        return default


def list_from_json(value):
    if isinstance(value, list):
        return [x for x in value if isinstance(x, dict)]
    if isinstance(value, dict):
        for key in ('friends', 'Friends', 'items', 'Items', 'users', 'Users', 'data', 'Data'):
            v = value.get(key)
            if isinstance(v, list):
                return [x for x in v if isinstance(x, dict)]
            if isinstance(v, dict):
                return [x for x in v.values() if isinstance(x, dict)]
        if all(isinstance(v, dict) for v in value.values()):
            return [x for x in value.values() if isinstance(x, dict)]
    return []


def get(d, *keys):
    if not isinstance(d, dict):
        return ''
    lower = {str(k).lower(): k for k in d.keys()}
    for k in keys:
        if k in d:
            return d[k]
        kk = lower.get(str(k).lower())
        if kk is not None:
            return d[kk]
    return ''


def clean(s):
    if s is None:
        return ''
    return str(s).strip()


def slugify(s):
    s = clean(s).lower()
    s = re.sub(r'[^a-z0-9\u4e00-\u9fff]+', '-', s).strip('-')
    return s[:80] or 'friend'


def array_of(v):
    if isinstance(v, list):
        return [clean(x) for x in v if clean(x)]
    if isinstance(v, str):
        raw = clean(v)
        if not raw:
            return []
        try:
            vv = json.loads(raw)
            if isinstance(vv, list):
                return [clean(x) for x in vv if clean(x)]
        except Exception:
            pass
        return [clean(x) for x in re.split(r'[\s,，;；|]+', raw) if clean(x)]
    return []


def yaml_quote(s):
    return json.dumps(clean(s), ensure_ascii=False)


def normalize_friend(f, idx=0, source='unknown'):
    username = clean(get(f, 'username', 'Username', 'friend_username', 'FriendUsername', 'author_username', 'AuthorUsername'))
    name = clean(get(f, 'name', 'Name', 'display_name', 'DisplayName', 'displayName', 'friend_display_name', 'FriendDisplayName', 'title', 'Title')) or username or f'朋友 {idx+1}'
    slug = clean(get(f, 'slug', 'Slug')) or slugify(username or name)
    fid = clean(get(f, 'id', 'ID')) or slug or username or name
    url = clean(get(f, 'url', 'URL', 'href', 'Href')) or f'/friends/{slugify(slug)}/'
    if not url.startswith('/') and not re.match(r'https?://', url):
        url = '/' + url.lstrip('/')
    try:
        count = int(get(f, 'post_count', 'PostCount', 'postCount', 'friend_post_count', 'FriendPostCount') or 0)
    except Exception:
        count = 0
    return {
        'id': slugify(fid),
        'username': username,
        'name': name,
        'display_name': name,
        'slug': slugify(slug),
        'url': url,
        'bio': clean(get(f, 'bio', 'Bio', 'friend_bio', 'FriendBio', 'summary', 'Summary')),
        'homepage': clean(get(f, 'homepage', 'Homepage', 'friend_homepage', 'FriendHomepage')),
        'avatar': clean(get(f, 'avatar', 'Avatar', 'avatar_url', 'AvatarURL', 'avatarUrl', 'profile_avatar', 'ProfileAvatar', 'photo', 'Photo', 'image', 'Image', 'friend_avatar', 'FriendAvatar', 'author_avatar', 'AuthorAvatar')) or '/img/avatar-default.svg',
        'cover': clean(get(f, 'cover', 'Cover', 'cover_url', 'CoverURL', 'coverUrl', 'banner', 'Banner', 'banner_url', 'BannerURL', 'bannerUrl', 'hero', 'Hero', 'hero_image', 'HeroImage', 'friend_cover', 'FriendCover')),
        'post_count': count,
        'post_titles': array_of(get(f, 'post_titles', 'PostTitles', 'postTitles'))[:8],
        'updated_at': clean(get(f, 'updated_at', 'UpdatedAt', 'updatedAt', 'date', 'Date')),
        'links': array_of(get(f, 'links', 'Links', 'relations', 'Relations', 'friends', 'Friends')),
        'role': clean(get(f, 'role', 'Role')),
        'account_type': clean(get(f, 'account_type', 'AccountType', 'type', 'Type')),
        '_source': source,
    }


def friend_key(f):
    # 用户名优先；没有用户名时用 slug/name。这样同一个人从不同来源可以合并。
    for k in (f.get('username'), f.get('id'), f.get('slug'), f.get('display_name'), f.get('name')):
        if clean(k):
            return slugify(k)
    return ''


def is_default_friend_asset(v):
    s = clean(v)
    if not s:
        return True
    defaults = {
        '/img/avatar-default.svg',
        '/img/hero-friends.svg',
        '/uploads/admin/article_default.png',
    }
    if s in defaults:
        return True
    return s.endswith('/article_default.png') or s.endswith('/hero-friends.svg') or s.endswith('/avatar-default.svg')


def merge_friend(old, new):
    out = dict(old or {})
    source = clean(new.get('_source'))
    from_user_profile = source == 'users/articles'

    # v20.2.3：用户资料里的头像/横幅是个人主页的权威来源。
    # 之前 current friends.json 在前，里面如果已经是默认 friend cover，users.json 里新上传的 cover 不会覆盖，
    # 于是保存成功后公开朋友页仍显示默认横幅。
    for key in ('username','name','display_name','slug','url','bio','homepage','avatar','cover','role','account_type'):
        nv = clean(new.get(key))
        if not nv:
            continue
        ov = clean(out.get(key))
        should_update = False
        if not ov:
            should_update = True
        elif key in ('avatar', 'cover') and is_default_friend_asset(ov):
            should_update = True
        elif from_user_profile and key in ('display_name','name','bio','homepage','avatar','cover'):
            should_update = True
        if should_update:
            out[key] = new.get(key)

    if int(new.get('post_count') or 0) > int(out.get('post_count') or 0):
        out['post_count'] = int(new.get('post_count') or 0)
    titles = []
    for t in array_of(out.get('post_titles')) + array_of(new.get('post_titles')):
        if t not in titles:
            titles.append(t)
    out['post_titles'] = titles[:8]
    if clean(new.get('updated_at')) > clean(out.get('updated_at')):
        out['updated_at'] = new.get('updated_at')
    links = []
    for t in array_of(out.get('links')) + array_of(new.get('links')):
        if t not in links:
            links.append(t)
    out['links'] = links
    return out


def dedupe(items):
    merged, order = {}, []
    for i, item in enumerate(items):
        f = normalize_friend(item, i, item.get('_source','unknown') if isinstance(item, dict) else 'unknown')
        k = friend_key(f)
        if not k:
            continue
        if k not in merged:
            merged[k] = f
            order.append(k)
        else:
            merged[k] = merge_friend(merged[k], f)

    used_slug = {}
    out = []
    for k in order:
        f = normalize_friend(merged[k], len(out), merged[k].get('_source','unknown'))
        base = slugify(f.get('slug') or f.get('username') or f.get('display_name') or f.get('name'))
        n = used_slug.get(base, 0) + 1
        used_slug[base] = n
        f['slug'] = base if n == 1 else f'{base}-{n}'
        f['id'] = f.get('id') or f['slug']
        f['url'] = f'/friends/{f["slug"]}/'
        f.pop('_source', None)
        out.append(f)
    out.sort(key=lambda x: (-int(x.get('post_count') or 0), clean(x.get('display_name')).lower()))
    return out


def from_friends_json(path):
    return [normalize_friend(x, i, str(path)) for i, x in enumerate(list_from_json(load_json(path, [])))]


def parse_front_matter(text):
    if not text.startswith('---'):
        return {}
    m = re.match(r'(?s)^---\s*\n(.*?)\n---', text)
    if not m:
        return {}
    data = {}
    for line in m.group(1).splitlines():
        if ':' not in line:
            continue
        k, v = line.split(':', 1)
        v = v.strip().strip('"').strip("'")
        data[k.strip()] = v
    return data


def from_content_friends(base):
    out = []
    base = Path(base)
    if not base.exists():
        return out
    for md in base.glob('*/index.md'):
        try:
            fm = parse_front_matter(md.read_text(encoding='utf-8'))
        except Exception:
            continue
        if not fm:
            continue
        slug = md.parent.name
        if clean(fm.get('title')) or clean(fm.get('friend_display_name')) or clean(fm.get('friend_username')):
            out.append(normalize_friend({
                'slug': slug,
                'username': fm.get('friend_username',''),
                'display_name': fm.get('friend_display_name') or fm.get('title') or slug,
                'bio': fm.get('friend_bio',''),
                'homepage': fm.get('friend_homepage',''),
                'avatar': fm.get('friend_avatar',''),
                'cover': fm.get('friend_cover',''),
                'post_count': fm.get('friend_post_count','0'),
                '_source': str(md),
            }, len(out)))
    return out


def derive_from_users_articles():
    users = list_from_json(load_json(users_path, []))
    arts = list_from_json(load_json(articles_path, []))
    counts, titles, latest = {}, {}, {}
    for a in arts:
        if clean(get(a, 'status', 'Status')) != 'published':
            continue
        author = clean(get(a, 'author', 'Author', 'username', 'Username'))
        if not author:
            continue
        counts[author] = counts.get(author, 0) + 1
        title = clean(get(a, 'title', 'Title'))
        if title:
            titles.setdefault(author, [])
            if len(titles[author]) < 8:
                titles[author].append(title)
        t = clean(get(a, 'published_at', 'PublishedAt', 'updated_at', 'UpdatedAt', 'created_at', 'CreatedAt'))
        if t and t > latest.get(author, ''):
            latest[author] = t
    out = []
    for u in users:
        if clean(get(u, 'disabled', 'Disabled')).lower() in ('true','1','yes'):
            continue
        role = clean(get(u, 'role', 'Role'))
        account_type = clean(get(u, 'account_type', 'AccountType'))
        if account_type == 'system':
            continue
        username = clean(get(u, 'username', 'Username'))
        name = clean(get(u, 'display_name', 'DisplayName', 'name', 'Name')) or username
        if not name and not username:
            continue
        out.append(normalize_friend({
            'username': username,
            'display_name': name,
            'bio': get(u, 'bio', 'Bio'),
            'homepage': get(u, 'homepage', 'Homepage'),
            'avatar': get(u, 'avatar', 'Avatar', 'avatar_url', 'AvatarURL', 'avatarUrl', 'profile_avatar', 'ProfileAvatar', 'photo', 'Photo', 'image', 'Image') or '/img/avatar-default.svg',
            'cover': get(u, 'cover', 'Cover', 'cover_url', 'CoverURL', 'coverUrl', 'banner', 'Banner', 'banner_url', 'BannerURL', 'bannerUrl', 'hero', 'Hero', 'hero_image', 'HeroImage'),
            'post_count': counts.get(username, 0),
            'post_titles': titles.get(username, []),
            'updated_at': latest.get(username, ''),
            '_source': 'users/articles',
        }, len(out)))
    for author, count in counts.items():
        if not any(x.get('username') == author for x in out):
            out.append(normalize_friend({
                'username': author,
                'display_name': author,
                'post_count': count,
                'post_titles': titles.get(author, []),
                'updated_at': latest.get(author, ''),
                '_source': 'article-author',
            }, len(out)))
    return out


def compact_key(s):
    return re.sub(r'[^a-z0-9\u4e00-\u9fff]+', '-', clean(s).lower()).strip('-')


def is_system_friend(f):
    # 只排除“系统用途账号”，不要按 role=admin 一刀切，避免站点主人被误删。
    username = compact_key(f.get('username'))
    fid = compact_key(f.get('id'))
    slug = compact_key(f.get('slug'))
    name = clean(f.get('display_name') or f.get('name'))
    name_key = compact_key(name)
    role = compact_key(f.get('role'))
    account_type = compact_key(f.get('account_type'))
    exact = {'admin', 'root', 'system', 'notice', 'announcement', 'announcer', 'gonggao', 'bot', 'site-admin', 'site-admins', 'manager', 'test', 'tests', 'demo', 'dummy', 'sample', 'ceshi', 'test-user', 'demo-user'}
    if username in exact or fid in exact or slug in exact:
        return True
    if account_type == 'system' or role in {'system', 'announcer', 'notice', 'gonggao'}:
        return True
    if name in {'管理员', '公告员', '公告', '系统', '系统账号', '站点公告', '测试', '测试账号', '测试用户', '临时账号'}:
        return True
    if any(word in name for word in ('管理员', '公告员', '系统账号', '测试账号', '临时账号')):
        return True
    if name_key in exact:
        return True
    return False

# 收集所有可能来源。
current = from_friends_json(friends_path)
backup_items = []
backup_sources = []
for pat in [
    '/opt/gexian-backup-before-v*/data/friends.json',
    '/opt/gexian-blog-mvp-before-v*/data/friends.json',
    '/opt/gexian-blog-mvp-v*-old/data/friends.json',
]:
    for fp in glob.glob(pat):
        items = from_friends_json(fp)
        if items:
            backup_items.extend(items)
            backup_sources.append(f'{fp}({len(items)})')

content_items = []
for base in [content_friends, *[Path(p) for p in glob.glob('/opt/gexian-blog-mvp-before-v*/content/friends')]]:
    content_items.extend(from_content_friends(base))

derived = derive_from_users_articles()

# v20.2.3：二次强制同步用户头像/横幅。
# v20.2.2 已修横幅，但如果旧 friends/content 里存在非默认头像，合并阶段仍可能保留旧头像；
# 这里以 users.json 的 avatar/cover 作为最终公开朋友页资料来源，确保账号资料保存后公开页立即更新。
def user_asset_overrides():
    overrides = {}
    for u in list_from_json(load_json(users_path, [])):
        if clean(get(u, 'disabled', 'Disabled')).lower() in ('true','1','yes'):
            continue
        if compact_key(get(u, 'account_type', 'AccountType')) == 'system':
            continue
        username = clean(get(u, 'username', 'Username'))
        name = clean(get(u, 'display_name', 'DisplayName', 'name', 'Name')) or username
        keys = set()
        for v in (username, name, get(u, 'slug', 'Slug')):
            k = slugify(v)
            if k:
                keys.add(k)
        if not keys:
            continue
        avatar = clean(get(u, 'avatar', 'Avatar', 'avatar_url', 'AvatarURL', 'avatarUrl', 'profile_avatar', 'ProfileAvatar', 'photo', 'Photo', 'image', 'Image'))
        cover = clean(get(u, 'cover', 'Cover', 'cover_url', 'CoverURL', 'coverUrl', 'banner', 'Banner', 'banner_url', 'BannerURL', 'bannerUrl', 'hero', 'Hero', 'hero_image', 'HeroImage'))
        for k in keys:
            overrides[k] = {'avatar': avatar, 'cover': cover}
    return overrides

USER_ASSET_OVERRIDES = user_asset_overrides()

def apply_user_asset_overrides(friends):
    changed = 0
    for f in friends:
        keys = [friend_key(f), slugify(f.get('username')), slugify(f.get('display_name') or f.get('name')), slugify(f.get('slug'))]
        ov = None
        for k in keys:
            if k and k in USER_ASSET_OVERRIDES:
                ov = USER_ASSET_OVERRIDES[k]
                break
        if not ov:
            continue
        avatar = clean(ov.get('avatar'))
        cover = clean(ov.get('cover'))
        if avatar and avatar != clean(f.get('avatar')):
            f['avatar'] = avatar
            changed += 1
        if cover and cover != clean(f.get('cover')):
            f['cover'] = cover
            changed += 1
    if changed:
        print(f'applied user avatar/cover overrides: {changed}')
    return friends

# 当前有 2 人以上时仍然保留当前为主；否则合并所有来源救回多人数据.
if len(dedupe(current)) >= 2:
    friends = dedupe(current + derived + content_items)
    print(f'friends kept from current data and enriched: {len(friends)}')
else:
    friends = dedupe(current + backup_items + content_items + derived)
    print(f'friends rebuilt from all sources: current={len(current)}, backups={len(backup_items)}, content={len(content_items)}, derived={len(derived)}, final={len(friends)}')
    if backup_sources:
        print('friend backup sources: ' + '; '.join(backup_sources[:8]))

_before_system_filter = len(friends)
friends = [f for f in friends if not is_system_friend(f)]
_removed_system = _before_system_filter - len(friends)
if _removed_system:
    print(f'filtered system friend accounts: {_removed_system}; final friends={len(friends)}')

# 如果依然只有 1 人，至少不要伪装成关系网，日志里明确暴露问题。
if len(friends) < 2:
    print('warn: only one friend source found. 星图只能显示一个人；请检查 data/users.json、data/articles.json 或旧备份 friends.json。')

friends = apply_user_asset_overrides(friends)

friends_path.write_text(json.dumps(friends, ensure_ascii=False, indent=2), encoding='utf-8')

# v20.0.8: 同步一份公开只读 JSON，前端在 Hugo 模板数据异常时直接读取它。
static_dir = root / 'static'
static_dir.mkdir(parents=True, exist_ok=True)
(static_dir / 'friends-data.json').write_text(json.dumps(friends, ensure_ascii=False, indent=2), encoding='utf-8')
print("synced public friend json:", static_dir / "friends-data.json", f"({len(friends)})")

site = load_json(site_path, {})
pages = site.get('pages', {}) if isinstance(site, dict) else {}
default_cover = clean(pages.get('friend_default_cover') or pages.get('friends_hero_image') or '/img/hero-friends.svg')

(content_friends / '_index.md').write_text('---\ntitle: "朋友"\nlayout: "friends-list"\ngenerated_by: "songline-friends-v20.2.3"\ndraft: false\n---\n\n', encoding='utf-8')

# 只清理自动生成的朋友详情页。
for md in list(content_friends.glob('*/index.md')):
    try:
        txt = md.read_text(encoding='utf-8')
        if 'generated_by: "songline-friends' in txt or 'generated_by: songline-friends' in txt:
            shutil.rmtree(md.parent, ignore_errors=True)
    except Exception:
        pass

for f in friends:
    d = content_friends / f['slug']
    d.mkdir(parents=True, exist_ok=True)
    cover = clean(f.get('cover')) or default_cover
    md = '\n'.join([
        '---',
        'title: ' + yaml_quote(f.get('display_name') or f.get('name') or f.get('username') or f.get('slug')),
        'layout: "friend-profile"',
        'generated_by: "songline-friends-v20.2.3"',
        'friend_username: ' + yaml_quote(f.get('username') or ''),
        'friend_display_name: ' + yaml_quote(f.get('display_name') or f.get('name') or ''),
        'friend_bio: ' + yaml_quote(f.get('bio') or '这个朋友还没有写简介。'),
        'friend_homepage: ' + yaml_quote(f.get('homepage') or ''),
        'friend_avatar: ' + yaml_quote(f.get('avatar') or '/img/avatar-default.svg'),
        'friend_cover: ' + yaml_quote(cover),
        'friend_post_count: ' + str(f.get('post_count') or 0),
        'draft: false',
        '---',
        '',
    ])
    (d / 'index.md').write_text(md, encoding='utf-8')

print(f'synced public friends: {len(friends)}')
PYFRIENDS


# v20.1.5: 生成真实 /tags/<slug>/ 详情页，并把漂流带/搜索入口链接到这些真实页面。
# 之前只依赖 Hugo taxonomy 的 .Page.RelPermalink；当 /content/tags/ 同时作为普通栏目存在时，部分环境会出现链接存在但详情页没生成，导致 404。
python3 - <<'PYTAGS'
from pathlib import Path
import json, re, hashlib, shutil

root = Path('.').resolve()
posts_root = root / 'content' / 'posts'
tags_root = root / 'content' / 'tags'
data_dir = root / 'data'
tags_root.mkdir(parents=True, exist_ok=True)
data_dir.mkdir(parents=True, exist_ok=True)

# 保证标签首页存在。
index = tags_root / '_index.md'
if not index.exists():
    index.write_text('---\ntitle: "标签"\nlayout: "terms"\ndraft: false\n---\n', encoding='utf-8')


def clean(s):
    return str(s or '').strip()


def split_front_matter(text):
    if not text.startswith('---'):
        return {}, text
    m = re.match(r'(?s)^---\s*\n(.*?)\n---\s*\n?(.*)$', text)
    if not m:
        return {}, text
    fm = m.group(1)
    body = m.group(2)
    out = {}
    for line in fm.splitlines():
        if ':' not in line:
            continue
        k, v = line.split(':', 1)
        out[k.strip()] = v.strip()
    return out, body


def parse_tags(raw):
    raw = clean(raw)
    if not raw:
        return []
    if raw.startswith('['):
        try:
            arr = json.loads(raw)
            return [clean(x) for x in arr if clean(x)]
        except Exception:
            pass
    raw = raw.strip('[]')
    return [x.strip().strip('"').strip("'") for x in raw.split(',') if x.strip().strip('"').strip("'")]


def yaml_quote(s):
    return json.dumps(clean(s), ensure_ascii=False)


def display_name(tag):
    return '站点公告' if tag == 'site-notice' else tag


def ascii_slug(tag):
    s = clean(tag).lower()
    if s == 'site-notice':
        return 'site-notice'
    # 对中英文混合都稳定：英文保留可读；纯中文/特殊符号用短 hash，避免 Nginx/URL 编码差异导致 404。
    base = re.sub(r'[^a-z0-9_-]+', '-', s).strip('-')
    if base:
        base = re.sub(r'-{2,}', '-', base)[:48].strip('-')
    if not base:
        base = 'tag-' + hashlib.sha1(clean(tag).encode('utf-8')).hexdigest()[:10]
    return base or 'tag'


def collect_posts():
    tags = {}
    for md in posts_root.glob('*/index.md'):
        try:
            text = md.read_text(encoding='utf-8')
        except Exception:
            continue
        fm, body = split_front_matter(text)
        title = clean(fm.get('title')).strip('"').strip("'") or md.parent.name
        date = clean(fm.get('date')).strip('"').strip("'")
        url = '/posts/' + md.parent.name + '/'
        for tag in parse_tags(fm.get('tags')):
            item = tags.setdefault(tag, {'raw': tag, 'display': display_name(tag), 'count': 0, 'articles': [], 'latest': ''})
            item['count'] += 1
            if len(item['articles']) < 5:
                item['articles'].append(title)
            if date > item['latest']:
                item['latest'] = date
    return tags

tags = collect_posts()
# 删除旧版自动生成的标签详情页，不碰手写页面和 site-notice 公告页。
for child in list(tags_root.iterdir()):
    if not child.is_dir() or child.name == 'site-notice':
        continue
    idx = child / '_index.md'
    if idx.exists():
        try:
            txt = idx.read_text(encoding='utf-8')
        except Exception:
            txt = ''
        if 'generated_by: "songline-tags-v20.1.5"' in txt or 'generated_by: songline-tags-' in txt:
            shutil.rmtree(child, ignore_errors=True)

used = {}
info = {}
for raw, item in sorted(tags.items(), key=lambda kv: (-kv[1]['count'], kv[0])):
    slug = ascii_slug(raw)
    base = slug
    n = 1
    while slug in used and used[slug] != raw:
        n += 1
        slug = f'{base}-{n}'
    used[slug] = raw
    url = f'/tags/{slug}/'
    info[raw] = {
        'raw': raw,
        'display': item['display'],
        'url': url,
        'slug': slug,
        'count': item['count'],
        'articles': item['articles'],
        'latest': item['latest'],
    }
    # site-notice 用已有公告详情布局；只同步 data/tag_urls，不覆盖它。
    if raw == 'site-notice':
        continue
    d = tags_root / slug
    d.mkdir(parents=True, exist_ok=True)
    (d / '_index.md').write_text('\n'.join([
        '---',
        'title: ' + yaml_quote(item['display']),
        'layout: "tag-detail-generated"',
        'generated_by: "songline-tags-v20.1.5"',
        'tag_raw: ' + yaml_quote(raw),
        'tag_display: ' + yaml_quote(item['display']),
        'draft: false',
        '---',
        '',
    ]), encoding='utf-8')

(data_dir / 'tag_urls.json').write_text(json.dumps(info, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'synced public tag detail pages: {len(info)}')
PYTAGS

rm -rf ./published/*
hugo --minify --source . --destination ./published

# v20.1.5: Hugo 的 taxonomy 路由和 content/tags 栏目在部分环境会互相抢 /tags/<slug>/。
# 这里在 Hugo 构建完成后直接写入 published/tags/<slug>/index.html，保证 Nginx root 下存在真实文件，点击不会 404。
python3 - <<'PYPUBTAGS'
from pathlib import Path
import json, re, html, shutil

root = Path('.').resolve()
posts_root = root / 'content' / 'posts'
published = root / 'published'
data_file = root / 'data' / 'tag_urls.json'
if not data_file.exists():
    print('skip physical tag pages: data/tag_urls.json not found')
    raise SystemExit(0)

try:
    tag_info = json.loads(data_file.read_text(encoding='utf-8'))
except Exception as e:
    print('skip physical tag pages: cannot read tag_urls.json', e)
    raise SystemExit(0)

site_cfg = {}
try:
    site_cfg = json.loads((root / 'data' / 'site.json').read_text(encoding='utf-8'))
except Exception:
    site_cfg = {}

bg_cfg = site_cfg.get('background') or {}
site_bg_image = str(bg_cfg.get('image') or '').strip()
site_bg_height = str(bg_cfg.get('height') or '').strip() or '420px'
site_bg_blur = str(bg_cfg.get('blur') or '').strip() or '18px'
site_bg_opacity = str(bg_cfg.get('opacity') or '').strip() or '0.38'


def site_body_class():
    return 'has-site-bg tag-detail-generated-page' if site_bg_image else 'tag-detail-generated-page'


def site_bg_layer_html():
    if not site_bg_image:
        return ''
    return '  <div class="site-bg-layer" style="--site-bg-image:url(\'%s\');--site-bg-height:%s;--site-bg-blur:%s;--site-bg-opacity:%s;" aria-hidden="true"></div>\n' % (esc(site_bg_image), esc(site_bg_height), esc(site_bg_blur), esc(site_bg_opacity))

published.mkdir(parents=True, exist_ok=True)
shutil.copy2(data_file, published / 'tag_urls.json')


def clean(s):
    return str(s or '').strip()


def split_front_matter(text):
    if not text.startswith('---'):
        return {}, text
    m = re.match(r'(?s)^---\s*\n(.*?)\n---\s*\n?(.*)$', text)
    if not m:
        return {}, text
    fm, body = m.group(1), m.group(2)
    out = {}
    for line in fm.splitlines():
        if ':' not in line:
            continue
        k, v = line.split(':', 1)
        out[k.strip()] = v.strip()
    return out, body


def parse_tags(raw):
    raw = clean(raw)
    if not raw:
        return []
    if raw.startswith('['):
        try:
            arr = json.loads(raw)
            return [clean(x) for x in arr if clean(x)]
        except Exception:
            pass
    raw = raw.strip('[]')
    return [x.strip().strip('"').strip("'") for x in raw.split(',') if x.strip().strip('"').strip("'")]


def yaml_unquote(s):
    s = clean(s)
    if len(s) >= 2 and ((s[0] == '"' and s[-1] == '"') or (s[0] == "'" and s[-1] == "'")):
        try:
            return json.loads(s) if s[0] == '"' else s[1:-1]
        except Exception:
            return s[1:-1]
    return s


def esc(s):
    return html.escape(clean(s), quote=True)


def icon_svg(name):
    # v20.3.5: physical generated tag pages use the same public icon interface as Hugo pages.
    # The actual SVG is supplied by /js/icon-system.js, so changing one registry updates search/header/meta icons consistently.
    safe = re.sub(r'[^a-z0-9_-]+', '', clean(name).lower()) or 'circle'
    return f'<span class="ui-icon" data-ui-icon="{esc(safe)}" aria-hidden="true"></span>'

def logo_html():
    site_info = site_cfg.get('site') or {}
    logo_icon = clean(site_info.get('logo_icon') or '')
    logo_text = clean(site_info.get('logo') or site_info.get('title') or 'Songline Blog')
    if logo_icon:
        return f'<img class="logo-icon" src="{esc(logo_icon)}" alt="" loading="lazy"><span class="logo-text">{esc(logo_text)}</span>'
    return f'<span class="logo-mark line-logo-mark">{icon_svg("logo")}</span><span class="logo-text">{esc(logo_text)}</span>'


def first_para(md):
    md = re.sub(r'(?s)^---.*?---', '', md).strip()
    md = re.sub(r'```.*?```', '', md, flags=re.S)
    md = re.sub(r'[#>*_`\[\]()]', '', md)
    for part in re.split(r'\n\s*\n', md):
        part = clean(re.sub(r'\s+', ' ', part))
        if part:
            return part[:140]
    return ''

posts = []
for md in posts_root.glob('*/index.md'):
    try:
        text = md.read_text(encoding='utf-8')
    except Exception:
        continue
    fm, body = split_front_matter(text)
    title = yaml_unquote(fm.get('title')) or md.parent.name
    date = yaml_unquote(fm.get('date'))[:10] or '未注明日期'
    summary = yaml_unquote(fm.get('summary')) or first_para(body) or '暂无摘要。'
    author = yaml_unquote(fm.get('author_display')) or yaml_unquote(fm.get('author')) or 'Songline'
    cover = yaml_unquote(fm.get('cover')) or '/img/hero-article.svg'
    cover_mode = yaml_unquote(fm.get('cover_mode')) or 'cover'
    tags = parse_tags(fm.get('tags'))
    posts.append({
        'title': title,
        'date': date,
        'summary': summary,
        'author': author,
        'cover': cover,
        'cover_mode': cover_mode,
        'tags': tags,
        'url': '/posts/' + md.parent.name + '/',
    })
posts.sort(key=lambda p: p.get('date') or '', reverse=True)


def render_post_card(p):
    tag_links = []
    for raw in p['tags']:
        info = tag_info.get(raw) or {}
        label = info.get('display') or ('站点公告' if raw == 'site-notice' else raw)
        href = info.get('url') or ('/tags/site-notice/' if raw == 'site-notice' else '/tags/')
        tag_links.append(f'<a class="tag" href="{esc(href)}">{esc(label)}</a>')
    return f'''<article class="card post-card" data-card-link="{esc(p['url'])}" role="link" tabindex="0" aria-label="阅读文章：{esc(p['title'])}">
  <a class="post-thumb cover-mode-{esc(p['cover_mode'])}" href="{esc(p['url'])}" style="background-image:url('{esc(p['cover'])}')"></a>
  <div class="post-info">
    <div class="post-card-head"><h2><a href="{esc(p['url'])}">{esc(p['title'])}</a></h2></div>
    <p>{esc(p['summary'])}</p>
    <div class="meta-row"><span class="meta-icon-item">{icon_svg('calendar')} {esc(p['date'])}</span><span class="meta-icon-item">{icon_svg('user')} {esc(p['author'])}</span>{''.join(tag_links)}<span class="views real-views meta-icon-item" data-view-mode="get" data-view-path="{esc(p['url'])}">{icon_svg('eye')} 阅读 <b>0</b></span></div>
  </div>
</article>'''


def render_page(raw, info):
    display = info.get('display') or ('站点公告' if raw == 'site-notice' else raw)
    related = [p for p in posts if raw in p.get('tags', [])]
    latest = related[0]['date'] if related else '暂无文章'
    cards = '\n'.join(render_post_card(p) for p in related) or '<div class="card" style="padding:28px">还没有文章。</div>'
    hot = ''
    for p in related[:3]:
        hot += f'''<a class="card related-card related-card-link" href="{esc(p['url'])}" aria-label="阅读热门文章：{esc(p['title'])}"><span class="post-thumb cover-mode-{esc(p['cover_mode'])}" style="background-image:url('{esc(p['cover'])}')"></span><div class="post-info"><h3>{esc(p['title'])}</h3><div class="meta-row"><span>{esc(p['date'])}</span><span class="views real-views meta-icon-item" data-view-mode="get" data-view-path="{esc(p['url'])}">{icon_svg('eye')} 阅读 <b>0</b></span></div></div></a>'''
    title = f'# {display}'
    return f'''<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>{esc(display)} - Songline Blog</title>
  <meta name="description" content="标签 {esc(display)} 下的文章列表。">
  <script>(function(){{try{{var theme=localStorage.getItem('songline-theme')||'dark';document.documentElement.setAttribute('data-theme',theme);document.documentElement.style.backgroundColor=theme==='dark'?'#0d1728':'#fbfaf7';}}catch(e){{document.documentElement.setAttribute('data-theme','dark');document.documentElement.style.backgroundColor='#0d1728';}}}})();</script>
  <link rel="stylesheet" href="/css/site.css?v=20.20.6">
  <link rel="stylesheet" href="/css/theme-vars.css?v=20.20.6">
  <script src="/js/icon-system.js?v=20.20.6"></script>
  <script defer src="/js/page-transition.js?v=20.20.6"></script>
</head>
<body class="{esc(site_body_class())}">
  <script>(function(){{try{{if((localStorage.getItem('songline-theme')||'dark')==='dark')document.body.classList.add('dark');}}catch(e){{document.body.classList.add('dark');}}}})();</script>
{site_bg_layer_html()}  <header class="site-header modern-site-header">
    <div class="navbar modern-navbar">
      <a class="logo" href="/">{logo_html()}</a>
      <nav class="nav-links modern-nav-links" aria-label="主导航"><a href="/">首页</a><a href="/posts/">文章</a><a href="/tags/" class="active">标签</a><a href="/friends/">朋友</a><a href="/tools/">工具</a></nav>
      <div class="header-icons"><a class="icon-btn" href="/posts/" aria-label="搜索">{icon_svg('search')}</a><button class="icon-btn" data-theme-toggle type="button" aria-label="切换深色模式">{icon_svg('moon')}</button></div>
    </div>
  </header>
  <main class="container">
    <a class="back-icon-link" href="/tags/" data-back-icon aria-label="返回" title="返回">{icon_svg('back')}</a>
    <section class="page-hero minimal-page-hero tag-detail-hero"><h1>{esc(title)}</h1></section>
    <section class="card toolbar-panel"><span class="pill active">{len(related)} 篇文章</span><span class="pill">最近更新 {esc(latest)}</span><div class="pills"><a class="pill" href="/tags/">返回标签</a><a class="pill" href="/posts/">全部文章</a></div></section>
    <section class="section"><div class="section-head"><span class="section-icon">{icon_svg('article')}</span><h2>该标签下的文章</h2></div><div class="article-list">{cards}</div></section>
    <section class="section"><div class="section-head"><span class="section-icon">{icon_svg('fire')}</span><h2>热门文章</h2></div><div class="related-grid">{hot}</div></section>
  </main>
  <footer class="footer site-footer-clean"><div class="footer-inner"><span>© Songline Blog</span><span class="footer-dot">·</span><span>由热爱驱动，持续记录</span></div></footer>
  <script src="/js/site.js?v=20.20.6"></script><script src="/js/search.js?v=20.20.6"></script>
</body>
</html>'''

count = 0
for raw, info in tag_info.items():
    url = clean(info.get('url'))
    if not url.startswith('/tags/') or not url.endswith('/'):
        continue
    slug = url.strip('/').split('/')[-1]
    out_dir = published / 'tags' / slug
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / 'index.html').write_text(render_page(raw, info), encoding='utf-8')
    count += 1

print(f'physical tag detail pages written: {count}')
PYPUBTAGS

echo "Blog rebuilt at $(date '+%F %T')"

# v20.3.5 note: 标签页英文标识已移除；物理标签详情页使用统一 data-ui-icon 图标接口。

# v20.3.5 note: 图标入口统一到 layouts/partials/ui-icon.html 与 static/js/icon-system.js。

# v20.3.5 note: 标题描述收敛；搜索图标统一走 site-search-icon/ui-icon；文章和 Markdown 阅读目录按相对层级缩进。
