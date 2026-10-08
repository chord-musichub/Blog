package main

import (
	"encoding/json"
	"errors"
	"regexp"
	"strings"
)

func defaultCommentSettings() CommentSettings {
	return CommentSettings{
		Enabled: true, Repo: "chord-musichub/Blog-comments", RepoID: "R_kgDOVAXXbA",
		Category: "Announcements", CategoryID: "DIC_kwDOVAXXbM4DHTm4",
	}
}

var commentRepoPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9-]{0,38}/[A-Za-z0-9_.-]{1,100}$`)
var commentIDPattern = regexp.MustCompile(`^[A-Za-z0-9_+=/-]{1,160}$`)

func normalizeCommentSettings(c CommentSettings) (CommentSettings, error) {
	c.Repo = strings.TrimSpace(c.Repo)
	c.RepoID = strings.TrimSpace(c.RepoID)
	c.Category = strings.TrimSpace(c.Category)
	c.CategoryID = strings.TrimSpace(c.CategoryID)
	if c.Enabled && (!commentRepoPattern.MatchString(c.Repo) || !commentIDPattern.MatchString(c.RepoID) || !commentIDPattern.MatchString(c.CategoryID) || c.Category == "" || len(c.Category) > 100) {
		return c, errors.New("启用文章留言需要有效的 GitHub 仓库、仓库 ID、分类名称和分类 ID，请从 giscus 配置页复制；不需要 Token")
	}
	return c, nil
}

// Merge only the new public field, preserving legacy/unknown site settings.
// Existing installations have no comments key; their snapshot still needs the
// configured defaults without overwriting the persisted owner's settings.
func (app *App) publicSiteComments(data []byte) ([]byte, error) {
	settings, err := app.loadSiteSettings()
	if err != nil {
		return nil, err
	}
	var public map[string]json.RawMessage
	if err := json.Unmarshal(data, &public); err != nil {
		return nil, err
	}
	if public == nil {
		public = make(map[string]json.RawMessage)
	}
	public["comments"], err = json.Marshal(settings.Comments)
	if err != nil {
		return nil, err
	}
	return json.MarshalIndent(public, "", "  ")
}
