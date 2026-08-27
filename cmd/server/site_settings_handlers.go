package main

import (
	"log"
	"net/http"
	"strings"
)

// 后台站点与稿件设置页面的 HTTP 处理器。
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
