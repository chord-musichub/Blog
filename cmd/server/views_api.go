package main

import (
	"encoding/json"
	"log"
	"net/http"
	"net/url"
	"path/filepath"
	"strings"
)

// viewAPIResponse 是公开阅读量接口的响应结构。
type viewAPIResponse struct {
	Path  string `json:"path"`
	Views int    `json:"views"`
}

func (app *App) viewsPath() string {
	return filepath.Join(app.cfg.DataDir, "views.json")
}

func cleanViewPath(raw string) string {
	v := strings.TrimSpace(raw)
	if v == "" {
		return ""
	}
	if strings.HasPrefix(v, "http://") || strings.HasPrefix(v, "https://") {
		if u, err := url.Parse(v); err == nil {
			v = u.Path
		}
	}
	if !strings.HasPrefix(v, "/") {
		v = "/" + v
	}
	if strings.Contains(v, "..") || strings.Contains(v, "\\") {
		return ""
	}
	if len(v) > 240 {
		return ""
	}
	return v
}

func (app *App) loadViews() map[string]int {
	out := map[string]int{}
	if err := readJSONFile(app.viewsPath(), &out); err != nil {
		log.Printf("load views error: %v", err)
		return out
	}
	return out
}

func (app *App) saveViews(v map[string]int) error {
	return writeJSONFile(app.viewsPath(), v, 0600)
}

func (app *App) handleViewsAPI(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	path := cleanViewPath(r.URL.Query().Get("path"))
	if path == "" {
		http.Error(w, `{"error":"bad path"}`, http.StatusBadRequest)
		return
	}
	app.viewsMu.Lock()
	defer app.viewsMu.Unlock()

	views := app.loadViews()
	switch r.Method {
	case http.MethodGet:
		_ = json.NewEncoder(w).Encode(viewAPIResponse{Path: path, Views: views[path]})
	case http.MethodPost:
		views[path]++
		if err := app.saveViews(views); err != nil {
			log.Printf("save views error: %v", err)
			http.Error(w, `{"error":"save failed"}`, http.StatusInternalServerError)
			return
		}
		_ = json.NewEncoder(w).Encode(viewAPIResponse{Path: path, Views: views[path]})
	default:
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
	}
}
