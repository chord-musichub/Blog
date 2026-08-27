package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
)

// 后台审核、用户管理、文章上传删除与清理路由。

func (app *App) handleAdmin(w http.ResponseWriter, r *http.Request) {
	u, _ := app.currentUser(r)
	app.render(w, "admin.html", map[string]any{
		"User":            u,
		"PendingArticles": app.store.ArticlesByStatus(stPending),
		"OtherArticles":   app.store.ArticlesExceptStatus(stPending),
		"Articles":        app.store.AllArticles(),
		"Users":           app.store.Users(),
		"PasswordResets":  app.store.PasswordResetRequests(),
		"Flash":           r.URL.Query().Get("msg"),
	})
}

func (app *App) handleNewUser(w http.ResponseWriter, r *http.Request) {
	u, _ := app.currentUser(r)
	if r.Method == http.MethodGet {
		app.render(w, "new_user.html", map[string]any{"User": u})
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", 405)
		return
	}
	if err := r.ParseForm(); err != nil {
		http.Error(w, "bad request", 400)
		return
	}
	err := app.store.CreateUser(r.FormValue("username"), r.FormValue("display"), r.FormValue("role"), r.FormValue("account_type"), r.FormValue("password"))
	if err != nil {
		app.render(w, "new_user.html", map[string]any{"User": u, "Error": err.Error()})
		return
	}
	if err := app.runHugo(r.Context()); err != nil {
		log.Printf("hugo build after create user error: %v", err)
		app.redirect(w, r, "/admin?msg=作者已创建，但公开站重建失败，请看日志", http.StatusSeeOther)
		return
	}
	app.redirect(w, r, "/admin?msg=作者已创建，公开站已同步", http.StatusSeeOther)
}

func (app *App) handleCleanup(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.NotFound(w, r)
		return
	}
	_ = r.ParseForm()
	mode := r.FormValue("mode")
	if mode == "drafts" {
		removed, err := app.store.DeleteArticlesByStatus(stDraft, stRejected)
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		app.redirect(w, r, fmt.Sprintf("/admin?msg=已清理 %d 篇草稿/退回文章", removed), http.StatusSeeOther)
		return
	}
	if mode == "all" {
		if err := app.store.DeleteAllArticles(); err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		_ = os.RemoveAll(app.cfg.HugoContentDir)
		_ = os.MkdirAll(app.cfg.HugoContentDir, 0755)
		_ = app.runHugo(r.Context())
		app.redirect(w, r, "/admin?msg=已清空所有文章", http.StatusSeeOther)
		return
	}
	app.redirect(w, r, "/admin?msg=未知清理操作", http.StatusSeeOther)
}

func canAccessArticle(u User, a Article) bool { return u.Role == roleAdmin || a.Author == u.Username }

func safeIntRange(raw string, min int, max int, fallback int) int {
	v := strings.TrimSpace(raw)
	if v == "" {
		return fallback
	}
	var n int
	if _, err := fmt.Sscanf(v, "%d", &n); err != nil {
		return fallback
	}
	if n < min {
		return min
	}
	if n > max {
		return max
	}
	return n
}
