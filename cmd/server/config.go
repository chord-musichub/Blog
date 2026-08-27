package main

import (
	"errors"
	"log"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

func cleanBasePath(p string) string {
	p = strings.TrimSpace(p)
	if p == "" || p == "/" {
		return ""
	}
	if !strings.HasPrefix(p, "/") {
		p = "/" + p
	}
	return strings.TrimRight(p, "/")
}

func adminURLPath(base, p string) string {
	if p == "" {
		p = "/"
	}
	if !strings.HasPrefix(p, "/") {
		p = "/" + p
	}
	if base == "" {
		return p
	}
	if p == "/" {
		return base + "/"
	}
	return base + p
}

func loadConfig() Config {
	get := func(k, d string) string {
		if v := os.Getenv(k); v != "" {
			return v
		}
		return d
	}
	secret := strings.TrimSpace(get("SESSION_SECRET", ""))
	if len(secret) < 32 {
		log.Fatal("SESSION_SECRET must be set to a random value of at least 32 characters")
	}
	adminPass := get("ADMIN_PASS", "")
	if strings.TrimSpace(adminPass) == "" {
		log.Fatal("ADMIN_PASS must be set in local configuration before starting the server")
	}
	adminUser := strings.TrimSpace(get("ADMIN_USER", ""))
	if adminUser == "" {
		log.Fatal("ADMIN_USER must be set in local configuration before starting the server")
	}
	return Config{
		Addr:              get("ADDR", ":8080"),
		DataDir:           get("DATA_DIR", "./data"),
		HugoContentDir:    get("HUGO_CONTENT_DIR", "./content/posts"),
		PublicDir:         get("PUBLIC_DIR", "./published"),
		HugoCommand:       get("HUGO_COMMAND", ""),
		SessionSecret:     secret,
		AdminUser:         adminUser,
		AdminPass:         adminPass,
		AdminBasePath:     cleanBasePath(get("ADMIN_BASE_PATH", "")),
		PublicBaseURL:     get("PUBLIC_BASE_URL", "/"),
		PublicSiteURL:     strings.TrimRight(strings.TrimSpace(get("PUBLIC_SITE_URL", "")), "/"),
		PublicAPIURL:      strings.TrimRight(strings.TrimSpace(get("PUBLIC_API_URL", "")), "/"),
		PublicCORSOrigins: get("PUBLIC_CORS_ORIGINS", ""),
		HugoBuildTimeout:  positiveDurationSeconds(get("HUGO_BUILD_TIMEOUT_SECONDS", "180"), 180),
		MaxUploadBytes:    positiveByteLimit(get("MAX_UPLOAD_BYTES", "104857600"), 100*1024*1024),
	}
}

func positiveDurationSeconds(raw string, fallback int) time.Duration {
	seconds, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil || seconds <= 0 {
		seconds = fallback
	}
	return time.Duration(seconds) * time.Second
}

func positiveByteLimit(raw string, fallback int64) int64 {
	value, err := strconv.ParseInt(strings.TrimSpace(raw), 10, 64)
	if err != nil || value <= 0 {
		return fallback
	}
	return value
}

// loadDotEnv 让本地二进制程序与 Docker Compose 共用同一份私有配置文件。
// 已存在的进程环境变量始终优先。
func loadDotEnv(path string) {
	b, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return
	}
	if err != nil {
		log.Printf("warning: could not read %s: %v", path, err)
		return
	}
	for _, raw := range strings.Split(string(b), "\n") {
		line := strings.TrimSpace(strings.TrimPrefix(raw, "\ufeff"))
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, value, ok := strings.Cut(line, "=")
		key = strings.TrimSpace(key)
		if !ok || key == "" {
			log.Printf("warning: ignored malformed line in %s", path)
			continue
		}
		if _, exists := os.LookupEnv(key); exists {
			continue
		}
		value = strings.TrimSpace(value)
		if len(value) >= 2 && ((value[0] == '"' && value[len(value)-1] == '"') || (value[0] == '\'' && value[len(value)-1] == '\'')) {
			value = value[1 : len(value)-1]
		}
		if err := os.Setenv(key, value); err != nil {
			log.Printf("warning: could not set %s from %s: %v", key, path, err)
		}
	}
}

func normalizedOrigin(raw string) string {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return ""
	}
	return u.Scheme + "://" + u.Host
}

func requestOrigin(r *http.Request) string {
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	} else if forwarded := strings.TrimSpace(strings.Split(r.Header.Get("X-Forwarded-Proto"), ",")[0]); forwarded == "https" {
		scheme = "https"
	}
	host := strings.TrimSpace(r.Host)
	if host == "" {
		return ""
	}
	return scheme + "://" + host
}

func (app *App) allowPublicCORS(w http.ResponseWriter, r *http.Request) bool {
	origin := normalizedOrigin(r.Header.Get("Origin"))
	if origin == "" {
		return true
	}
	// 浏览器同源请求也会为 JSON POST 附带 Origin；它不应依赖部署环境的跨域白名单。
	if origin == requestOrigin(r) {
		return true
	}
	allowed := map[string]bool{}
	for _, raw := range append([]string{app.cfg.PublicSiteURL, app.cfg.PublicAPIURL}, strings.Split(app.cfg.PublicCORSOrigins, ",")...) {
		if candidate := normalizedOrigin(raw); candidate != "" {
			allowed[candidate] = true
		}
	}
	if !allowed[origin] {
		return false
	}
	w.Header().Set("Access-Control-Allow-Origin", origin)
	w.Header().Set("Vary", "Origin")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	return true
}
