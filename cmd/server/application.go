package main

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
		"isAdminUser":      func(u User) bool { return u.Role == roleAdmin },
		"userArticleCount": func(username string) int { return store.ArticleCountByAuthor(username) },
		"canDeleteUser":    func(u User) bool { return u.Role != roleAdmin && store.ArticleCountByAuthor(u.Username) == 0 },
		"userDeleteReason": func(u User) string {
			if u.Role == roleAdmin {
				return "管理员账号不可删除"
			}
			n := store.ArticleCountByAuthor(u.Username)
			if n > 0 {
				return fmt.Sprintf("不可删除：该用户还有 %d 篇文章。可以先删除文章，或改用禁用。", n)
			}
			return ""
		},
		"resetStatusText": resetStatusText,
		"accountTypeText": accountTypeText,
		"isSystemAccount": func(t string) bool { return normalizeAccountType("", t) == accountSystem },
		"isOwnerAccount":  func(t string) bool { return normalizeAccountType("", t) == accountOwner },
		"isFriendAccount": func(t string) bool { return normalizeAccountType("", t) == accountFriend },
		"adminURL":        func(p string) string { return adminURLPath(cfg.AdminBasePath, p) },
		"publicURL":       func() string { return cfg.PublicBaseURL },
	}

	tpl := template.Must(template.New("").Funcs(funcs).ParseGlob("web/templates/*.html"))
	return &App{cfg: cfg, store: store, tpl: tpl, limiter: NewLimiter(), startedAt: time.Now()}
}
