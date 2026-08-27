package main

import (
	"strings"
	"testing"
)

func TestParseFrontMatterSeparatesMetadataAndBody(t *testing.T) {
	meta, body := parseFrontMatter("---\ntitle: \"测试文章\"\ntags: [\"Go\", \"博客\"]\n---\n\n# 正文\n")

	if meta["title"] != "测试文章" {
		t.Fatalf("title = %q, want %q", meta["title"], "测试文章")
	}
	if meta["tags"] != "Go, 博客" {
		t.Fatalf("tags = %q, want %q", meta["tags"], "Go, 博客")
	}
	if body != "# 正文\n" {
		t.Fatalf("body = %q, want markdown body", body)
	}
}

func TestMakeSummaryRemovesHeadingsAndCodeBlocks(t *testing.T) {
	summary := makeSummary("# 标题\n\n第一段文字。\n\n```go\nfmt.Println(\"ignore\")\n```\n\n第二段文字。")
	if summary != "标题 第一段文字。 第二段文字。" {
		t.Fatalf("summary = %q", summary)
	}
}

func TestContentSafetyHelpers(t *testing.T) {
	if got := cleanUsername(" Song Line! "); got != "songline" {
		t.Fatalf("cleanUsername = %q", got)
	}
	if got := slugify("Song Line / Go"); got != "song-line-go" {
		t.Fatalf("slugify = %q", got)
	}
	if got := cleanAssetPath("../secret.png"); got != "" {
		t.Fatalf("unsafe asset path = %q", got)
	}

	cleaned := stripUnsafeHTML("<p onclick=\"bad()\">正文</p><script>alert(1)</script><a href=\"javascript:bad()\">链接</a>")
	if strings.Contains(strings.ToLower(cleaned), "script") || strings.Contains(strings.ToLower(cleaned), "onclick") || strings.Contains(strings.ToLower(cleaned), "javascript:") {
		t.Fatalf("unsafe HTML was not removed: %q", cleaned)
	}
}
