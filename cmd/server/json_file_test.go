package main

import (
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestJSONFileRoundTrip(t *testing.T) {
	path := filepath.Join(t.TempDir(), "nested", "settings.json")
	want := map[string]any{"title": "Songline", "enabled": true}

	if err := writeJSONFile(path, want, 0600); err != nil {
		t.Fatalf("writeJSONFile() error = %v", err)
	}

	got := map[string]any{}
	if err := readJSONFile(path, &got); err != nil {
		t.Fatalf("readJSONFile() error = %v", err)
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("round trip mismatch: got %#v, want %#v", got, want)
	}
}

func TestReadJSONFileAllowsMissingFile(t *testing.T) {
	got := map[string]any{"keep": "default"}
	if err := readJSONFile(filepath.Join(t.TempDir(), "missing.json"), &got); err != nil {
		t.Fatalf("readJSONFile() error = %v", err)
	}
	if got["keep"] != "default" {
		t.Fatalf("missing file changed default value: %#v", got)
	}
}

func TestDecodeJSONBodyRejectsTrailingValue(t *testing.T) {
	var got struct {
		Score int `json:"score"`
	}
	if err := decodeJSONBody(strings.NewReader(`{"score": 42}`), 1024, &got); err != nil {
		t.Fatalf("decodeJSONBody() error = %v", err)
	}
	if got.Score != 42 {
		t.Fatalf("score = %d, want 42", got.Score)
	}
	if err := decodeJSONBody(strings.NewReader(`{"score": 42} {}`), 1024, &got); err == nil {
		t.Fatal("decodeJSONBody() accepted trailing JSON value")
	}
}
