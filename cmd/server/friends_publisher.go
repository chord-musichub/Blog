package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// 朋友页运行时数据合并与 Hugo 页面生成。

func (app *App) publicFriends() []PublicFriend {
	users := app.store.Users()
	articles := app.store.AllArticles()

	postCount := map[string]int{}
	postTitles := map[string][]string{}
	lastUpdated := map[string]time.Time{}
	for _, a := range articles {
		if a.Status != stPublished {
			continue
		}
		postCount[a.Author]++
		if len(postTitles[a.Author]) < 8 {
			postTitles[a.Author] = append(postTitles[a.Author], a.Title)
		}
		t := a.UpdatedAt
		if a.PublishedAt != nil {
			t = *a.PublishedAt
		}
		if t.After(lastUpdated[a.Author]) {
			lastUpdated[a.Author] = t
		}
	}

	friends := []PublicFriend{}
	usedSlugs := map[string]int{}
	for _, u := range users {
		if u.Disabled || u.Role == roleAdmin {
			continue
		}
		accountType := normalizeAccountType(u.Role, u.AccountType)
		if accountType == accountSystem {
			continue
		}
		name := firstNonEmpty(u.DisplayName, u.Username)
		slug := slugify(name)
		if slug == "" {
			slug = slugify(u.Username)
		}
		if slug == "" {
			continue
		}
		if n := usedSlugs[slug]; n > 0 {
			usedSlugs[slug] = n + 1
			slug = fmt.Sprintf("%s-%d", slug, n+1)
		} else {
			usedSlugs[slug] = 1
		}
		updated := ""
		if t := lastUpdated[u.Username]; !t.IsZero() {
			updated = t.Format(time.RFC3339)
		}
		titles := postTitles[u.Username]
		if titles == nil {
			titles = []string{}
		}
		friends = append(friends, PublicFriend{
			Username:    u.Username,
			DisplayName: name,
			Slug:        slug,
			URL:         "/friends/" + slug + "/",
			Bio:         strings.TrimSpace(u.Bio),
			Homepage:    strings.TrimSpace(u.Homepage),
			Avatar:      firstNonEmpty(u.Avatar, "/uploads/admin/main_logo.png"),
			Cover:       firstNonEmpty(u.Cover, ""),
			PostCount:   postCount[u.Username],
			PostTitles:  titles,
			UpdatedAt:   updated,
		})
	}
	return friends
}

func (app *App) syncPublicFriends() error {
	generatedFriends := app.publicFriends()

	dataPath := filepath.Join(app.cfg.DataDir, "friends.json")
	existingFriends := []PublicFriend{}
	if oldData, err := os.ReadFile(dataPath); err == nil && len(oldData) > 0 {
		_ = json.Unmarshal(oldData, &existingFriends)
	}
	friends := mergePublicFriends(existingFriends, generatedFriends)

	b, err := json.MarshalIndent(friends, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(dataPath, b, 0644); err != nil {
		return err
	}

	base := filepath.Clean(app.cfg.HugoContentDir)
	contentRoot := filepath.Dir(base)
	friendsRoot := filepath.Join(contentRoot, "friends")
	if err := os.MkdirAll(friendsRoot, 0755); err != nil {
		return err
	}

	settings, _ := app.loadSiteSettings()
	listCover := firstNonEmpty(settings.Pages.FriendsHeroImage, "/uploads/admin/friends.png")
	defaultFriendCover := firstNonEmpty(settings.Pages.FriendDefaultCover, settings.Pages.FriendsHeroImage, "/uploads/admin/friends.png")
	indexMD := fmt.Sprintf("---\ntitle: %q\nlayout: %q\ngenerated_by: %q\ndraft: false\n---\n\n", "朋友", "friends-list", "songline-friends-sync")
	if err := os.WriteFile(filepath.Join(friendsRoot, "_index.md"), []byte(indexMD), 0644); err != nil {
		return err
	}
	_ = listCover

	// 清理旧的自动生成朋友页，避免改名后残留旧 URL。
	old, _ := filepath.Glob(filepath.Join(friendsRoot, "*", "index.md"))
	for _, fp := range old {
		data, err := os.ReadFile(fp)
		if err == nil && strings.Contains(string(data), "generated_by: songline-friends-sync") {
			_ = os.RemoveAll(filepath.Dir(fp))
		}
	}

	for _, f := range friends {
		dir := filepath.Join(friendsRoot, f.Slug)
		if err := os.MkdirAll(dir, 0755); err != nil {
			return err
		}
		title := f.DisplayName
		bio := f.Bio
		cover := f.Cover
		if cover == "" {
			cover = defaultFriendCover
		}
		md := fmt.Sprintf("---\ntitle: %q\nlayout: %q\ngenerated_by: %q\nfriend_username: %q\nfriend_display_name: %q\nfriend_bio: %q\nfriend_homepage: %q\nfriend_avatar: %q\nfriend_cover: %q\nfriend_post_count: %d\ndraft: false\n---\n\n", title, "friend-profile", "songline-friends-sync", f.Username, f.DisplayName, bio, f.Homepage, f.Avatar, cover, f.PostCount)
		if err := os.WriteFile(filepath.Join(dir, "index.md"), []byte(md), 0644); err != nil {
			return err
		}
	}
	return nil
}
