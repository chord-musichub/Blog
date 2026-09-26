package main

import (
	"bytes"
	"context"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"math/rand"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

func previewFixture(t *testing.T, format string) []byte {
	t.Helper()
	img := image.NewNRGBA(image.Rect(0, 0, 1000, 600))
	rng := rand.New(rand.NewSource(42))
	for y := 0; y < 600; y++ {
		for x := 0; x < 1000; x++ {
			img.SetNRGBA(x, y, color.NRGBA{uint8(rng.Intn(256)), uint8(rng.Intn(256)), uint8(rng.Intn(256)), 255})
		}
	}
	var buf bytes.Buffer
	var err error
	if format == "png" {
		for y := 0; y < 120; y++ {
			for x := 0; x < 120; x++ {
				img.SetNRGBA(x, y, color.NRGBA{})
			}
		}
		err = png.Encode(&buf, img)
	} else {
		err = jpeg.Encode(&buf, img, &jpeg.Options{Quality: 95})
	}
	if err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func TestMediaPreviewLifecycle(t *testing.T) {
	app := mediaWorkflowApp(t)
	name := filepath.Join(app.mediaRootDir(), "admin", "general", "photo.jpg")
	original := previewFixture(t, "jpeg")
	writeMediaFixture(t, name, string(original))
	get := func(method, suffix, etag string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, "/uploads/admin/general/photo.jpg"+suffix, nil)
		if etag != "" {
			r.Header.Set("If-None-Match", etag)
		}
		w := httptest.NewRecorder()
		app.handlePublicMedia(w, r)
		return w
	}
	preview := get("GET", "?preview=320", "")
	cfg, _, err := image.DecodeConfig(preview.Body)
	if err != nil || cfg.Width != 320 || cfg.Height != 192 || preview.Code != 200 {
		t.Fatalf("preview: %+v %v %d", cfg, err, preview.Code)
	}
	if etag := preview.Header().Get("ETag"); etag == "" || get("GET", "?preview=320", etag).Code != 304 {
		t.Fatal("preview revalidation failed")
	}
	head := get("HEAD", "?preview=320", "")
	if head.Code != 200 || head.Body.Len() != 0 || head.Header().Get("ETag") != preview.Header().Get("ETag") {
		t.Fatal("HEAD does not match GET")
	}
	for _, suffix := range []string{"", "?preview=12345", "?preview=-1"} {
		if !bytes.Equal(get("GET", suffix, "").Body.Bytes(), original) {
			t.Fatalf("original changed for %s", suffix)
		}
	}
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if get("GET", "?preview=160", "").Code != 200 {
				t.Error("concurrent preview failed")
			}
		}()
	}
	wg.Wait()
	stamp := time.Now().Add(time.Second)
	if err := os.Chtimes(name, stamp, stamp); err != nil {
		t.Fatal(err)
	}
	if get("GET", "?preview=320", "").Header().Get("ETag") == preview.Header().Get("ETag") {
		t.Fatal("replacement retained stale cache identity")
	}
	if err := os.Remove(name); err != nil {
		t.Fatal(err)
	}
	if get("GET", "?preview=320", "").Code != 404 {
		t.Fatal("deleted original still available from preview cache")
	}
}

func TestMediaPreviewFallbackAndPNG(t *testing.T) {
	app := mediaWorkflowApp(t)
	for _, tc := range []struct {
		name    string
		data    []byte
		resized bool
	}{
		{"alpha.png", previewFixture(t, "png"), true},
		{"bad.jpg", []byte("not an image"), false},
		{"vector.svg", []byte(`<svg xmlns="http://www.w3.org/2000/svg"/>`), false},
	} {
		writeMediaFixture(t, filepath.Join(app.mediaRootDir(), "admin", "general", tc.name), string(tc.data))
		w := httptest.NewRecorder()
		app.handlePublicMedia(w, httptest.NewRequest(http.MethodGet, "/uploads/admin/general/"+tc.name+"?preview=160", nil))
		if w.Code != 200 {
			t.Fatalf("%s: %d", tc.name, w.Code)
		}
		if tc.resized {
			img, _, err := image.Decode(w.Body)
			if err != nil || img.Bounds().Dx() != 160 {
				t.Fatalf("PNG not resized: %v", err)
			}
			if _, _, _, alpha := img.At(0, 0).RGBA(); alpha != 0 {
				t.Fatal("PNG lost transparency")
			}
		} else if !bytes.Equal(tc.data, w.Body.Bytes()) {
			t.Fatalf("fallback altered %s", tc.name)
		}
	}
}

