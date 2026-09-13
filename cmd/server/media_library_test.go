package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestSafeUploadNameAndAllowedExtension(t *testing.T) {
	if got := safeUploadName("  hello world：v2.PNG "); got != "hello-world-v2.png" {
		t.Fatalf("safeUploadName = %q", got)
	}
	if got := safeUploadName("../unsafe?.png"); got != "unsafe.png" {
		t.Fatalf("safeUploadName path cleanup = %q", got)
	}
	if !isAllowedMediaExtension(".PNG") {
		t.Fatal("PNG should be allowed")
	}
	if isAllowedMediaExtension(".exe") {
		t.Fatal("EXE must not be allowed")
	}
}

func TestMediaOwnershipCheck(t *testing.T) {
	name, err := isMediaPathOwnedBy("Alice", "/uploads/alice/photo.png")
	if err != nil || name != "photo.png" {
		t.Fatalf("owned media = %q, %v", name, err)
	}
	if _, err := isMediaPathOwnedBy("alice", "/uploads/bob/photo.png"); err == nil {
		t.Fatal("foreign media path must be rejected")
	}
}

func TestMediaOwnershipAllowsCategorizedFilesOnlyInsideOwnerRoot(t *testing.T) {
	name, err := isMediaPathOwnedBy("Alice", "/uploads/alice/projects/cover.png")
	if err != nil || filepath.ToSlash(name) != "projects/cover.png" {
		t.Fatalf("categorized media = %q, %v", name, err)
	}
	if _, err := isMediaPathOwnedBy("alice", "/uploads/alice/../bob/cover.png"); err == nil {
		t.Fatal("parent traversal must be rejected")
	}
}

func TestListMediaFilesGroupsNestedCategories(t *testing.T) {
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "projects"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "projects", "cover.png"), []byte("x"), 0644); err != nil {
		t.Fatal(err)
	}
	files := listMediaFiles(dir, "/uploads/alice/")
	if len(files) != 1 || files[0].Path != "/uploads/alice/projects/cover.png" || files[0].Category != "projects" {
		t.Fatalf("unexpected files: %+v", files)
	}
	groups := mediaGroups(files)
	if len(groups) != 1 || groups[0].Label != "项目" {
		t.Fatalf("unexpected groups: %+v", groups)
	}
}
