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
		"editor.html",
		"media.html",
		"settings_hub.html",
		"account.html",
	} {
		if app.tpl.Lookup(name) == nil {
			t.Fatalf("template %q was not loaded", name)
		}
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
