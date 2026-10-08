package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestSyncHugoPublicDataUsesBuildRootAndVisibleDataDir(t *testing.T) {
	root := t.TempDir()
	dataDir := filepath.Join(root, "shared", "data")
	if err := os.MkdirAll(filepath.Dir(runtimeDataPath(dataDir, "site.json")), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(runtimeDataPath(dataDir, "site.json"), []byte(`{"background":{"image":"/uploads/admin/background/background01.png"}}`), 0600); err != nil {
		t.Fatal(err)
	}

	buildRoot := filepath.Join(root, "release")
	if err := os.MkdirAll(buildRoot, 0755); err != nil {
		t.Fatal(err)
	}
	previousDir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chdir(buildRoot); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chdir(previousDir) })
	registry := []byte(`{"C++":{"url":"/tags/c-2/"}}`)
	legacySource := runtimeDataPath(dataDir, "tag_urls.json")
	if err := os.MkdirAll(filepath.Dir(legacySource), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(legacySource, registry, 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(buildRoot, "hugo-data"), 0755); err != nil {
		t.Fatal(err)
	}
	legacySnapshot := filepath.Join(buildRoot, "hugo-data", "tag_urls.json")
	if err := os.WriteFile(legacySnapshot, registry, 0600); err != nil {
		t.Fatal(err)
	}

	app := &App{
		cfg:   Config{DataDir: dataDir, HugoContentDir: filepath.Join(root, "shared", "content", "posts")},
		store: &Store{articles: map[string]Article{}},
	}
	if err := app.syncHugoPublicData(); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(buildRoot, "hugo-data", "site.json")); err != nil {
		t.Fatalf("public Hugo data was not written into build root: %v", err)
	}
	publicSite, err := os.ReadFile(filepath.Join(buildRoot, "hugo-data", "site.json"))
	if err != nil {
		t.Fatal(err)
	}
	var settings SiteSettings
	if err := json.Unmarshal(publicSite, &settings); err != nil {
		t.Fatal(err)
	}
	if settings.Comments != defaultCommentSettings() {
		t.Fatalf("legacy settings did not expose comment configuration: %+v", settings.Comments)
	}
	if _, err := os.Stat(filepath.Join(root, "shared", "hugo-data", "site.json")); !os.IsNotExist(err) {
		t.Fatalf("public Hugo data must not be derived from shared content root, err=%v", err)
	}
	if _, err := os.Stat(legacySnapshot); !os.IsNotExist(err) {
		t.Fatalf("retired tag registry must not be loaded into Hugo, err=%v", err)
	}
	if got, err := os.ReadFile(legacySource); err != nil || string(got) != string(registry) {
		t.Fatalf("runtime tag registry must be preserved, got=%q err=%v", got, err)
	}
	if err := app.syncHugoPublicData(); err != nil {
		t.Fatalf("cleanup must be repeatable: %v", err)
	}
}
