package main

import (
	"encoding/json"
	"errors"
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
