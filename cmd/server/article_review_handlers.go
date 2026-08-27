package main

import (
	"log"
	"net/http"
	"strings"
	"time"
)

// 后台文章投稿、审核、发布与驳回流程。
func (app *App) submitArticle(w http.ResponseWriter, r *http.Request, id string, u User) {
	a, ok := app.store.GetArticle(id)
	if !ok {
		http.NotFound(w, r)
		return
	}
	if !canAccessArticle(u, a) {
		http.Error(w, "forbidden", 403)
		return
	}
	if a.Title == "" || a.Slug == "" || a.Body == "" {
		app.redirect(w, r, "/articles/"+id+"/edit?msg=请先补全并保存文章", http.StatusSeeOther)
		return
	}
	a.Status = stPending
	a.RejectNote = ""
	if err := app.store.SaveArticle(a); err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	app.redirect(w, r, "/?msg=已提交审核，等待管理员发布", http.StatusSeeOther)
}

func (app *App) publishArticle(w http.ResponseWriter, r *http.Request, id string, u User) {
	if u.Role != roleAdmin {
		http.Error(w, "forbidden", 403)
		return
	}
	a, ok := app.store.GetArticle(id)
	if !ok {
		http.NotFound(w, r)
		return
	}
	now := time.Now()
	a.Status = stPublished
	a.PublishedAt = &now
	a.RejectNote = ""
	if err := app.writeHugoArticle(a); err != nil {
		http.Error(w, "写入 Hugo 文章失败: "+err.Error(), 500)
		return
	}
	if err := app.store.SaveArticle(a); err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	if err := app.runHugo(r.Context()); err != nil {
		log.Printf("hugo build error: %v", err)
		app.redirect(w, r, "/admin?msg=已发布，但 Hugo 构建失败，请看服务器日志", http.StatusSeeOther)
		return
	}
	app.redirect(w, r, "/admin?msg=文章已发布", http.StatusSeeOther)
}

func (app *App) rejectArticle(w http.ResponseWriter, r *http.Request, id string, u User) {
	if u.Role != roleAdmin {
		http.Error(w, "forbidden", 403)
		return
	}
	a, ok := app.store.GetArticle(id)
	if !ok {
		http.NotFound(w, r)
		return
	}
	a.Status = stRejected
	now := time.Now()
	a.RejectedAt = &now
	_ = r.ParseForm()
	a.RejectNote = strings.TrimSpace(r.FormValue("note"))
	if err := app.store.SaveArticle(a); err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	app.redirect(w, r, "/admin?msg=已退回", http.StatusSeeOther)
}
