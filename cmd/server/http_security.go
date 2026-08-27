package main

import (
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// HTTP 响应头与按客户端地址限流。
func securityHeaders(cfg Config, next http.Handler) http.Handler {
	connectSources := []string{"'self'"}
	seen := map[string]bool{"'self'": true}
	for _, raw := range []string{cfg.PublicSiteURL, cfg.PublicAPIURL} {
		u, err := url.Parse(raw)
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
			continue
		}
		origin := u.Scheme + "://" + u.Host
		if !seen[origin] {
			seen[origin] = true
			connectSources = append(connectSources, origin)
		}
	}
	csp := "default-src 'self'; connect-src " + strings.Join(connectSources, " ") + "; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' blob: data:; base-uri 'self'; frame-ancestors 'none'"
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "same-origin")
		w.Header().Set("Content-Security-Policy", csp)
		next.ServeHTTP(w, r)
	})
}

func (app *App) withRate(name string, max int, per time.Duration, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ip, _, _ := net.SplitHostPort(r.RemoteAddr)
		if ip == "" {
			ip = r.RemoteAddr
		}
		if !app.limiter.Allow(name+":"+ip, max, per) {
			http.Error(w, "请求太频繁，等一下再试", 429)
			return
		}
		next(w, r)
	}
}

type Limiter struct {
	mu      sync.Mutex
	buckets map[string][]time.Time
}

func NewLimiter() *Limiter { return &Limiter{buckets: map[string][]time.Time{}} }
func (l *Limiter) Allow(key string, max int, per time.Duration) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	cutoff := now.Add(-per)
	xs := l.buckets[key][:0]
	for _, t := range l.buckets[key] {
		if t.After(cutoff) {
			xs = append(xs, t)
		}
	}
	if len(xs) >= max {
		l.buckets[key] = xs
		return false
	}
	xs = append(xs, now)
	l.buckets[key] = xs
	return true
}
