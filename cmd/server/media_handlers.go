package main

import (
	"net/http"
	"net/url"
	"os"
	"strings"
)

// 后台媒体库页面、上传、重命名与删除流程。
type mediaLibraryContext struct {
	user  User
	owner string
	dir   string
}

const siteMediaOwner = "admin"

func mediaLibraryURL(media mediaLibraryContext, message string) string {
	query := url.Values{}
	if media.owner == siteMediaOwner {
		query.Set("library", siteMediaOwner)
	}
	if message != "" {
		query.Set("msg", message)
	}
	if len(query) == 0 {
		return "/admin/media"
	}
	return "/admin/media?" + query.Encode()
}

// mediaLibraryForRequest chooses the library being managed, rather than
// treating a logged-in username as the only possible media owner. The site
// owner's project, memory, background and other shared assets deliberately
// live under the stable admin library. Ordinary accounts must remain confined
// to their personal directory.
func (app *App) mediaLibraryForRequest(user User, r *http.Request) mediaLibraryContext {
	owner := mediaOwner(user.Username)
	if isOwner(user) && strings.EqualFold(strings.TrimSpace(r.URL.Query().Get("library")), siteMediaOwner) {
		owner = siteMediaOwner
	}
	return mediaLibraryContext{
		user:  user,
		owner: owner,
		dir:   app.userMediaDir(owner),
	}
}

func (app *App) renderMediaLibrary(w http.ResponseWriter, r *http.Request, media mediaLibraryContext, extra map[string]any) {
	mediaURL := app.adminURL(mediaLibraryURL(media, ""))
	data := map[string]any{
		"User":       media.user,
		"Owner":      media.owner,
		"MediaURL":   mediaURL,
		"Files":      app.categorizedMediaFiles(media.owner),
		"Categories": mediaCategoryOptions(media),
		"Flash":      r.URL.Query().Get("msg"),
		"Workspace":  "media",
	}
	data["Groups"] = mediaGroups(data["Files"].([]MediaFile))
	for k, v := range extra {
		data[k] = v
	}
	app.render(w, "media.html", data)
}

// 后台媒体库的路由入口：页面展示与动作分发。
func (app *App) handleMediaLibrary(w http.ResponseWriter, r *http.Request) {
	user, _ := app.currentUser(r)
	media := app.mediaLibraryForRequest(user, r)
	if err := os.MkdirAll(media.dir, 0755); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if err := app.ensureCanonicalMediaLayout(); err != nil {
		http.Error(w, "初始化统一媒体库失败: "+err.Error(), http.StatusInternalServerError)
		return
	}

	switch r.Method {
	case http.MethodGet:
		app.renderMediaLibrary(w, r, media, nil)
	case http.MethodPost:
		limit := app.cfg.MaxUploadBytes
		if limit <= 0 {
			limit = 512 * 1024 * 1024
		}
		r.Body = http.MaxBytesReader(w, r.Body, limit)
		defer func() {
			if r.MultipartForm != nil {
				_ = r.MultipartForm.RemoveAll()
			}
		}()
		// 裁剪器通过 query 传递 action，避免在读取动作前提前解析整张 Canvas 图片。
		action := strings.TrimSpace(r.URL.Query().Get("action"))
		// 普通上传没有 action 字段。FormValue 会提前解析整个 multipart，
		// 导致上传处理器的大小限制失效，还会吞掉解析错误。
		if action == "" && !strings.HasPrefix(strings.ToLower(r.Header.Get("Content-Type")), "multipart/form-data") {
			r.Body = http.MaxBytesReader(w, r.Body, 64*1024)
			if err := r.ParseForm(); err != nil {
				http.Error(w, "无效的媒体操作表单", http.StatusBadRequest)
				return
			}
			action = strings.TrimSpace(r.FormValue("action"))
		}
		switch action {
		case "rename":
			app.renameMediaFile(w, r, media)
		case "delete":
			app.deleteMediaFile(w, r, media)
		case "categorize":
			app.categorizeMediaFile(w, r, media)
		case "cover-crop", "media-crop":
			app.saveCoverCrop(w, r, media)
		case "cover-upload":
			app.saveCoverUpload(w, r, media)
		case "media-import":
			app.importLegacyMedia(w, r, media)
		case "", "upload":
			app.uploadMediaFile(w, r, media)
		default:
			http.Error(w, "未知媒体操作", http.StatusBadRequest)
		}
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}
