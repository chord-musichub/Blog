package main

import (
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// 后台账户、用户、文章上传删除、密码申请与清理路由。

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

func (app *App) handleNewArticle(w http.ResponseWriter, r *http.Request) {
	u, _ := app.currentUser(r)
	if r.Method == http.MethodGet {
		a := Article{Author: u.Username, Status: stDraft}
		app.render(w, "editor.html", map[string]any{"User": u, "Article": a, "Mode": "new", "CoverFiles": listMediaFiles(userMediaDir(u.Username), userMediaPublicPrefix(u.Username))})
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", 405)
		return
	}
	app.createOrUpdateArticle(w, r, "", u)
}

func (app *App) saveAccountImageUpload(r *http.Request, username, field, prefix string) (string, error) {
	file, header, err := r.FormFile(field)
	if err != nil {
		if errors.Is(err, http.ErrMissingFile) {
			return "", nil
		}
		return "", err
	}
	defer file.Close()

	name := safeUploadName(header.Filename)
	ext := strings.ToLower(filepath.Ext(name))
	allowed := map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".webp": true, ".gif": true, ".svg": true}
	if !allowed[ext] {
		return "", fmt.Errorf("只允许上传 jpg / png / webp / gif / svg 图片")
	}

	owner := mediaOwner(username)
	dir := userMediaDir(owner)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", err
	}

	base := safeUploadName(prefix + ext)
	if base == "" {
		base = safeUploadName("profile" + ext)
	}
	dstName := uniqueUploadName(dir, base)
	dstPath := filepath.Join(dir, dstName)

	dst, err := os.Create(dstPath)
	if err != nil {
		return "", err
	}
	defer dst.Close()

	if _, err := io.Copy(dst, io.LimitReader(file, 3*1024*1024+1)); err != nil {
		return "", err
	}
	if info, err := os.Stat(dstPath); err == nil && info.Size() > 3*1024*1024 {
		_ = os.Remove(dstPath)
		return "", fmt.Errorf("图片不能超过 3MB")
	}
	return userMediaPublicPath(owner, dstName), nil
}

