package main

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestLanguageAssetsSharePublicSourcesBeforeHugoBuild(t *testing.T) {
	previous, _ := os.Getwd()
	if err := os.Chdir(filepath.Join("..", "..")); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chdir(previous) })
	mux := http.NewServeMux()
	registerLanguageAssets(mux)
	for route, file := range map[string]string{"/static/i18n.js": "static/js/i18n.js", "/static/i18n-catalog.js": "static/js/i18n-catalog.js", "/static/i18n.css": "static/css/i18n.css"} {
		want, err := os.ReadFile(file)
		if err != nil {
			t.Fatal(err)
		}
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, httptest.NewRequest(http.MethodGet, route, nil))
		if w.Code != 200 || !bytes.Equal(w.Body.Bytes(), want) {
			t.Fatalf("%s differs from shared source: %d", route, w.Code)
		}
		if w.Header().Get("Cache-Control") != "public, no-cache" {
			t.Fatal("language assets must revalidate")
		}
		w = httptest.NewRecorder()
		mux.ServeHTTP(w, httptest.NewRequest(http.MethodHead, route, nil))
		if w.Code != 200 || w.Body.Len() != 0 {
			t.Fatalf("HEAD %s", route)
		}
		w = httptest.NewRecorder()
		mux.ServeHTTP(w, httptest.NewRequest(http.MethodPost, route, nil))
		if w.Code != 405 {
			t.Fatalf("POST %s = %d", route, w.Code)
		}
	}
}
