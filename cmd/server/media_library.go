package main

import (
	"errors"
	"fmt"
	"os"
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

func mediaRootDir() string {
	return filepath.Join("static", "uploads")
}

func userMediaDir(username string) string {
	return filepath.Join(mediaRootDir(), mediaOwner(username))
}

func userMediaPublicPrefix(username string) string {
	return "/uploads/" + mediaOwner(username) + "/"
}

func userMediaPublicPath(username, name string) string {
	return userMediaPublicPrefix(username) + name
}

func isMediaPathOwnedBy(username, publicPath string) (string, error) {
	v := strings.TrimSpace(publicPath)
	prefix := userMediaPublicPrefix(username)
	if !strings.HasPrefix(v, prefix) {
		return "", fmt.Errorf("not owned")
	}
	name := strings.TrimPrefix(v, prefix)
	if name == "" || strings.Contains(name, "/") || strings.Contains(name, "\\") || strings.Contains(name, "..") {
		return "", fmt.Errorf("invalid media name")
	}
	return name, nil
}

type MediaFile struct {
	Path string
	Name string
	Ext  string
}

func listMediaFiles(dir string, publicPrefix string) []MediaFile {
	entries, _ := os.ReadDir(dir)
	out := []MediaFile{}
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		out = append(out, MediaFile{Path: publicPrefix + name, Name: name, Ext: strings.TrimPrefix(strings.ToLower(filepath.Ext(name)), ".")})
	}
	sort.Slice(out, func(i, j int) bool { return strings.ToLower(out[i].Name) < strings.ToLower(out[j].Name) })
	return out
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
