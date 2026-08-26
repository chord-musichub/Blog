package main

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// 本文件管理公开站全局设置、首页轨道配置与稿件默认设置。

func (app *App) siteSettingsPath() string {
	return filepath.Join(app.cfg.DataDir, "site.json")
}

func normalizeContactHref(raw string, defaultScheme string) string {
	v := strings.TrimSpace(raw)
	v = strings.ReplaceAll(v, "：", ":")
	if v == "" {
		return ""
	}
	lower := strings.ToLower(v)
	if strings.HasPrefix(lower, "mailto:") {
		addr := strings.TrimSpace(v[len("mailto:"):])
		if addr == "" {
			return ""
		}
		return "mailto:" + addr
	}
	if strings.HasPrefix(lower, "http://") || strings.HasPrefix(lower, "https://") || strings.HasPrefix(lower, "tel:") {
		return v
	}
	if defaultScheme == "mailto" {
		return "mailto:" + v
	}
	return v
}

func defaultOrbitSettings() OrbitSettings {
	return OrbitSettings{
		Title:   "星际入口",
		Posts:   OrbitEntry{Label: "文章", Kicker: "Archive", Title: "文章", Description: "浏览所有文章，按时间回看学习、项目和创作记录。", Href: "/posts/", LinkText: "进入文章"},
		Tags:    OrbitEntry{Label: "标签", Kicker: "Tags", Title: "标签", Description: "按标签寻找主题，把零散内容重新归档成线索。", Href: "/tags/", LinkText: "查看标签"},
		Friends: OrbitEntry{Label: "朋友", Kicker: "Friends", Title: "朋友", Description: "查看朋友们的主页与文字，进入这个小小的创作星图。", Href: "/friends/", LinkText: "查看朋友"},
		Tools:   OrbitEntry{Label: "工具", Kicker: "Tools", Title: "工具", Description: "打开站内小工具和实验页面，放一些顺手好用的东西。", Href: "/tools/", LinkText: "进入工具"},
		Notice:  OrbitEntry{Label: "公告", Kicker: "Notice", Title: "公告", Description: "查看站点更新、投稿说明和一些需要被看见的小通知。", Href: "#site-notice", LinkText: "查看公告"},
		About:   OrbitEntry{Label: "关于本站", Kicker: "About", Title: "关于本站", Description: "查看站点说明，了解这个小空间被放在这里的原因。", Href: "#site-intro", LinkText: "查看关于"},
	}
}

func fillOrbitEntry(v *OrbitEntry, d OrbitEntry) {
	if strings.TrimSpace(v.Label) == "" {
		v.Label = d.Label
	}
	if strings.TrimSpace(v.Kicker) == "" {
		v.Kicker = d.Kicker
	}
	if strings.TrimSpace(v.Title) == "" {
		v.Title = d.Title
	}
	if strings.TrimSpace(v.Description) == "" {
		v.Description = d.Description
	}
	if strings.TrimSpace(v.Href) == "" {
		v.Href = d.Href
	}
	if strings.TrimSpace(v.LinkText) == "" {
		v.LinkText = d.LinkText
	}
}

func cleanOrbitHref(raw string, fallback string) string {
	v := strings.TrimSpace(raw)
	if v == "" {
		return fallback
	}
	if strings.HasPrefix(v, "#") || strings.HasPrefix(v, "/") || strings.HasPrefix(v, "http://") || strings.HasPrefix(v, "https://") {
		return v
	}
	return fallback
}

