package main

import (
	"net/http"
	"strings"
)

// 文章路由入口：按路径分发到编辑、投稿和审核流程。

func (app *App) handleArticleRoutes(w http.ResponseWriter, r *http.Request) {
	u, _ := app.currentUser(r)
	parts := strings.Split(strings.Trim(strings.TrimPrefix(r.URL.Path, "/articles/"), "/"), "/")
	if len(parts) == 0 || parts[0] == "" {
		http.NotFound(w, r)
		return
	}
	id := parts[0]
	action := "edit"
	if len(parts) > 1 {
		action = parts[1]
	}

	switch action {
	case "edit":
		if r.Method == http.MethodGet {
			app.showEditor(w, r, id, u)
			return
		}
		if r.Method == http.MethodPost {
			app.createOrUpdateArticle(w, r, id, u)
			return
		}
	case "submit":
		if r.Method == http.MethodPost {
			app.submitArticle(w, r, id, u)
			return
		}
	case "publish":
		if r.Method == http.MethodPost {
			app.publishArticle(w, r, id, u)
			return
		}
	case "reject":
		if r.Method == http.MethodPost {
			app.rejectArticle(w, r, id, u)
			return
		}
	case "delete":
		if r.Method == http.MethodPost {
			app.deleteArticle(w, r, id, u)
			return
		}
	}
	http.NotFound(w, r)
}
