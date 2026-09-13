package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// 朋友页运行时数据合并与 Hugo 页面生成。

// syncFriendContentPages 从部署实例自己的 data/friends.json 重建本站用户的
// 资料页。文件首次由 assets/data/friends/friends.json 补种；外部节点不生成
// 本地资料页，也不会因本实例的账号变动而被覆盖。
func (app *App) syncFriendContentPages() error {
	dataPath := runtimeDataPath(app.cfg.DataDir, "friends.json")
	if err := app.ensurePublicFriendsData(); err != nil {
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
		// URL 之外，历史默认头像也需要随构建迁移；否则内存里虽已替换，
		// 运行时 friends.json 仍会在下一次启动时恢复成旧站点 Logo。
		if normalized.URL != friends[i].URL || normalized.Avatar != friends[i].Avatar {
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

// writeFriendContentPages 只处理本程序生成的资料页，避免删除用户自行维护的内容。
func (app *App) writeFriendContentPages(friends []PublicFriend) error {
	base := filepath.Clean(app.cfg.HugoContentDir)
	contentRoot := filepath.Dir(base)
	friendsRoot := filepath.Join(contentRoot, "friends")
	if err := os.MkdirAll(friendsRoot, 0755); err != nil {
		return err
	}

	settings, _ := app.loadSiteSettings()
	listCover := firstNonEmpty(settings.Pages.FriendsHeroImage, "/uploads/admin/background/qiandai_background.png")
	defaultFriendCover := firstNonEmpty(settings.Pages.FriendDefaultCover, settings.Pages.FriendsHeroImage, "/uploads/admin/background/qiandai_background.png")
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
		if strings.TrimSpace(f.Username) == "" {
			continue
		}
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
