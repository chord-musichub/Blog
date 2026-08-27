package main

import (
	"net/http"
	"os"
	"strings"
)

// 后台媒体库页面、上传、重命名与删除流程。
type mediaLibraryContext struct {
	user  User
	owner string
	dir   string
}

func (app *App) renderMediaLibrary(w http.ResponseWriter, r *http.Request, media mediaLibraryContext, extra map[string]any) {
	data := map[string]any{
		"User":  media.user,
		"Owner": media.owner,
		"Files": listMediaFiles(media.dir, userMediaPublicPrefix(media.owner)),
		"Flash": r.URL.Query().Get("msg"),
	}
	for k, v := range extra {
		data[k] = v
	}
	app.render(w, "media.html", data)
}

// 后台媒体库的路由入口：页面展示与动作分发。
func (app *App) handleMediaLibrary(w http.ResponseWriter, r *http.Request) {
	user, _ := app.currentUser(r)
	media := mediaLibraryContext{
		user:  user,
		owner: mediaOwner(user.Username),
		dir:   userMediaDir(user.Username),
	}
	if err := os.MkdirAll(media.dir, 0755); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	switch r.Method {
	case http.MethodGet:
		app.renderMediaLibrary(w, r, media, nil)
	case http.MethodPost:
		switch strings.TrimSpace(r.FormValue("action")) {
		case "rename":
			app.renameMediaFile(w, r, media)
		case "delete":
			app.deleteMediaFile(w, r, media)
		default:
			app.uploadMediaFile(w, r, media)
		}
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}
