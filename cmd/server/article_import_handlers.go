package main

import (
	"io"
	"log"
	"net/http"
	"path/filepath"
	"strings"
	"time"
)

// Markdown 导入、发布和文章删除处理器。

func (app *App) handleUploadArticle(w http.ResponseWriter, r *http.Request) {
	u, _ := app.currentUser(r)
	if r.Method == http.MethodGet {
		app.render(w, "upload.html", map[string]any{"User": u})
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", 405)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 1200*1024)
	if err := r.ParseMultipartForm(1200 * 1024); err != nil {
		app.render(w, "upload.html", map[string]any{"User": u, "Error": "上传失败：文件过大或表单格式错误"})
		return
	}
	file, header, err := r.FormFile("mdfile")
	if err != nil {
		app.render(w, "upload.html", map[string]any{"User": u, "Error": "请选择一个 .md 文件"})
		return
	}
	defer file.Close()
	if !strings.HasSuffix(strings.ToLower(header.Filename), ".md") && !strings.HasSuffix(strings.ToLower(header.Filename), ".markdown") {
		app.render(w, "upload.html", map[string]any{"User": u, "Error": "只允许上传 .md / .markdown 文件"})
		return
	}
	b, err := io.ReadAll(io.LimitReader(file, 1024*1024+1))
	if err != nil || len(b) > 1024*1024 {
		app.render(w, "upload.html", map[string]any{"User": u, "Error": "读取失败，或文件超过 1MB"})
		return
	}
	text := strings.TrimPrefix(string(b), "\ufeff")
	fm, body := parseFrontMatter(text)
	body = strings.TrimSpace(stripUnsafeHTML(body))
	if body == "" {
		app.render(w, "upload.html", map[string]any{"User": u, "Error": "Markdown 正文不能为空"})
		return
	}
	title := firstNonEmpty(r.FormValue("title"), fm["title"], firstMarkdownHeading(body), strings.TrimSuffix(header.Filename, filepath.Ext(header.Filename)))
	slug := slugify(firstNonEmpty(r.FormValue("slug"), fm["slug"], strings.TrimSuffix(header.Filename, filepath.Ext(header.Filename)), title))
	summary := firstNonEmpty(r.FormValue("summary"), fm["summary"], makeSummary(body))
	cover := cleanAssetPath(firstNonEmpty(r.FormValue("cover"), fm["cover"], fm["image"], fm["banner"]))
	coverMode := normalizeCoverMode(firstNonEmpty(r.FormValue("cover_mode"), fm["cover_mode"]))
	tags := splitTags(firstNonEmpty(r.FormValue("tags"), fm["tags"]))
	accountType := normalizeAccountType(u.Role, u.AccountType)
	if accountType != accountSystem {
		tags = filterProtectedNoticeTags(tags)
	}
	if title == "" || slug == "" {
		app.render(w, "upload.html", map[string]any{"User": u, "Error": "无法识别标题或 slug，请手动填写"})
		return
	}
	if app.store.SlugExists(slug, "") {
		slug = slug + "-" + newID()[:6]
	}
	a := Article{ID: newID(), Title: title, Slug: slug, Summary: summary, Cover: cover, CoverMode: coverMode, Tags: tags, Body: body, SourceMD: text, Author: u.Username, Status: stDraft, CreatedAt: time.Now()}
	uploadIntent := strings.TrimSpace(r.FormValue("upload_intent"))
	if uploadIntent == "" {
		// 兼容旧模板的按钮/复选框。
		if r.FormValue("publish_now") == "1" {
			uploadIntent = "publish"
		} else if r.FormValue("submit_after_upload") == "1" {
			uploadIntent = "submit"
		} else if u.Role != roleAdmin && r.FormValue("submit_after_upload") != "0" {
			uploadIntent = "submit"
		} else {
			uploadIntent = "draft"
		}
	}
	if uploadIntent != "draft" && uploadIntent != "submit" && uploadIntent != "publish" {
		uploadIntent = "draft"
	}
	if uploadIntent == "publish" && u.Role != roleAdmin {
		uploadIntent = "submit"
	}
	publishNow := uploadIntent == "publish" && u.Role == roleAdmin
	submitAfterUpload := uploadIntent == "submit"
	if publishNow {
		now := time.Now()
		a.Status = stPublished
		a.PublishedAt = &now
	} else if submitAfterUpload {
		a.Status = stPending
	}
	if err := app.store.SaveArticle(a); err != nil {
		http.Error(w, "保存失败: "+err.Error(), 500)
		return
	}
	if publishNow {
		if err := app.writeHugoArticle(a); err != nil {
			http.Error(w, "写入 Hugo 文章失败: "+err.Error(), 500)
			return
		}
		if err := app.runHugo(r.Context()); err != nil {
			log.Printf("hugo build after markdown upload error: %v", err)
			app.redirect(w, r, "/articles/"+a.ID+"/edit?msg=已上传并发布，但公开站重建失败，请看服务器日志", http.StatusSeeOther)
			return
		}
		app.redirect(w, r, "/articles/"+a.ID+"/edit?msg=Markdown 已上传并发布到公开站", http.StatusSeeOther)
		return
	}
	if submitAfterUpload {
		app.redirect(w, r, "/articles/"+a.ID+"/edit?msg=Markdown 已上传并进入审核队列", http.StatusSeeOther)
		return
	}
	app.redirect(w, r, "/articles/"+a.ID+"/edit?msg=Markdown 已上传到草稿箱，未提交审核", http.StatusSeeOther)
}

func (app *App) deleteArticle(w http.ResponseWriter, r *http.Request, id string, u User) {
	a, ok := app.store.GetArticle(id)
	if !ok {
		http.NotFound(w, r)
		return
	}
	// 作者只能删除自己的草稿/退回文章；管理员可以删除任何文章。
	if u.Role != roleAdmin {
		if a.Author != u.Username || !(a.Status == stDraft || a.Status == stRejected) {
			http.Error(w, "forbidden", 403)
			return
		}
	}
	if err := app.removeHugoArticle(a); err != nil {
		http.Error(w, "删除发布文件失败: "+err.Error(), 500)
		return
	}
	if err := app.store.DeleteArticle(id); err != nil {
		http.Error(w, "删除失败: "+err.Error(), 500)
		return
	}
	if err := app.runHugo(r.Context()); err != nil {
		log.Printf("hugo build after delete error: %v", err)
	}
	if u.Role == roleAdmin {
		app.redirect(w, r, "/admin?msg=文章已删除", http.StatusSeeOther)
		return
	}
	app.redirect(w, r, "/?msg=文章已删除", http.StatusSeeOther)
}
