package main

import (
	"net/http"
	"time"
)

func (app *App) router() http.Handler {
	mux := http.NewServeMux()
	mux.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.Dir("web/static"))))
	mux.Handle("/uploads/", http.StripPrefix("/uploads/", http.FileServer(http.Dir("static/uploads"))))
	// Markdown 源文件属于运行时数据，不能依赖公开站的静态目录或 SPA 兜底规则。
	mux.Handle("/md-source/", http.StripPrefix("/md-source/", http.FileServer(http.Dir("static/md-source"))))
	mux.HandleFunc("/api/views", app.handleViewsAPI)

	app.registerScoreRoutes(mux, app.handleSnakeScoresAPI, "snake-scores")
	app.registerScoreRoutes(mux, app.handleGame2048ScoresAPI, "2048-scores")
	app.registerScoreRoutes(mux, app.handleReactionScoresAPI, "reaction-scores")
	app.registerScoreRoutes(mux, app.handleFlappyScoresAPI, "flappy-scores")
	app.registerScoreRoutes(mux, app.handleTypingScoresAPI, "typing-scores")

	mux.HandleFunc("/", app.handleHome)
	mux.HandleFunc("/healthz", app.handleHealth)
	mux.HandleFunc("/login", app.withRate("login", 10, time.Minute, app.handleLogin))
	mux.HandleFunc("/logout", app.handleLogout)
	mux.HandleFunc("/account", app.requireLogin(app.handleAccount))
	mux.HandleFunc("/password/request", app.withRate("password-request", 5, time.Hour, app.handlePasswordResetRequest))
	mux.HandleFunc("/articles/new", app.requireLogin(app.handleNewArticle))
	mux.HandleFunc("/articles/upload", app.requireLogin(app.handleUploadArticle))
	mux.HandleFunc("/articles/", app.requireLogin(app.handleArticleRoutes))
	mux.HandleFunc("/admin", app.requireAdmin(app.handleAdmin))
	mux.HandleFunc("/admin/site", app.requireAdmin(app.handleSiteSettings))
	mux.HandleFunc("/admin/manuscript", app.requireAdmin(app.handleManuscriptSettings))
	mux.HandleFunc("/admin/theme", app.requireAdmin(app.handleThemeSettings))
	mux.HandleFunc("/admin/media", app.requireLogin(app.handleMediaLibrary))
	mux.HandleFunc("/admin/cleanup", app.requireAdmin(app.handleCleanup))
	mux.HandleFunc("/admin/password-requests/", app.requireAdmin(app.handlePasswordRequestRoutes))
	mux.HandleFunc("/users/new", app.requireAdmin(app.handleNewUser))
	mux.HandleFunc("/users/", app.requireAdmin(app.handleUserRoutes))
	return mux
}

func (app *App) registerScoreRoutes(mux *http.ServeMux, handler http.HandlerFunc, endpoint string) {
	for _, path := range []string{
		"/api/tools/" + endpoint,
		"/write/api/tools/" + endpoint,
		"/static/api/" + endpoint,
		"/api/" + endpoint,
	} {
		mux.HandleFunc(path, handler)
	}
}

func newHTTPServer(cfg Config, app *App) *http.Server {
	return &http.Server{
		Addr:              cfg.Addr,
		Handler:           securityHeaders(cfg, app.router()),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		MaxHeaderBytes:    1 << 20,
	}
}
