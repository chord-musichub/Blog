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
)

// 本文件负责将后台运行时数据转换为 Hugo 的公开站输入，并串行执行构建。

func (app *App) syncPublishedArticles() error {
	for _, a := range app.store.AllArticles() {
		if a.Status != stPublished {
			continue
		}
		if strings.TrimSpace(a.Slug) == "" {
			continue
		}
		if err := app.writeHugoArticle(a); err != nil {
			return err
		}
	}
	return nil
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
	cmd := exec.CommandContext(cctx, parts[0], parts[1:]...)
	cmd.Dir = "."
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("%v\n%s", err, string(out))
	}
	return nil
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
