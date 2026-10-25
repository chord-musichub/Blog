package server

import (
	"fmt"
	"html/template"
	"strings"
	"time"
)

func newApp(cfg Config, store *Store) *App {
	funcs := template.FuncMap{
		"dict": func(values ...any) (map[string]any, error) {
			if len(values)%2 != 0 {
				return nil, fmt.Errorf("dict expects even arg count")
			}
			m := make(map[string]any, len(values)/2)
			for i := 0; i < len(values); i += 2 {
				key, ok := values[i].(string)
				if !ok {
					return nil, fmt.Errorf("dict keys must be strings")
				}
				m[key] = values[i+1]
			}
			return m, nil
		},
		"default": func(fallback any, value any) any {
			switch v := value.(type) {
			case string:
				if strings.TrimSpace(v) == "" {
					return fallback
				}
				return v
			case int:
				if v == 0 {
					return fallback
				}
				return v
			case nil:
				return fallback
			default:
				return value
			}
		},
		"joinTags":    func(tags []string) string { return strings.Join(tags, ", ") },
		"add":         func(a, b int) int { return a + b },
		"statusText":  statusText,
		"statusClass": statusClass,
		"fmtTime": func(t time.Time) string {
			if t.IsZero() {
				return ""
			}
			return t.Format("2006-01-02 15:04")
		},
		"canSubmit":        func(a Article) bool { return a.Status == stDraft || a.Status == stRejected },
		"canPublish":       func(a Article) bool { return a.Status == stPending || a.Status == stDraft || a.Status == stRejected },
		"isAdminUser":      isAdmin,
		"isOwnerUser":      isOwner,
		"canModerateUser":  isAdmin,
		"canManageArticle": canManageArticles,
		"canDeleteArticle": canDeleteArticle,
		"creatorEntryKey":  creatorEntryKey,
		"canManageUser":    canManageUser,
		"roleText":         roleText,
		"userAvatar":       normalizeUserAvatar,
		"canDeleteUser":    func(u User) bool { return !isOwner(u) && store.ArticleCountByAuthor(u.Username) == 0 },
		"resetStatusText":  resetStatusText,
		"adminURL":         func(p string) string { return adminURLPath(cfg.AdminBasePath, p) },
		"publicURL":        func() string { return cfg.PublicBaseURL },
	}

	tpl := template.Must(template.New("").Funcs(funcs).ParseGlob("frontend/admin/templates/*.html"))
	return &App{
		cfg:        cfg,
		store:      store,
		tpl:        tpl,
		limiter:    NewLimiter(),
		startedAt:  time.Now(),
		scoreCache: make(map[string][]ScoreRecord),
	}
}
