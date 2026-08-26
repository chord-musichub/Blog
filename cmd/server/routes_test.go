package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestRouterServesRuntimeMarkdownSource(t *testing.T) {
	workspace := t.TempDir()
	if err := os.MkdirAll(filepath.Join(workspace, "static", "md-source"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(workspace, "static", "md-source", "article.md"), []byte("# 正确的 Markdown\n"), 0644); err != nil {
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
