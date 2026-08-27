package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
)

// 管理员用户状态、密码重置申请与用户清理处理器。

func (app *App) handleUserRoutes(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(strings.Trim(strings.TrimPrefix(r.URL.Path, "/users/"), "/"), "/")
	if len(parts) < 2 || r.Method != http.MethodPost {
		http.NotFound(w, r)
		return
	}
	username := cleanUsername(parts[0])
	action := parts[1]
	switch action {
	case "toggle":
		if err := app.store.ToggleUser(username); err != nil {
			app.redirect(w, r, "/admin?msg="+urlMsg(err.Error()), http.StatusSeeOther)
			return
		}
		if err := app.runHugo(r.Context()); err != nil {
			log.Printf("hugo build after toggle user error: %v", err)
			app.redirect(w, r, "/admin?msg=用户状态已更新，但公开站重建失败，请看日志", http.StatusSeeOther)
			return
		}
		app.redirect(w, r, "/admin?msg=用户状态已更新，公开站已同步", http.StatusSeeOther)
	case "reset":
		_ = r.ParseForm()
		password := r.FormValue("password")
		if err := app.store.ResetPassword(username, password); err != nil {
			app.redirect(w, r, "/admin?msg="+urlMsg(err.Error()), http.StatusSeeOther)
			return
		}
		app.redirect(w, r, "/admin?msg=密码已重置", http.StatusSeeOther)
	case "delete":
		if err := app.store.DeleteUser(username); err != nil {
			app.redirect(w, r, "/admin?msg="+urlMsg(err.Error()), http.StatusSeeOther)
			return
		}
		mediaDir := userMediaDir(username)
		if err := os.RemoveAll(mediaDir); err != nil {
			log.Printf("remove user media dir after delete user error: user=%s dir=%s err=%v", username, mediaDir, err)
			app.redirect(w, r, "/admin?msg=用户已删除，但媒体库清理失败，请看日志", http.StatusSeeOther)
			return
		}
		if err := app.runHugo(r.Context()); err != nil {
			log.Printf("hugo build after delete user error: %v", err)
			app.redirect(w, r, "/admin?msg=用户已删除，媒体库已清理，但公开站重建失败，请看日志", http.StatusSeeOther)
			return
		}
		app.redirect(w, r, "/admin?msg=用户已删除，个人媒体库已清理，公开站已同步", http.StatusSeeOther)
	default:
		http.NotFound(w, r)
	}
}

func (app *App) handlePasswordRequestRoutes(w http.ResponseWriter, r *http.Request) {
	u, _ := app.currentUser(r)
	parts := strings.Split(strings.Trim(strings.TrimPrefix(r.URL.Path, "/admin/password-requests/"), "/"), "/")
	if r.Method != http.MethodPost || len(parts) < 1 || parts[0] == "" {
		http.NotFound(w, r)
		return
	}
	id := parts[0]
	action := "approve"
	if len(parts) > 1 {
		action = parts[1]
	}
	_ = r.ParseForm()
	if action == "clear" {
		removed, err := app.store.ClearResolvedPasswordResets()
		if err != nil {
			app.redirect(w, r, "/admin?msg="+urlMsg(err.Error()), http.StatusSeeOther)
			return
		}
		app.redirect(w, r, fmt.Sprintf("/admin?msg=已清理 %d 条已处理申请", removed), http.StatusSeeOther)
		return
	}
	if err := app.store.ResolvePasswordReset(id, u.Username, action, r.FormValue("password")); err != nil {
		app.redirect(w, r, "/admin?msg="+urlMsg(err.Error()), http.StatusSeeOther)
		return
	}
	if action == "approve" {
		app.redirect(w, r, "/admin?msg=已批准密码修改；请把临时密码发给该用户", http.StatusSeeOther)
		return
	}
	app.redirect(w, r, "/admin?msg=已拒绝密码修改申请", http.StatusSeeOther)
}
