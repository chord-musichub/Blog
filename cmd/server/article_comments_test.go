package main

import (
	"encoding/json"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestCommentSettingsValidation(t *testing.T) {
	valid := defaultCommentSettings()
	valid.Repo = "  " + valid.Repo + "  "
	c, err := normalizeCommentSettings(valid)
	if err != nil || c.Repo != defaultCommentSettings().Repo {
		t.Fatalf("normalization: %+v %v", c, err)
	}
	for _, field := range []string{"repo", "repo_id", "category", "category_id"} {
		c = defaultCommentSettings()
		switch field {
		case "repo":
			c.Repo = "https://github.com/a/b"
		case "repo_id":
			c.RepoID = "token with spaces"
		case "category":
			c.Category = ""
		case "category_id":
			c.CategoryID = ""
		}
		if _, err := normalizeCommentSettings(c); err == nil {
			t.Errorf("accepted invalid %s", field)
		}
	}
	if _, err := normalizeCommentSettings(CommentSettings{}); err != nil {
		t.Fatal("disabled empty config must be allowed", err)
	}
}

func TestCommentsLegacySnapshotAndExplicitDisable(t *testing.T) {
	app := &App{cfg: Config{DataDir: t.TempDir()}}
	legacy := []byte(`{"site":{"title":"keep me"},"future_field":{"keep":true}}`)
	if err := os.MkdirAll(filepath.Dir(app.siteSettingsPath()), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(app.siteSettingsPath(), legacy, 0600); err != nil {
		t.Fatal(err)
	}
	data, err := app.publicSiteComments(legacy)
	if err != nil {
		t.Fatal(err)
	}
	var result struct {
		Comments CommentSettings `json:"comments"`
		Future   map[string]bool `json:"future_field"`
	}
	if err := json.Unmarshal(data, &result); err != nil {
		t.Fatal(err)
	}
	if result.Comments != defaultCommentSettings() || !result.Future["keep"] {
		t.Fatalf("snapshot dropped settings: %s", data)
	}
	if source, _ := os.ReadFile(app.siteSettingsPath()); string(source) != string(legacy) {
		t.Fatal("snapshot overwrote persisted settings")
	}
	s, _ := app.loadSiteSettings()
	s.Comments.Enabled = false
	if err := app.saveSiteSettings(s); err != nil {
		t.Fatal(err)
	}
	s, err = app.loadSiteSettings()
	if err != nil || s.Comments.Enabled {
		t.Fatalf("disable not preserved: %+v %v", s.Comments, err)
	}
	source, _ := os.ReadFile(app.siteSettingsPath())
	data, err = app.publicSiteComments(source)
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(data, &result); err != nil || result.Comments.Enabled {
		t.Fatalf("disabled snapshot: %s %v", data, err)
	}
}

func TestCommentSettingsInvalidPostDoesNotPersist(t *testing.T) {
	app, owner, _ := publicationFixture(t)
	if err := app.saveSiteSettings(defaultSiteSettings()); err != nil {
		t.Fatal(err)
	}
	before, _ := os.ReadFile(app.siteSettingsPath())
	response := httptest.NewRecorder()
	app.handleSiteSettings(response, articleRequest(app, "POST", "/admin/site", url.Values{
		"comments_present": {"1"}, "comments_enabled": {"on"}, "comments_repo": {"bad"},
	}, owner))
	if response.Code != 400 || !strings.Contains(response.Body.String(), "无需 Token") {
		t.Fatalf("invalid form status/body: %d %s", response.Code, response.Body)
	}
	after, _ := os.ReadFile(app.siteSettingsPath())
	if string(after) != string(before) {
		t.Fatal("invalid comments form changed settings")
	}
}

func TestCommentSettingsOwnerCanDisableAndOldFormPreservesChoice(t *testing.T) {
	app, owner, _ := publicationFixture(t)
	if err := app.saveSiteSettings(defaultSiteSettings()); err != nil {
		t.Fatal(err)
	}
	for _, form := range []url.Values{{"comments_present": {"1"}}, {"site_title": {"renamed site"}}} {
		response := httptest.NewRecorder()
		app.handleSiteSettings(response, articleRequest(app, "POST", "/admin/site", form, owner))
		if response.Code != 303 {
			t.Fatalf("settings save: %d %s", response.Code, response.Body)
		}
		settings, err := app.loadSiteSettings()
		if err != nil || settings.Comments.Enabled {
			t.Fatalf("disable/old form not preserved: %+v %v", settings.Comments, err)
		}
	}
}

func TestCommentBootstrapMatchesBackendDefaults(t *testing.T) {
	data, err := os.ReadFile(filepath.Join("..", "..", "assets", "bootstrap", "site.json"))
	if err != nil {
		t.Fatal(err)
	}
	var settings SiteSettings
	if err := json.Unmarshal(data, &settings); err != nil {
		t.Fatal(err)
	}
	if settings.Comments != defaultCommentSettings() {
		t.Fatalf("static/backend defaults differ: %+v", settings.Comments)
	}
}
