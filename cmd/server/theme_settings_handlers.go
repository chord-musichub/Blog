package main

import (
	"log"
	"net/http"
	"strings"
)

// 后台外观设置页面的 HTTP 处理器。
func (app *App) handleThemeSettings(w http.ResponseWriter, r *http.Request) {
	u, _ := app.currentUser(r)
	theme, err := app.loadThemeSettings()
	if err != nil {
		http.Error(w, "读取外观设置失败: "+err.Error(), 500)
		return
	}
	if r.Method == http.MethodGet {
		app.render(w, "theme_settings.html", map[string]any{"User": u, "Theme": theme, "Flash": r.URL.Query().Get("msg")})
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
	preset := strings.TrimSpace(r.FormValue("preset"))
	switch preset {
	case "warm-notebook":
		theme = ThemeSettings{Preset: preset, Accent: "#d97706", Accent2: "#b45309", Background: "#fff8ee", Panel: "#fffdf8", Text: "#3f2d1d", Muted: "#7c6b5a", Radius: "20px", Shadow: "soft", MaxWidth: "1240px", HeroHeight: "300px", ContentWidth: "860px", BodyFontSize: "17px", Watercolor: true}
	case "cool-gray":
		theme = ThemeSettings{Preset: preset, Accent: "#64748b", Accent2: "#334155", Background: "#f8fafc", Panel: "#ffffff", Text: "#172033", Muted: "#64748b", Radius: "14px", Shadow: "none", MaxWidth: "1180px", HeroHeight: "260px", ContentWidth: "820px", BodyFontSize: "17px", Watercolor: false}
	case "winter":
		theme = ThemeSettings{Preset: preset, Accent: "#38bdf8", Accent2: "#0284c7", Background: "#f3f9ff", Panel: "#ffffff", Text: "#12324d", Muted: "#5c7288", Radius: "24px", Shadow: "strong", MaxWidth: "1280px", HeroHeight: "320px", ContentWidth: "880px", BodyFontSize: "17px", Watercolor: true}
	default:
		theme.Preset = "soft-blue"
	}
	if r.FormValue("use_custom") == "on" {
		theme.Preset = preset
		theme.Accent = r.FormValue("accent")
		theme.Accent2 = r.FormValue("accent_2")
		theme.Background = r.FormValue("background")
		theme.Panel = r.FormValue("panel")
		theme.Text = r.FormValue("text")
		theme.Muted = r.FormValue("muted")
		theme.Radius = r.FormValue("radius")
		theme.Shadow = r.FormValue("shadow")
		theme.MaxWidth = r.FormValue("max_width")
		theme.HeroHeight = r.FormValue("hero_height")
		theme.ContentWidth = r.FormValue("content_width")
		theme.BodyFontSize = r.FormValue("body_font_size")
		theme.Watercolor = r.FormValue("watercolor") == "on"
	}
	if err := app.saveThemeSettings(theme); err != nil {
		http.Error(w, "保存外观失败: "+err.Error(), 500)
		return
	}
	if err := app.runHugo(r.Context()); err != nil {
		log.Printf("hugo build after theme settings error: %v", err)
		app.redirect(w, r, "/admin/site?msg=外观已保存，但公开站构建失败，请看日志", http.StatusSeeOther)
		return
	}
	app.redirect(w, r, "/admin/site?msg=外观设置已保存并重建公开站", http.StatusSeeOther)
}
