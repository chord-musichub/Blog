package main

import (
	"log"
	"net/http"
	"strings"
	"time"
)

// 后台文章编辑器的展示、校验与保存流程。
func (app *App) showEditor(w http.ResponseWriter, r *http.Request, id string, u User) {
	a, ok := app.store.GetArticle(id)
	if !ok {
		http.NotFound(w, r)
		return
	}
	if !canAccessArticle(u, a) {
		http.Error(w, "forbidden", 403)
		return
	}
	app.render(w, "editor.html", map[string]any{"User": u, "Article": a, "Mode": "edit", "Flash": r.URL.Query().Get("msg"), "CoverFiles": listMediaFiles(userMediaDir(u.Username), userMediaPublicPrefix(u.Username))})
}

func (app *App) createOrUpdateArticle(w http.ResponseWriter, r *http.Request, id string, u User) {
	r.Body = http.MaxBytesReader(w, r.Body, 600*1024)
	if err := r.ParseForm(); err != nil {
		http.Error(w, "表单太大或格式错误", 400)
		return
	}

	intent := strings.TrimSpace(r.FormValue("intent"))
	if intent == "" {
		intent = "save"
	}
	if intent != "save" && intent != "submit" && intent != "publish" {
		intent = "save"
	}
	if intent == "publish" && u.Role != roleAdmin {
		intent = "submit"
	}

	var a Article
	var oldPublished Article
	wasPublished := false
	if id == "" {
		a = Article{Author: u.Username, Status: stDraft}
	} else {
		old, ok := app.store.GetArticle(id)
		if !ok {
			http.NotFound(w, r)
			return
		}
		if !canAccessArticle(u, old) {
			http.Error(w, "forbidden", 403)
			return
		}
		a = old
		if a.Status == stPublished {
			wasPublished = true
			oldPublished = old
			if u.Role != roleAdmin {
				// 普通作者修改已发布文章时，先从公开站撤下，保存后需要重新提交审核。
				_ = app.removeHugoArticle(old)
				_ = app.runHugo(r.Context())
				a.Status = stDraft
				a.PublishedAt = nil
			}
		}
		if a.Status == stPending && intent == "save" {
			// 对正在审核的稿件点击“保存草稿”，表示作者要继续修改，所以退回草稿。
			a.Status = stDraft
		}
	}

	body := stripUnsafeHTML(r.FormValue("body"))
	title := strings.TrimSpace(r.FormValue("title"))
	slug := slugify(r.FormValue("slug"))
	summary := strings.TrimSpace(r.FormValue("summary"))
	cover := cleanAssetPath(r.FormValue("cover"))
	coverMode := normalizeCoverMode(r.FormValue("cover_mode"))
	tags := splitTags(r.FormValue("tags"))
	accountType := normalizeAccountType(u.Role, u.AccountType)
	if accountType != accountSystem {
		tags = filterProtectedNoticeTags(tags)
	}

	if title == "" {
		app.editorError(w, u, a, "标题不能为空")
		return
	}
	if slug == "" {
		slug = slugify(title)
	}
	if slug == "" {
		app.editorError(w, u, a, "Slug 不能为空，建议用 my-first-post 这种格式")
		return
	}
	if len(body) == 0 {
		app.editorError(w, u, a, "正文不能为空")
		return
	}
	if len(body) > 200*1024 {
		app.editorError(w, u, a, "正文超过 200KB，第一版先限制一下")
		return
	}
	if app.store.SlugExists(slug, a.ID) {
		app.editorError(w, u, a, "Slug 已被其他文章使用，换一个英文短名")
		return
	}

	// 新文章在保存前先生成 ID；否则 Store.SaveArticle 内部生成的 ID 不会回写到当前变量，
	// 保存后重定向会变成 /articles//edit，导致 404。
	if a.ID == "" {
		a.ID = newID()
		a.CreatedAt = time.Now()
	}

	a.Title, a.Slug, a.Summary, a.Cover, a.CoverMode, a.Tags, a.Body = title, slug, summary, cover, coverMode, tags, body
	// v20.0.8: 编辑器保存/发布后，同步更新 Markdown 源文本。
	// 公开文章页会用 source_md_url/source_md_b64 重新渲染正文；如果这里保留旧的上传源文件，
	// 浏览器会先看到新 .Content，随后又被旧 source_md 覆盖，看起来就像“发布后内容没变”。
	a.SourceMD = body
	a.RejectNote = ""

	shouldWritePublic := false
	if intent == "submit" {
		if a.Title == "" || a.Slug == "" || a.Body == "" {
			app.redirect(w, r, "/articles/"+a.ID+"/edit?msg=请先补全文章再提交审核", http.StatusSeeOther)
			return
		}
		a.Status = stPending
		a.PublishedAt = nil
		if wasPublished {
			_ = app.removeHugoArticle(oldPublished)
		}
	} else if intent == "publish" && u.Role == roleAdmin {
		now := time.Now()
		a.Status = stPublished
		a.PublishedAt = &now
		shouldWritePublic = true
	}

	if err := app.store.SaveArticle(a); err != nil {
		http.Error(w, "保存失败: "+err.Error(), 500)
		return
	}

	if shouldWritePublic {
		if oldPublished.Slug != "" && oldPublished.Slug != a.Slug {
			_ = app.removeHugoArticle(oldPublished)
		}
		if err := app.writeHugoArticle(a); err != nil {
			http.Error(w, "写入 Hugo 文章失败: "+err.Error(), 500)
			return
		}
		if err := app.runHugo(r.Context()); err != nil {
			log.Printf("hugo build after article save error: %v", err)
			app.redirect(w, r, "/articles/"+a.ID+"/edit?msg=已保存，但公开站重建失败，请看服务器日志", http.StatusSeeOther)
			return
		}
		if intent == "publish" {
			app.redirect(w, r, "/articles/"+a.ID+"/edit?msg=已发布到公开站，首页已同步", http.StatusSeeOther)
		} else {
			app.redirect(w, r, "/articles/"+a.ID+"/edit?msg=已保存修改，并同步到公开站", http.StatusSeeOther)
		}
		return
	}

	if intent == "submit" {
		if u.Role == roleAdmin {
			app.redirect(w, r, "/articles/"+a.ID+"/edit?msg=已放入审核队列（测试用），可到审核后台发布", http.StatusSeeOther)
		} else {
			app.redirect(w, r, "/articles/"+a.ID+"/edit?msg=已提交给管理员审核，公开站暂不会更新", http.StatusSeeOther)
		}
		return
	}
	app.redirect(w, r, "/articles/"+a.ID+"/edit?msg=已保存到草稿箱，未提交审核", http.StatusSeeOther)
}

func (app *App) editorError(w http.ResponseWriter, u User, a Article, msg string) {
	app.render(w, "editor.html", map[string]any{"User": u, "Article": a, "Mode": "edit", "Error": msg, "CoverFiles": listMediaFiles(userMediaDir(u.Username), userMediaPublicPrefix(u.Username))})
}
