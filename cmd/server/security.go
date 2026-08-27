package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// 会话签名、会话 Cookie 与路由权限包装器。

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
