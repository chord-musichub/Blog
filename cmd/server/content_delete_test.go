package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestArticleDeleteAllStatesAndRoles(t *testing.T) {
	for _, role := range []string{roleUser, roleOwner, roleAdmin} {
		for _, status := range []string{stDraft, stPending, stPublished, stRejected} {
			t.Run(role+"/"+status, func(t *testing.T) {
				app, owner, admin := publicationFixture(t)
				actor := User{Username: "author", Role: roleUser}
				app.store.users[actor.Username] = actor
				author := actor.Username
				if role == roleOwner {
					actor = owner
				} else if role == roleAdmin {
					actor = admin
				}
				// Managers delete another author's article, members delete their own.
				a := Article{ID: "remove", Slug: "remove", Author: author, Title: "Delete me", Body: "body", Status: status}
				survivor := Article{ID: "keep", Slug: "keep", Author: author, Title: "Keep me", Body: "keep", Status: stPublished}
				for _, item := range []Article{a, survivor} {
					if err := app.store.SaveArticle(item); err != nil {
						t.Fatal(err)
					}
				}
				if status == stPublished {
					if err := app.writeHugoArticle(a); err != nil {
						t.Fatal(err)
					}
				}
				if err := app.writeHugoArticle(survivor); err != nil {
					t.Fatal(err)
				}
				w := httptest.NewRecorder()
				app.router().ServeHTTP(w, articleRequest(app, http.MethodPost, "/articles/remove/delete", nil, actor))
				if w.Code != http.StatusSeeOther {
					t.Fatalf("delete: %d %s", w.Code, w.Body)
				}
				if _, ok := app.store.GetArticle(a.ID); ok {
					t.Fatal("deleted article remains in memory")
				}
				records := map[string]Article{}
				if err := readJSONFile(runtimeDataPath(app.cfg.DataDir, "articles.json"), &records); err != nil {
					t.Fatal(err)
				}
				if len(records) != 1 || records[survivor.ID].Title != survivor.Title {
					t.Fatal("delete did not persist precisely one record")
				}
				if _, err := os.Stat(filepath.Join(app.cfg.HugoContentDir, a.Slug)); !os.IsNotExist(err) {
					t.Fatalf("deleted publication remains: %v", err)
				}
				if _, err := os.Stat(filepath.Join(runtimeMarkdownDir(app.cfg.DataDir), a.Slug+".md")); !os.IsNotExist(err) {
					t.Fatalf("deleted source remains: %v", err)
				}
				if _, err := os.Stat(filepath.Join(app.cfg.HugoContentDir, survivor.Slug, "index.md")); err != nil {
					t.Fatal("another publication removed", err)
				}
			})
		}
	}
}

func TestArticleDeleteRejectsUnauthorizedAndGET(t *testing.T) {
	app, _, _ := publicationFixture(t)
	alice := User{Username: "alice", Role: roleUser}
	bob := User{Username: "bob", Role: roleUser}
	app.store.users[alice.Username] = alice
	app.store.users[bob.Username] = bob
	a := Article{ID: "private", Slug: "private", Author: alice.Username, Title: "Keep", Body: "body", Status: stPublished}
	if err := app.store.SaveArticle(a); err != nil {
		t.Fatal(err)
	}
	if err := app.writeHugoArticle(a); err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		method string
		actor  User
		want   int
	}{{http.MethodPost, bob, 403}, {http.MethodGet, alice, 404}, {http.MethodPost, User{}, 303}} {
		w := httptest.NewRecorder()
		app.router().ServeHTTP(w, articleRequest(app, tc.method, "/articles/private/delete", nil, tc.actor))
		if w.Code != tc.want {
			t.Fatalf("%s %s: %d", tc.method, tc.actor.Username, w.Code)
		}
		if _, ok := app.store.GetArticle(a.ID); !ok {
			t.Fatal("forbidden request deleted article")
		}
	}
	if _, err := os.Stat(filepath.Join(app.cfg.HugoContentDir, a.Slug, "index.md")); err != nil {
		t.Fatal(err)
	}
}

