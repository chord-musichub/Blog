package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// 本文件负责将后台运行时数据转换为 Hugo 的公开站输入，并串行执行构建。

func (app *App) hugoRootDir() string {
	contentDir := filepath.Clean(app.cfg.HugoContentDir)
	// 示例：/opt/gexian-blog-mvp/content/posts -> /opt/gexian-blog-mvp
	return filepath.Dir(filepath.Dir(contentDir))
}

func (app *App) writeArticleSourceMarkdown(a Article, source string) (string, error) {
	if strings.TrimSpace(a.Slug) == "" {
		return "", nil
	}
	root := app.hugoRootDir()
	dir := filepath.Join(root, "static", "md-source")
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", err
	}
	name := slugify(a.Slug)
	if name == "" {
		name = a.ID
	}
	fileName := name + ".md"
	if err := os.WriteFile(filepath.Join(dir, fileName), []byte(source), 0644); err != nil {
		return "", err
	}
	return "/md-source/" + fileName, nil
}

func (app *App) effectiveArticleSummary(a Article) string {
	if s := strings.TrimSpace(a.Summary); s != "" {
		return s
	}
	settings, err := app.loadSiteSettings()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(settings.Manuscript.DefaultSummary)
}

func (app *App) writeHugoArticle(a Article) error {
	dir := filepath.Join(app.cfg.HugoContentDir, a.Slug)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	date := a.CreatedAt.Format(time.RFC3339)
	if a.PublishedAt != nil {
		date = a.PublishedAt.Format(time.RFC3339)
	}
	authorDisplay := a.Author
	accountType := accountFriend
	showInFriends := true
	authorBio := ""
	authorHomepage := ""
	authorAvatar := ""
	authorCover := ""
	if u, ok := app.store.GetUser(a.Author); ok {
		authorDisplay = firstNonEmpty(u.DisplayName, u.Username)
		accountType = normalizeAccountType(u.Role, u.AccountType)
		showInFriends = u.ShowInFriends || accountType == accountFriend
		authorBio = u.Bio
		authorHomepage = u.Homepage
		authorAvatar = u.Avatar
		authorCover = u.Cover
	}
	// 朋友主页从账号资料生成，不再依赖文章 taxonomy。
	_ = showInFriends
	friendsList := []string{}
	friends, _ := json.Marshal(friendsList)
	isNotice := accountType == accountSystem
	displayTags := filterProtectedNoticeTags(append([]string{}, a.Tags...))
	if isNotice {
		displayTags = appendUniqueTag(displayTags, noticeTagSlug)
	}
	tags, _ := json.Marshal(displayTags)
	coverLine := ""
	if strings.TrimSpace(a.Cover) != "" {
		coverLine = fmt.Sprintf("cover: %q\ncover_mode: %q\n", a.Cover, normalizeCoverMode(a.CoverMode))
	}
	// v20.0.8: 公开页的客户端渲染源以最新编辑正文为准，避免旧上传源文件覆盖新内容。
	sourceMD := a.Body
	if strings.TrimSpace(sourceMD) == "" {
		sourceMD = a.SourceMD
	}
	sourceURL, err := app.writeArticleSourceMarkdown(a, sourceMD)
	if err != nil {
		return err
	}
	sourceB64 := base64.StdEncoding.EncodeToString([]byte(sourceMD))
	renderBody := normalizeArticleBodyForHugo(a.Body)
	summary := app.effectiveArticleSummary(a)
	md := fmt.Sprintf("---\ntitle: %q\ndate: %q\nauthor: %q\nauthor_username: %q\nauthor_display: %q\naccount_type: %q\nis_notice: %t\nfriends: %s\ntags: %s\nsummary: %q\n%sauthor_bio: %q\nauthor_homepage: %q\nauthor_avatar: %q\nauthor_cover: %q\nsource_md_url: %q\nsource_md_b64: %q\ndraft: false\n---\n\n%s\n", a.Title, date, authorDisplay, a.Author, authorDisplay, accountType, isNotice, friends, tags, summary, coverLine, authorBio, authorHomepage, authorAvatar, authorCover, sourceURL, sourceB64, renderBody)
	return os.WriteFile(filepath.Join(dir, "index.md"), []byte(md), 0644)
}

func (app *App) removeHugoArticle(a Article) error {
	if a.Slug == "" {
		return nil
	}
	dir := filepath.Join(app.cfg.HugoContentDir, a.Slug)
	return os.RemoveAll(dir)
}

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

