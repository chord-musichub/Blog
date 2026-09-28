package main

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func publicationFixture(t *testing.T) (*App, User, User) {
	t.Helper()
	previous, _ := os.Getwd()
	repo, _ := filepath.Abs(filepath.Join("..", ".."))
	root := t.TempDir()
	cfg := Config{DataDir: filepath.Join(root, "data"), HugoContentDir: filepath.Join(root, "content", "posts"), PublicDir: filepath.Join(root, "public"), AdminBasePath: "/write", SessionSecret: "test-only"}
	store := &Store{dataDir: cfg.DataDir, articles: map[string]Article{}, users: map[string]User{}, resets: map[string]PasswordResetRequest{}}
	owner := User{Username: "owner", Role: roleOwner, AccountType: accountOwner}
	admin := User{Username: "admin", Role: roleAdmin, AccountType: accountSystem}
	store.users[owner.Username] = owner
	store.users[admin.Username] = admin
	if err := os.Chdir(repo); err != nil {
		t.Fatal(err)
	}
	app := newApp(cfg, store)
	if err := os.Chdir(root); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chdir(previous) })
	if err := os.MkdirAll(cfg.HugoContentDir, 0755); err != nil {
		t.Fatal(err)
	}
	return app, owner, admin
}

func articleRequest(app *App, method, target string, form url.Values, user User) *http.Request {
	r := httptest.NewRequest(method, target, strings.NewReader(form.Encode()))
	r.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	cookie := httptest.NewRecorder()
	app.setSession(cookie, user.Username, false)
	r.AddCookie(cookie.Result().Cookies()[0])
	return r
}

