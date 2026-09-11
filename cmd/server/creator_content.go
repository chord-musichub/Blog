package main

import (
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
	return filepath.Join(app.cfg.DataDir, name+".json")
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
		if err := os.MkdirAll(app.cfg.DataDir, 0700); err != nil {
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
	if err := os.MkdirAll(app.cfg.DataDir, 0700); err != nil {
		return err
	}
	b, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(app.creatorDataPath(name), b, 0600)
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
	u, _ := app.currentUser(r)
	projects, err := app.loadProjects()
	if err != nil {
		http.Error(w, "读取项目失败: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if r.Method == http.MethodGet {
		app.render(w, "creator_projects.html", map[string]any{"User": u, "Projects": projects, "Files": listMediaFiles(app.userMediaDir(u.Username), userMediaPublicPrefix(u.Username)), "Flash": r.URL.Query().Get("msg")})
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
	index, _ := strconv.Atoi(r.FormValue("index"))
	action := strings.TrimSpace(r.FormValue("action"))
	if action == "delete" {
		if index < 0 || index >= len(projects) {
			http.Error(w, "项目不存在", http.StatusBadRequest)
			return
		}
		projects = append(projects[:index], projects[index+1:]...)
	} else {
		item := projectFromRequest(r)
		if item.Title == "" {
			app.render(w, "creator_projects.html", map[string]any{"User": u, "Projects": projects, "Files": listMediaFiles(app.userMediaDir(u.Username), userMediaPublicPrefix(u.Username)), "Error": "项目名称不能为空"})
			return
		}
		if action == "update" {
			if index < 0 || index >= len(projects) {
				http.Error(w, "项目不存在", http.StatusBadRequest)
				return
			}
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
		app.redirect(w, r, "/compose/projects?msg=项目已保存，但公开站构建失败，请看日志", http.StatusSeeOther)
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
	u, _ := app.currentUser(r)
	memories, err := app.loadMemories()
	if err != nil {
		http.Error(w, "读取回忆失败: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if r.Method == http.MethodGet {
		app.render(w, "creator_memories.html", map[string]any{"User": u, "Memories": memories, "Files": listMediaFiles(app.userMediaDir(u.Username), userMediaPublicPrefix(u.Username)), "Flash": r.URL.Query().Get("msg")})
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
	index, _ := strconv.Atoi(r.FormValue("index"))
	action := strings.TrimSpace(r.FormValue("action"))
	if action == "delete" {
		if index < 0 || index >= len(memories) {
			http.Error(w, "回忆不存在", http.StatusBadRequest)
			return
		}
		memories = append(memories[:index], memories[index+1:]...)
	} else {
		item := memoryFromRequest(r)
		if item.Date == "" || item.Title == "" {
			app.render(w, "creator_memories.html", map[string]any{"User": u, "Memories": memories, "Files": listMediaFiles(app.userMediaDir(u.Username), userMediaPublicPrefix(u.Username)), "Error": "年月和标题不能为空"})
			return
		}
		if action == "update" {
			if index < 0 || index >= len(memories) {
				http.Error(w, "回忆不存在", http.StatusBadRequest)
				return
			}
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
		app.redirect(w, r, "/compose/memories?msg=回忆已保存，但公开站构建失败，请看日志", http.StatusSeeOther)
		return
	}
	app.redirect(w, r, "/compose/memories?msg=回忆已保存并更新公开站", http.StatusSeeOther)
}

func memoryFromRequest(r *http.Request) Memory {
	return Memory{Date: strings.TrimSpace(r.FormValue("date")), Title: strings.TrimSpace(r.FormValue("title")), Image: cleanPublicPath(r.FormValue("image")), Description: strings.TrimSpace(r.FormValue("description"))}
}

func creatorContentSummary(items int, kind string) string {
	return fmt.Sprintf("%d 条%s", items, kind)
}
