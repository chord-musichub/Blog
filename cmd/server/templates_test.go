package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestCreatorAdminTemplatesParse(t *testing.T) {
	previousDir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chdir(filepath.Join("..", "..")); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chdir(previousDir) })

	app := newApp(Config{}, &Store{})
	for _, name := range []string{
		"home.html",
		"admin.html",
		"editor.html",
		"media.html",
		"settings_hub.html",
		"account.html",
		"creator_projects.html",
		"creator_memories.html",
		"compose_hub.html",
	} {
		if app.tpl.Lookup(name) == nil {
			t.Fatalf("template %q was not loaded", name)
		}
	}
}

func TestCreatorDataSeedsOnceThenUsesRuntimeCopy(t *testing.T) {
	previousDir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chdir(filepath.Join("..", "..")); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chdir(previousDir) })

	app := &App{cfg: Config{DataDir: t.TempDir()}}
	projects, err := app.loadProjects()
	if err != nil || len(projects) == 0 {
		t.Fatalf("seed projects = %d, err = %v", len(projects), err)
	}
	projects[0].Title = "runtime copy"
	if err := app.saveCreatorData("projects", projects); err != nil {
		t.Fatal(err)
	}
	loaded, err := app.loadProjects()
	if err != nil || loaded[0].Title != "runtime copy" {
		t.Fatalf("runtime project was not preferred: %+v, err=%v", loaded, err)
	}
	if _, err := os.Stat(filepath.Join(app.cfg.DataDir, "memories.json")); !os.IsNotExist(err) {
		t.Fatalf("unrelated creator data should not seed until requested: %v", err)
	}
}

func TestSettingsHubRendersForCreator(t *testing.T) {
	previousDir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chdir(filepath.Join("..", "..")); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chdir(previousDir) })

	app := newApp(Config{}, &Store{})
	response := httptest.NewRecorder()
	app.render(response, "settings_hub.html", map[string]any{
		"User": User{Username: "creator", Role: roleAdmin},
	})
	if response.Code != http.StatusOK {
		t.Fatalf("settings hub status = %d, body = %s", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), "账号资料") {
		t.Fatalf("settings hub did not render creator actions: %s", response.Body.String())
	}
}

func TestCreatorTopNavigationKeepsMediaInWorkspaceAndHomeUsesCompactDraftList(t *testing.T) {
	previousDir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chdir(filepath.Join("..", "..")); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chdir(previousDir) })

	app := newApp(Config{}, &Store{})
	response := httptest.NewRecorder()
	app.render(response, "home.html", map[string]any{
		"User":     User{Username: "creator", Role: roleUser},
		"Settings": defaultSiteSettings(),
		"Articles": []Article{{ID: "article-1", Title: "短稿", Status: stDraft}},
	})
	body := response.Body.String()
	if response.Code != http.StatusOK {
		t.Fatalf("home status = %d, body = %s", response.Code, body)
	}
	if strings.Contains(body, `data-admin-route="media"`) {
		t.Fatalf("creator top navigation still exposes media library: %s", body)
	}
	for _, want := range []string{"dashboard-article-list", "稿件", "短稿"} {
		if !strings.Contains(body, want) {
			t.Fatalf("home compact list missing %q: %s", want, body)
		}
	}
}