func TestArticleAdminNoticeOwnerAccessAndRename(t *testing.T) {
	app, owner, admin := publicationFixture(t)
	form := url.Values{"title": {"First notice"}, "slug": {"old-notice"}, "body": {"# Notice\n\nFirst body"}, "intent": {"publish"}}
	w := httptest.NewRecorder()
	app.handleNewArticle(w, articleRequest(app, "POST", "/articles/new", form, admin))
	if w.Code != 303 {
		t.Fatalf("admin cannot publish: %d %s", w.Code, w.Body)
	}
	articles := app.store.AllArticles()
	if len(articles) != 1 {
		t.Fatalf("articles=%v", articles)
	}
	original := articles[0]
	source, err := os.ReadFile(filepath.Join(app.cfg.HugoContentDir, original.Slug, "index.md"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(source), "is_notice: true") || !strings.Contains(string(source), `article_id: "`+original.ID+`"`) {
		t.Fatalf("missing notice/identity: %s", source)
	}
	w = httptest.NewRecorder()
	app.handleAdmin(w, articleRequest(app, "GET", "/admin", nil, owner))
	if w.Code != 200 || !strings.Contains(w.Body.String(), original.Title) {
		t.Fatal("owner cannot find admin article")
	}
	if !app.canAccessArticle(owner, original) || app.canAccessArticle(User{Username: "other", Role: roleUser}, original) {
		t.Fatal("article access policy incorrect")
	}
	// Editing title and URL then Save (not Publish) must update the same record.
	form.Set("title", "Renamed notice")
	form.Set("slug", "new-notice")
	form.Set("intent", "save")
	w = httptest.NewRecorder()
	app.createOrUpdateArticle(w, articleRequest(app, "POST", "/articles/"+original.ID+"/edit", form, admin), original.ID, admin)
	if w.Code != 303 {
		t.Fatalf("rename failed: %d %s", w.Code, w.Body)
	}
	a, _ := app.store.GetArticle(original.ID)
	if a.Slug != "new-notice" || a.Status != stPublished || len(app.store.AllArticles()) != 1 {
		t.Fatalf("rename created another record or lost state: %+v", a)
	}
	if _, err := os.Stat(filepath.Join(app.cfg.HugoContentDir, "old-notice")); !os.IsNotExist(err) {
		t.Fatal("old URL input remains")
	}
	if _, err := os.Stat(filepath.Join(app.cfg.HugoContentDir, "new-notice", "index.md")); err != nil {
		t.Fatal(err)
	}
	backups, _ := filepath.Glob(filepath.Join(app.cfg.DataDir, "backups", "article-publication", "old-notice-*", "index.md"))
	if len(backups) != 1 {
		t.Fatal("old version not recoverable")
	}
	// Owner edits admin's article, without silently granting moderation privileges.
	form.Set("title", "Owner correction")
	w = httptest.NewRecorder()
	app.createOrUpdateArticle(w, articleRequest(app, "POST", "/articles/"+a.ID+"/edit", form, owner), a.ID, owner)
	if w.Code != 303 {
		t.Fatalf("owner edit failed: %d %s", w.Code, w.Body)
	}
	a, _ = app.store.GetArticle(a.ID)
	if a.Title != "Owner correction" || a.Status != stDraft {
		t.Fatalf("owner edit state=%+v", a)
	}
	w = httptest.NewRecorder()
	app.publishArticle(w, articleRequest(app, "POST", "/articles/"+a.ID+"/publish", nil, admin), a.ID, admin)
	if w.Code != 303 {
		t.Fatalf("republish failed: %s", w.Body)
	}
	w = httptest.NewRecorder()
	app.deleteArticle(w, articleRequest(app, "POST", "/articles/"+a.ID+"/delete", nil, owner), a.ID, owner)
	if w.Code != 303 {
		t.Fatalf("owner delete failed: %d %s", w.Code, w.Body)
	}
	if _, ok := app.store.GetArticle(a.ID); ok {
		t.Fatal("deleted record remains")
	}
	if _, err := os.Stat(filepath.Join(app.cfg.HugoContentDir, a.Slug)); !os.IsNotExist(err) {
		t.Fatal("deleted public input remains")
	}
}

func TestInvalidEditLeavesPublishedArticleUntouched(t *testing.T) {
	app, owner, _ := publicationFixture(t)
	a := Article{ID: "stable", Author: owner.Username, Title: "Original", Slug: "original", Body: "Original body", Status: stPublished, CreatedAt: time.Now()}
	if err := app.store.SaveArticle(a); err != nil {
		t.Fatal(err)
	}
	if err := app.writeHugoArticle(a); err != nil {
		t.Fatal(err)
	}
	w := httptest.NewRecorder()
	form := url.Values{"title": {""}, "slug": {"changed"}, "body": {"Changed"}, "intent": {"save"}}
	app.createOrUpdateArticle(w, articleRequest(app, "POST", "/articles/stable/edit", form, owner), a.ID, owner)
	saved, _ := app.store.GetArticle(a.ID)
	if saved.Status != stPublished || saved.Slug != a.Slug {
		t.Fatal("invalid form altered record")
	}
	if _, err := os.Stat(filepath.Join(app.cfg.HugoContentDir, a.Slug, "index.md")); err != nil {
		t.Fatal("invalid form withdrew published article", err)
	}
}

func TestPublicationReconciliationAndManualRepair(t *testing.T) {
	app, owner, admin := publicationFixture(t)
	a := Article{ID: "stable", Author: admin.Username, Title: "Old title", Slug: "old-url", Body: "Original body", Status: stPublished, CreatedAt: time.Now()}
	if err := app.writeHugoArticle(a); err != nil {
		t.Fatal(err)
	}
	a.Title = "Completely different title"
	a.Slug = "current-url"
	if err := app.store.SaveArticle(a); err != nil {
		t.Fatal(err)
	}
	manual := filepath.Join(app.cfg.HugoContentDir, "manual")
	os.MkdirAll(manual, 0755)
	os.WriteFile(filepath.Join(manual, "index.md"), []byte("---\ntitle: \"Old title\"\n---\nManual"), 0644)
	if err := app.syncPublishedArticles(); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(app.cfg.HugoContentDir, "old-url")); !os.IsNotExist(err) {
		t.Fatal("ID reconciliation kept obsolete URL")
	}
	if _, err := os.Stat(filepath.Join(manual, "index.md")); err != nil {
		t.Fatal("manual article removed")
	}
	legacy := a
	legacy.ID = "legacy"
	legacy.Slug = "legacy-old"
	legacy.Title = "Old name before rename"
	if err := app.writeHugoArticle(legacy); err != nil {
		t.Fatal(err)
	}
	file := filepath.Join(app.cfg.HugoContentDir, legacy.Slug, "index.md")
	data, _ := os.ReadFile(file)
	data = []byte(strings.ReplaceAll(strings.ReplaceAll(string(data), `generated_by: "songline-article"`+"\n", ""), `article_id: "legacy"`+"\n", ""))
	os.WriteFile(file, data, 0644)
	if err := app.syncPublishedArticles(); err != nil {
		t.Fatal(err)
	}
	entries, err := app.orphanPublications()
	if err != nil || len(entries) != 1 || entries[0].Slug != legacy.Slug {
		t.Fatalf("legacy audit: %+v %v", entries, err)
	}
	entry := entries[0]
	w := httptest.NewRecorder()
	app.handlePublicationRepair(w, articleRequest(app, "GET", "/admin/publication-repair", nil, owner))
	if w.Code != 200 || !strings.Contains(w.Body.String(), legacy.Title) {
		t.Fatalf("repair list not rendered: %s", w.Body)
	}
	form := url.Values{"slug": {entry.Slug}, "fingerprint": {entry.Fingerprint}, "confirm": {"archive"}}
	form.Set("fingerprint", "stale")
	w = httptest.NewRecorder()
	app.handlePublicationRepair(w, articleRequest(app, "POST", "/admin/publication-repair", form, owner))
	if w.Code != 409 {
		t.Fatal("stale confirmation accepted")
	}
	form.Set("fingerprint", entry.Fingerprint)
	w = httptest.NewRecorder()
	app.handlePublicationRepair(w, articleRequest(app, "POST", "/admin/publication-repair", form, owner))
	if w.Code != 303 {
		t.Fatalf("repair failed: %d %s", w.Code, w.Body)
	}
	if _, err := os.Stat(file); !os.IsNotExist(err) {
		t.Fatal("legacy still public input")
	}
	if len(app.store.AllArticles()) != 1 {
		t.Fatal("repair changed records")
	}
	backups, _ := filepath.Glob(filepath.Join(app.cfg.DataDir, "backups", "article-publication", "legacy-old-*", "index.md"))
	if len(backups) != 1 {
		t.Fatal("missing legacy backup")
	}
	// Current article and traversal can never be archived through this endpoint.
	for _, slug := range []string{a.Slug, "..", "../manual"} {
		form.Set("slug", slug)
		w = httptest.NewRecorder()
		app.handlePublicationRepair(w, articleRequest(app, "POST", "/admin/publication-repair", form, owner))
		if w.Code != 409 {
			t.Fatalf("unsafe target accepted %s", slug)
		}
	}
}

