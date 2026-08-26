package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// 本文件管理主题默认值、参数校验、动态变量 CSS 与主题设置页面。

func (app *App) themeSettingsPath() string {
	return filepath.Join(app.cfg.DataDir, "theme.json")
}

func defaultThemeSettings() ThemeSettings {
	return ThemeSettings{
		Preset:       "soft-blue",
		Accent:       "#0ea5e9",
		Accent2:      "#2563eb",
		Background:   "#fbfaf7",
		Panel:        "#fffdfa",
		Text:         "#15345b",
		Muted:        "#64748b",
		Radius:       "18px",
		Shadow:       "soft",
		MaxWidth:     "1280px",
		HeroHeight:   "300px",
		ContentWidth: "860px",
		BodyFontSize: "17px",
		Watercolor:   true,
	}
}

func (app *App) loadThemeSettings() (ThemeSettings, error) {
	t := defaultThemeSettings()
	b, err := os.ReadFile(app.themeSettingsPath())
	if errors.Is(err, os.ErrNotExist) {
		return t, nil
	}
	if err != nil {
		return t, err
	}
	if len(strings.TrimSpace(string(b))) == 0 {
		return t, nil
	}
	if err := json.Unmarshal(b, &t); err != nil {
		return t, err
	}
	return t, nil
}

func (app *App) saveThemeSettings(t ThemeSettings) error {
	if err := os.MkdirAll(app.cfg.DataDir, 0700); err != nil {
		return err
	}
	b, err := json.MarshalIndent(t, "", "  ")
	if err != nil {
		return err
	}
	tmp := app.themeSettingsPath() + ".tmp"
	if err := os.WriteFile(tmp, b, 0600); err != nil {
		return err
	}
	if err := os.Rename(tmp, app.themeSettingsPath()); err != nil {
		return err
	}
	return app.writeThemeCSS(t)
}

func (app *App) writeThemeCSS(t ThemeSettings) error {
	if err := os.MkdirAll(filepath.Join("static", "css"), 0755); err != nil {
		return err
	}
	shadow := "0 18px 45px rgba(55,84,120,.08)"
	if t.Shadow == "none" {
		shadow = "none"
	} else if t.Shadow == "strong" {
		shadow = "0 24px 70px rgba(39,74,112,.16)"
	}
	if t.Radius == "" {
		t.Radius = "18px"
	}
	if t.MaxWidth == "" {
		t.MaxWidth = "1280px"
	}
	if t.HeroHeight == "" {
		t.HeroHeight = "300px"
	}
	if t.BodyFontSize == "" {
		t.BodyFontSize = "17px"
	}
	css := fmt.Sprintf(`:root{
  --bg:%s;
  --panel:%s;
  --text:%s;
  --muted:%s;
  --accent:%s;
  --accent-2:%s;
  --radius:%s;
  --max:%s;
  --shadow:%s;
}
.hero-banner{min-height:%s}
.page-hero{min-height:calc(%s - 30px)}
.markdown-body{font-size:%s}
.article-reader{max-width:%s}
`, safeCSSColor(t.Background, "#fbfaf7"), safeCSSColor(t.Panel, "#fffdfa"), safeCSSColor(t.Text, "#15345b"), safeCSSColor(t.Muted, "#64748b"), safeCSSColor(t.Accent, "#0ea5e9"), safeCSSColor(t.Accent2, "#2563eb"), safeCSSSize(t.Radius, "18px"), safeCSSSize(t.MaxWidth, "1280px"), shadow, safeCSSSize(t.HeroHeight, "300px"), safeCSSSize(t.HeroHeight, "300px"), safeCSSSize(t.BodyFontSize, "17px"), safeCSSSize(t.ContentWidth, "860px"))
	if !t.Watercolor {
		css += ".hero-banner,.page-hero{background-image:none!important}\n"
	}
	return os.WriteFile(filepath.Join("static", "css", "theme-vars.css"), []byte(css), 0644)
}

func safeCSSColor(v, fallback string) string {
	v = strings.TrimSpace(v)
	re := regexp.MustCompile(`^#[0-9a-fA-F]{3,8}$`)
	if re.MatchString(v) {
		return v
	}
	return fallback
}

func safeCSSSize(v, fallback string) string {
	v = strings.TrimSpace(v)
	re := regexp.MustCompile(`^[0-9.]+(px|rem|em|%)$`)
	if re.MatchString(v) {
		return v
	}
	return fallback
}

func safeCSSNumber(v, fallback string) string {
	v = strings.TrimSpace(v)
	if v == "" {
		return fallback
	}
	matched, _ := regexp.MatchString(`^(0(\.\d+)?|1(\.0+)?)$`, v)
	if matched {
		return v
	}
	return fallback
}

func (app *App) ensureThemeDefaults() error {
	t, err := app.loadThemeSettings()
	if err != nil {
		return err
	}
	if err := app.saveThemeSettings(t); err != nil {
		return err
	}
	return nil
}

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
