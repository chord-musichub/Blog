package main

import "net/http"

// render enriches every admin page with the shared site and theme settings.
func (app *App) render(w http.ResponseWriter, name string, data map[string]any) {
	if data == nil {
		data = map[string]any{}
	}
	if _, ok := data["Settings"]; !ok {
		if settings, err := app.loadSiteSettings(); err == nil {
			data["Settings"] = settings
		}
	}
	if _, ok := data["Theme"]; !ok {
		if theme, err := app.loadThemeSettings(); err == nil {
			data["Theme"] = theme
		}
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if err := app.tpl.ExecuteTemplate(w, name, data); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func (app *App) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("ok"))
}

func (app *App) handleHome(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}
	u, ok := app.currentUser(r)
	if !ok {
		app.redirect(w, r, "/login", http.StatusSeeOther)
		return
	}
	// 首页始终只展示登录者自己的稿件。审核管理员从专门的工作台按作者查看全站稿件，
	// 站主需要编辑成员文章时也从成员文章入口进入，避免创作首页被所有人的稿件淹没。
	articles := app.store.ArticlesByAuthor(u.Username)
	app.render(w, "home.html", map[string]any{"User": u, "Articles": articles, "Flash": r.URL.Query().Get("msg"), "IsDashboard": true})
}