func TestPublicationArchiveRefusesSymlinksAndStoreRollsBack(t *testing.T) {
	app, _, admin := publicationFixture(t)
	a := Article{ID: "one", Slug: "one", Title: "One", Body: "body", Author: admin.Username, Status: stDraft}
	if err := app.store.SaveArticle(a); err != nil {
		t.Fatal(err)
	}
	blocked := filepath.Join(app.cfg.DataDir, "blocked")
	os.WriteFile(blocked, []byte("file"), 0600)
	app.store.dataDir = blocked
	changed := a
	changed.Title = "Changed"
	if err := app.store.SaveArticle(changed); err == nil {
		t.Fatal("expected store failure")
	}
	saved, _ := app.store.GetArticle(a.ID)
	if saved.Title != a.Title {
		t.Fatal("failed save changed memory")
	}
	if err := app.store.DeleteArticle(a.ID); err == nil {
		t.Fatal("expected delete failure")
	}
	if _, ok := app.store.GetArticle(a.ID); !ok {
		t.Fatal("failed delete changed memory")
	}
	os.Symlink(t.TempDir(), filepath.Join(app.cfg.HugoContentDir, "link"))
	if err := app.archivePublication("link"); err == nil {
		t.Fatal("archived linked directory")
	}
	dir := filepath.Join(app.cfg.HugoContentDir, "nested-link")
	os.MkdirAll(dir, 0755)
	os.Symlink(blocked, filepath.Join(dir, "index.md"))
	if err := app.archivePublication("nested-link"); err == nil {
		t.Fatal("archived linked file")
	}
}

