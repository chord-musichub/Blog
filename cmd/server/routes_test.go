package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestRouterServesDataMarkdownSource(t *testing.T) {
	workspace := t.TempDir()
	dataDir := filepath.Join(workspace, "data")
	if err := os.MkdirAll(filepath.Join(dataDir, "md-source"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dataDir, "md-source", "article.md"), []byte("# 正确的 Markdown\n"), 0644); err != nil {
		t.Fatal(err)
	}

	previousDir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chdir(workspace); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chdir(previousDir) })

	app := &App{cfg: Config{DataDir: dataDir}, limiter: NewLimiter()}
	handler := app.router()

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/md-source/article.md", nil))
	if response.Code != http.StatusOK {
		t.Fatalf("markdown source status = %d, want %d", response.Code, http.StatusOK)
	}
	if got := response.Body.String(); got != "# 正确的 Markdown\n" {
		t.Fatalf("markdown source body = %q", got)
	}

	missing := httptest.NewRecorder()
	handler.ServeHTTP(missing, httptest.NewRequest(http.MethodGet, "/md-source/missing.md", nil))
	if missing.Code != http.StatusNotFound {
		t.Fatalf("missing markdown source status = %d, want %d", missing.Code, http.StatusNotFound)
	}
}

func TestRouterServesSeedMediaAndLegacyAdminPaths(t *testing.T) {
	workspace := t.TempDir()
	seed := filepath.Join(workspace, "static", "uploads", "admin", "logo", "main_logo.png")
	if err := os.MkdirAll(filepath.Dir(seed), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(seed, []byte("seed-logo"), 0644); err != nil {
		t.Fatal(err)
	}

	previousDir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chdir(workspace); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chdir(previousDir) })

	app := &App{cfg: Config{DataDir: filepath.Join(workspace, "data")}, limiter: NewLimiter()}
	handler := app.router()
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/uploads/admin/main_logo.png", nil))
	if response.Code != http.StatusOK || response.Body.String() != "seed-logo" {
		t.Fatalf("legacy seeded logo = status %d, body %q", response.Code, response.Body.String())
	}

	runtimeLogo := filepath.Join(app.mediaRootDir(), "admin", "logo", "main_logo.png")
	if err := os.MkdirAll(filepath.Dir(runtimeLogo), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(runtimeLogo, []byte("runtime-logo"), 0644); err != nil {
		t.Fatal(err)
	}
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/uploads/admin/logo/main_logo.png", nil))
	if response.Code != http.StatusOK || response.Body.String() != "runtime-logo" {
		t.Fatalf("runtime logo = status %d, body %q", response.Code, response.Body.String())
	}
	if got := response.Header().Get("Cache-Control"); got != "public, no-cache" {
		t.Fatalf("mutable media cache policy = %q", got)
	}
	modified := response.Header().Get("Last-Modified")
	if modified == "" {
		t.Fatal("media must support conditional revalidation")
	}
	request := httptest.NewRequest(http.MethodGet, "/uploads/admin/logo/main_logo.png", nil)
	request.Header.Set("If-Modified-Since", modified)
	cached := httptest.NewRecorder()
	handler.ServeHTTP(cached, request)
	if cached.Code != http.StatusNotModified || cached.Body.Len() != 0 {
		t.Fatalf("unchanged media must not resend bytes: status %d, bytes %d", cached.Code, cached.Body.Len())
	}
}
