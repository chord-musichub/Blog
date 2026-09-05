package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// 文章发布文件与供前端阅读的 Markdown 源文件生成。

func (app *App) hugoRootDir() string {
	contentDir := filepath.Clean(app.cfg.HugoContentDir)
	// 示例：/opt/gexian-blog-mvp/content/posts -> /opt/gexian-blog-mvp
	return filepath.Dir(filepath.Dir(contentDir))
}

func (app *App) writeArticleSourceMarkdown(a Article, source string) (string, error) {
	if strings.TrimSpace(a.Slug) == "" {
		return "", nil
	}
	dir := filepath.Join(app.runtimeStaticDir(), "md-source")
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", err
	}
	name := slugify(a.Slug)
	if name == "" {
		name = a.ID
	}
	fileName := name + ".md"
	if err := os.WriteFile(filepath.Join(dir, fileName), []byte(source), 0644); err != nil {
		return "", err
	}
	return "/md-source/" + fileName, nil
}

func (app *App) effectiveArticleSummary(a Article) string {
	if s := strings.TrimSpace(a.Summary); s != "" {
		return s
	}
	settings, err := app.loadSiteSettings()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(settings.Manuscript.DefaultSummary)
}

func (app *App) writeHugoArticle(a Article) error {
	dir := filepath.Join(app.cfg.HugoContentDir, a.Slug)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	date := a.CreatedAt.Format(time.RFC3339)
	if a.PublishedAt != nil {
		date = a.PublishedAt.Format(time.RFC3339)
	}
	authorDisplay := a.Author
	accountType := accountFriend
	showInFriends := true
	authorBio := ""
	authorHomepage := ""
	authorAvatar := defaultUserAvatar
	authorCover := ""
	if u, ok := app.store.GetUser(a.Author); ok {
		authorDisplay = firstNonEmpty(u.DisplayName, u.Username)
		accountType = normalizeAccountType(u.Role, u.AccountType)
		showInFriends = u.ShowInFriends || accountType == accountFriend
		authorBio = u.Bio
		authorHomepage = u.Homepage
		authorAvatar = normalizeUserAvatar(u.Avatar)
		authorCover = u.Cover
	}
	// 朋友主页从账号资料生成，不再依赖文章 taxonomy。
	_ = showInFriends
	friendsList := []string{}
	friends, _ := json.Marshal(friendsList)
	isNotice := accountType == accountSystem
	displayTags := filterProtectedNoticeTags(append([]string{}, a.Tags...))
	if isNotice {
		displayTags = appendUniqueTag(displayTags, noticeTagSlug)
	}
	tags, _ := json.Marshal(displayTags)
	coverLine := ""
	if strings.TrimSpace(a.Cover) != "" {
		coverLine = fmt.Sprintf("cover: %q\ncover_mode: %q\n", a.Cover, normalizeCoverMode(a.CoverMode))
	}
	// v20.0.8: 公开页的客户端渲染源以最新编辑正文为准，避免旧上传源文件覆盖新内容。
	sourceMD := a.Body
	if strings.TrimSpace(sourceMD) == "" {
		sourceMD = a.SourceMD
	}
	sourceURL, err := app.writeArticleSourceMarkdown(a, sourceMD)
	if err != nil {
		return err
	}
	sourceB64 := base64.StdEncoding.EncodeToString([]byte(sourceMD))
	renderBody := normalizeArticleBodyForHugo(a.Body)
	summary := app.effectiveArticleSummary(a)
	md := fmt.Sprintf("---\ntitle: %q\ndate: %q\nauthor: %q\nauthor_username: %q\nauthor_display: %q\naccount_type: %q\nis_notice: %t\nfriends: %s\ntags: %s\nsummary: %q\n%sauthor_bio: %q\nauthor_homepage: %q\nauthor_avatar: %q\nauthor_cover: %q\nsource_md_url: %q\nsource_md_b64: %q\ndraft: false\n---\n\n%s\n", a.Title, date, authorDisplay, a.Author, authorDisplay, accountType, isNotice, friends, tags, summary, coverLine, authorBio, authorHomepage, authorAvatar, authorCover, sourceURL, sourceB64, renderBody)
	return os.WriteFile(filepath.Join(dir, "index.md"), []byte(md), 0644)
}

func (app *App) removeHugoArticle(a Article) error {
	if a.Slug == "" {
		return nil
	}
	dir := filepath.Join(app.cfg.HugoContentDir, a.Slug)
	return os.RemoveAll(dir)
}