// Uses an actual Hugo executable in an isolated temporary site, never live data.
func TestArticleRealHugoRemovesOldPublicURLs(t *testing.T) {
	if os.Getenv("ARTICLE_REAL_HUGO") != "1" {
		t.Skip("opt-in real Hugo integration")
	}
	if _, err := exec.LookPath("hugo"); err != nil {
		t.Fatal(err)
	}
	app, owner, admin := publicationFixture(t)
	app.cfg.HugoCommand = "hugo --quiet"
	app.cfg.HugoBuildTimeout = 30 * time.Second
	os.WriteFile("hugo.toml", []byte("baseURL = 'https://example.test/'\n"), 0644)
	os.MkdirAll("layouts/_default", 0755)
	os.WriteFile("layouts/_default/single.html", []byte("<h1>{{ .Title }}</h1>{{ .Content }}"), 0644)
	os.WriteFile("layouts/index.html", []byte("{{ range .Site.RegularPages }}<a href=\"{{ .RelPermalink }}\">{{ .Title }}</a>{{ end }}"), 0644)
	form := url.Values{"title": {"CSAPP-lab思路"}, "slug": {"csapp-lab思路"}, "body": {"# Old body"}, "intent": {"publish"}}
	w := httptest.NewRecorder()
	app.handleNewArticle(w, articleRequest(app, "POST", "/articles/new", form, admin))
	if w.Code != 303 {
		t.Fatalf("initial publish: %d %s", w.Code, w.Body)
	}
	old := app.store.AllArticles()[0]
	oldInput, err := os.ReadFile(filepath.Join(app.cfg.HugoContentDir, old.Slug, "index.md"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(app.cfg.PublicDir, "posts", old.Slug, "index.html")); err != nil {
		t.Fatal(err)
	}
	form.Set("slug", "csapp-lab-guide")
	form.Set("title", "CSAPP-lab导入")
	form.Set("intent", "save")
	w = httptest.NewRecorder()
	app.createOrUpdateArticle(w, articleRequest(app, "POST", "/articles/"+old.ID+"/edit", form, admin), old.ID, admin)
	if w.Code != 303 {
		t.Fatalf("rename: %s", w.Body)
	}
	if _, err := os.Stat(filepath.Join(app.cfg.PublicDir, "posts", old.Slug, "index.html")); !os.IsNotExist(err) {
		t.Fatal("old public HTML still served")
	}
	newPage := filepath.Join(app.cfg.PublicDir, "posts", "csapp-lab-guide", "index.html")
	if data, err := os.ReadFile(newPage); err != nil || !strings.Contains(string(data), "CSAPP-lab导入") {
		t.Fatal("new public page missing", err)
	}
	// Recreate the server's pre-ID legacy residue, then exercise reviewed repair.
	legacy := strings.ReplaceAll(strings.ReplaceAll(string(oldInput), `generated_by: "songline-article"`+"\n", ""), `article_id: "`+old.ID+`"`+"\n", "")
	os.MkdirAll(filepath.Join(app.cfg.HugoContentDir, old.Slug), 0755)
	os.WriteFile(filepath.Join(app.cfg.HugoContentDir, old.Slug, "index.md"), []byte(legacy), 0644)
	if err := app.runHugo(httptest.NewRequest("GET", "/", nil).Context()); err != nil {
		t.Fatal(err)
	}
	entries, err := app.orphanPublications()
	if err != nil || len(entries) != 1 {
		t.Fatalf("legacy residue not found: %+v %v", entries, err)
	}
	entry := entries[0]
	repair := url.Values{"slug": {entry.Slug}, "fingerprint": {entry.Fingerprint}, "confirm": {"archive"}}
	w = httptest.NewRecorder()
	app.handlePublicationRepair(w, articleRequest(app, "POST", "/admin/publication-repair", repair, owner))
	if w.Code != 303 {
		t.Fatalf("repair: %s", w.Body)
	}
	if _, err := os.Stat(filepath.Join(app.cfg.PublicDir, "posts", old.Slug, "index.html")); !os.IsNotExist(err) {
		t.Fatal("legacy public HTML remains after repair")
	}
	index, err := os.ReadFile(filepath.Join(app.cfg.PublicDir, "index.html"))
	if err != nil || strings.Contains(string(index), "CSAPP-lab思路") || !strings.Contains(string(index), "CSAPP-lab导入") {
		t.Fatalf("public index has wrong articles: %s %v", index, err)
	}
	w = httptest.NewRecorder()
	app.deleteArticle(w, articleRequest(app, "POST", "/articles/"+old.ID+"/delete", nil, owner), old.ID, owner)
	if _, err := os.Stat(newPage); !os.IsNotExist(err) {
		t.Fatal("deleted public HTML remains")
	}
}
