package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"strings"
)

func main() {
	loadDotEnv(".env")
	cfg := loadConfig()
	mustMkdir(cfg.DataDir, 0700)
	mustMkdir(cfg.HugoContentDir, 0755)
	mustMkdir(cfg.PublicDir, 0755)

	store, err := NewStore(cfg.DataDir)
	if err != nil {
		log.Fatal(err)
	}
	if err := store.EnsureAdmin(cfg.AdminUser, cfg.AdminPass); err != nil {
		log.Fatal(err)
	}

	app := newApp(cfg, store)
	if err := app.runHugo(context.Background()); err != nil {
		log.Printf("initial site build error: %v", err)
	}
	srv := newHTTPServer(cfg, app)
	log.Printf("blog admin v20.18.5 listening on %s base=%q", cfg.Addr, cfg.AdminBasePath)
	log.Fatal(srv.ListenAndServe())
}

func normalizeAccountType(role, accountType string) string {
	accountType = strings.TrimSpace(accountType)
	switch accountType {
	case accountSystem, accountOwner, accountFriend:
		return accountType
	}
	if role == roleAdmin {
		return accountSystem
	}
	return accountFriend
}

func accountTypeText(t string) string {
	switch normalizeAccountType("", t) {
	case accountSystem:
		return "系统账号 / 公告"
	case accountOwner:
		return "站长 / 主账号"
	default:
		return "朋友作者"
	}
}

func isSystemAccount(t string) bool {
	return normalizeAccountType("", t) == accountSystem
}

func (app *App) adminURL(p string) string {
	return adminURLPath(app.cfg.AdminBasePath, p)
}

func (app *App) redirect(w http.ResponseWriter, r *http.Request, p string, code int) {
	if strings.HasPrefix(p, "http://") || strings.HasPrefix(p, "https://") {
		http.Redirect(w, r, p, code)
		return
	}
	http.Redirect(w, r, app.adminURL(p), code)
}

func mustMkdir(p string, mode os.FileMode) {
	if err := os.MkdirAll(p, mode); err != nil {
		log.Fatal(err)
	}
}

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
		http.Error(w, err.Error(), 500)
	}
}

func (app *App) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(200)
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
	articles := app.store.ArticlesByAuthor(u.Username)
	if u.Role == roleAdmin {
		articles = app.store.AllArticles()
	}
	app.render(w, "home.html", map[string]any{"User": u, "Articles": articles, "Flash": r.URL.Query().Get("msg")})
}
