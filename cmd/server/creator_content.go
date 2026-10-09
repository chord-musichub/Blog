package main

import (
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// Project and Memory are the public site's small, creator-maintained records.
// They deliberately keep the JSON keys used by the existing Hugo templates so
// old asset data and already-published links remain compatible.
type Project struct {
	Title       string   `json:"title"`
	Description string   `json:"description"`
	Year        string   `json:"year"`
	Status      string   `json:"status"`
	Role        string   `json:"role"`
	Stack       []string `json:"stack"`
	Cover       string   `json:"cover"`
	GitHub      string   `json:"github"`
	Demo        string   `json:"demo"`
	Route       string   `json:"route"`
}

type Memory struct {
	Date        string `json:"date"`
	Title       string `json:"title"`
	Image       string `json:"image"`
	Description string `json:"description"`
}

func (app *App) creatorDataPath(name string) string {
	return runtimeDataPath(app.cfg.DataDir, name+".json")
}

// loadCreatorData reads the persistent data volume first. On an installation
// that predates the manager, it makes a one-time copy from assets/data so
// deploying this version cannot make existing public projects or memories
// disappear. The copied file is then the single editable source of truth.
func (app *App) loadCreatorData(name string, target any) error {
	path := app.creatorDataPath(name)
	b, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		seed, seedErr := os.ReadFile(filepath.Join("assets", "data", name+".json"))
		if seedErr != nil {
			if errors.Is(seedErr, os.ErrNotExist) {
				seed = []byte("[]")
			} else {
				return seedErr
			}
		}
		if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
			return err
		}
		if err := os.WriteFile(path, seed, 0600); err != nil {
			return err
		}
		b = seed
	} else if err != nil {
		return err
	}
	if len(strings.TrimSpace(string(b))) == 0 {
		b = []byte("[]")
	}
	return json.Unmarshal(b, target)
}

func (app *App) saveCreatorData(name string, value any) error {
	return writeJSONFile(app.creatorDataPath(name), value, 0600)
}

// A snapshot key prevents stale row positions from deleting a different record,
// including identical adjacent entries, without changing the persistent format.
func creatorEntryKey(value any) string {
	b, _ := json.Marshal(value)
	return fmt.Sprintf("%x", sha256.Sum256(b))
}

func (app *App) loadProjects() ([]Project, error) {
	var projects []Project
	if err := app.loadCreatorData("projects", &projects); err != nil {
		return nil, err
	}
	if projects == nil {
		projects = []Project{}
	}
	return projects, nil
}

func (app *App) loadMemories() ([]Memory, error) {
	var memories []Memory
	if err := app.loadCreatorData("memories", &memories); err != nil {
		return nil, err
	}
	if memories == nil {
		memories = []Memory{}
	}
	return memories, nil
}

func (app *App) ensureCreatorContentData() error {
	if _, err := app.loadProjects(); err != nil {
		return err
	}
	_, err := app.loadMemories()
	return err
}

