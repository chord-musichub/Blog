package main

import (
	"errors"
	"fmt"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
)

// 本文件负责媒体库的归属校验、文件操作和后台管理页面。
var (
	unsafeUploadNameRE = regexp.MustCompile(`[^a-zA-Z0-9_-]+`)
	allowedMediaExts   = map[string]struct{}{
		".jpg": {}, ".jpeg": {}, ".png": {}, ".webp": {}, ".svg": {}, ".gif": {}, ".ico": {},
		".pdf": {}, ".zip": {}, ".mp3": {}, ".wav": {}, ".m4a": {}, ".ogg": {},
		".mp4": {}, ".webm": {}, ".mov": {},
		".txt": {}, ".md": {}, ".markdown": {},
	}
)

func isAllowedMediaExtension(ext string) bool {
	_, ok := allowedMediaExts[strings.ToLower(strings.TrimSpace(ext))]
	return ok
}

func cleanPublicPath(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	if strings.HasPrefix(s, "http://") || strings.HasPrefix(s, "https://") || strings.HasPrefix(s, "/") {
		return s
	}
	return "/" + s
}

func safeUploadName(name string) string {
	name = filepath.Base(strings.TrimSpace(name))
	name = strings.ReplaceAll(name, " ", "-")
	name = strings.ReplaceAll(name, "：", "-")
	ext := strings.ToLower(filepath.Ext(name))
	base := strings.TrimSuffix(name, filepath.Ext(name))
	base = unsafeUploadNameRE.ReplaceAllString(base, "-")
	base = strings.Trim(base, "-")
	if base == "" {
		return ""
	}
	return fmt.Sprintf("%s%s", base, ext)
}

func uniqueUploadName(dir, name string) string {
	ext := strings.ToLower(filepath.Ext(name))
	base := strings.TrimSuffix(name, filepath.Ext(name))
	candidate := name
	if _, err := os.Stat(filepath.Join(dir, candidate)); errors.Is(err, os.ErrNotExist) {
		return candidate
	}
	stamp := time.Now().Format("20060102150405")
	candidate = fmt.Sprintf("%s-%s%s", base, stamp, ext)
	if _, err := os.Stat(filepath.Join(dir, candidate)); errors.Is(err, os.ErrNotExist) {
		return candidate
	}
	for i := 2; i < 1000; i++ {
		candidate = fmt.Sprintf("%s-%s-%d%s", base, stamp, i, ext)
		if _, err := os.Stat(filepath.Join(dir, candidate)); errors.Is(err, os.ErrNotExist) {
			return candidate
		}
	}
	return fmt.Sprintf("%s-%s-%d%s", base, stamp, time.Now().UnixNano(), ext)
}

func mediaOwner(username string) string {
	u := cleanUsername(username)
	if u == "" {
		return "unknown"
	}
	return u
}

// 媒体属于部署实例的可变数据，而 static/ 只保留可随仓库发布的种子素材。
// /uploads 路径由 HTTP 服务从 data/media 提供，首次启动时再从 static/uploads
// 补种公开快照，避免用户上传反向污染 Git 工作区。
func (app *App) mediaRootDir() string {
	return filepath.Join(app.cfg.DataDir, "media")
}

func (app *App) userMediaDir(username string) string {
	return filepath.Join(app.mediaRootDir(), mediaOwner(username))
}

// A bundled file is copied from static/uploads into the runtime media directory
// on first use.  A plain os.Remove therefore cannot represent a user's choice
// to delete one: the next library request would seed it again.  Tombstones keep
// that choice in runtime data without ever modifying the repository seed.
func (app *App) mediaTombstonePath(owner, name string) string {
	return filepath.Join(app.mediaRootDir(), ".deleted", mediaOwner(owner), filepath.Clean(name))
}

func (app *App) isMediaTombstoned(owner, name string) bool {
	info, err := os.Stat(app.mediaTombstonePath(owner, name))
	return err == nil && !info.IsDir()
}

func (app *App) isMediaTombstonedRelative(relative string) bool {
	name := filepath.Clean(filepath.FromSlash(relative))
	parts := strings.Split(filepath.ToSlash(name), "/")
	if len(parts) < 2 || parts[0] == "." || strings.HasPrefix(parts[0], "..") {
		return false
	}
	return app.isMediaTombstoned(parts[0], filepath.Join(parts[1:]...))
}

func (app *App) markMediaTombstone(owner, name string) error {
	marker := app.mediaTombstonePath(owner, name)
	if err := os.MkdirAll(filepath.Dir(marker), 0755); err != nil {
		return err
	}
	file, err := os.OpenFile(marker, os.O_CREATE|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}
	return file.Close()
}

func (app *App) clearMediaTombstone(owner, name string) error {
	err := os.Remove(app.mediaTombstonePath(owner, name))
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return err
}

