package main

import (
	"bytes"
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
		// 记录原始错误，避免前端将所有失败都误报为“文件过大”。
		log.Printf("media upload multipart parse failed: limit=%d content_length=%d content_type=%q error=%v", app.cfg.MaxUploadBytes, r.ContentLength, r.Header.Get("Content-Type"), err)

		message := "上传失败：表单解析失败或上传中断，请重试"
		var maxBytesErr *http.MaxBytesError
		if errors.As(err, &maxBytesErr) {
			message = "上传失败：文件超过服务器允许的大小"
		}
		app.renderMediaLibrary(w, r, media, map[string]any{"Error": message})
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

// saveCoverCrop 保存由后台 Canvas 导出的 16:9 WebP 封面。
// 原文件只作为裁剪来源，始终保留在媒体库内，避免不可逆覆盖。
func (app *App) saveCoverCrop(w http.ResponseWriter, r *http.Request, media mediaLibraryContext) {
	const maxCropBytes int64 = 16 * 1024 * 1024
	writeError := func(status int, message string) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.WriteHeader(status)
		_, _ = w.Write([]byte(`{"ok":false,"error":"` + strings.ReplaceAll(message, `"`, `'`) + `"}`))
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxCropBytes+1024*1024)
	if err := r.ParseMultipartForm(maxCropBytes + 1024*1024); err != nil {
		writeError(http.StatusBadRequest, "裁剪图过大或表单格式错误")
		return
	}
	sourceName, err := isMediaPathOwnedBy(media.owner, strings.TrimSpace(r.FormValue("source")))
	if err != nil {
		writeError(http.StatusForbidden, "只能裁剪自己媒体库中的图片")
		return
	}
	if _, err := os.Stat(filepath.Join(media.dir, sourceName)); err != nil {
		writeError(http.StatusNotFound, "找不到用于裁剪的原图")
		return
	}
	switch strings.ToLower(filepath.Ext(sourceName)) {
	case ".jpg", ".jpeg", ".png", ".webp":
	default:
		writeError(http.StatusBadRequest, "目前仅支持 JPG、PNG、WebP 图片裁剪")
		return
	}

	file, _, err := r.FormFile("crop")
	if err != nil {
		writeError(http.StatusBadRequest, "没有收到裁剪后的封面")
		return
	}
	defer file.Close()

	// Canvas 输出必须是 WebP，检查文件签名后再落盘，避免接口变成任意文件上传入口。
	header := make([]byte, 12)
	if _, err := io.ReadFull(file, header); err != nil || string(header[:4]) != "RIFF" || string(header[8:12]) != "WEBP" {
		writeError(http.StatusBadRequest, "裁剪结果格式无效，请重新生成")
		return
	}
	base := strings.TrimSuffix(sourceName, filepath.Ext(sourceName))
	name := uniqueUploadName(media.dir, safeUploadName(base+"-16x9.webp"))
	outputPath := filepath.Join(media.dir, name)
	out, err := os.OpenFile(outputPath, os.O_CREATE|os.O_WRONLY|os.O_EXCL, 0644)
	if err != nil {
		writeError(http.StatusInternalServerError, "无法保存裁剪封面")
		return
	}
	defer out.Close()

	n, err := io.Copy(out, io.LimitReader(io.MultiReader(bytes.NewReader(header), file), maxCropBytes+1))
	if err != nil || n > maxCropBytes {
		_ = out.Close()
		_ = os.Remove(outputPath)
		writeError(http.StatusBadRequest, "裁剪封面超过 16MB 或保存失败")
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_, _ = w.Write([]byte(`{"ok":true,"path":"` + userMediaPublicPath(media.owner, name) + `"}`))
}
