package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

type scoreResponse struct {
	Mode   string        `json:"mode"`
	Scores []ScoreRecord `json:"scores"`
}

func scoreAPIFixture(t *testing.T) (*App, http.Handler) {
	t.Helper()
	app := &App{cfg: Config{DataDir: t.TempDir(), SessionSecret: "score-test", PublicCORSOrigins: "https://public.test"}, store: &Store{users: map[string]User{"writer": {Username: "writer", DisplayName: " Writer "}}}, limiter: NewLimiter()}
	return app, app.router()
}

func scoreAPIRequest(t *testing.T, handler http.Handler, method, path, body string, cookie *http.Cookie) (*httptest.ResponseRecorder, scoreResponse) {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if cookie != nil {
		req.AddCookie(cookie)
	}
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)
	var data scoreResponse
	if res.Code == http.StatusOK {
		if err := json.Unmarshal(res.Body.Bytes(), &data); err != nil {
			t.Fatalf("decode %s: %v", res.Body.String(), err)
		}
	}
	return res, data
}

func TestScoreAPIContractsAndAliases(t *testing.T) {
	for _, tc := range []struct {
		name      string
		min, max  int
		ascending bool
	}{
		{"snake", 1, 999999, false}, {"flappy", 1, 999999, false}, {"2048", 1, 9999999, false}, {"reaction", 1, 5000, true}, {"typing", 1000, 3600000, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			app, handler := scoreAPIFixture(t)
			session := httptest.NewRecorder()
			app.setSession(session, "writer", false)
			for _, prefix := range []string{"/api/tools/", "/write/api/tools/", "/static/api/", "/api/"} {
				path := prefix + tc.name + "-scores"
				res, data := scoreAPIRequest(t, handler, http.MethodPost, path, fmt.Sprintf(`{"score":%d,"player_id":" fake! id ","mode":"zh","article_id":" a!b "}`, tc.min), session.Result().Cookies()[0])
				if res.Code != http.StatusOK || len(data.Scores) != 1 {
					t.Fatalf("%s: status %d, body %s", path, res.Code, res.Body.String())
				}
				got := data.Scores[0]
				if got.Username != "writer" || got.DisplayName != "Writer" || got.PlayerID != "" || got.CreatedAt == "" {
					t.Fatalf("identity: %#v", got)
				}
				if tc.name == "typing" && (data.Mode != "mixed" || got.Mode != "mixed" || got.ArticleID != "ab") {
					t.Fatalf("typing metadata: %#v", data)
				}
			}
			path := "/api/tools/" + tc.name + "-scores"
			for _, body := range []string{"{", strings.Repeat(" ", int(scoreRequestMaxBytes)) + `{}`, fmt.Sprintf(`{"score":%d}`, tc.min-1), fmt.Sprintf(`{"score":%d}`, tc.max+1)} {
				res, _ := scoreAPIRequest(t, handler, http.MethodPost, path, body, nil)
				if res.Code != http.StatusBadRequest {
					t.Fatalf("invalid body: status %d", res.Code)
				}
			}
			res, _ := scoreAPIRequest(t, handler, http.MethodPost, path, fmt.Sprintf(`{"score":%d,"player_id":" guest!1234567 "}`, tc.max), nil)
			if res.Code != http.StatusOK {
				t.Fatalf("max score: %d %s", res.Code, res.Body.String())
			}
			res, data := scoreAPIRequest(t, handler, http.MethodGet, path+"?mode=chinese", "", nil)
			if tc.name == "typing" { // The guest used the default English mode.
				if data.Mode != "mixed" || len(data.Scores) != 1 {
					t.Fatalf("mixed board: %#v", data)
				}
				_, data = scoreAPIRequest(t, handler, http.MethodGet, path, "", nil)
				if data.Mode != "english" || len(data.Scores) != 1 || data.Scores[0].PlayerID != "guest1234567" {
					t.Fatalf("English board: %#v", data)
				}
			} else if len(data.Scores) != 2 || (data.Scores[0].Score == tc.min) != tc.ascending {
				t.Fatalf("ranking: %#v", data)
			}
			if tc.name == "reaction" && data.Scores[1].DisplayName != "游客 234567" {
				t.Fatalf("guest name: %#v", data)
			}
			if res.Header().Get("Cache-Control") != "no-store" || !strings.Contains(res.Header().Get("Content-Type"), "application/json") {
				t.Fatalf("headers: %#v", res.Header())
			}
			res, _ = scoreAPIRequest(t, handler, http.MethodDelete, path, "", nil)
			if res.Code != http.StatusMethodNotAllowed || res.Header().Get("Allow") != "GET, POST" {
				t.Fatalf("unsupported method: %d %#v", res.Code, res.Header())
			}
			for _, origin := range []string{"https://public.test", "https://untrusted.test"} {
				req := httptest.NewRequest(http.MethodOptions, path, nil)
				req.Header.Set("Origin", origin)
				res := httptest.NewRecorder()
				handler.ServeHTTP(res, req)
				want := http.StatusNoContent
				if origin == "https://untrusted.test" {
					want = http.StatusForbidden
				}
				if res.Code != want {
					t.Fatalf("CORS %s: %d", origin, res.Code)
				}
			}
			// A fresh app must recover the same records from disk, not only its cache.
			restarted := &App{cfg: app.cfg, store: app.store, limiter: NewLimiter()}
			_, reloaded := scoreAPIRequest(t, restarted.router(), http.MethodGet, path+"?mode=chinese", "", nil)
			if tc.name == "typing" && len(reloaded.Scores) != 1 || tc.name != "typing" && len(reloaded.Scores) != 2 {
				t.Fatalf("reloaded: %#v", reloaded)
			}
		})
	}
}

