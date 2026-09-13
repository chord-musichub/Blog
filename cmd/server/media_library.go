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
	name = path.Clean(name)
	if name == "." || name == "" || strings.HasPrefix(name, "../") || strings.Contains(name, "\\") {
		return "", fmt.Errorf("invalid media name")
	}
	return filepath.FromSlash(name), nil
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
		if err != nil || entry == nil || entry.IsDir() {
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
