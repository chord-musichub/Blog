package main

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestSaveCoverCropStoresDerivedWebPWithoutReplacingSource(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "source.png"), []byte("original"), 0644); err != nil {
		t.Fatal(err)
	}

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	if err := writer.WriteField("source", "/uploads/alice/source.png"); err != nil {
		t.Fatal(err)
	}
	part, err := writer.CreateFormFile("crop", "source-16x9.webp")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write([]byte("RIFF\x04\x00\x00\x00WEBP")); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}

	req := httptest.NewRequest(http.MethodPost, "/admin/media?action=cover-crop", &body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	res := httptest.NewRecorder()
	app := &App{}
	app.saveCoverCrop(res, req, mediaLibraryContext{owner: "alice", dir: dir})
	if res.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", res.Code, res.Body.String())
	}
	var response struct {
		OK   bool   `json:"ok"`
		Path string `json:"path"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if !response.OK || response.Path == "/uploads/alice/source.png" || filepath.Ext(response.Path) != ".webp" {
		t.Fatalf("unexpected crop response: %+v", response)
	}
	if _, err := os.Stat(filepath.Join(dir, filepath.Base(response.Path))); err != nil {
		t.Fatalf("derived cover was not saved: %v", err)
	}
	original, err := os.ReadFile(filepath.Join(dir, "source.png"))
	if err != nil || string(original) != "original" {
		t.Fatalf("source image was changed: %q, %v", original, err)
	}
}

func TestSaveCoverUploadStoresOwnedImage(t *testing.T) {
	dir := t.TempDir()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("cover", "my-cover.png")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write([]byte("image-bytes")); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}

	req := httptest.NewRequest(http.MethodPost, "/admin/media?action=cover-upload", &body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	res := httptest.NewRecorder()
	app := &App{cfg: Config{MaxUploadBytes: 1024 * 1024}}
	app.saveCoverUpload(res, req, mediaLibraryContext{owner: "alice", dir: dir})
	if res.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", res.Code, res.Body.String())
	}
	var response struct {
		OK   bool   `json:"ok"`
		Path string `json:"path"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if !response.OK || response.Path == "" || filepath.Ext(response.Path) != ".png" {
		t.Fatalf("unexpected upload response: %+v", response)
	}
	stored, err := os.ReadFile(filepath.Join(dir, filepath.Base(response.Path)))
	if err != nil || string(stored) != "image-bytes" {
		t.Fatalf("cover was not stored correctly: %q, %v", stored, err)
	}
}