func friendMergeKey(f PublicFriend) string {
	if strings.TrimSpace(f.Username) != "" {
		return "u:" + strings.ToLower(strings.TrimSpace(f.Username))
	}
	if strings.TrimSpace(f.DisplayName) != "" {
		return "n:" + strings.ToLower(strings.TrimSpace(f.DisplayName))
	}
	if strings.TrimSpace(f.Slug) != "" {
		return "s:" + strings.ToLower(strings.TrimSpace(f.Slug))
	}
	return ""
}

func normalizePublicFriend(f PublicFriend) PublicFriend {
	f.Username = strings.TrimSpace(f.Username)
	f.DisplayName = strings.TrimSpace(f.DisplayName)
	if f.DisplayName == "" {
		f.DisplayName = f.Username
	}
	f.Slug = strings.TrimSpace(f.Slug)
	if f.Slug == "" {
		f.Slug = slugify(firstNonEmpty(f.DisplayName, f.Username))
	}
	if f.Slug == "" {
		f.Slug = "friend"
	}
	f.URL = strings.TrimSpace(f.URL)
	if f.URL == "" {
		f.URL = "/friends/" + f.Slug + "/"
	}
	f.Bio = strings.TrimSpace(f.Bio)
	f.Homepage = strings.TrimSpace(f.Homepage)
	f.Avatar = firstNonEmpty(strings.TrimSpace(f.Avatar), "/uploads/admin/main_logo.png")
	f.Cover = strings.TrimSpace(f.Cover)
	f.UpdatedAt = strings.TrimSpace(f.UpdatedAt)
	if f.PostTitles == nil {
		f.PostTitles = []string{}
	}
	return f
}

func mergePublicFriends(existing []PublicFriend, generated []PublicFriend) []PublicFriend {
	merged := map[string]PublicFriend{}
	order := []string{}
	put := func(f PublicFriend, preferNew bool) {
		f = normalizePublicFriend(f)
		key := friendMergeKey(f)
		if key == "" {
			return
		}
		old, ok := merged[key]
		if !ok {
			merged[key] = f
			order = append(order, key)
			return
		}
		if preferNew {
			// v20.2.3：账号资料负责更新朋友公开页资料，头像/横幅以用户资料为准。
			if strings.TrimSpace(f.Username) != "" {
				old.Username = f.Username
			}
			if strings.TrimSpace(f.DisplayName) != "" {
				old.DisplayName = f.DisplayName
			}
			if strings.TrimSpace(f.Slug) != "" {
				old.Slug = f.Slug
			}
			if strings.TrimSpace(f.URL) != "" {
				old.URL = f.URL
			}
			if strings.TrimSpace(f.Bio) != "" {
				old.Bio = f.Bio
			}
			if strings.TrimSpace(f.Homepage) != "" {
				old.Homepage = f.Homepage
			}
			if strings.TrimSpace(f.Avatar) != "" {
				old.Avatar = f.Avatar
			}
			if strings.TrimSpace(f.Cover) != "" {
				old.Cover = f.Cover
			}
			old.PostCount = f.PostCount
			old.PostTitles = f.PostTitles
			old.UpdatedAt = f.UpdatedAt
		} else {
			if strings.TrimSpace(old.Username) == "" {
				old.Username = f.Username
			}
			if strings.TrimSpace(old.DisplayName) == "" {
				old.DisplayName = f.DisplayName
			}
			if strings.TrimSpace(old.Bio) == "" {
				old.Bio = f.Bio
			}
			if strings.TrimSpace(old.Homepage) == "" {
				old.Homepage = f.Homepage
			}
			if strings.TrimSpace(old.Avatar) == "" {
				old.Avatar = f.Avatar
			}
			if strings.TrimSpace(old.Cover) == "" {
				old.Cover = f.Cover
			}
		}
		merged[key] = normalizePublicFriend(old)
	}
	for _, f := range existing {
		put(f, false)
	}
	for _, f := range generated {
		put(f, true)
	}

	usedSlugs := map[string]int{}
	out := []PublicFriend{}
	for _, key := range order {
		f := normalizePublicFriend(merged[key])
		base := slugify(firstNonEmpty(f.Slug, f.DisplayName, f.Username))
		if base == "" {
			base = "friend"
		}
		if n := usedSlugs[base]; n > 0 {
			usedSlugs[base] = n + 1
			f.Slug = fmt.Sprintf("%s-%d", base, n+1)
		} else {
			usedSlugs[base] = 1
			f.Slug = base
		}
		f.URL = "/friends/" + f.Slug + "/"
		out = append(out, f)
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].PostCount != out[j].PostCount {
			return out[i].PostCount > out[j].PostCount
		}
		return strings.ToLower(out[i].DisplayName) < strings.ToLower(out[j].DisplayName)
	})
	return out
}

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