func TestScoreAPIRankingKeepsBestPerIdentityAndTopThree(t *testing.T) {
	for _, tc := range []struct {
		name      string
		ascending bool
	}{{"snake", false}, {"flappy", false}, {"2048", false}, {"reaction", true}, {"typing", true}} {
		t.Run(tc.name, func(t *testing.T) {
			app, handler := scoreAPIFixture(t)
			records := []ScoreRecord{
				{Score: 1000, PlayerID: "a", CreatedAt: "2026-01-03"},
				{Score: 1000, PlayerID: "a", CreatedAt: "2026-01-01"},
				{Score: 2000, PlayerID: "b", CreatedAt: "2026-01-02"},
				{Score: 2000, PlayerID: "b", CreatedAt: "2026-01-01"},
				{Score: 3000, PlayerID: "c", CreatedAt: "2026-01-01"},
				{Score: 4000, PlayerID: "d", CreatedAt: "2026-01-01"},
				{Score: 0, PlayerID: "invalid"},
			}
			if err := writeJSONFile(app.scoreDataPath(tc.name+"_scores.json"), records, 0644); err != nil {
				t.Fatal(err)
			}
			_, data := scoreAPIRequest(t, handler, http.MethodGet, "/api/"+tc.name+"-scores", "", nil)
			if len(data.Scores) != 3 {
				t.Fatalf("top three: %#v", data)
			}
			want := []int{4000, 3000, 2000}
			if tc.ascending {
				want = []int{1000, 2000, 3000}
			}
			for i, got := range data.Scores {
				if got.Score != want[i] || got.CreatedAt != "2026-01-01" {
					t.Fatalf("rank %d: %#v", i, got)
				}
			}
		})
	}
}

func TestScoreAPIFailedSavePreservesCachedBoard(t *testing.T) {
	app, handler := scoreAPIFixture(t)
	path := app.scoreDataPath("snake_scores.json")
	if err := writeJSONFile(path, []ScoreRecord{{Score: 10, PlayerID: "old"}}, 0644); err != nil {
		t.Fatal(err)
	}
	scoreAPIRequest(t, handler, http.MethodGet, "/api/snake-scores", "", nil)
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(path, 0755); err != nil {
		t.Fatal(err)
	} // Atomic replacement cannot replace a directory.
	res, _ := scoreAPIRequest(t, handler, http.MethodPost, "/api/snake-scores", `{"score":20,"player_id":"new"}`, nil)
	if res.Code != http.StatusInternalServerError {
		t.Fatalf("failed save: %d", res.Code)
	}
	_, data := scoreAPIRequest(t, handler, http.MethodGet, "/api/snake-scores", "", nil)
	if len(data.Scores) != 1 || data.Scores[0].Score != 10 {
		t.Fatalf("failed save changed cache: %#v", data)
	}
	if files, err := filepath.Glob(filepath.Join(filepath.Dir(path), ".json-*")); err != nil || len(files) != 0 {
		t.Fatalf("temporary files: %v %v", files, err)
	}
}

func TestScoreAPIConcurrentUpdatesKeepBestPerPlayer(t *testing.T) {
	app, handler := scoreAPIFixture(t)
	var workers sync.WaitGroup
	for player := 0; player < 3; player++ {
		for attempt := 1; attempt <= 12; attempt++ {
			workers.Add(1)
			go func(player, attempt int) {
				defer workers.Done()
				req := httptest.NewRequest(http.MethodPost, "/api/snake-scores", strings.NewReader(fmt.Sprintf(`{"score":%d,"player_id":"p%d"}`, attempt*10+player, player)))
				res := httptest.NewRecorder()
				handler.ServeHTTP(res, req)
				if res.Code != http.StatusOK {
					t.Errorf("concurrent save: %d %s", res.Code, res.Body.String())
				}
			}(player, attempt)
		}
	}
	workers.Wait()
	// Discard cache to verify that the final atomic write also kept every player.
	restarted := &App{cfg: app.cfg, store: app.store, limiter: NewLimiter()}
	_, data := scoreAPIRequest(t, restarted.router(), http.MethodGet, "/api/snake-scores", "", nil)
	if len(data.Scores) != 3 {
		t.Fatalf("concurrent board: %#v", data)
	}
	for i, record := range data.Scores {
		if record.Score != 122-i {
			t.Fatalf("concurrent rank %d: %#v", i, record)
		}
	}
}
