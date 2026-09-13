package main

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

// runtimeDataPath is the only place that maps a runtime JSON file to disk.
// Keep the data root stable for deployments, but group mutable records by
// responsibility so a copied runtime volume remains understandable.
func runtimeDataPath(root, name string) string {
	directory := map[string]string{
		"users.json":           "auth",
		"password_resets.json": "auth",
		"articles.json":        "content",
		"projects.json":        "content",
		"memories.json":        "content",
		"tag_urls.json":        "content",
		"friends.json":         "community",
		"messages.json":        "community",
		"site.json":            "settings",
		"theme.json":           "settings",
		"views.json":           "metrics",
		"2048_scores.json":     "games",
		"flappy_scores.json":   "games",
		"reaction_scores.json": "games",
		"snake_scores.json":    "games",
		"typing_scores.json":   "games",
	}[name]
	if directory == "" {
		return filepath.Join(root, name)
	}
	return filepath.Join(root, directory, name)
}

func runtimeMarkdownDir(root string) string { return filepath.Join(root, "md-source") }

// migrateRuntimeLayout performs a one-way, in-place move from the historic
// flat data directory. It never leaves a second runtime copy behind. Existing
// canonical files must match byte-for-byte; otherwise startup stops instead
// of guessing which private state should win.
func migrateRuntimeLayout(root string) error {
	if err := os.MkdirAll(root, 0700); err != nil {
		return err
	}
	for _, name := range []string{
		"users.json", "password_resets.json", "articles.json", "projects.json",
		"memories.json", "tag_urls.json", "friends.json", "messages.json",
		"site.json", "theme.json", "views.json", "2048_scores.json",
		"flappy_scores.json", "reaction_scores.json", "snake_scores.json",
		"typing_scores.json",
	} {
		legacy := filepath.Join(root, name)
		canonical := runtimeDataPath(root, name)
		if legacy == canonical {
			continue
		}
		if _, err := os.Stat(legacy); errors.Is(err, os.ErrNotExist) {
			continue
		} else if err != nil {
			return err
		}

		if _, err := os.Stat(canonical); err == nil {
			same, compareErr := sameFileContents(legacy, canonical)
			if compareErr != nil {
				return compareErr
			}
			if !same {
				return fmt.Errorf("runtime data conflict: both %s and %s exist with different content", legacy, canonical)
			}
			if err := os.Remove(legacy); err != nil {
				return err
			}
			continue
		} else if !errors.Is(err, os.ErrNotExist) {
			return err
		}

		if err := os.MkdirAll(filepath.Dir(canonical), 0700); err != nil {
			return err
		}
		if err := os.Rename(legacy, canonical); err != nil {
			return err
		}
	}
	return nil
}

func sameFileContents(left, right string) (bool, error) {
	a, err := os.Open(left)
	if err != nil {
		return false, err
	}
	defer a.Close()
	b, err := os.Open(right)
	if err != nil {
		return false, err
	}
	defer b.Close()
	return filesEqual(a, b)
}

func filesEqual(left, right *os.File) (bool, error) {
	leftInfo, err := left.Stat()
	if err != nil {
		return false, err
	}
	rightInfo, err := right.Stat()
	if err != nil {
		return false, err
	}
	if leftInfo.Size() != rightInfo.Size() {
		return false, nil
	}
	leftData, err := io.ReadAll(left)
	if err != nil {
		return false, err
	}
	rightData, err := io.ReadAll(right)
	if err != nil {
		return false, err
	}
	return bytes.Equal(leftData, rightData), nil
}
