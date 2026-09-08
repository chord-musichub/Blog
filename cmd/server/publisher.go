package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// 本文件负责将后台运行时数据转换为 Hugo 的公开站输入，并串行执行构建。

func (app *App) syncPublishedArticles() error {
	published := make([]Article, 0)
	for _, a := range app.store.AllArticles() {
		if a.Status != stPublished {
			continue
		}
		if strings.TrimSpace(a.Slug) == "" {
			continue
		}
		published = append(published, a)
		if err := app.writeHugoArticle(a); err != nil {
			return err
		}
	}
	return app.removeLegacyGeneratedArticleCopies(published)
}

// removeLegacyGeneratedArticleCopies cleans up a historic UTF-8 encoding issue
// that produced a second generated directory for the same published article.
// It only removes an entry if its generated title and date exactly match a
// currently published record while its directory name is no longer that record's slug.
func (app *App) removeLegacyGeneratedArticleCopies(published []Article) error {
	validSlugs := make(map[string]struct{}, len(published))
	identities := make(map[string]struct{}, len(published))
	for _, article := range published {
		validSlugs[article.Slug] = struct{}{}
		date := article.CreatedAt
		if article.PublishedAt != nil {
			date = *article.PublishedAt
		}
		identities[article.Title+"\x00"+date.Format(time.RFC3339)] = struct{}{}
	}

	entries, err := os.ReadDir(app.cfg.HugoContentDir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return err
	}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		if _, isCurrentSlug := validSlugs[entry.Name()]; isCurrentSlug {
			continue
		}
		title, date, ok := generatedArticleIdentity(filepath.Join(app.cfg.HugoContentDir, entry.Name(), "index.md"))
		if !ok {
			continue
		}
		if _, isLegacyCopy := identities[title+"\x00"+date]; !isLegacyCopy {
			continue
		}
		if err := os.RemoveAll(filepath.Join(app.cfg.HugoContentDir, entry.Name())); err != nil {
			return err
		}
	}
	return nil
}

func generatedArticleIdentity(path string) (string, string, bool) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", "", false
	}
	var title, date string
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "title:") {
			if err := json.Unmarshal([]byte(strings.TrimSpace(strings.TrimPrefix(line, "title:"))), &title); err != nil {
				return "", "", false
			}
		}
		if strings.HasPrefix(line, "date:") {
			if err := json.Unmarshal([]byte(strings.TrimSpace(strings.TrimPrefix(line, "date:"))), &date); err != nil {
				return "", "", false
			}
		}
		if line == "---" && title != "" && date != "" {
			return title, date, true
		}
	}
	return "", "", false
}

func (app *App) ensureBuiltinContentPages() error {
	base := filepath.Clean(app.cfg.HugoContentDir)
	contentRoot := filepath.Dir(base)

	toolsRoot := filepath.Join(contentRoot, "tools")
	if err := os.MkdirAll(filepath.Join(toolsRoot, "markdown-previewer"), 0755); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Join(toolsRoot, "random-number"), 0755); err != nil {
		return err
	}
	toolsIndex := "---\ntitle: \"工具\"\nlayout: \"tools\"\ngenerated_by: \"songline-tools-fallback\"\ndraft: false\n---\n\n"
	if err := os.WriteFile(filepath.Join(toolsRoot, "_index.md"), []byte(toolsIndex), 0644); err != nil {
		return err
	}
	mdIndex := "---\ntitle: \"Markdown 预览器\"\nlayout: \"markdown-previewer\"\ngenerated_by: \"songline-tools-fallback\"\ndraft: false\n---\n\n"
	if err := os.WriteFile(filepath.Join(toolsRoot, "markdown-previewer", "_index.md"), []byte(mdIndex), 0644); err != nil {
		return err
	}
	randomIndex := "---\ntitle: \"随机数生成器\"\nlayout: \"random-number\"\ngenerated_by: \"songline-tools-fallback\"\ndraft: false\n---\n\n"
	if err := os.WriteFile(filepath.Join(toolsRoot, "random-number", "_index.md"), []byte(randomIndex), 0644); err != nil {
		return err
	}

	noticeRoot := filepath.Join(contentRoot, "tags", "site-notice")
	if err := os.MkdirAll(noticeRoot, 0755); err != nil {
		return err
	}
	noticeIndex := "---\ntitle: \"站点公告\"\nlayout: \"site-notice\"\ngenerated_by: \"songline-notice-fallback\"\ndraft: false\n---\n\n"
	if _, err := os.Stat(filepath.Join(noticeRoot, "_index.md")); errors.Is(err, os.ErrNotExist) {
		if err := os.WriteFile(filepath.Join(noticeRoot, "_index.md"), []byte(noticeIndex), 0644); err != nil {
			return err
		}
	}
	return nil
}

func (app *App) runHugo(ctx context.Context) error {
	app.buildMu.Lock()
	defer app.buildMu.Unlock()

	if err := app.ensureSiteDefaults(); err != nil {
		return err
	}
	if err := app.ensureThemeDefaults(); err != nil {
		return err
	}
	if err := app.syncPublishedArticles(); err != nil {
		return err
	}
	// 朋友页以 data/friends.json 为唯一名单来源。每次构建只规范 URL 并重建
	// 自动生成的资料页，不再由 users.json 自动重写名单，避免朋友数量被缩减。
	if err := app.syncFriendContentPages(); err != nil {
		return err
	}
	if err := app.ensureBuiltinContentPages(); err != nil {
		return err
	}
	if err := app.writeRuntimeConfig(); err != nil {
		return err
	}
	if strings.TrimSpace(app.cfg.HugoCommand) == "" {
		return nil
	}
	cctx, cancel := context.WithTimeout(ctx, app.cfg.HugoBuildTimeout)
	defer cancel()
	parts := strings.Fields(app.cfg.HugoCommand)
	if app.cfg.PublicSiteURL != "" && strings.EqualFold(filepath.Base(parts[0]), "hugo") {
		parts = append(parts, "--baseURL", app.cfg.PublicSiteURL)
	}
	if strings.EqualFold(filepath.Base(parts[0]), "hugo") && !hasHugoFlag(parts, "--cleanDestinationDir") {
		// Hugo 默认保留上一轮已经不再生成的文件；发布时清掉这些陈旧输出，
		// 才能让 slug 修复或文章删除真正同步到公开站。
		parts = append(parts, "--cleanDestinationDir")
	}
	cmd := exec.CommandContext(cctx, parts[0], parts[1:]...)
	cmd.Dir = "."
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("%v\n%s", err, string(out))
	}
	return nil
}

func hasHugoFlag(parts []string, flag string) bool {
	for _, part := range parts {
		if part == flag || strings.HasPrefix(part, flag+"=") {
			return true
		}
	}
	return false
}

func (app *App) writeRuntimeConfig() error {
	if err := os.MkdirAll("static", 0755); err != nil {
		return err
	}
	payload, err := json.Marshal(struct {
		PublicAPIURL string `json:"publicApiUrl"`
	}{PublicAPIURL: app.cfg.PublicAPIURL})
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join("static", "runtime-config.js"), append([]byte("window.BlogRuntimeConfig = Object.freeze("), append(payload, []byte(");\n")...)...), 0644)
}
