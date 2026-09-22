package main

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func categoryRequest(app *App, library, source, category string) *httptest.ResponseRecorder {
	values := url.Values{"action": {"categorize"}, "old_path": {source}, "category": {category}}
	req := httptest.NewRequest(http.MethodPost, "/admin/media?library="+library, strings.NewReader(values.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	return mediaRequest(app, req)
}

func cropRequest(app *App, library, source string) *httptest.ResponseRecorder {
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	_ = writer.WriteField("source", source)
	_ = writer.WriteField("variant", "4x3")
	part, _ := writer.CreateFormFile("crop", "crop.webp")
	_, _ = part.Write([]byte("RIFF\x04\x00\x00\x00WEBP"))
	_ = writer.Close()
	req := httptest.NewRequest(http.MethodPost, "/admin/media?action=media-crop&library="+library, &body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	return mediaRequest(app, req)
}

func TestManualMediaCategoryPreservesReferencesAndPersists(t *testing.T) {
	app := mediaWorkflowApp(t)
	file := filepath.Join(app.userMediaDir("songline"), "general/photo.png")
	writeMediaFixture(t, file, "original")
	res := categoryRequest(app, "", "/uploads/songline/general/photo.png", "memories")
	if res.Code != http.StatusSeeOther || !strings.HasPrefix(res.Header().Get("Location"), "/write/admin/media?") {
		t.Fatalf("category update: %d %s", res.Code, res.Body.String())
	}
	restarted := &App{cfg: app.cfg}
	files := restarted.categorizedMediaFiles("songline")
	if len(files) != 1 || files[0].Category != "memories" || files[0].Path != "/uploads/songline/general/photo.png" {
		t.Fatalf("category or reference lost after restart: %+v", files)
	}
	if data, err := os.ReadFile(file); err != nil || string(data) != "original" {
		t.Fatalf("category moved/changed image: %q %v", data, err)
	}
	// A replacement with the same path is a new file, not the old classification.
	writeMediaFixture(t, file, "new upload bytes")
	if got := app.categorizedMediaFiles("songline")[0].Category; got != "general" {
		t.Fatalf("replacement inherited stale category: %s", got)
	}
}

func TestCategoryAndCropRespectLibraryPermissions(t *testing.T) {
	app := mediaWorkflowApp(t)
	for _, owner := range []string{"songline", "admin", "bob"} {
		writeMediaFixture(t, filepath.Join(app.userMediaDir(owner), "photo.png"), "original")
	}
	for _, source := range []string{"/uploads/bob/photo.png", "/uploads/songline/../bob/photo.png", "/uploads/songline/.hidden.png"} {
		if res := categoryRequest(app, "", source, "general"); res.Code != http.StatusForbidden {
			t.Fatalf("category accepted %s: %d", source, res.Code)
		}
		if res := cropRequest(app, "admin", source); res.Code != http.StatusForbidden {
			t.Fatalf("crop accepted %s: %d", source, res.Code)
		}
	}
	if res := categoryRequest(app, "", "/uploads/songline/photo.png", "../../bad"); res.Code != http.StatusBadRequest {
		t.Fatalf("invalid category accepted: %d", res.Code)
	}
	for _, item := range []struct{ library, owner string }{{"admin", "songline"}, {"", "admin"}, {"", "songline"}, {"admin", "admin"}} {
		res := cropRequest(app, item.library, "/uploads/"+item.owner+"/photo.png")
		if res.Code != http.StatusOK || !strings.Contains(res.Body.String(), "/uploads/"+item.owner+"/") {
			t.Fatalf("authorized crop mismatched upload library %+v: %d %s", item, res.Code, res.Body.String())
		}
	}
	app.store.users["songline"] = User{Username: "songline", Role: roleUser}
	if res := cropRequest(app, "admin", "/uploads/admin/photo.png"); res.Code != http.StatusForbidden {
		t.Fatalf("regular user cropped site media: %d", res.Code)
	}
	if res := categoryRequest(app, "admin", "/uploads/admin/photo.png", "general"); res.Code != http.StatusForbidden {
		t.Fatalf("regular user categorized site media: %d", res.Code)
	}
	if res := cropRequest(app, "admin", "/uploads/songline/photo.png"); res.Code != http.StatusOK {
		t.Fatalf("regular user cannot crop own media: %d %s", res.Code, res.Body.String())
	}
}

func TestManualCategorySurvivesCropAndRename(t *testing.T) {
	app := mediaWorkflowApp(t)
	writeMediaFixture(t, filepath.Join(app.userMediaDir("admin"), "general/photo.png"), "original")
	if res := categoryRequest(app, "admin", "/uploads/admin/general/photo.png", "memories"); res.Code != http.StatusSeeOther {
		t.Fatal(res.Body.String())
	}
	res := cropRequest(app, "", "/uploads/admin/general/photo.png")
	var result struct{ Path string }
	if err := json.Unmarshal(res.Body.Bytes(), &result); err != nil || res.Code != http.StatusOK {
		t.Fatalf("crop: %d %s", res.Code, res.Body.String())
	}
	values := url.Values{"action": {"rename"}, "old_path": {result.Path}, "new_name": {"renamed.webp"}}
	req := httptest.NewRequest(http.MethodPost, "/admin/media?library=admin", strings.NewReader(values.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	if res := mediaRequest(app, req); res.Code != http.StatusSeeOther {
		t.Fatalf("rename: %d %s", res.Code, res.Body.String())
	}
	files := app.categorizedMediaFiles("admin")
	if len(files) != 2 {
		t.Fatalf("lost source/crop: %+v", files)
	}
	for _, file := range files {
		if file.Category != "memories" {
			t.Fatalf("derived/renamed image lost category: %+v", file)
		}
	}
}

func TestMediaCategoryWriteFailureDoesNotChangeImage(t *testing.T) {
	app := mediaWorkflowApp(t)
	file := filepath.Join(app.userMediaDir("songline"), "photo.png")
	writeMediaFixture(t, file, "original")
	writeMediaFixture(t, filepath.Join(app.cfg.DataDir, "media-categories"), "blocked directory")
	if res := categoryRequest(app, "", "/uploads/songline/photo.png", "articles"); res.Code != http.StatusInternalServerError {
		t.Fatalf("failed write reported success: %d %s", res.Code, res.Body.String())
	}
	if data, err := os.ReadFile(file); err != nil || string(data) != "original" {
		t.Fatalf("write failure changed media: %q %v", data, err)
	}
}
