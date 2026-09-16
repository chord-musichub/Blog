package main

import (
	"bytes"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func creatorCenterFixture(role string) map[string]any {
	user := User{Username: "demo_creator", DisplayName: "示例创作者", Role: role}
	cover := "/uploads/songline/markdown.png"
	files := []MediaFile{{Path: cover, Name: "markdown.png", Ext: "png"}}
	articles := make([]Article, 12)
	for i := range articles {
		articles[i] = Article{ID: fmt.Sprintf("demo-%d", i), Title: fmt.Sprintf("创作记录 %02d · 记录生活中的灵感", i+1), Author: user.Username, Status: []string{stDraft, stPublished, stPending, stRejected}[i%4], UpdatedAt: time.Date(2026, 9, 12, 10, 0, 0, 0, time.UTC), Body: "## 新的开始\n\n这是一篇 **示例文章**。\n\n> 记录灵感，也记录生活。", Summary: "记录生活中的灵感。"}
	}
	articles[0].Cover = cover
	return map[string]any{"User": user, "Settings": defaultSiteSettings(), "Theme": defaultThemeSettings(), "Articles": articles, "Article": articles[0], "IsDashboard": true,
		"ArticleGroups": []map[string]any{{"DisplayName": user.DisplayName, "Username": user.Username, "Articles": articles}},
		"Files":         files, "CoverFiles": files, "Groups": []MediaGroup{{Key: "general", Label: "通用素材", Files: files}}, "Messages": []MessageRecord{},
		"Users": []User{user}, "Projects": []Project{{Title: "个人网站", Year: "2026", Description: "记录与分享", Stack: []string{"Go", "Hugo"}}},
		"Memories": []Memory{{Title: "新的开始", Date: "2026-09", Description: "记录值得珍藏的瞬间"}, {Title: "夏日", Date: "2026-08"}},
	}
}

func TestCreatorCenterRoleShellAndPages(t *testing.T) {
	previous, _ := os.Getwd()
	if err := os.Chdir(filepath.Join("..", "..")); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chdir(previous) })
	app := newApp(Config{AdminBasePath: "/write"}, &Store{})
	for _, role := range []string{roleUser, roleOwner, roleAdmin} {
		data := creatorCenterFixture(role)
		for _, page := range []string{"home.html", "editor.html", "account.html", "settings_hub.html", "admin.html", "media.html", "creator_projects.html", "creator_memories.html", "new_user.html", "site_settings.html", "theme_settings.html", "manuscript_settings.html"} {
			var body bytes.Buffer
			if err := app.tpl.ExecuteTemplate(&body, page, data); err != nil {
				t.Fatalf("%s / %s: %v", role, page, err)
			}
			html := body.String()
			if !strings.Contains(html, "creator-center.css?v=22.9.2") || strings.Contains(html, "href=\"/static/style.css") {
				t.Fatalf("%s must use exactly the new style entry", page)
			}
			if !strings.Contains(html, `data-base="/write/"`) {
				t.Fatalf("missing prefixed navigation: %s", page)
			}
			if role != roleOwner && strings.Contains(html, `data-cc-page="memories"`) {
				t.Fatalf("%s sees owner-only navigation", role)
			}
			if role == roleAdmin && strings.Contains(html, `class="rail-publish btn"`) {
				t.Fatal("administrator must not have a publish entry")
			}
		}
	}
}

func TestCreatorCenterSaveSubmitAndOwnership(t *testing.T) {
	root := t.TempDir()
	store := &Store{dataDir: root, users: map[string]User{}, articles: map[string]Article{}, resets: map[string]PasswordResetRequest{}}
	app := &App{cfg: Config{DataDir: root, AdminBasePath: "/write"}, store: store}
	user := User{Username: "alice", Role: roleUser}
	form := url.Values{"title": {"My story"}, "body": {"## Hello\n\nA story."}, "summary": {"Short summary"}, "tags": {"life,notes"}, "cover": {"/uploads/alice/articles/cover.png"}, "cover_mode": {"contain"}, "intent": {"save"}}
	post := func(id string, u User) *httptest.ResponseRecorder {
		r := httptest.NewRequest(http.MethodPost, "/articles/new", strings.NewReader(form.Encode()))
		r.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		w := httptest.NewRecorder()
		app.createOrUpdateArticle(w, r, id, u)
		return w
	}
	if w := post("", user); w.Code != http.StatusSeeOther {
		t.Fatalf("save failed: %d %s", w.Code, w.Body.String())
	}
	articles := store.ArticlesByAuthor("alice")
	if len(articles) != 1 {
		t.Fatal("draft not saved")
	}
	a := articles[0]
	if a.Status != stDraft || a.Cover != form.Get("cover") || a.CoverMode != "contain" || a.Body != form.Get("body") {
		t.Fatalf("editor fields lost: %+v", a)
	}
	form.Set("intent", "submit")
	if w := post(a.ID, user); w.Code != http.StatusSeeOther {
		t.Fatalf("submit failed: %d", w.Code)
	}
	a, _ = store.GetArticle(a.ID)
	if a.Status != stPending {
		t.Fatal("submit did not enter review")
	}
	if w := post(a.ID, User{Username: "bob", Role: roleUser}); w.Code != http.StatusForbidden {
		t.Fatal("another member can edit this draft")
	}
	if w := post("", User{Username: "moderator", Role: roleAdmin}); w.Code != http.StatusForbidden {
		t.Fatal("administrator can create a new submission")
	}
}

