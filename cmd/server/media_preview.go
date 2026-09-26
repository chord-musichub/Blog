package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"fmt"
	"image"
	"image/jpeg"
	"image/png"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"

	"golang.org/x/image/draw"
)

// One decoder at a time bounds peak memory even when a gallery is requested
// concurrently. Originals are never rewritten; unsupported images pass through.
var mediaPreviewSlot = make(chan struct{}, 1)

const previewCacheLimit = 256 << 20

func previewSize(r *http.Request) int {
	n, _ := strconv.Atoi(r.URL.Query().Get("preview"))
	switch n {
	case 160, 320, 640, 1280:
		return n
	}
	return 0
}

func (app *App) serveMediaPreview(w http.ResponseWriter, r *http.Request, source *os.File, info os.FileInfo, name string) bool {
	size := previewSize(r)
	if size == 0 || info.Size() > 32<<20 {
		return false
	}
	// Re-open the original BEFORE consulting the cache (caller): deletion and
	// tombstones must also revoke access to derived previews.
	key := fmt.Sprintf("v1:%s:%d:%d:%d", name, info.Size(), info.ModTime().UnixNano(), size)
	digest := fmt.Sprintf("%x", sha256.Sum256([]byte(key)))
	dir := filepath.Join(app.cfg.DataDir, "media-previews")
	cachePath := filepath.Join(dir, digest)
	serve := func() bool {
		file, err := os.Open(cachePath)
		if err != nil {
			return false
		}
		defer file.Close()
		w.Header().Set("ETag", `"preview-`+digest+`"`)
		w.Header().Set("Cache-Control", "public, no-cache")
		http.ServeContent(w, r, "preview", info.ModTime(), file)
		return true
	}
	if serve() {
		return true
	}
	select {
	case mediaPreviewSlot <- struct{}{}:
		defer func() { <-mediaPreviewSlot }()
	case <-r.Context().Done():
		return true
	}
	if serve() {
		return true
	}
	// SectionReader leaves the original file's offset untouched for fallback.
	reader := io.NewSectionReader(source, 0, info.Size())
	cfg, format, err := image.DecodeConfig(reader)
	if err != nil || (format != "jpeg" && format != "png") || cfg.Width <= 0 || cfg.Height <= 0 || int64(cfg.Width)*int64(cfg.Height) > 24_000_000 {
		return false
	}
	longest := max(cfg.Width, cfg.Height)
	if longest <= size {
		return false
	}
	data, err := io.ReadAll(io.NewSectionReader(source, 0, info.Size()))
	if err != nil {
		return false
	}
	var metadata []byte
	if format == "jpeg" {
		metadata, err = jpegPreviewMetadata(data)
		if err != nil {
			return false
		}
	} else if !plainPreviewPNG(data) {
		// Keep animated, color-managed and EXIF-oriented PNGs as originals.
		return false
	}
	img, _, err := image.Decode(bytes.NewReader(data))
	if err != nil || r.Context().Err() != nil {
		return false
	}
	if _, cmyk := img.(*image.CMYK); cmyk {
		return false // Retaining a CMYK profile on RGB output changes colors.
	}
	dst := image.NewNRGBA(image.Rect(0, 0, max(1, cfg.Width*size/longest), max(1, cfg.Height*size/longest)))
	draw.CatmullRom.Scale(dst, dst.Bounds(), img, img.Bounds(), draw.Src, nil)
	var encoded bytes.Buffer
	if format == "jpeg" {
		err = jpeg.Encode(&encoded, dst, &jpeg.Options{Quality: 88})
	} else {
		err = png.Encode(&encoded, dst)
	}
	if err != nil || r.Context().Err() != nil {
		return false
	}
	result := encoded.Bytes()
	if len(metadata) > 0 {
		// Preserve EXIF orientation and ICC profiles: browsers display the
		// resized pixels with the same rotation and color interpretation.
		result = append(append(append([]byte{}, result[:2]...), metadata...), result[2:]...)
	}
	if int64(len(result)) >= info.Size() || os.MkdirAll(dir, 0755) != nil {
		return false
	}
	pruneMediaPreviews(dir, int64(len(result)))
	tmp, err := os.CreateTemp(dir, ".preview-")
	if err != nil {
		return false
	}
	defer os.Remove(tmp.Name())
	_, err = tmp.Write(result)
	closeErr := tmp.Close()
	if err != nil || closeErr != nil || os.Rename(tmp.Name(), cachePath) != nil {
		return false
	}
	return serve()
}

func jpegPreviewMetadata(data []byte) ([]byte, error) {
	var result []byte
	for pos := 2; pos+4 <= len(data); {
		if data[pos] != 0xff {
			return nil, fmt.Errorf("invalid JPEG marker")
		}
		if data[pos+1] == 0xff {
			pos++
			continue
		}
		marker := data[pos+1]
		if marker == 0xda || marker == 0xd9 {
			return result, nil
		}
		length := int(binary.BigEndian.Uint16(data[pos+2 : pos+4]))
		if length < 2 || length > len(data)-pos-2 {
			return nil, fmt.Errorf("invalid JPEG segment")
		}
		if marker == 0xe1 || marker == 0xe2 {
			result = append(result, data[pos:pos+2+length]...)
		}
		pos += 2 + length
	}
	return nil, fmt.Errorf("incomplete JPEG")
}

func plainPreviewPNG(data []byte) bool {
	hasPixels := false
	for pos := 8; pos+12 <= len(data); {
		length := uint64(binary.BigEndian.Uint32(data[pos : pos+4]))
		if length > uint64(len(data)-pos-12) {
			return false
		}
		switch string(data[pos+4 : pos+8]) {
		case "acTL", "iCCP", "cHRM", "gAMA", "eXIf", "sRGB":
			return false
		case "IDAT":
			hasPixels = true
		case "IEND":
			return hasPixels
		}
		pos += 12 + int(length)
	}
	return false
}

// Only generated, digest-named files are eligible for eviction. All callers
// hold the decoder slot, so cache growth and pruning are serialized.
func pruneMediaPreviews(dir string, incoming int64) {
	entries, _ := os.ReadDir(dir)
	var files []os.FileInfo
	total := incoming
	for _, entry := range entries {
		if entry.IsDir() || len(entry.Name()) != 64 {
			continue
		}
		if _, err := hex.DecodeString(entry.Name()); err != nil {
			continue
		}
		info, err := entry.Info()
		if err == nil && info.Mode().IsRegular() {
			files = append(files, info)
			total += info.Size()
		}
	}
	sort.Slice(files, func(i, j int) bool { return files[i].ModTime().Before(files[j].ModTime()) })
	for index, file := range files {
		if total <= previewCacheLimit && len(files)-index < 512 {
			break
		}
		if os.Remove(filepath.Join(dir, file.Name())) == nil {
			total -= file.Size()
		}
	}
}
