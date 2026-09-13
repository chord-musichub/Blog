package main

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
)

// Public snapshot files make a clean clone render the same public-facing
// configuration without committing accounts, password hashes, messages,
// drafts, view counts, or game records from data/.
func (app *App) ensurePublicSnapshotData() error {
	for _, name := range []string{"site.json", "theme.json"} {
		target := filepath.Join(app.cfg.DataDir, name)
		if _, err := os.Stat(target); err == nil {
			continue
		} else if !errors.Is(err, os.ErrNotExist) {
			return err
		}
		source := filepath.Join("assets", "bootstrap", name)
		if _, err := os.Stat(source); errors.Is(err, os.ErrNotExist) {
			continue
		} else if err != nil {
			return err
		}
		if err := os.MkdirAll(app.cfg.DataDir, 0700); err != nil {
			return err
		}
		if err := copyFileExclusive(source, target); err != nil {
			return err
		}
	}
	return app.ensurePublicFriendsData()
}

// friends.json is a versioned platform seed: it contains only public friend
// card fields. Runtime edits live in data/friends.json and never overwrite the
// seed, so a fork has a usable star map while each deployment owns its state.
func (app *App) ensurePublicFriendsData() error {
	target := filepath.Join(app.cfg.DataDir, "friends.json")
	source := filepath.Join("assets", "data", "friends", "friends.json")
	if _, err := os.Stat(source); errors.Is(err, os.ErrNotExist) {
		return nil
	} else if err != nil {
		return err
	}
	seedData, err := os.ReadFile(source)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(app.cfg.DataDir, 0700); err != nil {
		return err
	}
	if _, err := os.Stat(target); errors.Is(err, os.ErrNotExist) {
		return copyFileExclusive(source, target)
	} else if err != nil {
		return err
	}

	var seed, current []PublicFriend
	if err := json.Unmarshal(seedData, &seed); err != nil {
		return err
	}
	currentData, err := os.ReadFile(target)
	if err != nil {
		return err
	}
	if len(strings.TrimSpace(string(currentData))) != 0 {
		if err := json.Unmarshal(currentData, &current); err != nil {
			return err
		}
	}
	merged := mergePublicFriends(seed, current)
	mergedData, err := json.MarshalIndent(merged, "", "  ")
	if err != nil {
		return err
	}
	if string(mergedData) == string(currentData) {
		return nil
	}
	return os.WriteFile(target, mergedData, 0600)
}
