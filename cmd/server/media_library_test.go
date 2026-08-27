package main

import "testing"

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