func defaultSiteSettings() SiteSettings {
	return SiteSettings{
		Site: SiteBasic{Title: "Songline Blog", DisplayName: "Blog", FooterText: "由热爱驱动，持续记录", ICP: "暂无", Logo: "Songline Blog", LogoIcon: "/uploads/admin/main_logo.png", Favicon: "/uploads/admin/main_logo.png", EnableDarkToggle: true},
		Home: HomeSettings{HeroTitle: "欢迎来到 Blog", HeroSubtitle: "记录学习、创作与生活的每一段足迹，在文字中连接思想，在分享中共同成长。", HeroImage: "/uploads/admin/show.png", IntroTitle: "这个站是什么？", IntroBody: "Blog 是一个个人博客，专注于分享我在技术、创作、项目与生活中的所思所学。\n这里没有噱头与套路，只有真诚的记录与持续的输出。\n希望它能成为我的数字花园，也能为你带来一些启发与帮助。", FoundedAt: "2026/5/8", RecommendedCount: 6},
		Pages: PageSettings{
			PostsHeroTitle: "文章", PostsHeroSubtitle: "记录思考，分享见解，探索技术与生活的更多可能。", PostsHeroImage: "/uploads/admin/article.png",
			TagsHeroTitle: "标签", TagsHeroSubtitle: "按主题浏览，发现感兴趣的内容。", TagsHeroImage: "/uploads/admin/tag.png",
			FriendsHeroTitle: "朋友", FriendsHeroSubtitle: "在这里，遇见一群热爱写作与分享的朋友。\n他们用文字记录生活，也温暖着彼此。", FriendsHeroImage: "/uploads/admin/friends.png",
			ArticleDefaultCover: "/uploads/admin/article_default.png", TagDefaultCover: "/uploads/admin/article_default.png", FriendDefaultCover: "/uploads/admin/article_default.png", ToolsHeroTitle: "工具", ToolsHeroSubtitle: "一些轻量小工具。",
		},
		Boot:       BootSettings{WelcomeText: "欢迎回来"},
		Orbit:      defaultOrbitSettings(),
		Manuscript: ManuscriptSettings{DefaultSummary: "这篇文章暂时还没有填写简介，先点进去看看正文吧。"},
		Background: BackgroundSettings{Image: "", Height: "420px", Blur: "18px", Opacity: "0.38"},
		AboutCard:  AboutCard{Title: "关于本站", AvatarText: "B", Name: "Blog", Body: "这是一个记录学习、创作与生活的个人博客。\n在这里，分享思考，沉淀成长，遇见更好的自己。"},
		Social:     SocialSettings{GitHub: "https://github.com/", Email: "mailto:hello@example.com", Bilibili: "https://space.bilibili.com/", ShowGitHub: true, ShowEmail: true, ShowBilibili: true, BilibiliIcon: "/uploads/admin/bilibili.png"},
		ContentAreas: []ContentArea{
			{Title: "技术笔记", Description: "记录开发过程中的知识、踩坑与解决方案。", Icon: "code", Link: "/tags/技术笔记/"},
			{Title: "创作记录", Description: "设计、写作、摄影等创作过程与灵感。", Icon: "pen", Link: "/tags/创作记录/"},
			{Title: "项目日志", Description: "独立项目的构思、开发与复盘总结。", Icon: "folder", Link: "/tags/项目日志/"},
			{Title: "生活随笔", Description: "关于阅读、思考与日常生活的片段。", Icon: "cup", Link: "/tags/生活随笔/"},
		},
	}
}

