package main

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestRouterServesSharedMarkdownRendererWithoutPublishedSite(t *testing.T) {
	previous, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	source, err := os.ReadFile(filepath.Join("..", "..", "static", "js", "markdown-renderer.js"))
	if err != nil {
		t.Fatal(err)
	}
	workspace := t.TempDir()
	asset := filepath.Join(workspace, "static", "js", "markdown-renderer.js")
	if err := os.MkdirAll(filepath.Dir(asset), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(asset, source, 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.Chdir(workspace); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chdir(previous) })
	handler := (&App{limiter: NewLimiter()}).router()
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/static/markdown-renderer.js?v=20.3.5", nil))
	if response.Code != http.StatusOK || !bytes.Equal(response.Body.Bytes(), source) {
		t.Fatalf("shared renderer: status %d, bytes %d", response.Code, response.Body.Len())
	}
	if got := response.Header().Get("Cache-Control"); got != "public, no-cache" {
		t.Fatalf("cache policy = %q", got)
	}
	head := httptest.NewRecorder()
	handler.ServeHTTP(head, httptest.NewRequest(http.MethodHead, "/static/markdown-renderer.js", nil))
	if head.Code != http.StatusOK || head.Body.Len() != 0 {
		t.Fatalf("HEAD: status %d, bytes %d", head.Code, head.Body.Len())
	}
	request := httptest.NewRequest(http.MethodGet, "/static/markdown-renderer.js", nil)
	request.Header.Set("If-Modified-Since", response.Header().Get("Last-Modified"))
	cached := httptest.NewRecorder()
	handler.ServeHTTP(cached, request)
	if cached.Code != http.StatusNotModified || cached.Body.Len() != 0 {
		t.Fatalf("conditional GET: status %d, bytes %d", cached.Code, cached.Body.Len())
	}
	post := httptest.NewRecorder()
	handler.ServeHTTP(post, httptest.NewRequest(http.MethodPost, "/static/markdown-renderer.js", nil))
	if post.Code != http.StatusMethodNotAllowed {
		t.Fatalf("POST status = %d", post.Code)
	}
	if err := os.Remove(asset); err != nil {
		t.Fatal(err)
	}
	missing := httptest.NewRecorder()
	handler.ServeHTTP(missing, httptest.NewRequest(http.MethodGet, "/static/markdown-renderer.js", nil))
	if missing.Code != http.StatusNotFound {
		t.Fatalf("missing asset status = %d", missing.Code)
	}
}
