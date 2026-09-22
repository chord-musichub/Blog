package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Classification is metadata, not a move: existing public image URLs stay valid.
// Bind each override to the file revision so deleting and re-uploading the same
// name does not accidentally inherit a previous file's category.
type mediaCategoryOverride struct {
	Category string    `json:"category"`
	Size     int64     `json:"size"`
	Modified time.Time `json:"modified"`
}

func (app *App) mediaCategoriesPath(owner string) string {
	return filepath.Join(app.cfg.DataDir, "media-categories", mediaOwner(owner)+".json")
}

func (app *App) readMediaCategories(owner string) (map[string]mediaCategoryOverride, error) {
	values := map[string]mediaCategoryOverride{}
	err := readJSONFile(app.mediaCategoriesPath(owner), &values)
	if values == nil {
		values = map[string]mediaCategoryOverride{}
	}
	return values, err
}

func (value mediaCategoryOverride) matches(file string) bool {
	info, err := os.Lstat(file)
	return err == nil && info.Mode().IsRegular() && info.Size() == value.Size && info.ModTime().Equal(value.Modified)
}

func mediaCategoryOptions(media mediaLibraryContext) []MediaGroup {
	keys := []string{"general", "articles", "profile"}
	if isOwner(media.user) {
		keys = append(keys, "projects", "memories")
	}
	if media.owner == siteMediaOwner {
		keys = append(keys, "friends", "site", "backgrounds", "tools")
	}
	options := make([]MediaGroup, 0, len(keys))
	for _, key := range keys {
		options = append(options, MediaGroup{Key: key, Label: mediaCategoryLabels[key]})
	}
	return options
}

func (app *App) categorizedMediaFiles(owner string) []MediaFile {
	app.mediaMu.RLock()
	defer app.mediaMu.RUnlock()
	dir := app.userMediaDir(owner)
	files := listMediaFiles(dir, userMediaPublicPrefix(owner))
	values, err := app.readMediaCategories(owner)
	if err != nil {
		log.Printf("read media categories for %s: %v", owner, err)
		return files
	}
	for i := range files {
		value, ok := values[files[i].Name]
		if ok && value.matches(filepath.Join(dir, files[i].Name)) {
			files[i].Category = normalizedMediaCategory(value.Category)
		}
	}
	return files
}

// Caller holds mediaMu. Keep overrides for existing files only.
func (app *App) writeMediaCategory(media mediaLibraryContext, name, category string) error {
	values, err := app.readMediaCategories(media.owner)
	if err != nil {
		return err
	}
	info, err := os.Lstat(filepath.Join(media.dir, name))
	if err != nil {
		return err
	}
	if !info.Mode().IsRegular() {
		return fmt.Errorf("只能分类普通媒体文件")
	}
	for key, value := range values {
		if !validMediaRelativeName(key) || !value.matches(filepath.Join(media.dir, key)) {
			delete(values, key)
		}
	}
	values[filepath.ToSlash(name)] = mediaCategoryOverride{Category: category, Size: info.Size(), Modified: info.ModTime()}
	return writeJSONFile(app.mediaCategoriesPath(media.owner), values, 0600)
}

// A renamed image or derived crop keeps its manually selected category.
// Caller holds mediaMu; no metadata is created for uncategorized images.
func (app *App) copyMediaCategory(media mediaLibraryContext, source, target string) error {
	values, err := app.readMediaCategories(media.owner)
	if err != nil {
		return err
	}
	value, ok := values[filepath.ToSlash(source)]
	if !ok || !value.matches(filepath.Join(media.dir, source)) {
		return nil
	}
	return app.writeMediaCategory(media, target, value.Category)
}

func (app *App) categorizeMediaFile(w http.ResponseWriter, r *http.Request, media mediaLibraryContext) {
	name, err := isMediaPathOwnedBy(media.owner, r.FormValue("old_path"))
	if err != nil {
		http.Error(w, "只能修改当前媒体库中文件的分类", http.StatusForbidden)
		return
	}
	category := strings.TrimSpace(r.FormValue("category"))
	allowed := false
	for _, option := range mediaCategoryOptions(media) {
		allowed = allowed || option.Key == category
	}
	if !allowed {
		http.Error(w, "无效的素材分类", http.StatusBadRequest)
		return
	}
	app.mediaMu.Lock()
	err = app.writeMediaCategory(media, name, category)
	app.mediaMu.Unlock()
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		app.renderMediaLibrary(w, r, media, map[string]any{"Error": "修改分类失败：" + err.Error()})
		return
	}
	app.redirect(w, r, mediaLibraryURL(media, "分类已更新，图片路径保持不变"), http.StatusSeeOther)
}