func (app *App) loadSiteSettings() (SiteSettings, error) {
	s := defaultSiteSettings()
	b, err := os.ReadFile(app.siteSettingsPath())
	if errors.Is(err, os.ErrNotExist) {
		return s, nil
	}
	if err != nil {
		return s, err
	}
	if len(strings.TrimSpace(string(b))) == 0 {
		return s, nil
	}
	if err := json.Unmarshal(b, &s); err != nil {
		return s, err
	}
	defaults := defaultSiteSettings()
	if len(s.ContentAreas) == 0 {
		s.ContentAreas = defaults.ContentAreas
	}
	if s.Pages.PostsHeroTitle == "" {
		s.Pages.PostsHeroTitle = defaults.Pages.PostsHeroTitle
	}
	if s.Pages.PostsHeroSubtitle == "" {
		s.Pages.PostsHeroSubtitle = defaults.Pages.PostsHeroSubtitle
	}
	if s.Pages.TagsHeroTitle == "" {
		s.Pages.TagsHeroTitle = defaults.Pages.TagsHeroTitle
	}
	if s.Pages.TagsHeroSubtitle == "" {
		s.Pages.TagsHeroSubtitle = defaults.Pages.TagsHeroSubtitle
	}
	if s.Pages.FriendsHeroTitle == "" {
		s.Pages.FriendsHeroTitle = defaults.Pages.FriendsHeroTitle
	}
	if s.Pages.FriendsHeroSubtitle == "" {
		s.Pages.FriendsHeroSubtitle = defaults.Pages.FriendsHeroSubtitle
	}
	if s.Home.FoundedAt == "" {
		s.Home.FoundedAt = defaults.Home.FoundedAt
	}
	if s.Home.RecommendedCount <= 0 {
		s.Home.RecommendedCount = defaults.Home.RecommendedCount
	}
	if s.Pages.ToolsHeroTitle == "" {
		s.Pages.ToolsHeroTitle = defaults.Pages.ToolsHeroTitle
	}
	if s.Pages.ToolsHeroSubtitle == "" {
		s.Pages.ToolsHeroSubtitle = defaults.Pages.ToolsHeroSubtitle
	}
	if strings.TrimSpace(s.Boot.WelcomeText) == "" {
		s.Boot.WelcomeText = defaults.Boot.WelcomeText
	}
	if strings.TrimSpace(s.Orbit.Title) == "" {
		s.Orbit.Title = defaults.Orbit.Title
	}
	fillOrbitEntry(&s.Orbit.Posts, defaults.Orbit.Posts)
	fillOrbitEntry(&s.Orbit.Tags, defaults.Orbit.Tags)
	fillOrbitEntry(&s.Orbit.Friends, defaults.Orbit.Friends)
	fillOrbitEntry(&s.Orbit.Tools, defaults.Orbit.Tools)
	fillOrbitEntry(&s.Orbit.Notice, defaults.Orbit.Notice)
	fillOrbitEntry(&s.Orbit.About, defaults.Orbit.About)
	if s.Manuscript.DefaultSummary == "" {
		s.Manuscript.DefaultSummary = defaults.Manuscript.DefaultSummary
	}
	if s.Background.Height == "" {
		s.Background.Height = defaults.Background.Height
	}
	if s.Background.Blur == "" {
		s.Background.Blur = defaults.Background.Blur
	}
	if s.Background.Opacity == "" {
		s.Background.Opacity = defaults.Background.Opacity
	}
	return s, nil
}

func (app *App) saveSiteSettings(s SiteSettings) error {
	if err := os.MkdirAll(app.cfg.DataDir, 0700); err != nil {
		return err
	}
	b, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}
	tmp := app.siteSettingsPath() + ".tmp"
	if err := os.WriteFile(tmp, b, 0600); err != nil {
		return err
	}
	return os.Rename(tmp, app.siteSettingsPath())
}

func (app *App) ensureSiteDefaults() error {
	if _, err := os.Stat(app.siteSettingsPath()); errors.Is(err, os.ErrNotExist) {
		return app.saveSiteSettings(defaultSiteSettings())
	}
	return nil
}

func (app *App) handleManuscriptSettings(w http.ResponseWriter, r *http.Request) {
	u, _ := app.currentUser(r)
	settings, err := app.loadSiteSettings()
	if err != nil {
		http.Error(w, "读取稿件设置失败: "+err.Error(), 500)
		return
	}
	if r.Method == http.MethodGet {
		app.render(w, "manuscript_settings.html", map[string]any{
			"User":     u,
			"Settings": settings,
			"Flash":    r.URL.Query().Get("msg"),
		})
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", 405)
		return
	}
	if err := r.ParseForm(); err != nil {
		http.Error(w, "bad request", 400)
		return
	}
	settings.Manuscript.DefaultSummary = strings.TrimSpace(r.FormValue("default_summary"))
	if err := app.saveSiteSettings(settings); err != nil {
		http.Error(w, "保存稿件设置失败: "+err.Error(), 500)
		return
	}
	if err := app.runHugo(r.Context()); err != nil {
		log.Printf("hugo build after manuscript settings error: %v", err)
		app.redirect(w, r, "/admin/manuscript?msg=稿件设置已保存，但公开站构建失败，请看日志", http.StatusSeeOther)
		return
	}
	app.redirect(w, r, "/admin/manuscript?msg=稿件设置已保存并重建公开站", http.StatusSeeOther)
}