func (app *App) syncPublishedArticles() error {
	for _, a := range app.store.AllArticles() {
		if a.Status != stPublished {
			continue
		}
		if strings.TrimSpace(a.Slug) == "" {
			continue
		}
		if err := app.writeHugoArticle(a); err != nil {
			return err
		}
	}
	return nil
}

func (app *App) ensureBuiltinContentPages() error {
	base := filepath.Clean(app.cfg.HugoContentDir)
	contentRoot := filepath.Dir(base)

	toolsRoot := filepath.Join(contentRoot, "tools")
	if err := os.MkdirAll(filepath.Join(toolsRoot, "markdown-previewer"), 0755); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Join(toolsRoot, "random-number"), 0755); err != nil {
		return err
	}
	toolsIndex := "---\ntitle: \"工具\"\nlayout: \"tools\"\ngenerated_by: \"songline-tools-fallback\"\ndraft: false\n---\n\n"
	if err := os.WriteFile(filepath.Join(toolsRoot, "_index.md"), []byte(toolsIndex), 0644); err != nil {
		return err
	}
	mdIndex := "---\ntitle: \"Markdown 预览器\"\nlayout: \"markdown-previewer\"\ngenerated_by: \"songline-tools-fallback\"\ndraft: false\n---\n\n"
	if err := os.WriteFile(filepath.Join(toolsRoot, "markdown-previewer", "_index.md"), []byte(mdIndex), 0644); err != nil {
		return err
	}
	randomIndex := "---\ntitle: \"随机数生成器\"\nlayout: \"random-number\"\ngenerated_by: \"songline-tools-fallback\"\ndraft: false\n---\n\n"
	if err := os.WriteFile(filepath.Join(toolsRoot, "random-number", "_index.md"), []byte(randomIndex), 0644); err != nil {
		return err
	}

	noticeRoot := filepath.Join(contentRoot, "tags", "site-notice")
	if err := os.MkdirAll(noticeRoot, 0755); err != nil {
		return err
	}
	noticeIndex := "---\ntitle: \"站点公告\"\nlayout: \"site-notice\"\ngenerated_by: \"songline-notice-fallback\"\ndraft: false\n---\n\n"
	if _, err := os.Stat(filepath.Join(noticeRoot, "_index.md")); errors.Is(err, os.ErrNotExist) {
		if err := os.WriteFile(filepath.Join(noticeRoot, "_index.md"), []byte(noticeIndex), 0644); err != nil {
			return err
		}
	}
	return nil
}

func (app *App) runHugo(ctx context.Context) error {
	app.buildMu.Lock()
	defer app.buildMu.Unlock()

	if err := app.ensureSiteDefaults(); err != nil {
		return err
	}
	if err := app.ensureThemeDefaults(); err != nil {
		return err
	}
	if err := app.syncPublishedArticles(); err != nil {
		return err
	}
	// 朋友页改为以 data/friends.json 为唯一长期数据源。
	// 这里不再由后台根据 users.json 自动重写 friends.json，避免发布文章或重建时把星图朋友数据缩成 1 人。
	// 公开朋友数据会在构建前同步到静态资源目录。
	if err := app.ensureBuiltinContentPages(); err != nil {
		return err
	}
	if err := app.writeRuntimeConfig(); err != nil {
		return err
	}
	if strings.TrimSpace(app.cfg.HugoCommand) == "" {
		return nil
	}
	cctx, cancel := context.WithTimeout(ctx, app.cfg.HugoBuildTimeout)
	defer cancel()
	parts := strings.Fields(app.cfg.HugoCommand)
	if app.cfg.PublicSiteURL != "" && strings.EqualFold(filepath.Base(parts[0]), "hugo") {
		parts = append(parts, "--baseURL", app.cfg.PublicSiteURL)
	}
	cmd := exec.CommandContext(cctx, parts[0], parts[1:]...)
	cmd.Dir = "."
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("%v\n%s", err, string(out))
	}
	return nil
}

func (app *App) writeRuntimeConfig() error {
	if err := os.MkdirAll("static", 0755); err != nil {
		return err
	}
	payload, err := json.Marshal(struct {
		PublicAPIURL string `json:"publicApiUrl"`
	}{PublicAPIURL: app.cfg.PublicAPIURL})
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join("static", "runtime-config.js"), append([]byte("window.BlogRuntimeConfig = Object.freeze("), append(payload, []byte(");\n")...)...), 0644)
}
