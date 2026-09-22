package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestCanonicalMediaMigrationCopiesLegacyAssetsAndRewritesRuntimeData(t *testing.T) {
	root := t.TempDir()
	previousDir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chdir(root); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chdir(previousDir) })
	if err := os.MkdirAll(filepath.Join("static", "media", "projects"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join("static", "media", "projects", "cover.png"), []byte("legacy"), 0644); err != nil {
		t.Fatal(err)
	}
	dataDir := filepath.Join(root, "data")
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Dir(runtimeDataPath(dataDir, "projects.json")), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(runtimeDataPath(dataDir, "projects.json"), []byte(`[{"cover":"/media/projects/cover.png"}]`), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Dir(runtimeDataPath(dataDir, "site.json")), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(runtimeDataPath(dataDir, "site.json"), []byte(`{"site":{"logo_icon":"/uploads/admin/main_logo.png"},"home":{"hero_image":"/uploads/admin/show.png"}}`), 0600); err != nil {
		t.Fatal(err)
	}
	app := &App{cfg: Config{DataDir: dataDir}}
	if err := app.ensureCanonicalMediaLayout(); err != nil {
		t.Fatal(err)
	}
	target := filepath.Join(dataDir, "media", "admin", "projects", "cover.png")
	if got, err := os.ReadFile(target); err != nil || string(got) != "legacy" {
		t.Fatalf("migrated asset = %q, %v", got, err)
	}
	updated, err := os.ReadFile(runtimeDataPath(dataDir, "projects.json"))
	if err != nil || !strings.Contains(string(updated), "/uploads/admin/projects/cover.png") {
		t.Fatalf("runtime reference not migrated: %q, %v", updated, err)
	}
	site, err := os.ReadFile(runtimeDataPath(dataDir, "site.json"))
	if err != nil || !strings.Contains(string(site), "/uploads/admin/logo/main_logo.png") || !strings.Contains(string(site), "/uploads/admin/background/qiandai_background.png") {
		t.Fatalf("admin asset references not migrated: %q, %v", site, err)
	}
}

func TestCanonicalMediaSeedAddsBundledFilesWithoutOverwritingRuntimeUpload(t *testing.T) {
	root := t.TempDir()
	previousDir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chdir(root); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chdir(previousDir) })
	bundled := filepath.Join(root, "static", "uploads", "admin", "projects", "cover.png")
	if err := os.MkdirAll(filepath.Dir(bundled), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(bundled, []byte("repository"), 0644); err != nil {
		t.Fatal(err)
	}
	dataDir := filepath.Join(root, "data")
	app := &App{cfg: Config{DataDir: dataDir}}
	if err := app.ensureCanonicalMediaLayout(); err != nil {
		t.Fatal(err)
	}
	target := filepath.Join(dataDir, "media", "admin", "projects", "cover.png")
	if got, err := os.ReadFile(target); err != nil || string(got) != "repository" {
		t.Fatalf("bundled media seed = %q, %v", got, err)
	}
	if err := os.WriteFile(target, []byte("server-upload"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := app.ensureCanonicalMediaLayout(); err != nil {
		t.Fatal(err)
	}
	if got, err := os.ReadFile(target); err != nil || string(got) != "server-upload" {
		t.Fatalf("existing runtime media was overwritten: %q, %v", got, err)
	}
}

func TestBundledMediaTombstonePreventsReseedAndPublicFallback(t *testing.T) {
	root := t.TempDir()
	previousDir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chdir(root); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chdir(previousDir) })

	bundled := filepath.Join(root, "static", "uploads", "admin", "projects", "cover.png")
	if err := os.MkdirAll(filepath.Dir(bundled), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(bundled, []byte("repository"), 0644); err != nil {
		t.Fatal(err)
	}
	app := &App{cfg: Config{DataDir: filepath.Join(root, "data")}}
	if err := app.ensureCanonicalMediaLayout(); err != nil {
		t.Fatal(err)
	}
	target := filepath.Join(app.mediaRootDir(), "admin", "projects", "cover.png")
	if err := os.Remove(target); err != nil {
		t.Fatal(err)
	}
	if err := app.markMediaTombstone("admin", filepath.Join("projects", "cover.png")); err != nil {
		t.Fatal(err)
	}
	if err := app.ensureCanonicalMediaLayout(); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(target); !os.IsNotExist(err) {
		t.Fatalf("deleted bundled media was seeded again: %v", err)
	}

	response := httptest.NewRecorder()
	app.handlePublicMedia(response, httptest.NewRequest(http.MethodGet, "/uploads/admin/projects/cover.png", nil))
	if response.Code != http.StatusNotFound {
		t.Fatalf("tombstoned bundled media status = %d, want %d", response.Code, http.StatusNotFound)
	}
}

func TestLegacyRuntimeStaticFilesMoveIntoDataWithoutOverwrite(t *testing.T) {
	root := t.TempDir()
	previousDir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chdir(root); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chdir(previousDir) })
	legacyRoot := filepath.Join(root, "shared", "static")
	legacyMedia := filepath.Join(legacyRoot, "uploads", "writer", "cover.png")
	legacyMarkdown := filepath.Join(legacyRoot, "md-source", "story.md")
	if err := os.MkdirAll(filepath.Dir(legacyMedia), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Dir(legacyMarkdown), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(legacyMedia, []byte("legacy-media"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(legacyRoot, "uploads", "writer", "new.png"), []byte("legacy-new"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(legacyMarkdown, []byte("legacy-markdown"), 0644); err != nil {
		t.Fatal(err)
	}
	dataDir := filepath.Join(root, "data")
	if err := os.MkdirAll(filepath.Join(dataDir, "media", "writer"), 0755); err != nil {
		t.Fatal(err)
	}
	targetMedia := filepath.Join(dataDir, "media", "writer", "cover.png")
	if err := os.WriteFile(targetMedia, []byte("runtime-media"), 0644); err != nil {
		t.Fatal(err)
	}
	app := &App{cfg: Config{DataDir: dataDir, LegacyRuntimeStaticDir: legacyRoot}}
	if err := app.migrateLegacyRuntimeData(); err != nil {
		t.Fatal(err)
	}
	if got, err := os.ReadFile(targetMedia); err != nil || string(got) != "runtime-media" {
		t.Fatalf("runtime media was overwritten: %q, %v", got, err)
	}
	if got, err := os.ReadFile(filepath.Join(dataDir, "media", "writer", "new.png")); err != nil || string(got) != "legacy-new" {
		t.Fatalf("legacy media migration = %q, %v", got, err)
	}
	if got, err := os.ReadFile(filepath.Join(dataDir, "md-source", "story.md")); err != nil || string(got) != "legacy-markdown" {
		t.Fatalf("legacy markdown migration = %q, %v", got, err)
	}
}

func TestPublicSnapshotSeedsOnlyMissingPublicData(t *testing.T) {
	root := t.TempDir()
	previousDir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chdir(root); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chdir(previousDir) })
	if err := os.MkdirAll(filepath.Join("assets", "bootstrap"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join("assets", "bootstrap", "site.json"), []byte(`{"site":"public"}`), 0644); err != nil {
		t.Fatal(err)
	}
	dataDir := filepath.Join(root, "data")
	app := &App{cfg: Config{DataDir: dataDir}}
	if err := app.ensurePublicSnapshotData(); err != nil {
		t.Fatal(err)
	}
	if got, err := os.ReadFile(runtimeDataPath(dataDir, "site.json")); err != nil || string(got) != `{"site":"public"}` {
		t.Fatalf("public snapshot = %q, %v", got, err)
	}
	if err := os.WriteFile(runtimeDataPath(dataDir, "site.json"), []byte(`{"site":"server"}`), 0600); err != nil {
		t.Fatal(err)
	}
	if err := app.ensurePublicSnapshotData(); err != nil {
		t.Fatal(err)
	}
	if got, err := os.ReadFile(runtimeDataPath(dataDir, "site.json")); err != nil || string(got) != `{"site":"server"}` {
		t.Fatalf("existing runtime data was overwritten: %q, %v", got, err)
	}
}

func TestPublicFriendSeedMergesIntoExistingInstanceData(t *testing.T) {
	root := t.TempDir()
	previousDir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chdir(root); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chdir(previousDir) })
	seedPath := filepath.Join("assets", "data", "friends", "friends.json")
	if err := os.MkdirAll(filepath.Dir(seedPath), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(seedPath, []byte(`[{"id":"outside","display_name":"Outside","bio":"seed","avatar":"/uploads/admin/friends/user-null.png"}]`), 0644); err != nil {
		t.Fatal(err)
	}
	dataDir := filepath.Join(root, "data")
	if err := os.MkdirAll(filepath.Dir(runtimeDataPath(dataDir, "friends.json")), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(runtimeDataPath(dataDir, "friends.json"), []byte(`[{"username":"writer","display_name":"Writer","bio":"runtime","avatar":"/uploads/writer/avatar.png"}]`), 0600); err != nil {
		t.Fatal(err)
	}
	app := &App{cfg: Config{DataDir: dataDir}}
	if err := app.ensurePublicFriendsData(); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(runtimeDataPath(dataDir, "friends.json"))
	if err != nil {
		t.Fatal(err)
	}
	var friends []PublicFriend
	if err := json.Unmarshal(data, &friends); err != nil {
		t.Fatal(err)
	}
	if len(friends) != 2 || friends[0].Username != "writer" && friends[1].Username != "writer" {
		t.Fatalf("merged friends = %#v", friends)
	}
	foundExternal := false
	for _, friend := range friends {
		if friend.ID == "outside" {
			foundExternal = true
		}
	}
	if !foundExternal {
		t.Fatalf("seed external friend missing from %#v", friends)
	}
}