func (app *App) handleCreatorProjects(w http.ResponseWriter, r *http.Request) {
	app.creatorMu.Lock()
	defer app.creatorMu.Unlock()
	u, _ := app.currentUser(r)
	if err := app.ensureCreatorContentData(); err != nil {
		http.Error(w, "初始化项目资料失败: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if err := app.ensureCanonicalMediaLayout(); err != nil {
		http.Error(w, "迁移项目媒体失败: "+err.Error(), http.StatusInternalServerError)
		return
	}
	projects, err := app.loadProjects()
	if err != nil {
		http.Error(w, "读取项目失败: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if r.Method == http.MethodGet {
		app.render(w, "creator_projects.html", map[string]any{"User": u, "Projects": projects, "Files": listMediaFiles(app.userMediaDir(u.Username), userMediaPublicPrefix(u.Username)), "Flash": r.URL.Query().Get("msg"), "Workspace": "compose", "WorkspacePage": "project"})
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if err := r.ParseForm(); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	index, indexErr := strconv.Atoi(r.FormValue("index"))
	action := strings.TrimSpace(r.FormValue("action"))
	if (action == "delete" || action == "update") && (indexErr != nil || index < 0 || index >= len(projects)) {
		http.Error(w, "项目不存在，请刷新列表", http.StatusBadRequest)
		return
	}
	if action == "delete" {
		if r.FormValue("list_key") != creatorEntryKey(projects) {
			http.Error(w, "项目列表已变化，请刷新后再删除", http.StatusConflict)
			return
		}
		projects = append(projects[:index], projects[index+1:]...)
	} else {
		item := projectFromRequest(r)
		if item.Title == "" {
			app.render(w, "creator_projects.html", map[string]any{"User": u, "Projects": projects, "Files": listMediaFiles(app.userMediaDir(u.Username), userMediaPublicPrefix(u.Username)), "Error": "项目名称不能为空", "Workspace": "compose", "WorkspacePage": "project"})
			return
		}
		if action == "update" {
			projects[index] = item
		} else {
			projects = append(projects, item)
		}
	}
	if err := app.saveCreatorData("projects", projects); err != nil {
		http.Error(w, "保存项目失败: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if err := app.runHugo(r.Context()); err != nil {
		if action == "delete" {
			app.redirect(w, r, "/compose/projects?msg=项目已删除，但公开站构建失败，请看日志", http.StatusSeeOther)
			return
		}
		app.redirect(w, r, "/compose/projects?msg=项目已保存，但公开站构建失败，请看日志", http.StatusSeeOther)
		return
	}
	if action == "delete" {
		app.redirect(w, r, "/compose/projects?msg=项目已删除并更新公开站", http.StatusSeeOther)
		return
	}
	app.redirect(w, r, "/compose/projects?msg=项目已保存并更新公开站", http.StatusSeeOther)
}

func projectFromRequest(r *http.Request) Project {
	return Project{
		Title: strings.TrimSpace(r.FormValue("title")), Description: strings.TrimSpace(r.FormValue("description")),
		Year: strings.TrimSpace(r.FormValue("year")), Status: strings.TrimSpace(r.FormValue("status")),
		Role: strings.TrimSpace(r.FormValue("role")), Stack: splitTags(r.FormValue("stack")),
		Cover: cleanPublicPath(r.FormValue("cover")), GitHub: strings.TrimSpace(r.FormValue("github")),
		Demo: strings.TrimSpace(r.FormValue("demo")), Route: strings.TrimSpace(r.FormValue("route")),
	}
}

func (app *App) handleCreatorMemories(w http.ResponseWriter, r *http.Request) {
	app.creatorMu.Lock()
	defer app.creatorMu.Unlock()
	u, _ := app.currentUser(r)
	if err := app.ensureCreatorContentData(); err != nil {
		http.Error(w, "初始化回忆资料失败: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if err := app.ensureCanonicalMediaLayout(); err != nil {
		http.Error(w, "迁移回忆媒体失败: "+err.Error(), http.StatusInternalServerError)
		return
	}
	memories, err := app.loadMemories()
	if err != nil {
		http.Error(w, "读取回忆失败: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if r.Method == http.MethodGet {
		app.render(w, "creator_memories.html", map[string]any{"User": u, "Memories": memories, "Files": listMediaFiles(app.userMediaDir(u.Username), userMediaPublicPrefix(u.Username)), "Flash": r.URL.Query().Get("msg"), "Workspace": "compose", "WorkspacePage": "memory"})
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if err := r.ParseForm(); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	index, indexErr := strconv.Atoi(r.FormValue("index"))
	action := strings.TrimSpace(r.FormValue("action"))
	if (action == "delete" || action == "update") && (indexErr != nil || index < 0 || index >= len(memories)) {
		http.Error(w, "回忆不存在，请刷新列表", http.StatusBadRequest)
		return
	}
	if action == "delete" {
		if r.FormValue("list_key") != creatorEntryKey(memories) {
			http.Error(w, "回忆列表已变化，请刷新后再删除", http.StatusConflict)
			return
		}
		memories = append(memories[:index], memories[index+1:]...)
	} else {
		item := memoryFromRequest(r)
		if item.Date == "" || item.Title == "" {
			app.render(w, "creator_memories.html", map[string]any{"User": u, "Memories": memories, "Files": listMediaFiles(app.userMediaDir(u.Username), userMediaPublicPrefix(u.Username)), "Error": "年月和标题不能为空", "Workspace": "compose", "WorkspacePage": "memory"})
			return
		}
		if action == "update" {
			memories[index] = item
		} else {
			memories = append(memories, item)
		}
	}
	if err := app.saveCreatorData("memories", memories); err != nil {
		http.Error(w, "保存回忆失败: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if err := app.runHugo(r.Context()); err != nil {
		if action == "delete" {
			app.redirect(w, r, "/compose/memories?msg=回忆已删除，但公开站构建失败，请看日志", http.StatusSeeOther)
			return
		}
		app.redirect(w, r, "/compose/memories?msg=回忆已保存，但公开站构建失败，请看日志", http.StatusSeeOther)
		return
	}
	if action == "delete" {
		app.redirect(w, r, "/compose/memories?msg=回忆已删除并更新公开站", http.StatusSeeOther)
		return
	}
	app.redirect(w, r, "/compose/memories?msg=回忆已保存并更新公开站", http.StatusSeeOther)
}

func memoryFromRequest(r *http.Request) Memory {
	return Memory{Date: strings.TrimSpace(r.FormValue("date")), Title: strings.TrimSpace(r.FormValue("title")), Image: cleanPublicPath(r.FormValue("image")), Description: strings.TrimSpace(r.FormValue("description"))}
}