func TestMediaLibraryOffersNonDestructiveCropForExistingRasterImages(t *testing.T) {
	previousDir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chdir(filepath.Join("..", "..")); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chdir(previousDir) })

	app := newApp(Config{}, &Store{})
	response := httptest.NewRecorder()
	app.render(response, "media.html", map[string]any{
		"User":      User{Username: "creator", Role: roleUser},
		"MediaURL":  "/admin/media",
		"Settings":  defaultSiteSettings(),
		"Workspace": "media",
		"Files": []MediaFile{
			{Path: "/uploads/creator/old-photo.png", Name: "old-photo.png", Ext: "png"},
			{Path: "/uploads/creator/notes.pdf", Name: "notes.pdf", Ext: "pdf"},
		},
		"Groups": []MediaGroup{{Key: "general", Label: "通用素材", Files: []MediaFile{
			{Path: "/uploads/creator/old-photo.png", Name: "old-photo.png", Ext: "png"},
			{Path: "/uploads/creator/notes.pdf", Name: "notes.pdf", Ext: "pdf"},
		}}},
	})
	body := response.Body.String()
	if response.Code != http.StatusOK {
		t.Fatalf("media status = %d, body = %s", response.Code, body)
	}
	for _, want := range []string{"mediaCropSource0-0", "裁剪 16:9", "cover-cropper.js?v=21.0.1"} {
		if !strings.Contains(body, want) {
			t.Fatalf("media crop affordance missing %q: %s", want, body)
		}
	}
	if strings.Contains(body, "mediaCropSource0-1") {
		t.Fatalf("non-image media unexpectedly received crop control: %s", body)
	}
}

func TestProjectAndMemoryEditorsUseCurrentCropperForLegacyImages(t *testing.T) {
	previousDir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chdir(filepath.Join("..", "..")); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chdir(previousDir) })

	app := newApp(Config{}, &Store{})
	data := map[string]any{
		"User":          User{Username: "songline", Role: roleOwner},
		"Settings":      defaultSiteSettings(),
		"Workspace":     "compose",
		"WorkspacePage": "project",
		"Projects":      []Project{{Title: "旧项目", Cover: "/media/projects/old.png"}},
		"Memories":      []Memory{{Date: "2026-09", Title: "旧回忆", Image: "/media/memories/old.jpg"}},
		"Files":         []MediaFile{},
	}
	for _, name := range []string{"creator_projects.html", "creator_memories.html"} {
		if name == "creator_memories.html" {
			data["WorkspacePage"] = "memory"
		}
		response := httptest.NewRecorder()
		app.render(response, name, data)
		body := response.Body.String()
		if response.Code != http.StatusOK || !strings.Contains(body, "cover-cropper.js?v=21.0.1") || !strings.Contains(body, "data-crop-source") {
			t.Fatalf("%s did not provide the current cropper: status=%d body=%s", name, response.Code, body)
		}
	}
}

func TestComposeHubShowsCreatorContentTypesForOwner(t *testing.T) {
	previousDir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chdir(filepath.Join("..", "..")); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chdir(previousDir) })

	app := newApp(Config{}, &Store{})
	response := httptest.NewRecorder()
	app.render(response, "compose_hub.html", map[string]any{"User": User{Username: "owner", Role: roleOwner}})
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), "回忆") {
		t.Fatalf("compose hub did not render all admin types: status=%d body=%s", response.Code, response.Body.String())
	}
}

func TestCreatorPagesShareSiteBackgroundAndIdentity(t *testing.T) {
	previousDir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chdir(filepath.Join("..", "..")); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chdir(previousDir) })

	app := newApp(Config{}, &Store{})
	data := map[string]any{
		"User":     User{Username: "songline", Role: roleOwner},
		"Settings": SiteSettings{Background: BackgroundSettings{Image: "/uploads/admin/site-bg.webp", Height: "420px", Blur: "18px", Opacity: "0.38"}},
	}
	for _, name := range []string{"compose_hub.html", "creator_projects.html", "creator_memories.html"} {
		response := httptest.NewRecorder()
		app.render(response, name, data)
		body := response.Body.String()
		if response.Code != http.StatusOK {
			t.Fatalf("%s status = %d, body = %s", name, response.Code, body)
		}
		for _, want := range []string{"admin-has-site-bg", "admin-site-bg-layer", "songline · 站主"} {
			if !strings.Contains(body, want) {
				t.Fatalf("%s did not render %q: %s", name, want, body)
			}
		}
	}
}

