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
)

// 登录、账号资料、个人文章入口和密码申请处理器。

func (app *App) handleNewArticle(w http.ResponseWriter, r *http.Request) {
	u, _ := app.currentUser(r)
	if r.Method == http.MethodGet {
		a := Article{Author: u.Username, Status: stDraft}
		app.render(w, "editor.html", map[string]any{"User": u, "Article": a, "Mode": "new", "CoverFiles": listMediaFiles(app.userMediaDir(u.Username), userMediaPublicPrefix(u.Username))})
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
	dir := app.userMediaDir(owner)
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
	coverFiles := listMediaFiles(app.userMediaDir(u.Username), userMediaPublicPrefix(u.Username))
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