func TestCreatorCenterIdentityAndConsolidatedSettings(t *testing.T) {
	previous, _ := os.Getwd()
	if err := os.Chdir(filepath.Join("..", "..")); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chdir(previous) })
	app := newApp(Config{AdminBasePath: "/write"}, &Store{})
	for _, role := range []string{roleUser, roleOwner, roleAdmin} {
		data := creatorCenterFixture(role)
		var body bytes.Buffer
		if err := app.tpl.ExecuteTemplate(&body, "account.html", data); err != nil {
			t.Fatal(err)
		}
		html := body.String()
		for _, expected := range []string{`src="/uploads/admin/logo/main_logo.png"`, `src="` + defaultUserAvatar + `"`, `data-backend-base="/write/"`} {
			if !strings.Contains(html, expected) {
				t.Fatalf("%s missing %s", role, expected)
			}
		}
		if strings.Contains(html, "settings-tree-group") || strings.Contains(html, `name="action" value="add_user"`) {
			t.Fatalf("%s still has redundant settings levels or account creation", role)
		}
		if role != roleOwner && strings.Contains(html, `class="settings-sidebar"`) {
			t.Fatal("non-owner sees unnecessary settings categories")
		}
	}
	data := creatorCenterFixture(roleUser)
	u := data["User"].(User)
	u.Avatar = "/uploads/demo_creator/profile/avatar.webp"
	data["User"] = u
	var body bytes.Buffer
	if err := app.tpl.ExecuteTemplate(&body, "home.html", data); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(body.String(), `src="`+u.Avatar+`"`) {
		t.Fatal("custom avatar not rendered")
	}
	body.Reset()
	if err := app.tpl.ExecuteTemplate(&body, "login.html", data); err != nil {
		t.Fatal(err)
	}
	for _, expected := range []string{`class="auth-home-link"`, `class="login-options"`, `class="password-request-link"`, `data-document-transition`} {
		if !strings.Contains(body.String(), expected) {
			t.Fatalf("login missing %s", expected)
		}
	}
	body.Reset()
	if err := app.tpl.ExecuteTemplate(&body, "site_settings.html", creatorCenterFixture(roleOwner)); err != nil {
		t.Fatal(err)
	}
	for _, retired := range []string{`name="orbit_title"`, `name="intro_body"`, `name="about_body"`, `name="posts_hero_title"`, `name="tools_hero_title"`} {
		if strings.Contains(body.String(), retired) {
			t.Fatalf("retired control exposed: %s", retired)
		}
	}
	w := httptest.NewRecorder()
	app.handleSettingsHub(w, httptest.NewRequest(http.MethodGet, "/settings?msg=saved", nil))
	if w.Code != http.StatusSeeOther || w.Header().Get("Location") != "/write/account?msg=saved" {
		t.Fatal("legacy settings entry does not go straight to profile")
	}
}

// Opt-in, loopback-only visual fixture. No authentication bypass or write route is
// registered in the application; these pages use synthetic data only.
// CREATOR_CENTER_PREVIEW=1 go test ./cmd/server -run TestCreatorCenterVisualPreview -timeout 30m
func TestCreatorCenterVisualPreview(t *testing.T) {
	if os.Getenv("CREATOR_CENTER_PREVIEW") != "1" {
		t.Skip("visual preview is opt-in")
	}
	previous, _ := os.Getwd()
	if err := os.Chdir(filepath.Join("..", "..")); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chdir(previous) })
	mux := http.NewServeMux()
	mux.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.Dir("web/static"))))
	mux.Handle("/uploads/", http.FileServer(http.Dir("static")))
	mux.HandleFunc("/write/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "只读预览，不保存数据", http.StatusMethodNotAllowed)
			return
		}
		role := r.URL.Query().Get("role")
		if role == "" {
			role = roleOwner
		}
		data := creatorCenterFixture(role)
		pages := map[string]string{"/write/": "home.html", "/write/articles/new": "editor.html", "/write/settings": "settings_hub.html", "/write/account": "account.html", "/write/admin": "admin.html", "/write/admin/media": "media.html", "/write/compose/projects": "creator_projects.html", "/write/compose/memories": "creator_memories.html", "/write/users/new": "new_user.html", "/write/admin/site": "site_settings.html", "/write/admin/theme": "theme_settings.html", "/write/settings/manuscript": "manuscript_settings.html"}
		page, ok := pages[r.URL.Path]
		if !ok {
			http.NotFound(w, r)
			return
		}
		data["IsDashboard"] = page == "home.html"
		var body bytes.Buffer
		// Reload templates while refining the UI; production still uses cached templates.
		app := newApp(Config{AdminBasePath: "/write"}, &Store{})
		if err := app.tpl.ExecuteTemplate(&body, page, data); err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write(body.Bytes())
	})
	t.Log("Read-only creator preview: http://127.0.0.1:8091/write/")
	server := &http.Server{Addr: "127.0.0.1:8091", Handler: mux, ReadHeaderTimeout: 5 * time.Second}
	t.Fatal(server.ListenAndServe())
}
