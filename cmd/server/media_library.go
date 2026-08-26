package main

import (
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
)

// 本文件负责媒体库的归属校验、文件操作和后台管理页面。

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
	re := regexp.MustCompile(`[^a-zA-Z0-9_-]+`)
	base = re.ReplaceAllString(base, "-")
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

func (app *App) handleMediaLibrary(w http.ResponseWriter, r *http.Request) {
	u, _ := app.currentUser(r)
	owner := mediaOwner(u.Username)
	dir := userMediaDir(owner)
	if err := os.MkdirAll(dir, 0755); err != nil {
		http.Error(w, err.Error(), 500)
		return
	}

	renderMedia := func(extra map[string]any) {
		data := map[string]any{
			"User":  u,
			"Owner": owner,
			"Files": listMediaFiles(dir, userMediaPublicPrefix(owner)),
			"Flash": r.URL.Query().Get("msg"),
		}
		for k, v := range extra {
			data[k] = v
		}
		app.render(w, "media.html", data)
	}

	if r.Method == http.MethodPost {
		action := strings.TrimSpace(r.FormValue("action"))
		if action == "rename" {
			oldPath := strings.TrimSpace(r.FormValue("old_path"))
			newRaw := strings.TrimSpace(r.FormValue("new_name"))
			oldName, err := isMediaPathOwnedBy(owner, oldPath)
			if err != nil {
				renderMedia(map[string]any{"Error": "重命名失败：只能重命名你自己媒体库里的文件"})
				return
			}
			newName := safeUploadName(newRaw)
			if newName == "" {
				renderMedia(map[string]any{"Error": "重命名失败：新文件名不能为空"})
				return
			}
			oldExt := strings.ToLower(filepath.Ext(oldName))
			newExt := strings.ToLower(filepath.Ext(newName))
			allowed := map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".webp": true, ".svg": true, ".gif": true, ".ico": true, ".pdf": true, ".zip": true, ".mp3": true, ".wav": true, ".txt": true, ".md": true, ".markdown": true}
			if !allowed[newExt] {
				renderMedia(map[string]any{"Error": "重命名失败：只允许图片、pdf、zip、mp3、wav、txt、md"})
				return
			}
			if oldExt != "" && newExt != oldExt {
				renderMedia(map[string]any{"Error": "重命名失败：为了避免引用失效，请保持原扩展名 " + oldExt})
				return
			}
			oldFile := filepath.Join(dir, oldName)
			newFile := filepath.Join(dir, newName)
			if oldFile == newFile {
				app.redirect(w, r, "/admin/media?msg="+url.QueryEscape("文件名没有变化："+userMediaPublicPath(owner, oldName)), http.StatusSeeOther)
				return
			}
			if _, err := os.Stat(newFile); err == nil {
				renderMedia(map[string]any{"Error": "重命名失败：新文件名已存在"})
				return
			}
			if err := os.Rename(oldFile, newFile); err != nil {
				renderMedia(map[string]any{"Error": "重命名失败：" + err.Error()})
				return
			}
			if err := app.runHugo(r.Context()); err != nil {
				log.Printf("hugo build after media rename error: %v", err)
			}
			app.redirect(w, r, "/admin/media?msg="+url.QueryEscape("已重命名为："+userMediaPublicPath(owner, newName)), http.StatusSeeOther)
			return
		}

		if action == "delete" {
			oldPath := strings.TrimSpace(r.FormValue("old_path"))
			oldName, err := isMediaPathOwnedBy(owner, oldPath)
			if err != nil {
				renderMedia(map[string]any{"Error": "删除失败：只能删除你自己媒体库里的文件"})
				return
			}
			if err := os.Remove(filepath.Join(dir, oldName)); err != nil {
				renderMedia(map[string]any{"Error": "删除失败：" + err.Error()})
				return
			}
			if err := app.runHugo(r.Context()); err != nil {
				log.Printf("hugo build after media delete error: %v", err)
			}
			app.redirect(w, r, "/admin/media?msg="+url.QueryEscape("已删除："+userMediaPublicPath(owner, oldName)), http.StatusSeeOther)
			return
		}

		r.Body = http.MaxBytesReader(w, r.Body, app.cfg.MaxUploadBytes)
		if err := r.ParseMultipartForm(app.cfg.MaxUploadBytes); err != nil {
			renderMedia(map[string]any{"Error": "上传失败：文件过大或表单格式错误"})
			return
		}
		file, header, err := r.FormFile("media")
		if err != nil {
			renderMedia(map[string]any{"Error": "请选择文件"})
			return
		}
		defer file.Close()
		ext := strings.ToLower(filepath.Ext(header.Filename))
		allowed := map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".webp": true, ".svg": true, ".gif": true, ".ico": true, ".pdf": true, ".zip": true, ".mp3": true, ".wav": true, ".txt": true, ".md": true, ".markdown": true}
		if !allowed[ext] {
			renderMedia(map[string]any{"Error": "只允许上传图片、pdf、zip、mp3、wav、txt、md"})
			return
		}
		customName := strings.TrimSpace(r.FormValue("filename"))
		name := safeUploadName(customName)
		if name == "" {
			name = uniqueUploadName(dir, safeUploadName(header.Filename))
		}
		if filepath.Ext(name) == "" {
			name += ext
		}
		if strings.ToLower(filepath.Ext(name)) != ext {
			renderMedia(map[string]any{"Error": "上传失败：自定义文件名扩展名需要和原文件一致"})
			return
		}
		dst := filepath.Join(dir, name)
		out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_EXCL, 0644)
		if err != nil {
			if errors.Is(err, os.ErrExist) {
				renderMedia(map[string]any{"Error": "上传失败：同名文件已存在，请换一个文件名"})
				return
			}
			http.Error(w, err.Error(), 500)
			return
		}
		defer out.Close()
		if _, err := io.Copy(out, file); err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		if err := app.runHugo(r.Context()); err != nil {
			log.Printf("hugo build after media upload error: %v", err)
		}
		app.redirect(w, r, "/admin/media?msg=已上传："+url.QueryEscape(userMediaPublicPath(owner, name)), http.StatusSeeOther)
		return
	}
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", 405)
		return
	}
	renderMedia(nil)
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
