package main

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestMigrateRuntimeLayoutMovesFlatDataWithoutDuplicates(t *testing.T) {
	root := t.TempDir()
	legacy := filepath.Join(root, "users.json")
	if err := os.WriteFile(legacy, []byte(`{"owner":{"username":"owner"}}`), 0600); err != nil {
		t.Fatal(err)
	}
	if err := migrateRuntimeLayout(root); err != nil {
		t.Fatal(err)
	}
	canonical := runtimeDataPath(root, "users.json")
	if _, err := os.Stat(legacy); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("legacy copy still exists: %v", err)
	}
	if got, err := os.ReadFile(canonical); err != nil || string(got) != `{"owner":{"username":"owner"}}` {
		t.Fatalf("canonical data = %q, %v", got, err)
	}
}

func TestMigrateRuntimeLayoutRefusesConflictingDuplicates(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "site.json"), []byte(`{"site":"legacy"}`), 0600); err != nil {
		t.Fatal(err)
	}
	canonical := runtimeDataPath(root, "site.json")
	if err := os.MkdirAll(filepath.Dir(canonical), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(canonical, []byte(`{"site":"canonical"}`), 0600); err != nil {
		t.Fatal(err)
	}
	if err := migrateRuntimeLayout(root); err == nil {
		t.Fatal("expected conflicting runtime data to stop migration")
	}
}
