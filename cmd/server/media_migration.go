package main

import (
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// 旧站把创作图片放在 static/media，而用户上传内容放在 static/uploads。
// 现在 /uploads 统一从 data/media 读取；旧目录与旧发布目录只作为一次性迁移
// 来源保留，避免升级时遗漏已经发布的文件。
var legacyMediaDirectories = []struct {
	legacy   string
	category string
}{
	{legacy: "projects", category: "projects"},
	{legacy: "memories", category: "memories"},
	{legacy: "users", category: "friends"},
}

var legacyMediaPathReplacements = []struct{ old, new string }{
	{"/media/projects/", "/uploads/admin/projects/"},
	{"/media/memories/", "/uploads/admin/memories/"},
	{"/media/users/", "/uploads/admin/friends/"},
	// v20.26 将站点自有素材按职责归入 admin 的子目录。旧 URL 仍可能存在于
	// 已部署的 site.json、用户资料和历史文章中，因此启动时统一改写。
	{"/uploads/admin/main_logo.png", "/uploads/admin/logo/main_logo.png"},
	{"/uploads/admin/bilibili.png", "/uploads/admin/logo/bilibili.png"},
	{"/uploads/admin/snowMan.png", "/uploads/admin/friends/snowMan.png"},
	{"/uploads/admin/article_default.png", "/uploads/admin/article/article_default.png"},
	{"/uploads/admin/announcement.png", "/uploads/admin/article/announcement.png"},
	{"/uploads/admin/background01.png", "/uploads/admin/background/background01.png"},
	{"/uploads/admin/ground-background.png", "/uploads/admin/background/ground-background.png"},
	{"/uploads/admin/ground-back-black.png", "/uploads/admin/background/ground-back-black.png"},
	{"/uploads/admin/qiandai_background.png", "/uploads/admin/background/qiandai_background.png"},
	{"/uploads/admin/qiandai-background-black.png", "/uploads/admin/background/qiandai-background-black.png"},
	{"/uploads/admin/under-ground.png", "/uploads/admin/background/under-ground.png"},
	{"/uploads/admin/under-ground-black.png", "/uploads/admin/background/under-ground-black.png"},
	{"/uploads/admin/tools-underground-soil-light-v1.png", "/uploads/admin/background/tools-underground-soil-light-v1.png"},
	{"/uploads/admin/tools-underground-soil-dark-v1.png", "/uploads/admin/background/tools-underground-soil-dark-v1.png"},
	// show/article/tag/friends 四张早期横幅未随资源归档保留，统一使用现存的
	// 横向校园背景，避免复刻或升级后出现 404。
	{"/uploads/admin/show.png", "/uploads/admin/background/qiandai_background.png"},
	{"/uploads/admin/article.png", "/uploads/admin/background/ground-background.png"},
	{"/uploads/admin/tag.png", "/uploads/admin/background/ground-background.png"},
	{"/uploads/admin/friends.png", "/uploads/admin/background/qiandai_background.png"},
	// 兼容更早的 uploads 根目录写法。
	{"/uploads/main_logo.png", "/uploads/admin/logo/main_logo.png"},
	{"/uploads/article.png", "/uploads/admin/background/ground-background.png"},
	{"/uploads/tag.png", "/uploads/admin/background/ground-background.png"},
	{"/uploads/friends.png", "/uploads/admin/background/qiandai_background.png"},
	{"/uploads/background01.png", "/uploads/admin/background/background01.png"},
	{"/uploads/snowMan.png", "/uploads/admin/friends/snowMan.png"},
	{"/uploads/bilibili.png", "/uploads/admin/logo/bilibili.png"},
}

// ensureCanonicalMediaLayout is intentionally idempotent. It is safe to run
// before every public rebuild: existing target files are never overwritten.
func (app *App) ensureCanonicalMediaLayout() error {
	app.mediaMu.Lock()
	defer app.mediaMu.Unlock()
	if err := app.migrateLegacyRuntimeData(); err != nil {
		return err
	}
	if err := app.seedBundledMediaFiles(); err != nil {
		return err
	}
	if err := app.migrateLegacyMediaFiles(); err != nil {
		return err
	}
	return app.migrateLegacyMediaReferences()
}

// migrateLegacyRuntimeData preserves files from deployments that used
// RUNTIME_STATIC_DIR=shared/static before runtime data was consolidated under
// data/. Existing data/media files always win, so the migration is safe to run
// on every startup.
func (app *App) migrateLegacyRuntimeData() error {
	legacyRoot := strings.TrimSpace(app.cfg.LegacyRuntimeStaticDir)
	if legacyRoot == "" {
		return nil
	}
	legacyRoot = filepath.Clean(legacyRoot)
	if filepath.Clean(filepath.Join(legacyRoot, "uploads")) != filepath.Clean(app.mediaRootDir()) {
		if err := copyMissingTree(filepath.Join(legacyRoot, "uploads"), app.mediaRootDir(), app.isMediaTombstonedRelative); err != nil {
			return err
		}
	}
	return copyMissingTree(filepath.Join(legacyRoot, "md-source"), runtimeMarkdownDir(app.cfg.DataDir), nil)
}

func copyMissingTree(sourceRoot, targetRoot string, skip func(string) bool) error {
	if _, err := os.Stat(sourceRoot); errors.Is(err, os.ErrNotExist) {
		return nil
	} else if err != nil {
		return err
	}
	return filepath.WalkDir(sourceRoot, func(source string, entry os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(sourceRoot, source)
		if err != nil || rel == "." {
			return err
		}
		target := filepath.Join(targetRoot, rel)
		if entry.IsDir() {
			return os.MkdirAll(target, 0755)
		}
		if !entry.Type().IsRegular() {
			return nil
		}
		if skip != nil && skip(rel) {
			return nil
		}
		if _, err := os.Stat(target); err == nil {
			return nil
		} else if !errors.Is(err, os.ErrNotExist) {
			return err
		}
		if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
			return err
		}
		return copyFileExclusive(source, target)
	})
}

