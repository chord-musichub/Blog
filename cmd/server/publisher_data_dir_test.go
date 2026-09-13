package main

import (
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
	if _, err := os.Stat(filepath.Join(root, "shared", "hugo-data", "site.json")); !os.IsNotExist(err) {
		t.Fatalf("public Hugo data must not be derived from shared content root, err=%v", err)
	}
}