func TestMediaPreviewPreservesJPEGMetadata(t *testing.T) {
	app := mediaWorkflowApp(t)
	src := previewFixture(t, "jpeg")
	// EXIF little-endian orientation = 6 (90 degrees), plus an ICC segment.
	exif := []byte{'E', 'x', 'i', 'f', 0, 0, 'I', 'I', 42, 0, 8, 0, 0, 0, 1, 0, 0x12, 1, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0}
	metadata := append([]byte{0xff, 0xe1, 0, byte(len(exif) + 2)}, exif...)
	metadata = append(metadata, 0xff, 0xe2, 0, 5, 'i', 'c', 'c')
	src = append(append(append([]byte{}, src[:2]...), metadata...), src[2:]...)
	writeMediaFixture(t, filepath.Join(app.mediaRootDir(), "admin", "general", "rotate.jpg"), string(src))
	w := httptest.NewRecorder()
	app.handlePublicMedia(w, httptest.NewRequest("GET", "/uploads/admin/general/rotate.jpg?preview=160", nil))
	got, err := jpegPreviewMetadata(w.Body.Bytes())
	if err != nil || !bytes.Equal(got, metadata) || w.Body.Len() >= len(src) {
		t.Fatal("preview lost orientation/profile or was not resized", err)
	}
}

func TestPreviewPNGSkipsAnimationAndProfiles(t *testing.T) {
	for _, chunk := range []string{"acTL", "iCCP", "gAMA", "sRGB", "cHRM", "eXIf"} {
		data := append(make([]byte, 8), 0, 0, 0, 0, 'I', 'D', 'A', 'T', 0, 0, 0, 0)
		data = append(data, 0, 0, 0, 0)
		data = append(data, chunk...)
		data = append(data, 0, 0, 0, 0, 0, 0, 0, 0, 'I', 'E', 'N', 'D', 0, 0, 0, 0)
		if plainPreviewPNG(data) {
			t.Errorf("unsafe PNG chunk accepted: %s", chunk)
		}
	}
}

func TestMediaPreviewRangeAndCacheFailure(t *testing.T) {
	app := mediaWorkflowApp(t)
	original := previewFixture(t, "jpeg")
	name := filepath.Join(app.mediaRootDir(), "admin", "general", "photo.jpg")
	writeMediaFixture(t, name, string(original))
	request := httptest.NewRequest("GET", "/uploads/admin/general/photo.jpg?preview=320", nil)
	request.Header.Set("Range", "bytes=0-9")
	w := httptest.NewRecorder()
	app.handlePublicMedia(w, request)
	if w.Code != 206 || w.Body.Len() != 10 {
		t.Fatalf("preview range: %d %d", w.Code, w.Body.Len())
	}
	// A cache write failure must still serve the intact original, not an error.
	app.cfg.DataDir = filepath.Join(app.cfg.DataDir, "blocked")
	writeMediaFixture(t, app.cfg.DataDir, "not a directory")
	f, err := os.Open(name)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	info, _ := f.Stat()
	if app.serveMediaPreview(httptest.NewRecorder(), request, f, info, "different-key.jpg") {
		t.Fatal("invalid cache unexpectedly served")
	}
	if offset, _ := f.Seek(0, 1); offset != 0 {
		t.Fatal("fallback original offset changed")
	}
}

func TestMediaPreviewCancelledQueueAndPruning(t *testing.T) {
	app := mediaWorkflowApp(t)
	name := filepath.Join(app.mediaRootDir(), "admin", "general", "photo.jpg")
	writeMediaFixture(t, name, string(previewFixture(t, "jpeg")))
	mediaPreviewSlot <- struct{}{}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	w := httptest.NewRecorder()
	app.handlePublicMedia(w, httptest.NewRequest("GET", "/uploads/admin/general/photo.jpg?preview=640", nil).WithContext(ctx))
	<-mediaPreviewSlot
	if w.Body.Len() != 0 {
		t.Fatal("cancelled preview was generated")
	}
	dir := filepath.Join(app.cfg.DataDir, "media-previews")
	keep := filepath.Join(dir, strings.Repeat("z", 64))
	writeMediaFixture(t, keep, "not a generated cache file")
	old := filepath.Join(dir, strings.Repeat("a", 64))
	writeMediaFixture(t, old, "old cache")
	// Sparse test file exercises the disk budget without writing 256 MiB.
	if err := os.Truncate(old, previewCacheLimit); err != nil {
		t.Fatal(err)
	}
	pruneMediaPreviews(dir, 100)
	if _, err := os.Stat(old); !os.IsNotExist(err) {
		t.Fatal("oversized cache was not pruned")
	}
	if _, err := os.Stat(keep); err != nil {
		t.Fatal("non-cache file was pruned")
	}
}

func FuzzPreviewMetadataBounds(f *testing.F) {
	f.Add([]byte{0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff})
	f.Add([]byte("not an image"))
	f.Fuzz(func(t *testing.T, data []byte) {
		if len(data) > 1<<20 {
			t.Skip()
		}
		_, _ = jpegPreviewMetadata(data)
		_ = plainPreviewPNG(data)
	})
}
