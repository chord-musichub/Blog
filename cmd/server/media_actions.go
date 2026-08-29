package main

import (
	"errors"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
)

// 媒体库的修改动作：重命名、删除与上传。
func (app *App) renameMediaFile(w http.ResponseWriter, r *http.Request, media mediaLibraryContext) {
	oldPath := strings.TrimSpace(r.FormValue("old_path"))
	newRaw := strings.TrimSpace(r.FormValue("new_name"))
	oldName, err := isMediaPathOwnedBy(media.owner, oldPath)
	if err != nil {
		app.renderMediaLibrary(w, r, media, map[string]any{"Error": "重命名失败：只能重命名你自己媒体库里的文件"})
		return
	}
	newName := safeUploadName(newRaw)
	if newName == "" {
		app.renderMediaLibrary(w, r, media, map[string]any{"Error": "重命名失败：新文件名不能为空"})
		return
	}
	oldExt := strings.ToLower(filepath.Ext(oldName))
	newExt := strings.ToLower(filepath.Ext(newName))
	if !isAllowedMediaExtension(newExt) {
		app.renderMediaLibrary(w, r, media, map[string]any{"Error": "重命名失败：只允许图片、pdf、zip、mp3、wav、txt、md"})
		return
	}
	if oldExt != "" && newExt != oldExt {
		app.renderMediaLibrary(w, r, media, map[string]any{"Error": "重命名失败：为了避免引用失效，请保持原扩展名 " + oldExt})
		return
	}
	oldFile := filepath.Join(media.dir, oldName)
	newFile := filepath.Join(media.dir, newName)
	if oldFile == newFile {
		app.redirect(w, r, "/admin/media?msg="+url.QueryEscape("文件名没有变化："+userMediaPublicPath(media.owner, oldName)), http.StatusSeeOther)
		return
	}
	if _, err := os.Stat(newFile); err == nil {
		app.renderMediaLibrary(w, r, media, map[string]any{"Error": "重命名失败：新文件名已存在"})
		return
	}
	if err := os.Rename(oldFile, newFile); err != nil {
		app.renderMediaLibrary(w, r, media, map[string]any{"Error": "重命名失败：" + err.Error()})
		return
	}
	if err := app.runHugo(r.Context()); err != nil {
		log.Printf("hugo build after media rename error: %v", err)
	}
	app.redirect(w, r, "/admin/media?msg="+url.QueryEscape("已重命名为："+userMediaPublicPath(media.owner, newName)), http.StatusSeeOther)
}

func (app *App) deleteMediaFile(w http.ResponseWriter, r *http.Request, media mediaLibraryContext) {
	oldPath := strings.TrimSpace(r.FormValue("old_path"))
	oldName, err := isMediaPathOwnedBy(media.owner, oldPath)
	if err != nil {
		app.renderMediaLibrary(w, r, media, map[string]any{"Error": "删除失败：只能删除你自己媒体库里的文件"})
		return
	}
	if err := os.Remove(filepath.Join(media.dir, oldName)); err != nil {
		app.renderMediaLibrary(w, r, media, map[string]any{"Error": "删除失败：" + err.Error()})
		return
	}
	if err := app.runHugo(r.Context()); err != nil {
		log.Printf("hugo build after media delete error: %v", err)
	}
	app.redirect(w, r, "/admin/media?msg="+url.QueryEscape("已删除："+userMediaPublicPath(media.owner, oldName)), http.StatusSeeOther)
}

func (app *App) uploadMediaFile(w http.ResponseWriter, r *http.Request, media mediaLibraryContext) {
	r.Body = http.MaxBytesReader(w, r.Body, app.cfg.MaxUploadBytes)
	if err := r.ParseMultipartForm(app.cfg.MaxUploadBytes); err != nil {
		app.renderMediaLibrary(w, r, media, map[string]any{"Error": "上传失败：文件过大或表单格式错误"})
		return
	}
	file, header, err := r.FormFile("media")
	if err != nil {
		app.renderMediaLibrary(w, r, media, map[string]any{"Error": "请选择文件"})
		return
	}
	defer file.Close()

	ext := strings.ToLower(filepath.Ext(header.Filename))
	if !isAllowedMediaExtension(ext) {
		app.renderMediaLibrary(w, r, media, map[string]any{"Error": "只允许上传图片、视频（mp4/webm/mov）、音频、pdf、zip、txt、md"})
		return
	}
	name := safeUploadName(strings.TrimSpace(r.FormValue("filename")))
	if name == "" {
		name = uniqueUploadName(media.dir, safeUploadName(header.Filename))
	}
	if filepath.Ext(name) == "" {
		name += ext
	}
	if strings.ToLower(filepath.Ext(name)) != ext {
		app.renderMediaLibrary(w, r, media, map[string]any{"Error": "上传失败：自定义文件名扩展名需要和原文件一致"})
		return
	}

	out, err := os.OpenFile(filepath.Join(media.dir, name), os.O_CREATE|os.O_WRONLY|os.O_EXCL, 0644)
	if err != nil {
		if errors.Is(err, os.ErrExist) {
			app.renderMediaLibrary(w, r, media, map[string]any{"Error": "上传失败：同名文件已存在，请换一个文件名"})
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer out.Close()
	if _, err := io.Copy(out, file); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if err := app.runHugo(r.Context()); err != nil {
		log.Printf("hugo build after media upload error: %v", err)
	}
	app.redirect(w, r, "/admin/media?msg=已上传："+url.QueryEscape(userMediaPublicPath(media.owner, name)), http.StatusSeeOther)
}
