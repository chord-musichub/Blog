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
			URL:         friendProfileURL(slug),
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

	return app.writeFriendContentPages(friends)
}

// syncFriendContentPages 从 data/friends.json 重建资料页；不从 users.json
// 推导成员，避免一次普通站点重建意外改写朋友名单。
func (app *App) syncFriendContentPages() error {
	dataPath := filepath.Join(app.cfg.DataDir, "friends.json")
	// 部署时 data 目录通常是持久化卷。早期版本曾把该文件缩减成只含
	// 站长的一项；若直接以它构建 Hugo，朋友星图就只会渲染中心节点。
	// 仅在这类明显不完整的迁移状态下，使用随站点发布的历史完整名单补回，
	// 正常的多成员服务器数据绝不会被这里覆盖。
	if err := app.recoverIncompleteFriendData(dataPath); err != nil {
		return err
	}
	data, err := os.ReadFile(dataPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	var friends []PublicFriend
	if err := json.Unmarshal(data, &friends); err != nil {
		return err
	}
	changed := false
	for i := range friends {
		normalized := normalizePublicFriend(friends[i])
		if normalized.URL != friends[i].URL {
			changed = true
		}
		friends[i] = normalized
	}
	if changed {
		b, err := json.MarshalIndent(friends, "", "  ")
		if err != nil {
			return err
		}
		if err := os.WriteFile(dataPath, b, 0644); err != nil {
			return err
		}
	}
	return app.writeFriendContentPages(friends)
}

func (app *App) recoverIncompleteFriendData(dataPath string) error {
	var current []PublicFriend
	if data, err := os.ReadFile(dataPath); err == nil && len(data) > 0 {
		if err := json.Unmarshal(data, &current); err != nil {
			return err
		}
	} else if err != nil && !os.IsNotExist(err) {
		return err
	}
	// 一名成员正是旧版错误写入的特征；两名及以上视为管理员维护的数据。
	if len(current) > 1 {
		return nil
	}

	seedPath := filepath.Join("static", "friends-data.json")
	seedData, err := os.ReadFile(seedPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	var seed []PublicFriend
	if err := json.Unmarshal(seedData, &seed); err != nil {
		return err
	}
	if len(seed) <= len(current) {
		return nil
	}

	// current 放在 generated 位置，使现有站长资料优先于随镜像附带的旧快照。
	restored := mergePublicFriends(seed, current)
	b, err := json.MarshalIndent(restored, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(dataPath), 0755); err != nil {
		return err
	}
	return os.WriteFile(dataPath, b, 0644)
}

// writeFriendContentPages 只处理本程序生成的资料页，避免删除用户自行维护的内容。
func (app *App) writeFriendContentPages(friends []PublicFriend) error {
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