func TestAdministratorNavigationUsesManagementWorkflow(t *testing.T) {
	previousDir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chdir(filepath.Join("..", "..")); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chdir(previousDir) })

	app := newApp(Config{}, &Store{})
	response := httptest.NewRecorder()
	app.render(response, "admin.html", map[string]any{
		"User":           User{Username: "reviewer", Role: roleAdmin},
		"ArticleGroups":  []articleAuthorGroup{},
		"Users":          []User{},
		"Messages":       []MessageRecord{},
		"PasswordResets": []PasswordResetRequest{},
	})
	body := response.Body.String()
	if response.Code != http.StatusOK {
		t.Fatalf("admin page status = %d, body = %s", response.Code, body)
	}
	for _, want := range []string{"稿件审核", "留言", "用户"} {
		if !strings.Contains(body, want) {
			t.Fatalf("admin page missing %q: %s", want, body)
		}
	}
	if strings.Contains(body, ">投稿<") || strings.Contains(body, "回主页 ↗") {
		t.Fatalf("administrator navigation leaked creator-only link: %s", body)
	}
}

func TestSettingsPagesRenderAsTwoPaneWorkspace(t *testing.T) {
	previousDir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chdir(filepath.Join("..", "..")); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chdir(previousDir) })

	app := newApp(Config{}, &Store{})
	data := map[string]any{
		"User":     User{Username: "songline", Role: roleOwner},
		"Settings": defaultSiteSettings(),
		"Theme":    defaultThemeSettings(),
	}
	for _, name := range []string{"settings_hub.html", "site_settings.html", "theme_settings.html", "manuscript_settings.html", "account.html"} {
		response := httptest.NewRecorder()
		app.render(response, name, data)
		body := response.Body.String()
		if response.Code != http.StatusOK || !strings.Contains(body, "settings-workspace") || !strings.Contains(body, "settings-sidebar") {
			t.Fatalf("%s did not render settings workspace: status=%d body=%s", name, response.Code, body)
		}
	}
}

func TestCreatorWorkspacesReuseTheTwoPaneShell(t *testing.T) {
	previousDir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chdir(filepath.Join("..", "..")); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chdir(previousDir) })

	app := newApp(Config{}, &Store{})
	data := map[string]any{
		"User":           User{Username: "songline", Role: roleOwner},
		"Settings":       defaultSiteSettings(),
		"Workspace":      "compose",
		"WorkspacePage":  "article",
		"Article":        Article{Status: stDraft},
		"Projects":       []Project{},
		"Memories":       []Memory{},
		"Files":          []MediaFile{},
		"CoverFiles":     []MediaFile{},
		"ArticleGroups":  []articleAuthorGroup{},
		"Messages":       []MessageRecord{},
		"Users":          []User{},
		"PasswordResets": []PasswordResetRequest{},
	}
	for _, name := range []string{"compose_hub.html", "media.html", "creator_projects.html", "creator_memories.html", "editor.html", "admin.html"} {
		if name == "media.html" {
			data["Workspace"] = "media"
		} else if name == "editor.html" {
			data["Workspace"] = "editor"
		} else if name == "admin.html" {
			data["Workspace"] = "admin"
		} else {
			data["Workspace"] = "compose"
		}
		response := httptest.NewRecorder()
		app.render(response, name, data)
		body := response.Body.String()
		if response.Code != http.StatusOK || !strings.Contains(body, "workspace-shell") || !strings.Contains(body, "workspace-sidebar") {
			t.Fatalf("%s did not render creator workspace: status=%d body=%s", name, response.Code, body)
		}
	}
}

func TestLegacyUploadGETRedirectsToCompose(t *testing.T) {
	app := &App{cfg: Config{}}
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/articles/upload", nil)
	app.handleUploadArticle(response, request)
	if response.Code != http.StatusSeeOther {
		t.Fatalf("legacy upload status = %d, want %d", response.Code, http.StatusSeeOther)
	}
	if got := response.Header().Get("Location"); got != "/articles/new?import=1" {
		t.Fatalf("legacy upload location = %q", got)
	}
}