// Persist the removal before touching bytes, and serialize it with seed/migration
// passes. A failed operation must leave the original file publicly available.
func (app *App) removeMediaName(media mediaLibraryContext, name string, change func() error) error {
	app.mediaMu.Lock()
	defer app.mediaMu.Unlock()
	info, err := os.Lstat(filepath.Join(media.dir, name))
	if err != nil {
		return err
	}
	if !info.Mode().IsRegular() {
		return fmt.Errorf("只能操作普通媒体文件")
	}
	marked := app.isMediaTombstoned(media.owner, name)
	if err := app.markMediaTombstone(media.owner, name); err != nil {
		return err
	}
	if err := change(); err != nil {
		if !marked {
			return errors.Join(err, app.clearMediaTombstone(media.owner, name))
		}
		return err
	}
	return nil
}

func userMediaPublicPrefix(username string) string {
	return "/uploads/" + mediaOwner(username) + "/"
}

func userMediaPublicPath(username, name string) string {
	return userMediaPublicPrefix(username) + filepath.ToSlash(name)
}

func isMediaPathOwnedBy(username, publicPath string) (string, error) {
	v := strings.TrimSpace(publicPath)
	prefix := userMediaPublicPrefix(username)
	if !strings.HasPrefix(v, prefix) {
		return "", fmt.Errorf("not owned")
	}
	name := strings.TrimPrefix(v, prefix)
	if !validMediaRelativeName(name) {
		return "", fmt.Errorf("invalid media name")
	}
	name = path.Clean(name)
	if name == "." || name == "" || strings.HasPrefix(name, "../") || strings.Contains(name, "\\") {
		return "", fmt.Errorf("invalid media name")
	}
	return filepath.FromSlash(name), nil
}

func validMediaRelativeName(name string) bool {
	if name == "" || strings.Contains(name, "\\") {
		return false
	}
	for _, part := range strings.Split(name, "/") {
		if part == "" || strings.HasPrefix(part, ".") {
			return false
		}
	}
	return true
}

type MediaFile struct {
	Path     string
	Name     string
	Ext      string
	Category string
}

func listMediaFiles(dir string, publicPrefix string) []MediaFile {
	out := []MediaFile{}
	_ = filepath.WalkDir(dir, func(filePath string, entry os.DirEntry, err error) error {
		if err != nil || entry == nil {
			return nil
		}
		if entry.IsDir() {
			rel, relErr := filepath.Rel(dir, filePath)
			if relErr == nil && filepath.Clean(rel) == ".deleted" {
				return filepath.SkipDir
			}
			return nil
		}
		rel, err := filepath.Rel(dir, filePath)
		if err != nil || rel == "." || strings.HasPrefix(rel, "..") {
			return nil
		}
		name := filepath.ToSlash(rel)
		category := "general"
		if parts := strings.Split(name, "/"); len(parts) > 1 && parts[0] != "" {
			category = parts[0]
		}
		out = append(out, MediaFile{
			Path:     publicPrefix + name,
			Name:     name,
			Ext:      strings.TrimPrefix(strings.ToLower(filepath.Ext(name)), "."),
			Category: category,
		})
		return nil
	})
	sort.Slice(out, func(i, j int) bool { return strings.ToLower(out[i].Name) < strings.ToLower(out[j].Name) })
	return out
}

type MediaGroup struct {
	Key   string
	Label string
	Files []MediaFile
}

var mediaCategoryLabels = map[string]string{
	"general":     "通用素材",
	"articles":    "文章",
	"projects":    "项目",
	"memories":    "回忆",
	"profile":     "个人资料",
	"friends":     "朋友",
	"site":        "站点",
	"backgrounds": "背景",
	"tools":       "工具",
}

func normalizedMediaCategory(raw string) string {
	key := strings.ToLower(strings.TrimSpace(raw))
	if _, ok := mediaCategoryLabels[key]; ok {
		return key
	}
	return "general"
}

func mediaGroups(files []MediaFile) []MediaGroup {
	byKey := map[string][]MediaFile{}
	for _, file := range files {
		key := normalizedMediaCategory(file.Category)
		byKey[key] = append(byKey[key], file)
	}
	keys := make([]string, 0, len(byKey))
	for key := range byKey {
		keys = append(keys, key)
	}
	sort.Slice(keys, func(i, j int) bool {
		if keys[i] == "general" {
			return true
		}
		if keys[j] == "general" {
			return false
		}
		return keys[i] < keys[j]
	})
	groups := make([]MediaGroup, 0, len(keys))
	for _, key := range keys {
		groups = append(groups, MediaGroup{Key: key, Label: mediaCategoryLabels[key], Files: byKey[key]})
	}
	return groups
}

func mediaDirectoryForCategory(media mediaLibraryContext, category string) (string, string, error) {
	category = normalizedMediaCategory(category)
	dir := filepath.Join(media.dir, category)
	root := filepath.Clean(media.dir)
	if dir != root && !strings.HasPrefix(filepath.Clean(dir), root+string(os.PathSeparator)) {
		return "", "", fmt.Errorf("invalid media category")
	}
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", "", err
	}
	return dir, category, nil
}

func mediaNameFromPublicPath(p string) (string, error) {
	v := strings.TrimSpace(p)
	if !strings.HasPrefix(v, "/uploads/") {
		return "", fmt.Errorf("invalid media path")
	}
	rest := strings.TrimPrefix(v, "/uploads/")
	if rest == "" || strings.Contains(rest, "\\") || strings.Contains(rest, "..") {
		return "", fmt.Errorf("invalid media name")
	}
	return rest, nil
}
