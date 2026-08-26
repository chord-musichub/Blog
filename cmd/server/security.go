package main

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// 本文件集中处理会话、密码验证、限流和 HTTP 安全响应头。
// 路由只声明权限需求，安全策略在此处统一维护。

func (app *App) requireLogin(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if _, ok := app.currentUser(r); !ok {
			app.redirect(w, r, "/login", http.StatusSeeOther)
			return
		}
		next(w, r)
	}
}
func (app *App) requireAdmin(next http.HandlerFunc) http.HandlerFunc {
	return app.requireLogin(func(w http.ResponseWriter, r *http.Request) {
		u, _ := app.currentUser(r)
		if u.Role != roleAdmin {
			http.Error(w, "forbidden", 403)
			return
		}
		next(w, r)
	})
}

func (app *App) currentUser(r *http.Request) (User, bool) {
	c, err := r.Cookie("session")
	if err != nil {
		return User{}, false
	}
	username, ok := app.verifySession(c.Value)
	if !ok {
		return User{}, false
	}
	u, ok := app.store.GetUser(username)
	if !ok || u.Disabled {
		return User{}, false
	}
	return u, true
}

func (app *App) setSession(w http.ResponseWriter, username string, remember bool) {
	duration := 12 * time.Hour
	maxAge := 0
	if remember {
		duration = 30 * 24 * time.Hour
		maxAge = 30 * 24 * 3600
	}
	exp := time.Now().Add(duration).Unix()
	payload := fmt.Sprintf("%s:%d", username, exp)
	raw := payload + ":" + app.sign(payload)
	http.SetCookie(w, &http.Cookie{Name: "session", Value: base64.RawURLEncoding.EncodeToString([]byte(raw)), Path: "/", MaxAge: maxAge, HttpOnly: true, SameSite: http.SameSiteLaxMode})
}
func (app *App) verifySession(v string) (string, bool) {
	b, err := base64.RawURLEncoding.DecodeString(v)
	if err != nil {
		return "", false
	}
	parts := strings.Split(string(b), ":")
	if len(parts) != 3 {
		return "", false
	}
	payload := parts[0] + ":" + parts[1]
	if subtle.ConstantTimeCompare([]byte(app.sign(payload)), []byte(parts[2])) != 1 {
		return "", false
	}
	var exp int64
	_, _ = fmt.Sscan(parts[1], &exp)
	if time.Now().Unix() > exp {
		return "", false
	}
	return parts[0], true
}
func (app *App) sign(s string) string {
	mac := hmac.New(sha256.New, []byte(app.cfg.SessionSecret))
	mac.Write([]byte(s))
	return hex.EncodeToString(mac.Sum(nil))
}

func HashPassword(password string) (string, error) {
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	dk := pbkdf2Key([]byte(password), salt, passwordPBKDF2Iterations, passwordHashBytes)
	return fmt.Sprintf("pbkdf2$%d$%s$%s", passwordPBKDF2Iterations, base64.RawStdEncoding.EncodeToString(salt), base64.RawStdEncoding.EncodeToString(dk)), nil
}
func VerifyPassword(password, encoded string) bool {
	parts := strings.Split(encoded, "$")
	if len(parts) != 4 || parts[0] != "pbkdf2" {
		return false
	}
	salt, err1 := base64.RawStdEncoding.DecodeString(parts[2])
	want, err2 := base64.RawStdEncoding.DecodeString(parts[3])
	if err1 != nil || err2 != nil {
		return false
	}
	dk := pbkdf2Key([]byte(password), salt, passwordPBKDF2Iterations, len(want))
	return subtle.ConstantTimeCompare(dk, want) == 1
}
func pbkdf2Key(password, salt []byte, iter, keyLen int) []byte {
	hLen := 32
	numBlocks := (keyLen + hLen - 1) / hLen
	out := make([]byte, 0, numBlocks*hLen)
	for block := 1; block <= numBlocks; block++ {
		mac := hmac.New(sha256.New, password)
		mac.Write(salt)
		mac.Write([]byte{byte(block >> 24), byte(block >> 16), byte(block >> 8), byte(block)})
		u := mac.Sum(nil)
		t := append([]byte(nil), u...)
		for i := 1; i < iter; i++ {
			mac = hmac.New(sha256.New, password)
			mac.Write(u)
			u = mac.Sum(nil)
			for j := range t {
				t[j] ^= u[j]
			}
		}
		out = append(out, t...)
	}
	return out[:keyLen]
}

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