// seedBundledMediaFiles copies repository-managed public media into the
// persistent runtime directory only when it is missing. This gives a newly
// cloned deployment its initial visual state while preserving server uploads.
func (app *App) seedBundledMediaFiles() error {
	sourceRoot := filepath.Clean(filepath.Join("static", "uploads"))
	targetRoot := filepath.Clean(app.mediaRootDir())
	if sourceRoot == targetRoot {
		return nil
	}
	if _, err := os.Stat(sourceRoot); errors.Is(err, os.ErrNotExist) {
		return nil
	} else if err != nil {
		return err
	}
	return filepath.WalkDir(sourceRoot, func(source string, entry os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(sourceRoot, source)
		if err != nil || rel == "." {
			return err
		}
		target := filepath.Join(targetRoot, rel)
		if entry.IsDir() {
			return os.MkdirAll(target, 0755)
		}
		if !entry.Type().IsRegular() {
			return nil
		}
		if app.isMediaTombstonedRelative(rel) {
			return nil
		}
		if _, err := os.Stat(target); err == nil {
			return nil
		} else if !errors.Is(err, os.ErrNotExist) {
			return err
		}
		if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
			return err
		}
		return copyFileExclusive(source, target)
	})
}

func (app *App) migrateLegacyMediaFiles() error {
	adminDir := app.userMediaDir("admin")
	for _, mapping := range legacyMediaDirectories {
		sourceDir := filepath.Join("static", "media", mapping.legacy)
		entries, err := os.ReadDir(sourceDir)
		if errors.Is(err, os.ErrNotExist) {
			continue
		}
		if err != nil {
			return err
		}
		targetDir := filepath.Join(adminDir, mapping.category)
		if err := os.MkdirAll(targetDir, 0755); err != nil {
			return err
		}
		for _, entry := range entries {
			if entry.IsDir() || !isAllowedMediaExtension(filepath.Ext(entry.Name())) {
				continue
			}
			if app.isMediaTombstoned("admin", filepath.Join(mapping.category, entry.Name())) {
				continue
			}
			source := filepath.Join(sourceDir, entry.Name())
			target := filepath.Join(targetDir, entry.Name())
			if _, err := os.Stat(target); err == nil {
				continue
			} else if !errors.Is(err, os.ErrNotExist) {
				return err
			}
			if err := copyFileExclusive(source, target); err != nil {
				return err
			}
		}
	}
	return nil
}

func copyFileExclusive(source, target string) error {
	in, err := os.Open(source)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_EXCL, 0644)
	if err != nil {
		return err
	}
	_, copyErr := io.Copy(out, in)
	closeErr := out.Close()
	if copyErr != nil || closeErr != nil {
		_ = os.Remove(target)
		if copyErr != nil {
			return copyErr
		}
		return closeErr
	}
	return nil
}

// Runtime JSON is user data, so only the persistent copies are rewritten here.
// Git seed files remain compatibility fixtures; first-start seeding is followed
// immediately by this migration before the first Hugo build.
func (app *App) migrateLegacyMediaReferences() error {
	for _, name := range []string{"site.json", "projects.json", "memories.json", "friends.json", "users.json", "articles.json", "messages.json"} {
		path := runtimeDataPath(app.cfg.DataDir, name)
		if err := rewriteLegacyMediaPaths(path); err != nil {
			return err
		}
	}
	return nil
}

func rewriteLegacyMediaPaths(filePath string) error {
	b, err := os.ReadFile(filePath)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	updated := string(b)
	for _, replacement := range legacyMediaPathReplacements {
		updated = strings.ReplaceAll(updated, replacement.old, replacement.new)
	}
	if updated == string(b) {
		return nil
	}
	return os.WriteFile(filePath, []byte(updated), 0600)
}
