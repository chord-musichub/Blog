package main

import (
	"encoding/json"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// Opt-in, read-only asset audit. Derived files go to an explicit temporary
// directory and can be served by browser fixtures without deploying the app.
func TestMediaPreviewAssetAudit(t *testing.T) {
	out := os.Getenv("BLOG_PREVIEW_AUDIT")
	if out == "" {
		t.Skip("set BLOG_PREVIEW_AUDIT to a temporary output directory")
	}
	if !strings.HasPrefix(filepath.Clean(out), os.TempDir()+string(os.PathSeparator)+"blog-preview-audit.") {
		t.Fatal("audit output must be a blog-preview-audit.* temporary directory")
	}
	app := &App{cfg: Config{DataDir: out}}
	type item struct {
		Path                        string
		OriginalBytes, PreviewBytes int64
		GenerationMs                int64
		Resized                     bool
	}
	var report []item
	root := filepath.Join("..", "..", "static", "uploads")
	err := filepath.WalkDir(root, func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			return nil
		}
		ext := strings.ToLower(filepath.Ext(path))
		if ext != ".jpg" && ext != ".jpeg" && ext != ".png" {
			return nil
		}
		file, err := os.Open(path)
		if err != nil {
			return err
		}
		defer file.Close()
		info, err := file.Stat()
		if err != nil {
			return err
		}
		name, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}
		url := "/uploads/" + filepath.ToSlash(name)
		size := "640"
		if strings.Contains(url, "/tool/") {
			size = "160"
		}
		w := httptest.NewRecorder()
		start := time.Now()
		resized := app.serveMediaPreview(w, httptest.NewRequest("GET", url+"?preview="+size, nil), file, info, name)
		record := item{Path: url, OriginalBytes: info.Size(), PreviewBytes: info.Size(), GenerationMs: time.Since(start).Milliseconds(), Resized: resized}
		if resized {
			record.PreviewBytes = int64(w.Body.Len())
			target := filepath.Join(out, "generated", size, "uploads", name)
			if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
				return err
			}
			if err := os.WriteFile(target, w.Body.Bytes(), 0644); err != nil {
				return err
			}
		}
		report = append(report, record)
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	data, err := json.MarshalIndent(report, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(out, "report.json"), data, 0644); err != nil {
		t.Fatal(err)
	}
	var before, after int64
	for _, item := range report {
		before += item.OriginalBytes
		after += item.PreviewBytes
	}
	t.Logf("%d assets: original=%d preview=%d saved=%.1f%%", len(report), before, after, 100*(1-float64(after)/float64(before)))
}