func (app *App) handleSiteSettings(w http.ResponseWriter, r *http.Request) {
	u, _ := app.currentUser(r)
	settings, err := app.loadSiteSettings()
	if err != nil {
		http.Error(w, "读取站点设置失败: "+err.Error(), 500)
		return
	}
	if r.Method == http.MethodGet {
		theme, _ := app.loadThemeSettings()
		app.render(w, "site_settings.html", map[string]any{"User": u, "Settings": settings, "Theme": theme, "Flash": r.URL.Query().Get("msg")})
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", 405)
		return
	}
	if err := r.ParseForm(); err != nil {
		http.Error(w, "bad request", 400)
		return
	}
	settings.Site.Title = strings.TrimSpace(r.FormValue("site_title"))
	settings.Site.DisplayName = strings.TrimSpace(r.FormValue("display_name"))
	settings.Site.Logo = strings.TrimSpace(r.FormValue("logo"))
	settings.Site.LogoIcon = cleanPublicPath(r.FormValue("logo_icon"))
	settings.Site.Favicon = cleanPublicPath(r.FormValue("favicon"))
	settings.Site.FooterText = strings.TrimSpace(r.FormValue("footer_text"))
	settings.Site.ICP = strings.TrimSpace(r.FormValue("icp"))
	settings.Site.EnableDarkToggle = true
	// v20.18.5: 首页欢迎区只保留封面图，Hero 标题/副标题已从后台 UI 移除；保留旧值避免破坏历史数据。
	settings.Home.HeroImage = cleanPublicPath(r.FormValue("hero_image"))
	settings.Home.FoundedAt = strings.TrimSpace(r.FormValue("founded_at"))
	settings.Home.RecommendedCount = safeIntRange(r.FormValue("recommended_count"), 1, 12, 6)
	settings.Home.IntroTitle = strings.TrimSpace(r.FormValue("intro_title"))
	settings.Home.IntroBody = strings.TrimSpace(r.FormValue("intro_body"))
	settings.Boot.WelcomeText = strings.TrimSpace(r.FormValue("boot_welcome_text"))
	if settings.Boot.WelcomeText == "" {
		settings.Boot.WelcomeText = defaultSiteSettings().Boot.WelcomeText
	}
	settings.Orbit.Title = strings.TrimSpace(r.FormValue("orbit_title"))
	if settings.Orbit.Title == "" {
		settings.Orbit.Title = defaultSiteSettings().Orbit.Title
	}
	orbitDefaults := defaultOrbitSettings()
	readOrbit := func(prefix string, fallback OrbitEntry) OrbitEntry {
		return OrbitEntry{
			Label:       strings.TrimSpace(r.FormValue(prefix + "_label")),
			Kicker:      strings.TrimSpace(r.FormValue(prefix + "_kicker")),
			Title:       strings.TrimSpace(r.FormValue(prefix + "_title")),
			Description: strings.TrimSpace(r.FormValue(prefix + "_desc")),
			Href:        cleanOrbitHref(r.FormValue(prefix+"_href"), fallback.Href),
			LinkText:    strings.TrimSpace(r.FormValue(prefix + "_link")),
		}
	}
	settings.Orbit.Posts = readOrbit("orbit_posts", orbitDefaults.Posts)
	fillOrbitEntry(&settings.Orbit.Posts, orbitDefaults.Posts)
	settings.Orbit.Tags = readOrbit("orbit_tags", orbitDefaults.Tags)
	fillOrbitEntry(&settings.Orbit.Tags, orbitDefaults.Tags)
	settings.Orbit.Friends = readOrbit("orbit_friends", orbitDefaults.Friends)
	fillOrbitEntry(&settings.Orbit.Friends, orbitDefaults.Friends)
	settings.Orbit.Tools = readOrbit("orbit_tools", orbitDefaults.Tools)
	fillOrbitEntry(&settings.Orbit.Tools, orbitDefaults.Tools)
	settings.Orbit.Notice = readOrbit("orbit_notice", orbitDefaults.Notice)
	fillOrbitEntry(&settings.Orbit.Notice, orbitDefaults.Notice)
	settings.Orbit.About = readOrbit("orbit_about", orbitDefaults.About)
	fillOrbitEntry(&settings.Orbit.About, orbitDefaults.About)
	settings.Pages.PostsHeroTitle = strings.TrimSpace(r.FormValue("posts_hero_title"))
	settings.Pages.PostsHeroImage = cleanPublicPath(r.FormValue("posts_hero_image"))
	settings.Pages.TagsHeroTitle = strings.TrimSpace(r.FormValue("tags_hero_title"))
	settings.Pages.TagsHeroImage = cleanPublicPath(r.FormValue("tags_hero_image"))
	settings.Pages.FriendsHeroTitle = strings.TrimSpace(r.FormValue("friends_hero_title"))
	settings.Pages.FriendsHeroImage = cleanPublicPath(r.FormValue("friends_hero_image"))
	settings.Pages.ToolsHeroTitle = strings.TrimSpace(r.FormValue("tools_hero_title"))
	settings.Pages.ArticleDefaultCover = cleanPublicPath(r.FormValue("article_default_cover"))
	settings.Pages.TagDefaultCover = cleanPublicPath(r.FormValue("tag_default_cover"))
	settings.Pages.FriendDefaultCover = cleanPublicPath(r.FormValue("friend_default_cover"))
	settings.Background.Image = cleanPublicPath(r.FormValue("background_image"))
	settings.Background.Height = safeCSSSize(r.FormValue("background_height"), "420px")
	settings.Background.Blur = safeCSSSize(r.FormValue("background_blur"), "18px")
	settings.Background.Opacity = safeCSSNumber(r.FormValue("background_opacity"), "0.38")
	settings.AboutCard.Title = strings.TrimSpace(r.FormValue("about_title"))
	settings.AboutCard.AvatarText = strings.TrimSpace(r.FormValue("about_avatar_text"))
	settings.AboutCard.AvatarImage = cleanPublicPath(r.FormValue("about_avatar_image"))
	settings.AboutCard.Name = strings.TrimSpace(r.FormValue("about_name"))
	settings.AboutCard.Body = strings.TrimSpace(r.FormValue("about_body"))
	settings.Social.GitHub = strings.TrimSpace(r.FormValue("github"))
	settings.Social.Email = normalizeContactHref(strings.TrimSpace(r.FormValue("email")), "mailto")
	settings.Social.Bilibili = strings.TrimSpace(r.FormValue("bilibili"))
	settings.Social.BilibiliIcon = cleanPublicPath(r.FormValue("bilibili_icon"))
	settings.Social.ShowGitHub = r.FormValue("show_github") == "on"
	settings.Social.ShowEmail = r.FormValue("show_email") == "on"
	settings.Social.ShowBilibili = r.FormValue("show_bilibili") == "on"

	if err := app.saveSiteSettings(settings); err != nil {
		http.Error(w, "保存站点设置失败: "+err.Error(), 500)
		return
	}
	if err := app.runHugo(r.Context()); err != nil {
		log.Printf("hugo build after site settings error: %v", err)
		app.redirect(w, r, "/admin/site?msg=设置已保存，但公开站构建失败，请看日志", http.StatusSeeOther)
		return
	}
	app.redirect(w, r, "/admin?msg=站点设置已保存并重建公开站", http.StatusSeeOther)
}