func (app *App) handleAccount(w http.ResponseWriter, r *http.Request) {
	u, _ := app.currentUser(r)
	coverFiles := listMediaFiles(userMediaDir(u.Username), userMediaPublicPrefix(u.Username))
	if r.Method == http.MethodGet {
		app.render(w, "account.html", map[string]any{"User": u, "CoverFiles": coverFiles, "Flash": r.URL.Query().Get("msg")})
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", 405)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 8*1024*1024)
	contentType := strings.ToLower(r.Header.Get("Content-Type"))
	if strings.Contains(contentType, "multipart/form-data") {
		if err := r.ParseMultipartForm(8 * 1024 * 1024); err != nil {
			http.Error(w, "bad request", 400)
			return
		}
	} else {
		if err := r.ParseForm(); err != nil {
			http.Error(w, "bad request", 400)
			return
		}
	}
	action := strings.TrimSpace(r.FormValue("action"))
	if action == "add_user" {
		if u.Role != roleAdmin {
			http.Error(w, "forbidden", 403)
			return
		}
		if err := app.store.CreateUser(r.FormValue("username"), r.FormValue("display"), r.FormValue("role"), r.FormValue("account_type"), r.FormValue("password")); err != nil {
			app.render(w, "account.html", map[string]any{"User": u, "CoverFiles": coverFiles, "Error": err.Error()})
			return
		}
		if err := app.runHugo(r.Context()); err != nil {
			log.Printf("hugo build after account create user error: %v", err)
			app.redirect(w, r, "/account?msg=用户已创建，但公开站重建失败，请看日志", http.StatusSeeOther)
			return
		}
		app.redirect(w, r, "/account?msg=用户已创建，公开站已同步", http.StatusSeeOther)
		return
	}
	if action == "profile" {
		oldProfileUser := u
		avatar := r.FormValue("avatar")
		cover := r.FormValue("cover")
		if uploaded, err := app.saveAccountImageUpload(r, u.Username, "avatar_file", "avatar"); err != nil {
			app.render(w, "account.html", map[string]any{"User": u, "CoverFiles": coverFiles, "Error": "头像上传失败：" + err.Error()})
			return
		} else if uploaded != "" {
			avatar = uploaded
		}
		if uploaded, err := app.saveAccountImageUpload(r, u.Username, "cover_file", "friend-cover"); err != nil {
			app.render(w, "account.html", map[string]any{"User": u, "CoverFiles": coverFiles, "Error": "横幅上传失败：" + err.Error()})
			return
		} else if uploaded != "" {
			cover = uploaded
		}

		if err := app.store.SaveOwnProfile(u.Username, r.FormValue("display_name"), r.FormValue("bio"), r.FormValue("homepage"), avatar, cover); err != nil {
			app.render(w, "account.html", map[string]any{"User": u, "CoverFiles": coverFiles, "Error": err.Error()})
			return
		}
		newProfileUser, _ := app.store.GetUser(u.Username)
		if err := app.syncUserProfileToFriendsJSON(oldProfileUser, newProfileUser); err != nil {
			log.Printf("sync profile to friends.json error: %v", err)
			app.render(w, "account.html", map[string]any{"User": newProfileUser, "CoverFiles": coverFiles, "Error": "个人资料已保存，但同步朋友页失败：" + err.Error()})
			return
		}
		if err := app.runHugo(r.Context()); err != nil {
			log.Printf("hugo build after profile save error: %v", err)
			app.render(w, "account.html", map[string]any{"User": newProfileUser, "CoverFiles": coverFiles, "Error": "个人资料已保存，但公开站重建失败，请看日志：" + err.Error()})
			return
		}
		app.redirect(w, r, "/?msg=个人资料已保存，公开站已重建", http.StatusSeeOther)
		return
	}
	oldPass := r.FormValue("old_password")
	newPass := r.FormValue("new_password")
	confirm := r.FormValue("confirm_password")
	if newPass != confirm {
		app.render(w, "account.html", map[string]any{"User": u, "CoverFiles": coverFiles, "Error": "两次输入的新密码不一致"})
		return
	}
	if err := app.store.ChangeOwnPassword(u.Username, oldPass, newPass); err != nil {
		app.render(w, "account.html", map[string]any{"User": u, "CoverFiles": coverFiles, "Error": err.Error()})
		return
	}
	app.redirect(w, r, "/?msg=账号密码已修改", http.StatusSeeOther)
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

func (app *App) handleAdmin(w http.ResponseWriter, r *http.Request) {
	u, _ := app.currentUser(r)
	app.render(w, "admin.html", map[string]any{
		"User":            u,
		"PendingArticles": app.store.ArticlesByStatus(stPending),
		"OtherArticles":   app.store.ArticlesExceptStatus(stPending),
		"Articles":        app.store.AllArticles(),
		"Users":           app.store.Users(),
		"PasswordResets":  app.store.PasswordResetRequests(),
		"Flash":           r.URL.Query().Get("msg"),
	})
}

func (app *App) handleNewUser(w http.ResponseWriter, r *http.Request) {
	u, _ := app.currentUser(r)
	if r.Method == http.MethodGet {
		app.render(w, "new_user.html", map[string]any{"User": u})
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
	err := app.store.CreateUser(r.FormValue("username"), r.FormValue("display"), r.FormValue("role"), r.FormValue("account_type"), r.FormValue("password"))
	if err != nil {
		app.render(w, "new_user.html", map[string]any{"User": u, "Error": err.Error()})
		return
	}
	if err := app.runHugo(r.Context()); err != nil {
		log.Printf("hugo build after create user error: %v", err)
		app.redirect(w, r, "/admin?msg=作者已创建，但公开站重建失败，请看日志", http.StatusSeeOther)
		return
	}
	app.redirect(w, r, "/admin?msg=作者已创建，公开站已同步", http.StatusSeeOther)
}

func (app *App) handleUploadArticle(w http.ResponseWriter, r *http.Request) {
	u, _ := app.currentUser(r)
	if r.Method == http.MethodGet {
		app.render(w, "upload.html", map[string]any{"User": u})
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", 405)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 1200*1024)
	if err := r.ParseMultipartForm(1200 * 1024); err != nil {
		app.render(w, "upload.html", map[string]any{"User": u, "Error": "上传失败：文件过大或表单格式错误"})
		return
	}
	file, header, err := r.FormFile("mdfile")
	if err != nil {
		app.render(w, "upload.html", map[string]any{"User": u, "Error": "请选择一个 .md 文件"})
		return
	}
	defer file.Close()
	if !strings.HasSuffix(strings.ToLower(header.Filename), ".md") && !strings.HasSuffix(strings.ToLower(header.Filename), ".markdown") {
		app.render(w, "upload.html", map[string]any{"User": u, "Error": "只允许上传 .md / .markdown 文件"})
		return
	}
	b, err := io.ReadAll(io.LimitReader(file, 1024*1024+1))
	if err != nil || len(b) > 1024*1024 {
		app.render(w, "upload.html", map[string]any{"User": u, "Error": "读取失败，或文件超过 1MB"})
		return
	}
	text := strings.TrimPrefix(string(b), "\ufeff")
	fm, body := parseFrontMatter(text)
	body = strings.TrimSpace(stripUnsafeHTML(body))
	if body == "" {
		app.render(w, "upload.html", map[string]any{"User": u, "Error": "Markdown 正文不能为空"})
		return
	}
	title := firstNonEmpty(r.FormValue("title"), fm["title"], firstMarkdownHeading(body), strings.TrimSuffix(header.Filename, filepath.Ext(header.Filename)))
	slug := slugify(firstNonEmpty(r.FormValue("slug"), fm["slug"], strings.TrimSuffix(header.Filename, filepath.Ext(header.Filename)), title))
	summary := firstNonEmpty(r.FormValue("summary"), fm["summary"], makeSummary(body))
	cover := cleanAssetPath(firstNonEmpty(r.FormValue("cover"), fm["cover"], fm["image"], fm["banner"]))
	coverMode := normalizeCoverMode(firstNonEmpty(r.FormValue("cover_mode"), fm["cover_mode"]))
	tags := splitTags(firstNonEmpty(r.FormValue("tags"), fm["tags"]))
	accountType := normalizeAccountType(u.Role, u.AccountType)
	if accountType != accountSystem {
		tags = filterProtectedNoticeTags(tags)
	}
	if title == "" || slug == "" {
		app.render(w, "upload.html", map[string]any{"User": u, "Error": "无法识别标题或 slug，请手动填写"})
		return
	}
	if app.store.SlugExists(slug, "") {
		slug = slug + "-" + newID()[:6]
	}
	a := Article{ID: newID(), Title: title, Slug: slug, Summary: summary, Cover: cover, CoverMode: coverMode, Tags: tags, Body: body, SourceMD: text, Author: u.Username, Status: stDraft, CreatedAt: time.Now()}
	uploadIntent := strings.TrimSpace(r.FormValue("upload_intent"))
	if uploadIntent == "" {
		// 兼容旧模板的按钮/复选框。
		if r.FormValue("publish_now") == "1" {
			uploadIntent = "publish"
		} else if r.FormValue("submit_after_upload") == "1" {
			uploadIntent = "submit"
		} else if u.Role != roleAdmin && r.FormValue("submit_after_upload") != "0" {
			uploadIntent = "submit"
		} else {
			uploadIntent = "draft"
		}
	}
	if uploadIntent != "draft" && uploadIntent != "submit" && uploadIntent != "publish" {
		uploadIntent = "draft"
	}
	if uploadIntent == "publish" && u.Role != roleAdmin {
		uploadIntent = "submit"
	}
	publishNow := uploadIntent == "publish" && u.Role == roleAdmin
	submitAfterUpload := uploadIntent == "submit"
	if publishNow {
		now := time.Now()
		a.Status = stPublished
		a.PublishedAt = &now
	} else if submitAfterUpload {
		a.Status = stPending
	}
	if err := app.store.SaveArticle(a); err != nil {
		http.Error(w, "保存失败: "+err.Error(), 500)
		return
	}
	if publishNow {
		if err := app.writeHugoArticle(a); err != nil {
			http.Error(w, "写入 Hugo 文章失败: "+err.Error(), 500)
			return
		}
		if err := app.runHugo(r.Context()); err != nil {
			log.Printf("hugo build after markdown upload error: %v", err)
			app.redirect(w, r, "/articles/"+a.ID+"/edit?msg=已上传并发布，但公开站重建失败，请看服务器日志", http.StatusSeeOther)
			return
		}
		app.redirect(w, r, "/articles/"+a.ID+"/edit?msg=Markdown 已上传并发布到公开站", http.StatusSeeOther)
		return
	}
	if submitAfterUpload {
		app.redirect(w, r, "/articles/"+a.ID+"/edit?msg=Markdown 已上传并进入审核队列", http.StatusSeeOther)
		return
	}
	app.redirect(w, r, "/articles/"+a.ID+"/edit?msg=Markdown 已上传到草稿箱，未提交审核", http.StatusSeeOther)
}

func (app *App) deleteArticle(w http.ResponseWriter, r *http.Request, id string, u User) {
	a, ok := app.store.GetArticle(id)
	if !ok {
		http.NotFound(w, r)
		return
	}
	// 作者只能删除自己的草稿/退回文章；管理员可以删除任何文章。
	if u.Role != roleAdmin {
		if a.Author != u.Username || !(a.Status == stDraft || a.Status == stRejected) {
			http.Error(w, "forbidden", 403)
			return
		}
	}
	if err := app.removeHugoArticle(a); err != nil {
		http.Error(w, "删除发布文件失败: "+err.Error(), 500)
		return
	}
	if err := app.store.DeleteArticle(id); err != nil {
		http.Error(w, "删除失败: "+err.Error(), 500)
		return
	}
	if err := app.runHugo(r.Context()); err != nil {
		log.Printf("hugo build after delete error: %v", err)
	}
	if u.Role == roleAdmin {
		app.redirect(w, r, "/admin?msg=文章已删除", http.StatusSeeOther)
		return
	}
	app.redirect(w, r, "/?msg=文章已删除", http.StatusSeeOther)
}

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

func (app *App) handleCleanup(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.NotFound(w, r)
		return
	}
	_ = r.ParseForm()
	mode := r.FormValue("mode")
	if mode == "drafts" {
		removed, err := app.store.DeleteArticlesByStatus(stDraft, stRejected)
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		app.redirect(w, r, fmt.Sprintf("/admin?msg=已清理 %d 篇草稿/退回文章", removed), http.StatusSeeOther)
		return
	}
	if mode == "all" {
		if err := app.store.DeleteAllArticles(); err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		_ = os.RemoveAll(app.cfg.HugoContentDir)
		_ = os.MkdirAll(app.cfg.HugoContentDir, 0755)
		_ = app.runHugo(r.Context())
		app.redirect(w, r, "/admin?msg=已清空所有文章", http.StatusSeeOther)
		return
	}
	app.redirect(w, r, "/admin?msg=未知清理操作", http.StatusSeeOther)
}

func canAccessArticle(u User, a Article) bool { return u.Role == roleAdmin || a.Author == u.Username }

func safeIntRange(raw string, min int, max int, fallback int) int {
	v := strings.TrimSpace(raw)
	if v == "" {
		return fallback
	}
	var n int
	if _, err := fmt.Sscanf(v, "%d", &n); err != nil {
		return fallback
	}
	if n < min {
		return min
	}
	if n > max {
		return max
	}
	return n
}