func TestCreatorDeletionPersistsAndRefusesStaleRows(t *testing.T) {
	for _, kind := range []string{"projects", "memories"} {
		t.Run(kind, func(t *testing.T) {
			app, owner, admin := publicationFixture(t)
			user := User{Username: "member", Role: roleUser}
			app.store.users[user.Username] = user
			firstProject := Project{Title: "First project", Cover: "/uploads/admin/projects/keep.png"}
			secondProject := Project{Title: "Second project"}
			firstMemory := Memory{Title: "First memory", Date: "2026-01", Image: "/uploads/admin/memories/keep.png"}
			secondMemory := Memory{Title: "Second memory", Date: "2026-02"}
			var first, second any
			if kind == "projects" {
				first, second = firstProject, secondProject
				if err := app.saveCreatorData(kind, []Project{firstProject, secondProject}); err != nil {
					t.Fatal(err)
				}
			} else {
				first, second = firstMemory, secondMemory
				if err := app.saveCreatorData(kind, []Memory{firstMemory, secondMemory}); err != nil {
					t.Fatal(err)
				}
			}
			media := filepath.Join(app.cfg.DataDir, "media", "admin", kind, "keep.png")
			if err := os.MkdirAll(filepath.Dir(media), 0700); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(media, []byte("original image"), 0600); err != nil {
				t.Fatal(err)
			}
			endpoint := "/compose/" + kind
			post := func(actor User, index, key string) *httptest.ResponseRecorder {
				form := url.Values{"action": {"delete"}, "index": {index}, "list_key": {key}}
				w := httptest.NewRecorder()
				app.router().ServeHTTP(w, articleRequest(app, http.MethodPost, endpoint, form, actor))
				return w
			}
			for _, actor := range []User{admin, user} {
				if w := post(actor, "0", creatorEntryKey([]any{first, second})); w.Code != 403 {
					t.Fatalf("archive permission: %s %d", actor.Role, w.Code)
				}
			}
			for _, index := range []string{"", "invalid", "-1", "9"} {
				if w := post(owner, index, creatorEntryKey([]any{first, second})); w.Code != 400 {
					t.Fatalf("invalid index %q: %d", index, w.Code)
				}
			}
			for _, key := range []string{"", creatorEntryKey([]any{second})} {
				if w := post(owner, "0", key); w.Code != 409 {
					t.Fatalf("stale identity: %d", w.Code)
				}
			}
			w := post(owner, "0", creatorEntryKey([]any{first, second}))
			location, _ := url.Parse(w.Header().Get("Location"))
			if w.Code != 303 || !strings.Contains(location.Query().Get("msg"), "已删除") {
				t.Fatalf("delete failed: %d %s %s", w.Code, w.Body, w.Header().Get("Location"))
			}
			// The old first-row request must not remove the second row now at index 0.
			if w := post(owner, "0", creatorEntryKey([]any{first, second})); w.Code != 409 {
				t.Fatalf("old tab delete: %d", w.Code)
			}
			var actual []map[string]any
			if err := readJSONFile(app.creatorDataPath(kind), &actual); err != nil {
				t.Fatal(err)
			}
			if len(actual) != 1 || actual[0]["title"] != fmt.Sprintf("Second %s", map[string]string{"projects": "project", "memories": "memory"}[kind]) {
				t.Fatalf("wrong surviving record: %+v", actual)
			}
			var public []map[string]any
			if err := readJSONFile(filepath.Join(app.hugoRootDir(), "hugo-data", kind+".json"), &public); err != nil {
				t.Fatal(err)
			}
			if len(public) != 1 || public[0]["title"] != actual[0]["title"] {
				t.Fatal("public build input did not reflect deletion")
			}
			if w := post(owner, "0", creatorEntryKey([]any{second})); w.Code != 303 {
				t.Fatalf("last item delete: %d %s", w.Code, w.Body)
			}
			raw, err := os.ReadFile(app.creatorDataPath(kind))
			if err != nil {
				t.Fatal(err)
			}
			var empty []any
			if err := json.Unmarshal(raw, &empty); err != nil || len(empty) != 0 || strings.TrimSpace(string(raw)) != "[]" {
				t.Fatalf("empty data must remain an array: %s %v", raw, err)
			}
			if raw, err := os.ReadFile(media); err != nil || string(raw) != "original image" {
				t.Fatal("content delete changed original media", err)
			}
		})
	}
}

