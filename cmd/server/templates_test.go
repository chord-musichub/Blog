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
	if !strings.Contains(response.Body.String(), "账号与资料") {
		t.Fatalf("settings hub did not render creator actions: %s", response.Body.String())
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
