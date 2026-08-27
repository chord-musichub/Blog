package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// 本文件管理主题默认值、参数校验、动态变量 CSS 与主题设置页面。
var (
	cssColorRE  = regexp.MustCompile(`^#[0-9a-fA-F]{3,8}$`)
	cssSizeRE   = regexp.MustCompile(`^[0-9.]+(px|rem|em|%)$`)
	cssNumberRE = regexp.MustCompile(`^(0(\.\d+)?|1(\.0+)?)$`)
)

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
	if cssColorRE.MatchString(v) {
		return v
	}
	return fallback
}

func safeCSSSize(v, fallback string) string {
	v = strings.TrimSpace(v)
	if cssSizeRE.MatchString(v) {
		return v
	}
	return fallback
}

func safeCSSNumber(v, fallback string) string {
	v = strings.TrimSpace(v)
	if v == "" {
		return fallback
	}
	if cssNumberRE.MatchString(v) {
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