// Opt-in local fixture: mutations use only t.TempDir and synthetic accounts.
// CONTENT_DELETE_PREVIEW=1 go test ./cmd/server -run TestContentDeleteBrowserPreview -timeout 20m
func TestContentDeleteBrowserPreview(t *testing.T) {
	if os.Getenv("CONTENT_DELETE_PREVIEW") != "1" {
		t.Skip("content delete browser fixture is opt-in")
	}
	repo, err := filepath.Abs(filepath.Join("..", ".."))
	if err != nil {
		t.Fatal(err)
	}
	app, owner, admin := publicationFixture(t)
	member := User{Username: "member", Role: roleUser, DisplayName: "示例成员"}
	app.store.users[member.Username] = member
	mux := http.NewServeMux()
	mux.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.Dir(filepath.Join(repo, "web", "static")))))
	mux.HandleFunc("/static/markdown-renderer.js", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, filepath.Join(repo, "static", "js", "markdown-renderer.js"))
	})
	mux.HandleFunc("/fixture/reset", func(w http.ResponseWriter, r *http.Request) {
		actor := member
		if r.URL.Query().Get("role") == roleOwner {
			actor = owner
		} else if r.URL.Query().Get("role") == roleAdmin {
			actor = admin
		}
		app.store.mu.Lock()
		app.store.articles = map[string]Article{}
		app.store.mu.Unlock()
		_ = os.RemoveAll(app.cfg.HugoContentDir)
		_ = os.MkdirAll(app.cfg.HugoContentDir, 0755)
		for _, status := range []string{stDraft, stPending, stPublished, stRejected} {
			a := Article{ID: status, Slug: status, Title: "示例文章 " + status, Author: actor.Username, Status: status, Body: "## 内容\n\n测试文章"}
			if err := app.store.SaveArticle(a); err != nil {
				http.Error(w, err.Error(), 500)
				return
			}
			if status == stPublished {
				if err := app.writeHugoArticle(a); err != nil {
					http.Error(w, err.Error(), 500)
					return
				}
			}
		}
		foreign := Article{ID: "foreign", Slug: "foreign", Title: "其他作者的文章", Author: "other", Status: stPublished, Body: "Other body"}
		if err := app.store.SaveArticle(foreign); err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		if err := app.writeHugoArticle(foreign); err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		if err := app.saveCreatorData("projects", []Project{{Title: "示例项目", Demo: "invalid legacy URL"}, {Title: "保留项目"}}); err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		if err := app.saveCreatorData("memories", []Memory{{Title: "示例回忆", Date: "2026-01"}, {Title: "保留回忆", Date: "2026-02"}}); err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		app.setSession(w, actor.Username, false)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"user": actor.Username})
	})
	mux.HandleFunc("/fixture/state", func(w http.ResponseWriter, r *http.Request) {
		projects, _ := app.loadProjects()
		memories, _ := app.loadMemories()
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"articles": app.store.AllArticles(), "projects": projects, "memories": memories})
	})
	mux.Handle("/write/", http.StripPrefix("/write", app.router()))
	t.Log("Synthetic content deletion fixture: http://127.0.0.1:8092/write/")
	server := &http.Server{Addr: "127.0.0.1:8092", Handler: mux}
	t.Fatal(server.ListenAndServe())
}

func TestRepeatedDeleteCannotRemoveIdenticalAdjacentEntries(t *testing.T) {
	for _, kind := range []string{"projects", "memories"} {
		t.Run(kind, func(t *testing.T) {
			app, owner, _ := publicationFixture(t)
			var items any
			if kind == "projects" {
				p := Project{Title: "Same"}
				items = []Project{p, p}
			} else {
				m := Memory{Title: "Same", Date: "2026-01"}
				items = []Memory{m, m}
			}
			if err := app.saveCreatorData(kind, items); err != nil {
				t.Fatal(err)
			}
			form := url.Values{"action": {"delete"}, "index": {"0"}, "list_key": {creatorEntryKey(items)}}
			for _, want := range []int{303, 409} {
				w := httptest.NewRecorder()
				app.router().ServeHTTP(w, articleRequest(app, http.MethodPost, "/compose/"+kind, form, owner))
				if w.Code != want {
					t.Fatalf("repeated identical-row delete: %d want %d", w.Code, want)
				}
			}
			var remaining []any
			if err := readJSONFile(app.creatorDataPath(kind), &remaining); err != nil || len(remaining) != 1 {
				t.Fatalf("deleted adjacent identical entry: %v %v", remaining, err)
			}
		})
	}
}

func TestDeleteBuildFailureReportsPersistedDeletion(t *testing.T) {
	for _, kind := range []string{"article", "projects", "memories"} {
		t.Run(kind, func(t *testing.T) {
			app, owner, _ := publicationFixture(t)
			app.cfg.HugoCommand = "/bin/false"
			app.cfg.HugoBuildTimeout = time.Second
			endpoint := "/articles/failed-build/delete"
			form := url.Values{}
			if kind == "article" {
				a := Article{ID: "failed-build", Slug: "failed-build", Title: "Delete", Author: owner.Username, Body: "body", Status: stPublished}
				if err := app.store.SaveArticle(a); err != nil {
					t.Fatal(err)
				}
				if err := app.writeHugoArticle(a); err != nil {
					t.Fatal(err)
				}
			} else {
				var items any
				if kind == "projects" {
					items = []Project{{Title: "Delete"}}
				} else {
					items = []Memory{{Title: "Delete", Date: "2026-01"}}
				}
				if err := app.saveCreatorData(kind, items); err != nil {
					t.Fatal(err)
				}
				form = url.Values{"action": {"delete"}, "index": {"0"}, "list_key": {creatorEntryKey(items)}}
				endpoint = "/compose/" + kind
			}
			w := httptest.NewRecorder()
			app.router().ServeHTTP(w, articleRequest(app, http.MethodPost, endpoint, form, owner))
			location, _ := url.Parse(w.Header().Get("Location"))
			message := location.Query().Get("msg")
			if w.Code != 303 || !strings.Contains(message, "已删除") || !strings.Contains(message, "失败") {
				t.Fatalf("build failure misreported: %d %s", w.Code, message)
			}
			if kind == "article" {
				if _, ok := app.store.GetArticle("failed-build"); ok {
					t.Fatal("failed build restored deleted article")
				}
			} else {
				var records []any
				if err := readJSONFile(app.creatorDataPath(kind), &records); err != nil || len(records) != 0 {
					t.Fatalf("deleted archive record restored: %v %v", records, err)
				}
			}
		})
	}
}
