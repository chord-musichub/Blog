package main

import (
	"bytes"
	"errors"
	"html/template"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func mediaWorkflowApp(t *testing.T) *App {
	t.Helper()
	root := t.TempDir()
	previous, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chdir(root); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chdir(previous) })
	return &App{
		cfg:   Config{DataDir: filepath.Join(root, "data"), HugoContentDir: filepath.Join(root, "content", "posts"), AdminBasePath: "/write", MaxUploadBytes: 4096, SessionSecret: "media-workflow-test-secret"},
		store: &Store{users: map[string]User{"songline": {Username: "songline", Role: roleOwner}}, articles: map[string]Article{}},
		tpl:   template.Must(template.New("media.html").Parse(`{{.Error}}{{range .Files}}{{.Path}}{{end}}`)),
	}
}

func mediaRequest(app *App, request *http.Request) *httptest.ResponseRecorder {
	session := httptest.NewRecorder()
	app.setSession(session, "songline", false)
	request.AddCookie(session.Result().Cookies()[0])
	response := httptest.NewRecorder()
	app.handleMediaLibrary(response, request)
	return response
}

func writeMediaFixture(t *testing.T, name, value string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(name), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(name, []byte(value), 0644); err != nil {
		t.Fatal(err)
	}
}

func TestMediaWorkflowDeleteRenameReuploadAndRestart(t *testing.T) {
	app := mediaWorkflowApp(t)
	seed := filepath.Join("static", "uploads", "admin", "general", "photo.png")
	writeMediaFixture(t, seed, "seed-image")
	legacy := filepath.Join("legacy", "uploads", "admin", "general", "photo.png")
	writeMediaFixture(t, legacy, "legacy-image")
	app.cfg.LegacyRuntimeStaticDir = "legacy"
	if err := app.ensureCanonicalMediaLayout(); err != nil {
		t.Fatal(err)
	}
	post := func(action, oldName, newName string) {
		t.Helper()
		values := url.Values{"action": {action}, "old_path": {"/uploads/admin/general/" + oldName}, "new_name": {newName}}
		req := httptest.NewRequest(http.MethodPost, "/admin/media?library=admin", strings.NewReader(values.Encode()))
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		res := mediaRequest(app, req)
		redirect, err := url.Parse(res.Header().Get("Location"))
		if err != nil || res.Code != http.StatusSeeOther || redirect.Path != "/write/admin/media" || redirect.Query().Get("library") != "admin" {
			t.Fatalf("operation %s: %d %s %v", action, res.Code, res.Body.String(), redirect)
		}
	}
	get := func(name string, want int, body string) {
		t.Helper()
		res := httptest.NewRecorder()
		app.handlePublicMedia(res, httptest.NewRequest(http.MethodGet, "/uploads/admin/general/"+name, nil))
		if res.Code != want || (want == 200 && res.Body.String() != body) {
			t.Fatalf("GET %s: %d %q", name, res.Code, res.Body.String())
		}
	}
	post("rename", "photo.png", "renamed.png")
	get("photo.png", 404, "")
	get("renamed.png", 200, "legacy-image")
	post("delete", "renamed.png", "")
	get("renamed.png", 404, "")
	// Simulate a fresh process and the next seed pass using the same runtime data.
	restarted := &App{cfg: app.cfg}
	if err := restarted.ensureCanonicalMediaLayout(); err != nil {
		t.Fatal(err)
	}
	if files := listMediaFiles(app.userMediaDir("admin"), "/uploads/admin/"); len(files) != 0 {
		t.Fatalf("removed media resurrected: %+v", files)
	}
	// Editor upload reuses a previously deleted name; the live bytes must win
	// without clearing the marker or reviving the repository fallback.
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("cover", "photo.png")
	if err != nil {
		t.Fatal(err)
	}
	_, _ = part.Write([]byte("fresh-upload"))
	_ = writer.Close()
	if err := app.markMediaTombstone("admin", "general/cover-photo.png"); err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, "/admin/media?library=admin&action=cover-upload", &body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	if res := mediaRequest(app, req); res.Code != 200 {
		t.Fatalf("reupload failed: %d %s", res.Code, res.Body.String())
	}
	get("cover-photo.png", 200, "fresh-upload")
	post("delete", "cover-photo.png", "")
	get("cover-photo.png", 404, "")
}

func TestMediaRemovalFailurePreservesFile(t *testing.T) {
	app := mediaWorkflowApp(t)
	media := mediaLibraryContext{owner: "admin", dir: app.userMediaDir("admin")}
	file := filepath.Join(media.dir, "photo.png")
	writeMediaFixture(t, file, "original")
	err := app.removeMediaName(media, "photo.png", func() error { return errors.New("disk failure") })
	if err == nil || app.isMediaTombstoned("admin", "photo.png") {
		t.Fatalf("failed mutation left removal state: %v", err)
	}
	markerParent := filepath.Dir(app.mediaTombstonePath("admin", "nested/photo.png"))
	writeMediaFixture(t, markerParent, "block marker directory")
	writeMediaFixture(t, filepath.Join(media.dir, "nested/photo.png"), "keep")
	called := false
	err = app.removeMediaName(media, "nested/photo.png", func() error { called = true; return nil })
	if err == nil || called {
		t.Fatal("mutation ran without a durable removal marker")
	}
	if got, err := os.ReadFile(file); err != nil || string(got) != "original" {
		t.Fatalf("original lost: %q %v", got, err)
	}
}

func TestMediaUploadLimitAppliesBeforeActionParsing(t *testing.T) {
	app := mediaWorkflowApp(t)
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, _ := writer.CreateFormFile("media", "large.png")
	_, _ = part.Write(bytes.Repeat([]byte("x"), 8192))
	_ = writer.Close()
	req := httptest.NewRequest(http.MethodPost, "/admin/media?library=admin", &body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	res := mediaRequest(app, req)
	if !strings.Contains(res.Body.String(), "超过服务器允许") {
		t.Fatalf("upload limit bypassed: %d %s", res.Code, res.Body.String())
	}
	if files := listMediaFiles(app.userMediaDir("admin"), "/uploads/admin/"); len(files) != 0 {
		t.Fatalf("oversize file saved: %+v", files)
	}
}

func TestMediaRejectsHiddenAndEscapingPaths(t *testing.T) {
	app := mediaWorkflowApp(t)
	if err := app.markMediaTombstone("admin", "photo.png"); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"../admin/photo.png", "/admin/photo.png", "folder/../../photo.png", ".secret", "folder/.private", "folder\\photo.png"} {
		if _, err := isMediaPathOwnedBy("alice", "/uploads/alice/"+name); err == nil {
			t.Errorf("accepted %q", name)
		}
	}
	res := httptest.NewRecorder()
	app.handlePublicMedia(res, httptest.NewRequest(http.MethodGet, "/uploads/.deleted/admin/photo.png", nil))
	if res.Code != 404 {
		t.Fatalf("internal marker is public: %d", res.Code)
	}
}
