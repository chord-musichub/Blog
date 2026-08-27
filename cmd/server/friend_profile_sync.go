package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// 用户资料同步到朋友页数据的规则。
func sameProfileFriendKey(a, b string) bool {
	return slugify(a) != "" && slugify(a) == slugify(b)
}

func (app *App) syncUserProfileToFriendsJSON(oldUser, newUser User) error {
	accountType := normalizeAccountType(newUser.Role, newUser.AccountType)
	if accountType == accountSystem || newUser.Disabled || newUser.Role == roleAdmin {
		return nil
	}

	dataPath := filepath.Join(app.cfg.DataDir, "friends.json")
	if err := os.MkdirAll(filepath.Dir(dataPath), 0755); err != nil {
		return err
	}

	existing := []PublicFriend{}
	if oldData, err := os.ReadFile(dataPath); err == nil && len(oldData) > 0 {
		_ = json.Unmarshal(oldData, &existing)
	}

	name := firstNonEmpty(newUser.DisplayName, newUser.Username)
	slug := slugify(name)
	if slug == "" {
		slug = slugify(newUser.Username)
	}
	if slug == "" {
		slug = "friend"
	}

	postCount := 0
	postTitles := []string{}
	updated := ""
	for _, a := range app.store.AllArticles() {
		if a.Status != stPublished || a.Author != newUser.Username {
			continue
		}
		postCount++
		if len(postTitles) < 8 && strings.TrimSpace(a.Title) != "" {
			postTitles = append(postTitles, a.Title)
		}
		t := a.UpdatedAt
		if a.PublishedAt != nil {
			t = *a.PublishedAt
		}
		if !t.IsZero() && t.Format(time.RFC3339) > updated {
			updated = t.Format(time.RFC3339)
		}
	}

	next := PublicFriend{
		Username:    strings.TrimSpace(newUser.Username),
		DisplayName: name,
		Slug:        slug,
		URL:         "/friends/" + slug + "/",
		Bio:         strings.TrimSpace(newUser.Bio),
		Homepage:    strings.TrimSpace(newUser.Homepage),
		Avatar:      firstNonEmpty(strings.TrimSpace(newUser.Avatar), "/uploads/admin/main_logo.png"),
		Cover:       strings.TrimSpace(newUser.Cover),
		PostCount:   postCount,
		PostTitles:  postTitles,
		UpdatedAt:   updated,
	}

	oldName := firstNonEmpty(oldUser.DisplayName, oldUser.Username)
	oldSlug := slugify(oldName)
	if oldSlug == "" {
		oldSlug = slugify(oldUser.Username)
	}

	found := -1
	for i, f := range existing {
		if strings.TrimSpace(f.Username) != "" && strings.EqualFold(strings.TrimSpace(f.Username), newUser.Username) {
			found = i
			break
		}
		if strings.TrimSpace(f.URL) != "" && (strings.TrimSpace(f.URL) == "/friends/"+oldSlug+"/" || strings.TrimSpace(f.URL) == "/friends/"+slug+"/") {
			found = i
			break
		}
		if sameProfileFriendKey(f.Slug, oldSlug) || sameProfileFriendKey(f.Slug, slug) || sameProfileFriendKey(f.DisplayName, oldName) || sameProfileFriendKey(f.DisplayName, name) {
			found = i
			break
		}
	}

	if found >= 0 {
		// 账号资料是公开朋友页资料的权威来源；文章数保留实时统计。
		existing[found].Username = next.Username
		existing[found].DisplayName = next.DisplayName
		existing[found].Slug = next.Slug
		existing[found].URL = next.URL
		existing[found].Bio = next.Bio
		existing[found].Homepage = next.Homepage
		existing[found].Avatar = next.Avatar
		existing[found].Cover = next.Cover
		existing[found].PostCount = next.PostCount
		existing[found].PostTitles = next.PostTitles
		existing[found].UpdatedAt = next.UpdatedAt
	} else {
		existing = append(existing, next)
	}

	b, err := json.MarshalIndent(existing, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(dataPath, b, 0644)
}
