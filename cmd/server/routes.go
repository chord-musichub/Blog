package main

import (
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"
)

func (app *App) router() http.Handler {
	mux := http.NewServeMux()
	mux.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.Dir("web/static"))))
	mux.HandleFunc("/uploads/", app.handlePublicMedia)
	// Markdown 源文件属于运行时数据，不能依赖公开站的静态目录或 SPA 兜底规则。
	mux.Handle("/md-source/", http.StripPrefix("/md-source/", http.FileServer(http.Dir(filepath.Join(app.cfg.DataDir, "md-source")))))
	mux.HandleFunc("/api/views", app.handleViewsAPI)
	mux.HandleFunc("/api/messages", app.handleMessagesAPI)

	app.registerScoreRoutes(mux, app.handleSnakeScoresAPI, "snake-scores")
	app.registerScoreRoutes(mux, app.handleGame2048ScoresAPI, "2048-scores")
	app.registerScoreRoutes(mux, app.handleReactionScoresAPI, "reaction-scores")
	app.registerScoreRoutes(mux, app.handleFlappyScoresAPI, "flappy-scores")
	app.registerScoreRoutes(mux, app.handleTypingScoresAPI, "typing-scores")

	mux.HandleFunc("/", app.handleHome)
	mux.HandleFunc("/healthz", app.handleHealth)
	mux.HandleFunc("/login", app.withRate("login", 10, time.Minute, app.handleLogin))
	mux.HandleFunc("/logout", app.handleLogout)
	mux.HandleFunc("/settings", app.requireLogin(app.handleSettingsHub))
	mux.HandleFunc("/account", app.requireLogin(app.handleAccount))
	mux.HandleFunc("/password/request", app.withRate("password-request", 5, time.Hour, app.handlePasswordResetRequest))
	mux.HandleFunc("/compose", app.requireLogin(app.handleComposeHub))
	mux.HandleFunc("/articles/new", app.requireLogin(app.handleNewArticle))
	mux.HandleFunc("/articles/upload", app.requireLogin(app.handleUploadArticle))
	mux.HandleFunc("/articles/", app.requireLogin(app.handleArticleRoutes))
	// 项目与回忆属于站主个人归档，只允许站主编辑。
	mux.HandleFunc("/compose/projects", app.requireOwner(app.handleCreatorProjects))
	mux.HandleFunc("/compose/memories", app.requireOwner(app.handleCreatorMemories))
	mux.HandleFunc("/admin", app.requireArticleManager(app.handleAdmin))
	mux.HandleFunc("/admin/site", app.requireOwner(app.handleSiteSettings))
	mux.HandleFunc("/admin/manuscript", app.requireOwner(app.handleManuscriptSettings))
	mux.HandleFunc("/admin/theme", app.requireOwner(app.handleThemeSettings))
	mux.HandleFunc("/admin/media", app.requireLogin(app.handleMediaLibrary))
	mux.HandleFunc("/admin/cleanup", app.requireOwner(app.handleCleanup))
	mux.HandleFunc("/admin/password-requests/", app.requireAdmin(app.handlePasswordRequestRoutes))
	mux.HandleFunc("/admin/messages/", app.requireAdmin(app.handleAdminMessageRoutes))
	mux.HandleFunc("/users/new", app.requireAdmin(app.handleNewUser))
	mux.HandleFunc("/users/", app.requireAdmin(app.handleUserRoutes))
	return mux
}

// handlePublicMedia serves the instance-owned media first. Repository-managed
// public seeds are a read-only fallback so a clean clone (or a just-upgraded
// deployment before its first rebuild) never loses its icons or backgrounds.
// It also resolves historical admin-root URLs while old generated HTML is
// still cached by a browser or reverse proxy.
func (app *App) handlePublicMedia(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	publicPath := canonicalPublicMediaPath(r.URL.Path)
	name := strings.TrimPrefix(publicPath, "/uploads/")
	name = path.Clean(name)
	if name == "." || name == "" || strings.HasPrefix(name, "../") || strings.Contains(name, "\\") {
		http.NotFound(w, r)
		return
	}
	for _, root := range []string{app.mediaRootDir(), filepath.Join("static", "uploads")} {
		candidate := filepath.Join(root, filepath.FromSlash(name))
		if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
			http.ServeFile(w, r, candidate)
			return
		}
	}
	http.NotFound(w, r)
}

func canonicalPublicMediaPath(publicPath string) string {
	result := publicPath
	for _, replacement := range legacyMediaPathReplacements {
		result = strings.ReplaceAll(result, replacement.old, replacement.new)
	}
	return result
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
		// ReadTimeout 覆盖整个请求体。媒体上传不能沿用普通页面的短超时。
		ReadTimeout: cfg.HTTPReadTimeout,
		// 上传完成后还会触发 Hugo 构建，响应超时同样由配置控制。
		WriteTimeout:   cfg.HTTPWriteTimeout,
		MaxHeaderBytes: 1 << 20,
	}
}
