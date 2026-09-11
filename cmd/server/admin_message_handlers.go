package main

import (
	"net/http"
	"strings"
)

// handleAdminMessageRoutes keeps message moderation under the administrator
// workspace. Public visitors still interact exclusively through /api/messages.
func (app *App) handleAdminMessageRoutes(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.NotFound(w, r)
		return
	}
	parts := strings.Split(strings.Trim(strings.TrimPrefix(r.URL.Path, "/admin/messages/"), "/"), "/")
	if len(parts) != 2 || parts[0] == "" || parts[1] != "delete" {
		http.NotFound(w, r)
		return
	}
	if err := app.deleteMessage(parts[0]); err != nil {
		app.redirect(w, r, "/admin?msg="+urlMsg(err.Error())+"#messages", http.StatusSeeOther)
		return
	}
	app.redirect(w, r, "/admin?msg=留言已删除#messages", http.StatusSeeOther)
}
