package main

import (
	"crypto/rand"
	"encoding/hex"
	"net/url"
	"regexp"
	"strings"
)

// 纯内容处理函数：不读写 HTTP 或文件系统，便于复用与单元测试。

func parseFrontMatter(text string) (map[string]string, string) {
	out := map[string]string{}
	text = strings.ReplaceAll(text, "\r\n", "\n")
	if !strings.HasPrefix(text, "---\n") {
		return out, text
	}
	idx := strings.Index(text[4:], "\n---")
	if idx < 0 {
		return out, text
	}
	front := text[4 : 4+idx]
	body := strings.TrimLeft(text[4+idx+len("\n---"):], "\n")
	for _, line := range strings.Split(front, "\n") {
		parts := strings.SplitN(line, ":", 2)
		if len(parts) != 2 {
			continue
		}
		k := strings.ToLower(strings.TrimSpace(parts[0]))
		v := strings.TrimSpace(parts[1])
		v = strings.Trim(v, `"'`)
		if strings.HasPrefix(v, "[") && strings.HasSuffix(v, "]") {
			v = strings.Trim(v, "[]")
			v = strings.ReplaceAll(v, `"`, "")
		}
		out[k] = v
	}
	return out, body
}

func firstMarkdownHeading(body string) string {
	for _, line := range strings.Split(body, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "# ") {
			return strings.TrimSpace(strings.TrimPrefix(line, "# "))
		}
	}
	return ""
}

func makeSummary(body string) string {
	body = regexp.MustCompile("(?m)^#+\\s*").ReplaceAllString(body, "")
	body = regexp.MustCompile("`{3}[\\s\\S]*?`{3}").ReplaceAllString(body, "")
	body = strings.Join(strings.Fields(body), " ")
	r := []rune(body)
	if len(r) > 120 {
		return string(r[:120]) + "..."
	}
	return body
}

func firstNonEmpty(xs ...string) string {
	for _, x := range xs {
		x = strings.TrimSpace(x)
		if x != "" {
			return x
		}
	}
	return ""
}

func urlMsg(s string) string { return url.QueryEscape(s) }

func newID() string { b := make([]byte, 8); _, _ = rand.Read(b); return hex.EncodeToString(b) }
func cleanUsername(s string) string {
	return regexp.MustCompile(`[^a-zA-Z0-9_-]`).ReplaceAllString(strings.ToLower(strings.TrimSpace(s)), "")
}
func slugify(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s = regexp.MustCompile(`[^a-z0-9\p{Han}]+`).ReplaceAllString(s, "-")
	s = strings.Trim(s, "-")
	if len([]rune(s)) > 80 {
		s = string([]rune(s)[:80])
	}
	return s
}

func normalizeCoverMode(raw string) string {
	v := strings.TrimSpace(raw)
	switch v {
	case "contain", "cover":
		return v
	default:
		return "cover"
	}
}

func cleanAssetPath(raw string) string {
	v := strings.TrimSpace(raw)
	v = strings.ReplaceAll(v, "：", ":")
	if v == "" {
		return ""
	}
	lower := strings.ToLower(v)
	if strings.HasPrefix(lower, "http://") || strings.HasPrefix(lower, "https://") {
		return v
	}
	if !strings.HasPrefix(v, "/") {
		v = "/" + v
	}
	if strings.Contains(v, "..") || strings.Contains(v, "\\") || len(v) > 240 {
		return ""
	}
	return v
}

func splitTags(s string) []string {
	parts := strings.Split(s, ",")
	out := []string{}
	seen := map[string]bool{}
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" && len([]rune(p)) <= 32 && !seen[p] {
			out = append(out, p)
			seen[p] = true
		}
	}
	if len(out) > 10 {
		out = out[:10]
	}
	return out
}

func appendUniqueTag(tags []string, tag string) []string {
	tag = strings.TrimSpace(tag)
	if tag == "" {
		return tags
	}
	for _, t := range tags {
		if strings.EqualFold(strings.TrimSpace(t), tag) {
			return tags
		}
	}
	if len(tags) >= 10 {
		return tags
	}
	return append(tags, tag)
}

func isNoticeTag(tag string) bool {
	t := strings.TrimSpace(strings.ToLower(tag))
	return t == noticeTagSlug || t == "站点公告"
}

func filterProtectedNoticeTags(tags []string) []string {
	out := []string{}
	for _, tag := range tags {
		if isNoticeTag(tag) {
			continue
		}
		out = append(out, tag)
	}
	return out
}

func normalizeArticleBodyForHugo(s string) string {
	// 临时 Markdown 预览器会把 <br> 当换行；公开文章这里转成 Markdown 硬换行，
	// 避免 Hugo/Goldmark 环境差异导致文章阅读页不换行。源 Markdown 下载仍保留原文。
	br := regexp.MustCompile(`(?i)(<br\s*/?>|&lt;br\s*/?&gt;)`)
	return br.ReplaceAllString(s, "  \n")
}

func stripUnsafeHTML(s string) string {
	// Go regexp 不支持 \1 这种反向引用，所以这里不用成对匹配写法。
	// 第一版做保守过滤：移除危险标签、事件属性和 javascript: 链接。
	dangerousTags := regexp.MustCompile(`(?is)<\s*/?\s*(script|iframe|object|embed|style|link|meta)[^>]*>`)
	eventAttrs := regexp.MustCompile(`(?is)\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)`)
	jsLinks := regexp.MustCompile(`(?is)javascript\s*:`)
	s = dangerousTags.ReplaceAllString(s, "")
	s = eventAttrs.ReplaceAllString(s, "")
	s = jsLinks.ReplaceAllString(s, "")
	return s
}

func resetStatusText(s string) string {
	switch s {
	case "pending":
		return "待处理"
	case "approved":
		return "已批准"
	case "rejected":
		return "已拒绝"
	default:
		return s
	}
}
func statusText(s string) string {
	switch s {
	case stDraft:
		return "草稿"
	case stPending:
		return "待审核"
	case stPublished:
		return "已发布"
	case stRejected:
		return "已退回"
	case stDeleted:
		return "已删除"
	default:
		return s
	}
}
func statusClass(s string) string {
	switch s {
	case stDraft:
		return "draft"
	case stPending:
		return "pending"
	case stPublished:
		return "published"
	case stRejected:
		return "rejected"
	case stDeleted:
		return "deleted"
	default:
		return ""
	}
}
