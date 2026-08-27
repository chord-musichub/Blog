package main

import (
	"net/http"
)

// 登录、退出和密码重置申请的公开入口。
func (app *App) handleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		if _, ok := app.currentUser(r); ok {
			app.redirect(w, r, "/", http.StatusSeeOther)
			return
		}
		app.render(w, "login.html", map[string]any{"Flash": r.URL.Query().Get("msg")})
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
	username := cleanUsername(r.FormValue("username"))
	u, ok := app.store.GetUser(username)
	if !ok || !VerifyPassword(r.FormValue("password"), u.PasswordHash) {
		app.render(w, "login.html", map[string]any{"Error": "账号或密码不对"})
		return
	}
	if u.Disabled {
		app.render(w, "login.html", map[string]any{"Error": "账号已被禁用，请联系管理员"})
		return
	}
	app.setSession(w, u.Username, r.FormValue("remember") == "on")
	if u.PasswordMustChange {
		app.redirect(w, r, "/account?msg=请先修改初始/临时密码", http.StatusSeeOther)
		return
	}
	app.redirect(w, r, "/?msg=登录成功", http.StatusSeeOther)
}

func (app *App) handleLogout(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{Name: "session", Value: "", Path: "/", MaxAge: -1, HttpOnly: true, SameSite: http.SameSiteLaxMode})
	app.redirect(w, r, "/login?msg=已退出", http.StatusSeeOther)
}

func (app *App) handlePasswordResetRequest(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		app.render(w, "request_password.html", map[string]any{"Flash": r.URL.Query().Get("msg")})
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", 405)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 32*1024)
	if err := r.ParseForm(); err != nil {
		http.Error(w, "bad request", 400)
		return
	}
	if err := app.store.CreatePasswordReset(r.FormValue("username"), r.FormValue("note")); err != nil {
		app.render(w, "request_password.html", map[string]any{"Error": err.Error()})
		return
	}
	app.redirect(w, r, "/login?msg=密码修改申请已提交，等管理员处理后再登录", http.StatusSeeOther)
}
