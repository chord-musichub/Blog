package main

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
)

func main() {
	loadDotEnv(".env")
	cfg := loadConfig()
	mustMkdir(cfg.DataDir, 0700)
	mustMkdir(cfg.HugoContentDir, 0755)
	mustMkdir(cfg.PublicDir, 0755)

	store, err := NewStore(cfg.DataDir)
	if err != nil {
		log.Fatal(err)
	}
	if err := store.EnsureAdmin(cfg.AdminUser, cfg.AdminPass); err != nil {
		log.Fatal(err)
	}

	app := newApp(cfg, store)
	if err := app.runHugo(context.Background()); err != nil {
		log.Printf("initial site build error: %v", err)
	}
	srv := newHTTPServer(cfg, app)
	log.Printf("blog admin v20.18.5 listening on %s base=%q", cfg.Addr, cfg.AdminBasePath)
	log.Fatal(srv.ListenAndServe())
}

type viewAPIResponse struct {
	Path  string `json:"path"`
	Views int    `json:"views"`
}

func (app *App) viewsPath() string {
	return filepath.Join(app.cfg.DataDir, "views.json")
}

func cleanViewPath(raw string) string {
	v := strings.TrimSpace(raw)
	if v == "" {
		return ""
	}
	if strings.HasPrefix(v, "http://") || strings.HasPrefix(v, "https://") {
		if u, err := url.Parse(v); err == nil {
			v = u.Path
		}
	}
	if !strings.HasPrefix(v, "/") {
		v = "/" + v
	}
	if strings.Contains(v, "..") || strings.Contains(v, "\\") {
		return ""
	}
	if len(v) > 240 {
		return ""
	}
	return v
}

func (app *App) loadViews() map[string]int {
	out := map[string]int{}
	b, err := os.ReadFile(app.viewsPath())
	if err != nil || len(strings.TrimSpace(string(b))) == 0 {
		return out
	}
	_ = json.Unmarshal(b, &out)
	return out
}

func (app *App) saveViews(v map[string]int) error {
	if err := os.MkdirAll(app.cfg.DataDir, 0700); err != nil {
		return err
	}
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	tmp := app.viewsPath() + ".tmp"
	if err := os.WriteFile(tmp, b, 0600); err != nil {
		return err
	}
	return os.Rename(tmp, app.viewsPath())
}

func (app *App) snakeScoresPath() string {
	return filepath.Join(app.cfg.DataDir, "snake_scores.json")
}

func (app *App) loadSnakeScores() []SnakeScoreRecord {
	path := app.snakeScoresPath()
	data, err := os.ReadFile(path)
	if err != nil || len(data) == 0 {
		return []SnakeScoreRecord{}
	}
	var scores []SnakeScoreRecord
	if err := json.Unmarshal(data, &scores); err != nil {
		log.Printf("load snake scores error: %v", err)
		return []SnakeScoreRecord{}
	}
	return normalizeHighScoreRecords(scores)
}

func (app *App) saveSnakeScores(scores []SnakeScoreRecord) error {
	cleaned := normalizeHighScoreRecords(scores)
	if err := os.MkdirAll(filepath.Dir(app.snakeScoresPath()), 0755); err != nil {
		return err
	}
	b, err := json.MarshalIndent(cleaned, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(app.snakeScoresPath(), b, 0644)
}

func (app *App) handleSnakeScoresAPI(w http.ResponseWriter, r *http.Request) {
	if !app.allowPublicCORS(w, r) {
		http.Error(w, "forbidden origin", http.StatusForbidden)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	switch r.Method {
	case http.MethodGet:
		app.store.mu.Lock()
		scores := app.loadSnakeScores()
		app.store.mu.Unlock()
		_ = json.NewEncoder(w).Encode(map[string]any{"scores": scores})
		return
	case http.MethodPost:
		var req snakeScoreRequest
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, scoreRequestMaxBytes)).Decode(&req); err != nil {
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}
		if req.Score <= 0 || req.Score > 999999 {
			http.Error(w, "invalid score", http.StatusBadRequest)
			return
		}
		app.store.mu.Lock()
		record := SnakeScoreRecord{
			Score:     req.Score,
			CreatedAt: time.Now().UTC().Format(time.RFC3339),
		}
		applyScoreRecordIdentity(app, r, req, &record)
		scores := app.loadSnakeScores()
		scores = append(scores, record)
		if err := app.saveSnakeScores(scores); err != nil {
			app.store.mu.Unlock()
			log.Printf("save snake scores error: %v", err)
			http.Error(w, "save failed", http.StatusInternalServerError)
			return
		}
		scores = app.loadSnakeScores()
		app.store.mu.Unlock()
		_ = json.NewEncoder(w).Encode(map[string]any{"scores": scores})
		return
	default:
		w.Header().Set("Allow", "GET, POST")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
}

func game2048ScoreIdentity(item SnakeScoreRecord) string {
	if strings.TrimSpace(item.Username) != "" {
		return "user:" + strings.TrimSpace(item.Username)
	}
	if strings.TrimSpace(item.PlayerID) != "" {
		return "guest:" + strings.TrimSpace(item.PlayerID)
	}
	return "legacy:" + strings.TrimSpace(item.CreatedAt)
}

func normalizeGame2048ScoreRecords(scores []SnakeScoreRecord) []SnakeScoreRecord {
	bestByIdentity := map[string]SnakeScoreRecord{}
	for _, item := range scores {
		if item.Score <= 0 {
			continue
		}
		key := game2048ScoreIdentity(item)
		old, ok := bestByIdentity[key]
		if !ok || item.Score > old.Score || (item.Score == old.Score && item.CreatedAt < old.CreatedAt) {
			bestByIdentity[key] = item
		}
	}
	cleaned := make([]SnakeScoreRecord, 0, len(bestByIdentity))
	for _, item := range bestByIdentity {
		cleaned = append(cleaned, item)
	}
	sort.SliceStable(cleaned, func(i, j int) bool {
		if cleaned[i].Score == cleaned[j].Score {
			return cleaned[i].CreatedAt < cleaned[j].CreatedAt
		}
		return cleaned[i].Score > cleaned[j].Score
	})
	if len(cleaned) > 3 {
		cleaned = cleaned[:3]
	}
	return cleaned
}

func (app *App) game2048ScoresPath() string {
	return filepath.Join(app.cfg.DataDir, "2048_scores.json")
}

func (app *App) loadGame2048Scores() []SnakeScoreRecord {
	path := app.game2048ScoresPath()
	data, err := os.ReadFile(path)
	if err != nil || len(data) == 0 {
		return []SnakeScoreRecord{}
	}
	var scores []SnakeScoreRecord
	if err := json.Unmarshal(data, &scores); err != nil {
		log.Printf("load 2048 scores error: %v", err)
		return []SnakeScoreRecord{}
	}
	return normalizeGame2048ScoreRecords(scores)
}

func (app *App) saveGame2048Scores(scores []SnakeScoreRecord) error {
	cleaned := normalizeGame2048ScoreRecords(scores)
	if err := os.MkdirAll(filepath.Dir(app.game2048ScoresPath()), 0755); err != nil {
		return err
	}
	b, err := json.MarshalIndent(cleaned, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(app.game2048ScoresPath(), b, 0644)
}

func (app *App) handleGame2048ScoresAPI(w http.ResponseWriter, r *http.Request) {
	if !app.allowPublicCORS(w, r) {
		http.Error(w, "forbidden origin", http.StatusForbidden)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	switch r.Method {
	case http.MethodGet:
		app.store.mu.Lock()
		scores := app.loadGame2048Scores()
		app.store.mu.Unlock()
		_ = json.NewEncoder(w).Encode(map[string]any{"scores": scores})
		return
	case http.MethodPost:
		var req snakeScoreRequest
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, scoreRequestMaxBytes)).Decode(&req); err != nil {
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}
		if req.Score <= 0 || req.Score > maxAcceptedGameScore {
			http.Error(w, "invalid score", http.StatusBadRequest)
			return
		}
		playerID := cleanScorePlayerID(req.PlayerID)
		record := SnakeScoreRecord{
			Score:     req.Score,
			CreatedAt: time.Now().UTC().Format(time.RFC3339),
			PlayerID:  playerID,
		}
		if u, ok := app.currentUser(r); ok {
			record.Username = u.Username
			record.DisplayName = strings.TrimSpace(u.DisplayName)
			if record.DisplayName == "" {
				record.DisplayName = u.Username
			}
			record.PlayerID = ""
		}
		app.store.mu.Lock()
		scores := app.loadGame2048Scores()
		scores = append(scores, record)
		if err := app.saveGame2048Scores(scores); err != nil {
			app.store.mu.Unlock()
			log.Printf("save 2048 scores error: %v", err)
			http.Error(w, "save failed", http.StatusInternalServerError)
			return
		}
		scores = app.loadGame2048Scores()
		app.store.mu.Unlock()
		_ = json.NewEncoder(w).Encode(map[string]any{"scores": scores})
		return
	default:
		w.Header().Set("Allow", "GET, POST")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
}

func cleanScorePlayerID(raw string) string {
	v := strings.TrimSpace(raw)
	if v == "" {
		return ""
	}
	var b strings.Builder
	for _, r := range v {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			b.WriteRune(r)
		}
		if b.Len() >= 64 {
			break
		}
	}
	return b.String()
}

func scoreIdentity(item SnakeScoreRecord) string {
	if strings.TrimSpace(item.Username) != "" {
		return "user:" + strings.TrimSpace(item.Username)
	}
	if strings.TrimSpace(item.PlayerID) != "" {
		return "guest:" + strings.TrimSpace(item.PlayerID)
	}
	return "legacy:" + strings.TrimSpace(item.CreatedAt)
}

func normalizeHighScoreRecords(scores []SnakeScoreRecord) []SnakeScoreRecord {
	bestByIdentity := map[string]SnakeScoreRecord{}
	for _, item := range scores {
		if item.Score <= 0 {
			continue
		}
		key := scoreIdentity(item)
		old, ok := bestByIdentity[key]
		if !ok || item.Score > old.Score || (item.Score == old.Score && item.CreatedAt < old.CreatedAt) {
			bestByIdentity[key] = item
		}
	}
	cleaned := make([]SnakeScoreRecord, 0, len(bestByIdentity))
	for _, item := range bestByIdentity {
		cleaned = append(cleaned, item)
	}
	sort.SliceStable(cleaned, func(i, j int) bool {
		if cleaned[i].Score == cleaned[j].Score {
			return cleaned[i].CreatedAt < cleaned[j].CreatedAt
		}
		return cleaned[i].Score > cleaned[j].Score
	})
	if len(cleaned) > 3 {
		cleaned = cleaned[:3]
	}
	return cleaned
}

func applyScoreRecordIdentity(app *App, r *http.Request, req snakeScoreRequest, record *SnakeScoreRecord) {
	record.PlayerID = cleanScorePlayerID(req.PlayerID)
	if u, ok := app.currentUser(r); ok {
		record.Username = u.Username
		record.DisplayName = strings.TrimSpace(u.DisplayName)
		if record.DisplayName == "" {
			record.DisplayName = u.Username
		}
		record.PlayerID = ""
	}
}

func reactionScoreIdentity(item SnakeScoreRecord) string {
	if strings.TrimSpace(item.Username) != "" {
		return "user:" + strings.TrimSpace(item.Username)
	}
	if strings.TrimSpace(item.PlayerID) != "" {
		return "guest:" + strings.TrimSpace(item.PlayerID)
	}
	return "legacy:" + strings.TrimSpace(item.CreatedAt)
}

func reactionScoreDisplay(item SnakeScoreRecord) string {
	if strings.TrimSpace(item.DisplayName) != "" {
		return strings.TrimSpace(item.DisplayName)
	}
	if strings.TrimSpace(item.Username) != "" {
		return strings.TrimSpace(item.Username)
	}
	if strings.TrimSpace(item.PlayerID) != "" {
		id := strings.TrimSpace(item.PlayerID)
		if len(id) > 6 {
			id = id[len(id)-6:]
		}
		return "游客 " + id
	}
	return "访客"
}

func normalizeReactionScoreRecords(scores []SnakeScoreRecord) []SnakeScoreRecord {
	bestByIdentity := map[string]SnakeScoreRecord{}
	for _, item := range scores {
		if item.Score <= 0 {
			continue
		}
		item.DisplayName = reactionScoreDisplay(item)
		key := reactionScoreIdentity(item)
		old, ok := bestByIdentity[key]
		if !ok || item.Score < old.Score || (item.Score == old.Score && item.CreatedAt < old.CreatedAt) {
			bestByIdentity[key] = item
		}
	}
	cleaned := make([]SnakeScoreRecord, 0, len(bestByIdentity))
	for _, item := range bestByIdentity {
		cleaned = append(cleaned, item)
	}
	sort.SliceStable(cleaned, func(i, j int) bool {
		if cleaned[i].Score == cleaned[j].Score {
			return cleaned[i].CreatedAt < cleaned[j].CreatedAt
		}
		return cleaned[i].Score < cleaned[j].Score
	})
	if len(cleaned) > 3 {
		cleaned = cleaned[:3]
	}
	return cleaned
}

func (app *App) reactionScoresPath() string {
	return filepath.Join(app.cfg.DataDir, "reaction_scores.json")
}

func (app *App) loadReactionScores() []SnakeScoreRecord {
	path := app.reactionScoresPath()
	data, err := os.ReadFile(path)
	if err != nil || len(data) == 0 {
		return []SnakeScoreRecord{}
	}
	var scores []SnakeScoreRecord
	if err := json.Unmarshal(data, &scores); err != nil {
		log.Printf("load reaction scores error: %v", err)
		return []SnakeScoreRecord{}
	}
	return normalizeReactionScoreRecords(scores)
}

func (app *App) saveReactionScores(scores []SnakeScoreRecord) error {
	cleaned := normalizeReactionScoreRecords(scores)
	if err := os.MkdirAll(filepath.Dir(app.reactionScoresPath()), 0755); err != nil {
		return err
	}
	b, err := json.MarshalIndent(cleaned, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(app.reactionScoresPath(), b, 0644)
}

func (app *App) handleReactionScoresAPI(w http.ResponseWriter, r *http.Request) {
	if !app.allowPublicCORS(w, r) {
		http.Error(w, "forbidden origin", http.StatusForbidden)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	switch r.Method {
	case http.MethodGet:
		app.store.mu.Lock()
		scores := app.loadReactionScores()
		app.store.mu.Unlock()
		_ = json.NewEncoder(w).Encode(map[string]any{"scores": scores})
		return
	case http.MethodPost:
		var req snakeScoreRequest
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, scoreRequestMaxBytes)).Decode(&req); err != nil {
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}
		// 反应时间单位为 ms。这里是网页估测值，允许低于 50ms 的极快记录同步。
		if req.Score < 1 || req.Score > 5000 {
			http.Error(w, "invalid score", http.StatusBadRequest)
			return
		}
		playerID := cleanScorePlayerID(req.PlayerID)
		record := SnakeScoreRecord{
			Score:     req.Score,
			CreatedAt: time.Now().UTC().Format(time.RFC3339),
			PlayerID:  playerID,
		}
		if u, ok := app.currentUser(r); ok {
			record.Username = u.Username
			record.DisplayName = strings.TrimSpace(u.DisplayName)
			if record.DisplayName == "" {
				record.DisplayName = u.Username
			}
			record.PlayerID = ""
		} else {
			record.DisplayName = reactionScoreDisplay(record)
		}
		app.store.mu.Lock()
		scores := app.loadReactionScores()
		scores = append(scores, record)
		if err := app.saveReactionScores(scores); err != nil {
			app.store.mu.Unlock()
			log.Printf("save reaction scores error: %v", err)
			http.Error(w, "save failed", http.StatusInternalServerError)
			return
		}
		scores = app.loadReactionScores()
		app.store.mu.Unlock()
		_ = json.NewEncoder(w).Encode(map[string]any{"scores": scores})
		return
	default:
		w.Header().Set("Allow", "GET, POST")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
}

func (app *App) flappyScoresPath() string {
	return filepath.Join(app.cfg.DataDir, "flappy_scores.json")
}

func (app *App) loadFlappyScores() []SnakeScoreRecord {
	path := app.flappyScoresPath()
	data, err := os.ReadFile(path)
	if err != nil || len(data) == 0 {
		return []SnakeScoreRecord{}
	}
	var scores []SnakeScoreRecord
	if err := json.Unmarshal(data, &scores); err != nil {
		log.Printf("load flappy scores error: %v", err)
		return []SnakeScoreRecord{}
	}
	return normalizeHighScoreRecords(scores)
}

func (app *App) saveFlappyScores(scores []SnakeScoreRecord) error {
	cleaned := normalizeHighScoreRecords(scores)
	if err := os.MkdirAll(filepath.Dir(app.flappyScoresPath()), 0755); err != nil {
		return err
	}
	b, err := json.MarshalIndent(cleaned, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(app.flappyScoresPath(), b, 0644)
}

func (app *App) handleFlappyScoresAPI(w http.ResponseWriter, r *http.Request) {
	if !app.allowPublicCORS(w, r) {
		http.Error(w, "forbidden origin", http.StatusForbidden)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	switch r.Method {
	case http.MethodGet:
		app.store.mu.Lock()
		scores := app.loadFlappyScores()
		app.store.mu.Unlock()
		_ = json.NewEncoder(w).Encode(map[string]any{"scores": scores})
		return
	case http.MethodPost:
		var req snakeScoreRequest
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, scoreRequestMaxBytes)).Decode(&req); err != nil {
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}
		if req.Score <= 0 || req.Score > 999999 {
			http.Error(w, "invalid score", http.StatusBadRequest)
			return
		}
		app.store.mu.Lock()
		record := SnakeScoreRecord{
			Score:     req.Score,
			CreatedAt: time.Now().UTC().Format(time.RFC3339),
		}
		applyScoreRecordIdentity(app, r, req, &record)
		scores := app.loadFlappyScores()
		scores = append(scores, record)
		if err := app.saveFlappyScores(scores); err != nil {
			app.store.mu.Unlock()
			log.Printf("save flappy scores error: %v", err)
			http.Error(w, "save failed", http.StatusInternalServerError)
			return
		}
		scores = app.loadFlappyScores()
		app.store.mu.Unlock()
		_ = json.NewEncoder(w).Encode(map[string]any{"scores": scores})
		return
	default:
		w.Header().Set("Allow", "GET, POST")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
}

func typingScoreMode(raw string) string {
	mode := strings.ToLower(strings.TrimSpace(raw))
	switch mode {
	case "mixed", "zh", "cn", "chinese":
		return "mixed"
	default:
		return "english"
	}
}

func (app *App) typingScoresPath() string {
	return filepath.Join(app.cfg.DataDir, "typing_scores.json")
}

func typingScoreIdentity(item SnakeScoreRecord) string {
	if strings.TrimSpace(item.Username) != "" {
		return "user:" + strings.TrimSpace(item.Username)
	}
	if strings.TrimSpace(item.PlayerID) != "" {
		return "guest:" + strings.TrimSpace(item.PlayerID)
	}
	return "legacy:" + strings.TrimSpace(item.CreatedAt)
}

func normalizeTypingScoreRecords(scores []SnakeScoreRecord, mode string) []SnakeScoreRecord {
	mode = typingScoreMode(mode)
	bestByIdentity := map[string]SnakeScoreRecord{}
	for _, item := range scores {
		if item.Score <= 0 || typingScoreMode(item.Mode) != mode {
			continue
		}
		item.Mode = mode
		key := typingScoreIdentity(item)
		old, ok := bestByIdentity[key]
		if !ok || item.Score < old.Score || (item.Score == old.Score && item.CreatedAt < old.CreatedAt) {
			bestByIdentity[key] = item
		}
	}
	cleaned := make([]SnakeScoreRecord, 0, len(bestByIdentity))
	for _, item := range bestByIdentity {
		cleaned = append(cleaned, item)
	}
	sort.SliceStable(cleaned, func(i, j int) bool {
		if cleaned[i].Score == cleaned[j].Score {
			return cleaned[i].CreatedAt < cleaned[j].CreatedAt
		}
		return cleaned[i].Score < cleaned[j].Score
	})
	if len(cleaned) > 3 {
		cleaned = cleaned[:3]
	}
	return cleaned
}

func normalizeAllTypingScoreRecords(scores []SnakeScoreRecord) []SnakeScoreRecord {
	cleaned := make([]SnakeScoreRecord, 0, 6)
	cleaned = append(cleaned, normalizeTypingScoreRecords(scores, "english")...)
	cleaned = append(cleaned, normalizeTypingScoreRecords(scores, "mixed")...)
	return cleaned
}

func (app *App) loadTypingScores(mode string) []SnakeScoreRecord {
	path := app.typingScoresPath()
	data, err := os.ReadFile(path)
	if err != nil || len(data) == 0 {
		return []SnakeScoreRecord{}
	}
	var scores []SnakeScoreRecord
	if err := json.Unmarshal(data, &scores); err != nil {
		log.Printf("load typing scores error: %v", err)
		return []SnakeScoreRecord{}
	}
	return normalizeTypingScoreRecords(scores, mode)
}

func (app *App) saveTypingScores(scores []SnakeScoreRecord) error {
	cleaned := normalizeAllTypingScoreRecords(scores)
	if err := os.MkdirAll(filepath.Dir(app.typingScoresPath()), 0755); err != nil {
		return err
	}
	b, err := json.MarshalIndent(cleaned, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(app.typingScoresPath(), b, 0644)
}

func (app *App) handleTypingScoresAPI(w http.ResponseWriter, r *http.Request) {
	if !app.allowPublicCORS(w, r) {
		http.Error(w, "forbidden origin", http.StatusForbidden)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	switch r.Method {
	case http.MethodGet:
		mode := typingScoreMode(r.URL.Query().Get("mode"))
		app.store.mu.Lock()
		scores := app.loadTypingScores(mode)
		app.store.mu.Unlock()
		_ = json.NewEncoder(w).Encode(map[string]any{"mode": mode, "scores": scores})
		return
	case http.MethodPost:
		var req snakeScoreRequest
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, scoreRequestMaxBytes)).Decode(&req); err != nil {
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}
		mode := typingScoreMode(req.Mode)
		// 打字练习成绩单位为 ms。只记录完整完成一篇文章的时间。
		if req.Score < 1000 || req.Score > 3600000 {
			http.Error(w, "invalid score", http.StatusBadRequest)
			return
		}
		playerID := cleanScorePlayerID(req.PlayerID)
		articleID := cleanScorePlayerID(req.ArticleID)
		record := SnakeScoreRecord{
			Score:     req.Score,
			CreatedAt: time.Now().UTC().Format(time.RFC3339),
			PlayerID:  playerID,
			Mode:      mode,
			ArticleID: articleID,
		}
		if u, ok := app.currentUser(r); ok {
			record.Username = u.Username
			record.DisplayName = strings.TrimSpace(u.DisplayName)
			if record.DisplayName == "" {
				record.DisplayName = u.Username
			}
			record.PlayerID = ""
		}
		app.store.mu.Lock()
		all := normalizeAllTypingScoreRecords(append(app.loadTypingScores("english"), app.loadTypingScores("mixed")...))
		all = append(all, record)
		if err := app.saveTypingScores(all); err != nil {
			app.store.mu.Unlock()
			log.Printf("save typing scores error: %v", err)
			http.Error(w, "save failed", http.StatusInternalServerError)
			return
		}
		scores := app.loadTypingScores(mode)
		app.store.mu.Unlock()
		_ = json.NewEncoder(w).Encode(map[string]any{"mode": mode, "scores": scores})
		return
	default:
		w.Header().Set("Allow", "GET, POST")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
}

func (app *App) handleViewsAPI(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	path := cleanViewPath(r.URL.Query().Get("path"))
	if path == "" {
		http.Error(w, `{"error":"bad path"}`, http.StatusBadRequest)
		return
	}
	app.store.mu.Lock()
	defer app.store.mu.Unlock()

	views := app.loadViews()
	switch r.Method {
	case http.MethodGet:
		_ = json.NewEncoder(w).Encode(viewAPIResponse{Path: path, Views: views[path]})
	case http.MethodPost:
		views[path]++
		if err := app.saveViews(views); err != nil {
			log.Printf("save views error: %v", err)
			http.Error(w, `{"error":"save failed"}`, http.StatusInternalServerError)
			return
		}
		_ = json.NewEncoder(w).Encode(viewAPIResponse{Path: path, Views: views[path]})
	default:
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
	}
}

const noticeTagSlug = "site-notice"
const noticeTagLabel = "站点公告"

func normalizeAccountType(role, accountType string) string {
	accountType = strings.TrimSpace(accountType)
	switch accountType {
	case accountSystem, accountOwner, accountFriend:
		return accountType
	}
	if role == roleAdmin {
		return accountSystem
	}
	return accountFriend
}

func accountTypeText(t string) string {
	switch normalizeAccountType("", t) {
	case accountSystem:
		return "系统账号 / 公告"
	case accountOwner:
		return "站长 / 主账号"
	default:
		return "朋友作者"
	}
}

func isSystemAccount(t string) bool {
	return normalizeAccountType("", t) == accountSystem
}

func (app *App) adminURL(p string) string {
	return adminURLPath(app.cfg.AdminBasePath, p)
}

func (app *App) redirect(w http.ResponseWriter, r *http.Request, p string, code int) {
	if strings.HasPrefix(p, "http://") || strings.HasPrefix(p, "https://") {
		http.Redirect(w, r, p, code)
		return
	}
	http.Redirect(w, r, app.adminURL(p), code)
}

func mustMkdir(p string, mode os.FileMode) {
	if err := os.MkdirAll(p, mode); err != nil {
		log.Fatal(err)
	}
}

func NewStore(dataDir string) (*Store, error) {
	s := &Store{dataDir: dataDir, users: map[string]User{}, articles: map[string]Article{}, resets: map[string]PasswordResetRequest{}}
	if err := s.load("users.json", &s.users); err != nil {
		return nil, err
	}
	if err := s.load("articles.json", &s.articles); err != nil {
		return nil, err
	}
	if err := s.load("password_resets.json", &s.resets); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *Store) load(name string, v any) error {
	b, err := os.ReadFile(filepath.Join(s.dataDir, name))
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	if len(strings.TrimSpace(string(b))) == 0 {
		return nil
	}
	return json.Unmarshal(b, v)
}

func (s *Store) saveLocked(name string, v any) error {
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	tmp := filepath.Join(s.dataDir, name+".tmp")
	dst := filepath.Join(s.dataDir, name)
	if err := os.WriteFile(tmp, b, 0600); err != nil {
		return err
	}
	return os.Rename(tmp, dst)
}

func (s *Store) EnsureAdmin(username, password string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	username = cleanUsername(username)
	if username == "" {
		return errors.New("ADMIN_USER must be configured before creating the initial administrator")
	}
	if _, ok := s.users[username]; ok {
		u := s.users[username]
		if u.Role != roleAdmin {
			return errors.New("ADMIN_USER already belongs to a non-admin account; choose a different username or resolve the account conflict")
		}
		// 本地环境配置是初始管理员的唯一权威来源。
		// 这样 .env 中的密码修改会在每次重启后生效，其他用户仍由应用数据存储管理。
		if VerifyPassword(password, u.PasswordHash) {
			return nil
		}
		h, err := HashPassword(password)
		if err != nil {
			return err
		}
		u.PasswordHash = h
		u.PasswordMustChange = false
		s.users[username] = u
		return s.saveLocked("users.json", s.users)
	}
	if password == "" {
		return errors.New("ADMIN_PASS must be configured before creating the initial administrator")
	}
	h, err := HashPassword(password)
	if err != nil {
		return err
	}
	s.users[username] = User{Username: username, DisplayName: "站点公告", Role: roleAdmin, AccountType: accountSystem, PasswordHash: h, CreatedAt: time.Now(), ShowInFriends: false}
	return s.saveLocked("users.json", s.users)
}

func (s *Store) CreateUser(username, displayName, role, accountType, password string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	username = cleanUsername(username)
	if username == "" {
		return errors.New("用户名只能包含字母、数字、下划线和短横线")
	}
	if len(password) < 6 {
		return errors.New("密码至少 6 位")
	}
	if _, ok := s.users[username]; ok {
		return errors.New("用户已经存在")
	}
	if role != roleAdmin {
		role = roleAuthor
	}
	accountType = normalizeAccountType(role, accountType)
	if strings.TrimSpace(displayName) == "" {
		if accountType == accountSystem {
			displayName = "站点公告"
		} else {
			displayName = username
		}
	}
	h, err := HashPassword(password)
	if err != nil {
		return err
	}
	showInFriends := accountType == accountFriend
	s.users[username] = User{Username: username, DisplayName: strings.TrimSpace(displayName), Role: role, AccountType: accountType, ShowInFriends: showInFriends, PasswordHash: h, CreatedAt: time.Now(), PasswordMustChange: role != roleAdmin}
	return s.saveLocked("users.json", s.users)
}

func (s *Store) GetUser(username string) (User, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	u, ok := s.users[username]
	if ok {
		u.AccountType = normalizeAccountType(u.Role, u.AccountType)
		if u.DisplayName == "" {
			u.DisplayName = u.Username
		}
	}
	return u, ok
}

func (s *Store) Users() []User {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]User, 0, len(s.users))
	for _, u := range s.users {
		u.AccountType = normalizeAccountType(u.Role, u.AccountType)
		if u.DisplayName == "" {
			u.DisplayName = u.Username
		}
		out = append(out, u)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.Before(out[j].CreatedAt) })
	return out
}

func (s *Store) AllArticles() []Article {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]Article, 0, len(s.articles))
	for _, a := range s.articles {
		if a.Status == stDeleted {
			continue
		}
		out = append(out, a)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].UpdatedAt.After(out[j].UpdatedAt) })
	return out
}

func (s *Store) ArticlesByStatus(status string) []Article {
	all := s.AllArticles()
	out := []Article{}
	for _, a := range all {
		if a.Status == status {
			out = append(out, a)
		}
	}
	return out
}

func (s *Store) ArticlesExceptStatus(status string) []Article {
	all := s.AllArticles()
	out := []Article{}
	for _, a := range all {
		if a.Status != status {
			out = append(out, a)
		}
	}
	return out
}

func (s *Store) ArticlesByAuthor(author string) []Article {
	all := s.AllArticles()
	out := []Article{}
	for _, a := range all {
		if a.Author == author {
			out = append(out, a)
		}
	}
	return out
}

func (s *Store) GetArticle(id string) (Article, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	a, ok := s.articles[id]
	return a, ok
}

func (s *Store) SaveArticle(a Article) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now()
	if a.ID == "" {
		a.ID = newID()
		a.CreatedAt = now
	}
	if a.Status == "" {
		a.Status = stDraft
	}
	a.UpdatedAt = now
	s.articles[a.ID] = a
	return s.saveLocked("articles.json", s.articles)
}

func (s *Store) SlugExists(slug, exceptID string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	for id, a := range s.articles {
		if id != exceptID && a.Status != stDeleted && a.Slug == slug {
			return true
		}
	}
	return false
}

func (s *Store) DeleteArticle(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.articles[id]; !ok {
		return errors.New("文章不存在")
	}
	delete(s.articles, id)
	return s.saveLocked("articles.json", s.articles)
}

func (s *Store) DeleteArticlesByStatus(statuses ...string) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	set := map[string]bool{}
	for _, st := range statuses {
		set[st] = true
	}
	removed := 0
	for id, a := range s.articles {
		if set[a.Status] {
			delete(s.articles, id)
			removed++
		}
	}
	return removed, s.saveLocked("articles.json", s.articles)
}

func (s *Store) DeleteAllArticles() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.articles = map[string]Article{}
	return s.saveLocked("articles.json", s.articles)
}

func (s *Store) ArticleCountByAuthor(username string) int {
	s.mu.Lock()
	defer s.mu.Unlock()
	count := 0
	for _, a := range s.articles {
		if a.Author == username && a.Status != stDeleted {
			count++
		}
	}
	return count
}

func (s *Store) ToggleUser(username string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	u, ok := s.users[username]
	if !ok {
		return errors.New("用户不存在")
	}
	if u.Role == roleAdmin {
		return errors.New("不能禁用管理员")
	}
	u.Disabled = !u.Disabled
	s.users[username] = u
	return s.saveLocked("users.json", s.users)
}

func (s *Store) ResetPassword(username, password string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	u, ok := s.users[username]
	if !ok {
		return errors.New("用户不存在")
	}
	if len(password) < 6 {
		return errors.New("密码至少 6 位")
	}
	h, err := HashPassword(password)
	if err != nil {
		return err
	}
	u.PasswordHash = h
	u.PasswordMustChange = true
	s.users[username] = u
	return s.saveLocked("users.json", s.users)
}

func (s *Store) DeleteUser(username string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	u, ok := s.users[username]
	if !ok {
		return errors.New("用户不存在")
	}
	if u.Role == roleAdmin {
		return errors.New("不能删除管理员")
	}
	for _, a := range s.articles {
		if a.Author == username && a.Status != stDeleted {
			return errors.New("该用户还有文章，请先删除文章或改用禁用")
		}
	}
	delete(s.users, username)
	return s.saveLocked("users.json", s.users)
}

func (s *Store) SaveOwnProfile(username, displayName, bio, homepage, avatar, cover string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	u, ok := s.users[username]
	if !ok {
		return errors.New("用户不存在")
	}
	displayName = strings.TrimSpace(displayName)
	if displayName == "" {
		displayName = u.Username
	}
	u.DisplayName = displayName
	u.Bio = strings.TrimSpace(bio)
	u.Homepage = normalizeContactHref(homepage, "")
	u.Avatar = cleanAssetPath(avatar)
	u.Cover = cleanAssetPath(cover)
	s.users[username] = u
	return s.saveLocked("users.json", s.users)
}

func (s *Store) ChangeOwnPassword(username, oldPassword, newPassword string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	u, ok := s.users[username]
	if !ok {
		return errors.New("用户不存在")
	}
	if !VerifyPassword(oldPassword, u.PasswordHash) {
		return errors.New("旧密码不正确")
	}
	if len(newPassword) < 8 {
		return errors.New("新密码至少 8 位")
	}
	h, err := HashPassword(newPassword)
	if err != nil {
		return err
	}
	u.PasswordHash = h
	u.PasswordMustChange = false
	s.users[username] = u
	return s.saveLocked("users.json", s.users)
}

func (s *Store) CreatePasswordReset(username, note string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	username = cleanUsername(username)
	u, ok := s.users[username]
	if !ok || u.Role == roleAdmin {
		return errors.New("用户不存在，或管理员账号不能走申请流程")
	}
	if u.Disabled {
		return errors.New("账号已被禁用，请直接联系管理员")
	}
	for _, req := range s.resets {
		if req.Username == username && req.Status == "pending" {
			return errors.New("已有待处理的密码申请，请等待管理员处理")
		}
	}
	now := time.Now()
	id := newID()
	s.resets[id] = PasswordResetRequest{ID: id, Username: username, Note: strings.TrimSpace(note), Status: "pending", CreatedAt: now, UpdatedAt: now}
	return s.saveLocked("password_resets.json", s.resets)
}

func (s *Store) PasswordResetRequests() []PasswordResetRequest {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]PasswordResetRequest, 0, len(s.resets))
	for _, req := range s.resets {
		out = append(out, req)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Status != out[j].Status {
			return out[i].Status == "pending"
		}
		return out[i].CreatedAt.After(out[j].CreatedAt)
	})
	return out
}

func (s *Store) ResolvePasswordReset(id, admin, action, newPassword string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	req, ok := s.resets[id]
	if !ok {
		return errors.New("申请不存在")
	}
	if req.Status != "pending" {
		return errors.New("申请已处理")
	}
	now := time.Now()
	switch action {
	case "approve":
		if len(newPassword) < 8 {
			return errors.New("临时密码至少 8 位")
		}
		u, ok := s.users[req.Username]
		if !ok {
			return errors.New("用户不存在")
		}
		h, err := HashPassword(newPassword)
		if err != nil {
			return err
		}
		u.PasswordHash = h
		u.PasswordMustChange = true
		s.users[req.Username] = u
		req.Status = "approved"
	case "reject":
		req.Status = "rejected"
	default:
		return errors.New("未知操作")
	}
	req.UpdatedAt = now
	req.ResolvedBy = admin
	s.resets[id] = req
	if err := s.saveLocked("users.json", s.users); err != nil {
		return err
	}
	return s.saveLocked("password_resets.json", s.resets)
}

func (s *Store) ClearResolvedPasswordResets() (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	removed := 0
	for id, req := range s.resets {
		if req.Status != "pending" {
			delete(s.resets, id)
			removed++
		}
	}
	return removed, s.saveLocked("password_resets.json", s.resets)
}

func (app *App) render(w http.ResponseWriter, name string, data map[string]any) {
	if data == nil {
		data = map[string]any{}
	}
	if _, ok := data["Settings"]; !ok {
		if settings, err := app.loadSiteSettings(); err == nil {
			data["Settings"] = settings
		}
	}
	if _, ok := data["Theme"]; !ok {
		if theme, err := app.loadThemeSettings(); err == nil {
			data["Theme"] = theme
		}
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if err := app.tpl.ExecuteTemplate(w, name, data); err != nil {
		http.Error(w, err.Error(), 500)
	}
}

func (app *App) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(200)
	_, _ = w.Write([]byte("ok"))
}

func (app *App) handleHome(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}
	u, ok := app.currentUser(r)
	if !ok {
		app.redirect(w, r, "/login", http.StatusSeeOther)
		return
	}
	articles := app.store.ArticlesByAuthor(u.Username)
	if u.Role == roleAdmin {
		articles = app.store.AllArticles()
	}
	app.render(w, "home.html", map[string]any{"User": u, "Articles": articles, "Flash": r.URL.Query().Get("msg")})
}

func (app *App) handleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		if _, ok := app.currentUser(r); ok {
			app.redirect(w, r, "/", http.StatusSeeOther)
			return
		}
		app.render(w, "login.html", map[string]any{"Flash": r.URL.Query().Get("msg")})
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
	username := cleanUsername(r.FormValue("username"))
	u, ok := app.store.GetUser(username)
	if !ok || !VerifyPassword(r.FormValue("password"), u.PasswordHash) {
		app.render(w, "login.html", map[string]any{"Error": "账号或密码不对"})
		return
	}
	if u.Disabled {
		app.render(w, "login.html", map[string]any{"Error": "账号已被禁用，请联系管理员"})
		return
	}
	app.setSession(w, u.Username, r.FormValue("remember") == "on")
	if u.PasswordMustChange {
		app.redirect(w, r, "/account?msg=请先修改初始/临时密码", http.StatusSeeOther)
		return
	}
	app.redirect(w, r, "/?msg=登录成功", http.StatusSeeOther)
}

func (app *App) handleLogout(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{Name: "session", Value: "", Path: "/", MaxAge: -1, HttpOnly: true, SameSite: http.SameSiteLaxMode})
	app.redirect(w, r, "/login?msg=已退出", http.StatusSeeOther)
}

func (app *App) handleNewArticle(w http.ResponseWriter, r *http.Request) {
	u, _ := app.currentUser(r)
	if r.Method == http.MethodGet {
		a := Article{Author: u.Username, Status: stDraft}
		app.render(w, "editor.html", map[string]any{"User": u, "Article": a, "Mode": "new", "CoverFiles": listMediaFiles(userMediaDir(u.Username), userMediaPublicPrefix(u.Username))})
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", 405)
		return
	}
	app.createOrUpdateArticle(w, r, "", u)
}

func (app *App) saveAccountImageUpload(r *http.Request, username, field, prefix string) (string, error) {
	file, header, err := r.FormFile(field)
	if err != nil {
		if errors.Is(err, http.ErrMissingFile) {
			return "", nil
		}
		return "", err
	}
	defer file.Close()

	name := safeUploadName(header.Filename)
	ext := strings.ToLower(filepath.Ext(name))
	allowed := map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".webp": true, ".gif": true, ".svg": true}
	if !allowed[ext] {
		return "", fmt.Errorf("只允许上传 jpg / png / webp / gif / svg 图片")
	}

	owner := mediaOwner(username)
	dir := userMediaDir(owner)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", err
	}

	base := safeUploadName(prefix + ext)
	if base == "" {
		base = safeUploadName("profile" + ext)
	}
	dstName := uniqueUploadName(dir, base)
	dstPath := filepath.Join(dir, dstName)

	dst, err := os.Create(dstPath)
	if err != nil {
		return "", err
	}
	defer dst.Close()

	if _, err := io.Copy(dst, io.LimitReader(file, 3*1024*1024+1)); err != nil {
		return "", err
	}
	if info, err := os.Stat(dstPath); err == nil && info.Size() > 3*1024*1024 {
		_ = os.Remove(dstPath)
		return "", fmt.Errorf("图片不能超过 3MB")
	}
	return userMediaPublicPath(owner, dstName), nil
}

func (app *App) handleAccount(w http.ResponseWriter, r *http.Request) {
	u, _ := app.currentUser(r)
	coverFiles := listMediaFiles(userMediaDir(u.Username), userMediaPublicPrefix(u.Username))
	if r.Method == http.MethodGet {
		app.render(w, "account.html", map[string]any{"User": u, "CoverFiles": coverFiles, "Flash": r.URL.Query().Get("msg")})
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", 405)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 8*1024*1024)
	contentType := strings.ToLower(r.Header.Get("Content-Type"))
	if strings.Contains(contentType, "multipart/form-data") {
		if err := r.ParseMultipartForm(8 * 1024 * 1024); err != nil {
			http.Error(w, "bad request", 400)
			return
		}
	} else {
		if err := r.ParseForm(); err != nil {
			http.Error(w, "bad request", 400)
			return
		}
	}
	action := strings.TrimSpace(r.FormValue("action"))
	if action == "add_user" {
		if u.Role != roleAdmin {
			http.Error(w, "forbidden", 403)
			return
		}
		if err := app.store.CreateUser(r.FormValue("username"), r.FormValue("display"), r.FormValue("role"), r.FormValue("account_type"), r.FormValue("password")); err != nil {
			app.render(w, "account.html", map[string]any{"User": u, "CoverFiles": coverFiles, "Error": err.Error()})
			return
		}
		if err := app.runHugo(r.Context()); err != nil {
			log.Printf("hugo build after account create user error: %v", err)
			app.redirect(w, r, "/account?msg=用户已创建，但公开站重建失败，请看日志", http.StatusSeeOther)
			return
		}
		app.redirect(w, r, "/account?msg=用户已创建，公开站已同步", http.StatusSeeOther)
		return
	}
	if action == "profile" {
		oldProfileUser := u
		avatar := r.FormValue("avatar")
		cover := r.FormValue("cover")
		if uploaded, err := app.saveAccountImageUpload(r, u.Username, "avatar_file", "avatar"); err != nil {
			app.render(w, "account.html", map[string]any{"User": u, "CoverFiles": coverFiles, "Error": "头像上传失败：" + err.Error()})
			return
		} else if uploaded != "" {
			avatar = uploaded
		}
		if uploaded, err := app.saveAccountImageUpload(r, u.Username, "cover_file", "friend-cover"); err != nil {
			app.render(w, "account.html", map[string]any{"User": u, "CoverFiles": coverFiles, "Error": "横幅上传失败：" + err.Error()})
			return
		} else if uploaded != "" {
			cover = uploaded
		}

		if err := app.store.SaveOwnProfile(u.Username, r.FormValue("display_name"), r.FormValue("bio"), r.FormValue("homepage"), avatar, cover); err != nil {
			app.render(w, "account.html", map[string]any{"User": u, "CoverFiles": coverFiles, "Error": err.Error()})
			return
		}
		newProfileUser, _ := app.store.GetUser(u.Username)
		if err := app.syncUserProfileToFriendsJSON(oldProfileUser, newProfileUser); err != nil {
			log.Printf("sync profile to friends.json error: %v", err)
			app.render(w, "account.html", map[string]any{"User": newProfileUser, "CoverFiles": coverFiles, "Error": "个人资料已保存，但同步朋友页失败：" + err.Error()})
			return
		}
		if err := app.runHugo(r.Context()); err != nil {
			log.Printf("hugo build after profile save error: %v", err)
			app.render(w, "account.html", map[string]any{"User": newProfileUser, "CoverFiles": coverFiles, "Error": "个人资料已保存，但公开站重建失败，请看日志：" + err.Error()})
			return
		}
		app.redirect(w, r, "/?msg=个人资料已保存，公开站已重建", http.StatusSeeOther)
		return
	}
	oldPass := r.FormValue("old_password")
	newPass := r.FormValue("new_password")
	confirm := r.FormValue("confirm_password")
	if newPass != confirm {
		app.render(w, "account.html", map[string]any{"User": u, "CoverFiles": coverFiles, "Error": "两次输入的新密码不一致"})
		return
	}
	if err := app.store.ChangeOwnPassword(u.Username, oldPass, newPass); err != nil {
		app.render(w, "account.html", map[string]any{"User": u, "CoverFiles": coverFiles, "Error": err.Error()})
		return
	}
	app.redirect(w, r, "/?msg=账号密码已修改", http.StatusSeeOther)
}

func (app *App) handlePasswordResetRequest(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		app.render(w, "request_password.html", map[string]any{"Flash": r.URL.Query().Get("msg")})
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", 405)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 32*1024)
	if err := r.ParseForm(); err != nil {
		http.Error(w, "bad request", 400)
		return
	}
	if err := app.store.CreatePasswordReset(r.FormValue("username"), r.FormValue("note")); err != nil {
		app.render(w, "request_password.html", map[string]any{"Error": err.Error()})
		return
	}
	app.redirect(w, r, "/login?msg=密码修改申请已提交，等管理员处理后再登录", http.StatusSeeOther)
}

func (app *App) handleArticleRoutes(w http.ResponseWriter, r *http.Request) {
	u, _ := app.currentUser(r)
	parts := strings.Split(strings.Trim(strings.TrimPrefix(r.URL.Path, "/articles/"), "/"), "/")
	if len(parts) == 0 || parts[0] == "" {
		http.NotFound(w, r)
		return
	}
	id := parts[0]
	action := "edit"
	if len(parts) > 1 {
		action = parts[1]
	}

	switch action {
	case "edit":
		if r.Method == http.MethodGet {
			app.showEditor(w, r, id, u)
			return
		}
		if r.Method == http.MethodPost {
			app.createOrUpdateArticle(w, r, id, u)
			return
		}
	case "submit":
		if r.Method == http.MethodPost {
			app.submitArticle(w, r, id, u)
			return
		}
	case "publish":
		if r.Method == http.MethodPost {
			app.publishArticle(w, r, id, u)
			return
		}
	case "reject":
		if r.Method == http.MethodPost {
			app.rejectArticle(w, r, id, u)
			return
		}
	case "delete":
		if r.Method == http.MethodPost {
			app.deleteArticle(w, r, id, u)
			return
		}
	}
	http.NotFound(w, r)
}

func (app *App) showEditor(w http.ResponseWriter, r *http.Request, id string, u User) {
	a, ok := app.store.GetArticle(id)
	if !ok {
		http.NotFound(w, r)
		return
	}
	if !canAccessArticle(u, a) {
		http.Error(w, "forbidden", 403)
		return
	}
	app.render(w, "editor.html", map[string]any{"User": u, "Article": a, "Mode": "edit", "Flash": r.URL.Query().Get("msg"), "CoverFiles": listMediaFiles(userMediaDir(u.Username), userMediaPublicPrefix(u.Username))})
}

func (app *App) createOrUpdateArticle(w http.ResponseWriter, r *http.Request, id string, u User) {
	r.Body = http.MaxBytesReader(w, r.Body, 600*1024)
	if err := r.ParseForm(); err != nil {
		http.Error(w, "表单太大或格式错误", 400)
		return
	}

	intent := strings.TrimSpace(r.FormValue("intent"))
	if intent == "" {
		intent = "save"
	}
	if intent != "save" && intent != "submit" && intent != "publish" {
		intent = "save"
	}
	if intent == "publish" && u.Role != roleAdmin {
		intent = "submit"
	}

	var a Article
	var oldPublished Article
	wasPublished := false
	if id == "" {
		a = Article{Author: u.Username, Status: stDraft}
	} else {
		old, ok := app.store.GetArticle(id)
		if !ok {
			http.NotFound(w, r)
			return
		}
		if !canAccessArticle(u, old) {
			http.Error(w, "forbidden", 403)
			return
		}
		a = old
		if a.Status == stPublished {
			wasPublished = true
			oldPublished = old
			if u.Role != roleAdmin {
				// 普通作者修改已发布文章时，先从公开站撤下，保存后需要重新提交审核。
				_ = app.removeHugoArticle(old)
				_ = app.runHugo(r.Context())
				a.Status = stDraft
				a.PublishedAt = nil
			}
		}
		if a.Status == stPending && intent == "save" {
			// 对正在审核的稿件点击“保存草稿”，表示作者要继续修改，所以退回草稿。
			a.Status = stDraft
		}
	}

	body := stripUnsafeHTML(r.FormValue("body"))
	title := strings.TrimSpace(r.FormValue("title"))
	slug := slugify(r.FormValue("slug"))
	summary := strings.TrimSpace(r.FormValue("summary"))
	cover := cleanAssetPath(r.FormValue("cover"))
	coverMode := normalizeCoverMode(r.FormValue("cover_mode"))
	tags := splitTags(r.FormValue("tags"))
	accountType := normalizeAccountType(u.Role, u.AccountType)
	if accountType != accountSystem {
		tags = filterProtectedNoticeTags(tags)
	}

	if title == "" {
		app.editorError(w, u, a, "标题不能为空")
		return
	}
	if slug == "" {
		slug = slugify(title)
	}
	if slug == "" {
		app.editorError(w, u, a, "Slug 不能为空，建议用 my-first-post 这种格式")
		return
	}
	if len(body) == 0 {
		app.editorError(w, u, a, "正文不能为空")
		return
	}
	if len(body) > 200*1024 {
		app.editorError(w, u, a, "正文超过 200KB，第一版先限制一下")
		return
	}
	if app.store.SlugExists(slug, a.ID) {
		app.editorError(w, u, a, "Slug 已被其他文章使用，换一个英文短名")
		return
	}

	// 新文章在保存前先生成 ID；否则 Store.SaveArticle 内部生成的 ID 不会回写到当前变量，
	// 保存后重定向会变成 /articles//edit，导致 404。
	if a.ID == "" {
		a.ID = newID()
		a.CreatedAt = time.Now()
	}

	a.Title, a.Slug, a.Summary, a.Cover, a.CoverMode, a.Tags, a.Body = title, slug, summary, cover, coverMode, tags, body
	// v20.0.8: 编辑器保存/发布后，同步更新 Markdown 源文本。
	// 公开文章页会用 source_md_url/source_md_b64 重新渲染正文；如果这里保留旧的上传源文件，
	// 浏览器会先看到新 .Content，随后又被旧 source_md 覆盖，看起来就像“发布后内容没变”。
	a.SourceMD = body
	a.RejectNote = ""

	shouldWritePublic := false
	if intent == "submit" {
		if a.Title == "" || a.Slug == "" || a.Body == "" {
			app.redirect(w, r, "/articles/"+a.ID+"/edit?msg=请先补全文章再提交审核", http.StatusSeeOther)
			return
		}
		a.Status = stPending
		a.PublishedAt = nil
		if wasPublished {
			_ = app.removeHugoArticle(oldPublished)
		}
	} else if intent == "publish" && u.Role == roleAdmin {
		now := time.Now()
		a.Status = stPublished
		a.PublishedAt = &now
		shouldWritePublic = true
	}

	if err := app.store.SaveArticle(a); err != nil {
		http.Error(w, "保存失败: "+err.Error(), 500)
		return
	}

	if shouldWritePublic {
		if oldPublished.Slug != "" && oldPublished.Slug != a.Slug {
			_ = app.removeHugoArticle(oldPublished)
		}
		if err := app.writeHugoArticle(a); err != nil {
			http.Error(w, "写入 Hugo 文章失败: "+err.Error(), 500)
			return
		}
		if err := app.runHugo(r.Context()); err != nil {
			log.Printf("hugo build after article save error: %v", err)
			app.redirect(w, r, "/articles/"+a.ID+"/edit?msg=已保存，但公开站重建失败，请看服务器日志", http.StatusSeeOther)
			return
		}
		if intent == "publish" {
			app.redirect(w, r, "/articles/"+a.ID+"/edit?msg=已发布到公开站，首页已同步", http.StatusSeeOther)
		} else {
			app.redirect(w, r, "/articles/"+a.ID+"/edit?msg=已保存修改，并同步到公开站", http.StatusSeeOther)
		}
		return
	}

	if intent == "submit" {
		if u.Role == roleAdmin {
			app.redirect(w, r, "/articles/"+a.ID+"/edit?msg=已放入审核队列（测试用），可到审核后台发布", http.StatusSeeOther)
		} else {
			app.redirect(w, r, "/articles/"+a.ID+"/edit?msg=已提交给管理员审核，公开站暂不会更新", http.StatusSeeOther)
		}
		return
	}
	app.redirect(w, r, "/articles/"+a.ID+"/edit?msg=已保存到草稿箱，未提交审核", http.StatusSeeOther)
}

func (app *App) editorError(w http.ResponseWriter, u User, a Article, msg string) {
	app.render(w, "editor.html", map[string]any{"User": u, "Article": a, "Mode": "edit", "Error": msg, "CoverFiles": listMediaFiles(userMediaDir(u.Username), userMediaPublicPrefix(u.Username))})
}

func (app *App) submitArticle(w http.ResponseWriter, r *http.Request, id string, u User) {
	a, ok := app.store.GetArticle(id)
	if !ok {
		http.NotFound(w, r)
		return
	}
	if !canAccessArticle(u, a) {
		http.Error(w, "forbidden", 403)
		return
	}
	if a.Title == "" || a.Slug == "" || a.Body == "" {
		app.redirect(w, r, "/articles/"+id+"/edit?msg=请先补全并保存文章", http.StatusSeeOther)
		return
	}
	a.Status = stPending
	a.RejectNote = ""
	if err := app.store.SaveArticle(a); err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	app.redirect(w, r, "/?msg=已提交审核，等待管理员发布", http.StatusSeeOther)
}

func (app *App) publishArticle(w http.ResponseWriter, r *http.Request, id string, u User) {
	if u.Role != roleAdmin {
		http.Error(w, "forbidden", 403)
		return
	}
	a, ok := app.store.GetArticle(id)
	if !ok {
		http.NotFound(w, r)
		return
	}
	now := time.Now()
	a.Status = stPublished
	a.PublishedAt = &now
	a.RejectNote = ""
	if err := app.writeHugoArticle(a); err != nil {
		http.Error(w, "写入 Hugo 文章失败: "+err.Error(), 500)
		return
	}
	if err := app.store.SaveArticle(a); err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	if err := app.runHugo(r.Context()); err != nil {
		log.Printf("hugo build error: %v", err)
		app.redirect(w, r, "/admin?msg=已发布，但 Hugo 构建失败，请看服务器日志", http.StatusSeeOther)
		return
	}
	app.redirect(w, r, "/admin?msg=文章已发布", http.StatusSeeOther)
}

func (app *App) rejectArticle(w http.ResponseWriter, r *http.Request, id string, u User) {
	if u.Role != roleAdmin {
		http.Error(w, "forbidden", 403)
		return
	}
	a, ok := app.store.GetArticle(id)
	if !ok {
		http.NotFound(w, r)
		return
	}
	a.Status = stRejected
	now := time.Now()
	a.RejectedAt = &now
	_ = r.ParseForm()
	a.RejectNote = strings.TrimSpace(r.FormValue("note"))
	if err := app.store.SaveArticle(a); err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	app.redirect(w, r, "/admin?msg=已退回", http.StatusSeeOther)
}

func (app *App) handleAdmin(w http.ResponseWriter, r *http.Request) {
	u, _ := app.currentUser(r)
	app.render(w, "admin.html", map[string]any{
		"User":            u,
		"PendingArticles": app.store.ArticlesByStatus(stPending),
		"OtherArticles":   app.store.ArticlesExceptStatus(stPending),
		"Articles":        app.store.AllArticles(),
		"Users":           app.store.Users(),
		"PasswordResets":  app.store.PasswordResetRequests(),
		"Flash":           r.URL.Query().Get("msg"),
	})
}

func (app *App) handleNewUser(w http.ResponseWriter, r *http.Request) {
	u, _ := app.currentUser(r)
	if r.Method == http.MethodGet {
		app.render(w, "new_user.html", map[string]any{"User": u})
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
	err := app.store.CreateUser(r.FormValue("username"), r.FormValue("display"), r.FormValue("role"), r.FormValue("account_type"), r.FormValue("password"))
	if err != nil {
		app.render(w, "new_user.html", map[string]any{"User": u, "Error": err.Error()})
		return
	}
	if err := app.runHugo(r.Context()); err != nil {
		log.Printf("hugo build after create user error: %v", err)
		app.redirect(w, r, "/admin?msg=作者已创建，但公开站重建失败，请看日志", http.StatusSeeOther)
		return
	}
	app.redirect(w, r, "/admin?msg=作者已创建，公开站已同步", http.StatusSeeOther)
}

func (app *App) handleUploadArticle(w http.ResponseWriter, r *http.Request) {
	u, _ := app.currentUser(r)
	if r.Method == http.MethodGet {
		app.render(w, "upload.html", map[string]any{"User": u})
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", 405)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 1200*1024)
	if err := r.ParseMultipartForm(1200 * 1024); err != nil {
		app.render(w, "upload.html", map[string]any{"User": u, "Error": "上传失败：文件过大或表单格式错误"})
		return
	}
	file, header, err := r.FormFile("mdfile")
	if err != nil {
		app.render(w, "upload.html", map[string]any{"User": u, "Error": "请选择一个 .md 文件"})
		return
	}
	defer file.Close()
	if !strings.HasSuffix(strings.ToLower(header.Filename), ".md") && !strings.HasSuffix(strings.ToLower(header.Filename), ".markdown") {
		app.render(w, "upload.html", map[string]any{"User": u, "Error": "只允许上传 .md / .markdown 文件"})
		return
	}
	b, err := io.ReadAll(io.LimitReader(file, 1024*1024+1))
	if err != nil || len(b) > 1024*1024 {
		app.render(w, "upload.html", map[string]any{"User": u, "Error": "读取失败，或文件超过 1MB"})
		return
	}
	text := strings.TrimPrefix(string(b), "\ufeff")
	fm, body := parseFrontMatter(text)
	body = strings.TrimSpace(stripUnsafeHTML(body))
	if body == "" {
		app.render(w, "upload.html", map[string]any{"User": u, "Error": "Markdown 正文不能为空"})
		return
	}
	title := firstNonEmpty(r.FormValue("title"), fm["title"], firstMarkdownHeading(body), strings.TrimSuffix(header.Filename, filepath.Ext(header.Filename)))
	slug := slugify(firstNonEmpty(r.FormValue("slug"), fm["slug"], strings.TrimSuffix(header.Filename, filepath.Ext(header.Filename)), title))
	summary := firstNonEmpty(r.FormValue("summary"), fm["summary"], makeSummary(body))
	cover := cleanAssetPath(firstNonEmpty(r.FormValue("cover"), fm["cover"], fm["image"], fm["banner"]))
	coverMode := normalizeCoverMode(firstNonEmpty(r.FormValue("cover_mode"), fm["cover_mode"]))
	tags := splitTags(firstNonEmpty(r.FormValue("tags"), fm["tags"]))
	accountType := normalizeAccountType(u.Role, u.AccountType)
	if accountType != accountSystem {
		tags = filterProtectedNoticeTags(tags)
	}
	if title == "" || slug == "" {
		app.render(w, "upload.html", map[string]any{"User": u, "Error": "无法识别标题或 slug，请手动填写"})
		return
	}
	if app.store.SlugExists(slug, "") {
		slug = slug + "-" + newID()[:6]
	}
	a := Article{ID: newID(), Title: title, Slug: slug, Summary: summary, Cover: cover, CoverMode: coverMode, Tags: tags, Body: body, SourceMD: text, Author: u.Username, Status: stDraft, CreatedAt: time.Now()}
	uploadIntent := strings.TrimSpace(r.FormValue("upload_intent"))
	if uploadIntent == "" {
		// 兼容旧模板的按钮/复选框。
		if r.FormValue("publish_now") == "1" {
			uploadIntent = "publish"
		} else if r.FormValue("submit_after_upload") == "1" {
			uploadIntent = "submit"
		} else if u.Role != roleAdmin && r.FormValue("submit_after_upload") != "0" {
			uploadIntent = "submit"
		} else {
			uploadIntent = "draft"
		}
	}
	if uploadIntent != "draft" && uploadIntent != "submit" && uploadIntent != "publish" {
		uploadIntent = "draft"
	}
	if uploadIntent == "publish" && u.Role != roleAdmin {
		uploadIntent = "submit"
	}
	publishNow := uploadIntent == "publish" && u.Role == roleAdmin
	submitAfterUpload := uploadIntent == "submit"
	if publishNow {
		now := time.Now()
		a.Status = stPublished
		a.PublishedAt = &now
	} else if submitAfterUpload {
		a.Status = stPending
	}
	if err := app.store.SaveArticle(a); err != nil {
		http.Error(w, "保存失败: "+err.Error(), 500)
		return
	}
	if publishNow {
		if err := app.writeHugoArticle(a); err != nil {
			http.Error(w, "写入 Hugo 文章失败: "+err.Error(), 500)
			return
		}
		if err := app.runHugo(r.Context()); err != nil {
			log.Printf("hugo build after markdown upload error: %v", err)
			app.redirect(w, r, "/articles/"+a.ID+"/edit?msg=已上传并发布，但公开站重建失败，请看服务器日志", http.StatusSeeOther)
			return
		}
		app.redirect(w, r, "/articles/"+a.ID+"/edit?msg=Markdown 已上传并发布到公开站", http.StatusSeeOther)
		return
	}
	if submitAfterUpload {
		app.redirect(w, r, "/articles/"+a.ID+"/edit?msg=Markdown 已上传并进入审核队列", http.StatusSeeOther)
		return
	}
	app.redirect(w, r, "/articles/"+a.ID+"/edit?msg=Markdown 已上传到草稿箱，未提交审核", http.StatusSeeOther)
}

func (app *App) deleteArticle(w http.ResponseWriter, r *http.Request, id string, u User) {
	a, ok := app.store.GetArticle(id)
	if !ok {
		http.NotFound(w, r)
		return
	}
	// 作者只能删除自己的草稿/退回文章；管理员可以删除任何文章。
	if u.Role != roleAdmin {
		if a.Author != u.Username || !(a.Status == stDraft || a.Status == stRejected) {
			http.Error(w, "forbidden", 403)
			return
		}
	}
	if err := app.removeHugoArticle(a); err != nil {
		http.Error(w, "删除发布文件失败: "+err.Error(), 500)
		return
	}
	if err := app.store.DeleteArticle(id); err != nil {
		http.Error(w, "删除失败: "+err.Error(), 500)
		return
	}
	if err := app.runHugo(r.Context()); err != nil {
		log.Printf("hugo build after delete error: %v", err)
	}
	if u.Role == roleAdmin {
		app.redirect(w, r, "/admin?msg=文章已删除", http.StatusSeeOther)
		return
	}
	app.redirect(w, r, "/?msg=文章已删除", http.StatusSeeOther)
}

func (app *App) handleUserRoutes(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(strings.Trim(strings.TrimPrefix(r.URL.Path, "/users/"), "/"), "/")
	if len(parts) < 2 || r.Method != http.MethodPost {
		http.NotFound(w, r)
		return
	}
	username := cleanUsername(parts[0])
	action := parts[1]
	switch action {
	case "toggle":
		if err := app.store.ToggleUser(username); err != nil {
			app.redirect(w, r, "/admin?msg="+urlMsg(err.Error()), http.StatusSeeOther)
			return
		}
		if err := app.runHugo(r.Context()); err != nil {
			log.Printf("hugo build after toggle user error: %v", err)
			app.redirect(w, r, "/admin?msg=用户状态已更新，但公开站重建失败，请看日志", http.StatusSeeOther)
			return
		}
		app.redirect(w, r, "/admin?msg=用户状态已更新，公开站已同步", http.StatusSeeOther)
	case "reset":
		_ = r.ParseForm()
		password := r.FormValue("password")
		if err := app.store.ResetPassword(username, password); err != nil {
			app.redirect(w, r, "/admin?msg="+urlMsg(err.Error()), http.StatusSeeOther)
			return
		}
		app.redirect(w, r, "/admin?msg=密码已重置", http.StatusSeeOther)
	case "delete":
		if err := app.store.DeleteUser(username); err != nil {
			app.redirect(w, r, "/admin?msg="+urlMsg(err.Error()), http.StatusSeeOther)
			return
		}
		mediaDir := userMediaDir(username)
		if err := os.RemoveAll(mediaDir); err != nil {
			log.Printf("remove user media dir after delete user error: user=%s dir=%s err=%v", username, mediaDir, err)
			app.redirect(w, r, "/admin?msg=用户已删除，但媒体库清理失败，请看日志", http.StatusSeeOther)
			return
		}
		if err := app.runHugo(r.Context()); err != nil {
			log.Printf("hugo build after delete user error: %v", err)
			app.redirect(w, r, "/admin?msg=用户已删除，媒体库已清理，但公开站重建失败，请看日志", http.StatusSeeOther)
			return
		}
		app.redirect(w, r, "/admin?msg=用户已删除，个人媒体库已清理，公开站已同步", http.StatusSeeOther)
	default:
		http.NotFound(w, r)
	}
}

func (app *App) handlePasswordRequestRoutes(w http.ResponseWriter, r *http.Request) {
	u, _ := app.currentUser(r)
	parts := strings.Split(strings.Trim(strings.TrimPrefix(r.URL.Path, "/admin/password-requests/"), "/"), "/")
	if r.Method != http.MethodPost || len(parts) < 1 || parts[0] == "" {
		http.NotFound(w, r)
		return
	}
	id := parts[0]
	action := "approve"
	if len(parts) > 1 {
		action = parts[1]
	}
	_ = r.ParseForm()
	if action == "clear" {
		removed, err := app.store.ClearResolvedPasswordResets()
		if err != nil {
			app.redirect(w, r, "/admin?msg="+urlMsg(err.Error()), http.StatusSeeOther)
			return
		}
		app.redirect(w, r, fmt.Sprintf("/admin?msg=已清理 %d 条已处理申请", removed), http.StatusSeeOther)
		return
	}
	if err := app.store.ResolvePasswordReset(id, u.Username, action, r.FormValue("password")); err != nil {
		app.redirect(w, r, "/admin?msg="+urlMsg(err.Error()), http.StatusSeeOther)
		return
	}
	if action == "approve" {
		app.redirect(w, r, "/admin?msg=已批准密码修改；请把临时密码发给该用户", http.StatusSeeOther)
		return
	}
	app.redirect(w, r, "/admin?msg=已拒绝密码修改申请", http.StatusSeeOther)
}

func (app *App) handleCleanup(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.NotFound(w, r)
		return
	}
	_ = r.ParseForm()
	mode := r.FormValue("mode")
	if mode == "drafts" {
		removed, err := app.store.DeleteArticlesByStatus(stDraft, stRejected)
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		app.redirect(w, r, fmt.Sprintf("/admin?msg=已清理 %d 篇草稿/退回文章", removed), http.StatusSeeOther)
		return
	}
	if mode == "all" {
		if err := app.store.DeleteAllArticles(); err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		_ = os.RemoveAll(app.cfg.HugoContentDir)
		_ = os.MkdirAll(app.cfg.HugoContentDir, 0755)
		_ = app.runHugo(r.Context())
		app.redirect(w, r, "/admin?msg=已清空所有文章", http.StatusSeeOther)
		return
	}
	app.redirect(w, r, "/admin?msg=未知清理操作", http.StatusSeeOther)
}

func canAccessArticle(u User, a Article) bool { return u.Role == roleAdmin || a.Author == u.Username }

func (app *App) hugoRootDir() string {
	contentDir := filepath.Clean(app.cfg.HugoContentDir)
	// 示例：/opt/gexian-blog-mvp/content/posts -> /opt/gexian-blog-mvp
	return filepath.Dir(filepath.Dir(contentDir))
}

func (app *App) writeArticleSourceMarkdown(a Article, source string) (string, error) {
	if strings.TrimSpace(a.Slug) == "" {
		return "", nil
	}
	root := app.hugoRootDir()
	dir := filepath.Join(root, "static", "md-source")
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", err
	}
	name := slugify(a.Slug)
	if name == "" {
		name = a.ID
	}
	fileName := name + ".md"
	if err := os.WriteFile(filepath.Join(dir, fileName), []byte(source), 0644); err != nil {
		return "", err
	}
	return "/md-source/" + fileName, nil
}

func (app *App) effectiveArticleSummary(a Article) string {
	if s := strings.TrimSpace(a.Summary); s != "" {
		return s
	}
	settings, err := app.loadSiteSettings()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(settings.Manuscript.DefaultSummary)
}

func (app *App) writeHugoArticle(a Article) error {
	dir := filepath.Join(app.cfg.HugoContentDir, a.Slug)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	date := a.CreatedAt.Format(time.RFC3339)
	if a.PublishedAt != nil {
		date = a.PublishedAt.Format(time.RFC3339)
	}
	authorDisplay := a.Author
	accountType := accountFriend
	showInFriends := true
	authorBio := ""
	authorHomepage := ""
	authorAvatar := ""
	authorCover := ""
	if u, ok := app.store.GetUser(a.Author); ok {
		authorDisplay = firstNonEmpty(u.DisplayName, u.Username)
		accountType = normalizeAccountType(u.Role, u.AccountType)
		showInFriends = u.ShowInFriends || accountType == accountFriend
		authorBio = u.Bio
		authorHomepage = u.Homepage
		authorAvatar = u.Avatar
		authorCover = u.Cover
	}
	// 朋友主页从账号资料生成，不再依赖文章 taxonomy。
	_ = showInFriends
	friendsList := []string{}
	friends, _ := json.Marshal(friendsList)
	isNotice := accountType == accountSystem
	displayTags := filterProtectedNoticeTags(append([]string{}, a.Tags...))
	if isNotice {
		displayTags = appendUniqueTag(displayTags, noticeTagSlug)
	}
	tags, _ := json.Marshal(displayTags)
	coverLine := ""
	if strings.TrimSpace(a.Cover) != "" {
		coverLine = fmt.Sprintf("cover: %q\ncover_mode: %q\n", a.Cover, normalizeCoverMode(a.CoverMode))
	}
	// v20.0.8: 公开页的客户端渲染源以最新编辑正文为准，避免旧上传源文件覆盖新内容。
	sourceMD := a.Body
	if strings.TrimSpace(sourceMD) == "" {
		sourceMD = a.SourceMD
	}
	sourceURL, err := app.writeArticleSourceMarkdown(a, sourceMD)
	if err != nil {
		return err
	}
	sourceB64 := base64.StdEncoding.EncodeToString([]byte(sourceMD))
	renderBody := normalizeArticleBodyForHugo(a.Body)
	summary := app.effectiveArticleSummary(a)
	md := fmt.Sprintf("---\ntitle: %q\ndate: %q\nauthor: %q\nauthor_username: %q\nauthor_display: %q\naccount_type: %q\nis_notice: %t\nfriends: %s\ntags: %s\nsummary: %q\n%sauthor_bio: %q\nauthor_homepage: %q\nauthor_avatar: %q\nauthor_cover: %q\nsource_md_url: %q\nsource_md_b64: %q\ndraft: false\n---\n\n%s\n", a.Title, date, authorDisplay, a.Author, authorDisplay, accountType, isNotice, friends, tags, summary, coverLine, authorBio, authorHomepage, authorAvatar, authorCover, sourceURL, sourceB64, renderBody)
	return os.WriteFile(filepath.Join(dir, "index.md"), []byte(md), 0644)
}

func (app *App) removeHugoArticle(a Article) error {
	if a.Slug == "" {
		return nil
	}
	dir := filepath.Join(app.cfg.HugoContentDir, a.Slug)
	return os.RemoveAll(dir)
}

func (app *App) publicFriends() []PublicFriend {
	users := app.store.Users()
	articles := app.store.AllArticles()

	postCount := map[string]int{}
	postTitles := map[string][]string{}
	lastUpdated := map[string]time.Time{}
	for _, a := range articles {
		if a.Status != stPublished {
			continue
		}
		postCount[a.Author]++
		if len(postTitles[a.Author]) < 8 {
			postTitles[a.Author] = append(postTitles[a.Author], a.Title)
		}
		t := a.UpdatedAt
		if a.PublishedAt != nil {
			t = *a.PublishedAt
		}
		if t.After(lastUpdated[a.Author]) {
			lastUpdated[a.Author] = t
		}
	}

	friends := []PublicFriend{}
	usedSlugs := map[string]int{}
	for _, u := range users {
		if u.Disabled || u.Role == roleAdmin {
			continue
		}
		accountType := normalizeAccountType(u.Role, u.AccountType)
		if accountType == accountSystem {
			continue
		}
		name := firstNonEmpty(u.DisplayName, u.Username)
		slug := slugify(name)
		if slug == "" {
			slug = slugify(u.Username)
		}
		if slug == "" {
			continue
		}
		if n := usedSlugs[slug]; n > 0 {
			usedSlugs[slug] = n + 1
			slug = fmt.Sprintf("%s-%d", slug, n+1)
		} else {
			usedSlugs[slug] = 1
		}
		updated := ""
		if t := lastUpdated[u.Username]; !t.IsZero() {
			updated = t.Format(time.RFC3339)
		}
		titles := postTitles[u.Username]
		if titles == nil {
			titles = []string{}
		}
		friends = append(friends, PublicFriend{
			Username:    u.Username,
			DisplayName: name,
			Slug:        slug,
			URL:         "/friends/" + slug + "/",
			Bio:         strings.TrimSpace(u.Bio),
			Homepage:    strings.TrimSpace(u.Homepage),
			Avatar:      firstNonEmpty(u.Avatar, "/img/avatar-default.svg"),
			Cover:       firstNonEmpty(u.Cover, ""),
			PostCount:   postCount[u.Username],
			PostTitles:  titles,
			UpdatedAt:   updated,
		})
	}
	return friends
}

func friendMergeKey(f PublicFriend) string {
	if strings.TrimSpace(f.Username) != "" {
		return "u:" + strings.ToLower(strings.TrimSpace(f.Username))
	}
	if strings.TrimSpace(f.DisplayName) != "" {
		return "n:" + strings.ToLower(strings.TrimSpace(f.DisplayName))
	}
	if strings.TrimSpace(f.Slug) != "" {
		return "s:" + strings.ToLower(strings.TrimSpace(f.Slug))
	}
	return ""
}

func normalizePublicFriend(f PublicFriend) PublicFriend {
	f.Username = strings.TrimSpace(f.Username)
	f.DisplayName = strings.TrimSpace(f.DisplayName)
	if f.DisplayName == "" {
		f.DisplayName = f.Username
	}
	f.Slug = strings.TrimSpace(f.Slug)
	if f.Slug == "" {
		f.Slug = slugify(firstNonEmpty(f.DisplayName, f.Username))
	}
	if f.Slug == "" {
		f.Slug = "friend"
	}
	f.URL = strings.TrimSpace(f.URL)
	if f.URL == "" {
		f.URL = "/friends/" + f.Slug + "/"
	}
	f.Bio = strings.TrimSpace(f.Bio)
	f.Homepage = strings.TrimSpace(f.Homepage)
	f.Avatar = firstNonEmpty(strings.TrimSpace(f.Avatar), "/img/avatar-default.svg")
	f.Cover = strings.TrimSpace(f.Cover)
	f.UpdatedAt = strings.TrimSpace(f.UpdatedAt)
	if f.PostTitles == nil {
		f.PostTitles = []string{}
	}
	return f
}

func mergePublicFriends(existing []PublicFriend, generated []PublicFriend) []PublicFriend {
	merged := map[string]PublicFriend{}
	order := []string{}
	put := func(f PublicFriend, preferNew bool) {
		f = normalizePublicFriend(f)
		key := friendMergeKey(f)
		if key == "" {
			return
		}
		old, ok := merged[key]
		if !ok {
			merged[key] = f
			order = append(order, key)
			return
		}
		if preferNew {
			// v20.2.3：账号资料负责更新朋友公开页资料，头像/横幅以用户资料为准。
			if strings.TrimSpace(f.Username) != "" {
				old.Username = f.Username
			}
			if strings.TrimSpace(f.DisplayName) != "" {
				old.DisplayName = f.DisplayName
			}
			if strings.TrimSpace(f.Slug) != "" {
				old.Slug = f.Slug
			}
			if strings.TrimSpace(f.URL) != "" {
				old.URL = f.URL
			}
			if strings.TrimSpace(f.Bio) != "" {
				old.Bio = f.Bio
			}
			if strings.TrimSpace(f.Homepage) != "" {
				old.Homepage = f.Homepage
			}
			if strings.TrimSpace(f.Avatar) != "" {
				old.Avatar = f.Avatar
			}
			if strings.TrimSpace(f.Cover) != "" {
				old.Cover = f.Cover
			}
			old.PostCount = f.PostCount
			old.PostTitles = f.PostTitles
			old.UpdatedAt = f.UpdatedAt
		} else {
			if strings.TrimSpace(old.Username) == "" {
				old.Username = f.Username
			}
			if strings.TrimSpace(old.DisplayName) == "" {
				old.DisplayName = f.DisplayName
			}
			if strings.TrimSpace(old.Bio) == "" {
				old.Bio = f.Bio
			}
			if strings.TrimSpace(old.Homepage) == "" {
				old.Homepage = f.Homepage
			}
			if strings.TrimSpace(old.Avatar) == "" {
				old.Avatar = f.Avatar
			}
			if strings.TrimSpace(old.Cover) == "" {
				old.Cover = f.Cover
			}
		}
		merged[key] = normalizePublicFriend(old)
	}
	for _, f := range existing {
		put(f, false)
	}
	for _, f := range generated {
		put(f, true)
	}

	usedSlugs := map[string]int{}
	out := []PublicFriend{}
	for _, key := range order {
		f := normalizePublicFriend(merged[key])
		base := slugify(firstNonEmpty(f.Slug, f.DisplayName, f.Username))
		if base == "" {
			base = "friend"
		}
		if n := usedSlugs[base]; n > 0 {
			usedSlugs[base] = n + 1
			f.Slug = fmt.Sprintf("%s-%d", base, n+1)
		} else {
			usedSlugs[base] = 1
			f.Slug = base
		}
		f.URL = "/friends/" + f.Slug + "/"
		out = append(out, f)
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].PostCount != out[j].PostCount {
			return out[i].PostCount > out[j].PostCount
		}
		return strings.ToLower(out[i].DisplayName) < strings.ToLower(out[j].DisplayName)
	})
	return out
}

func sameProfileFriendKey(a, b string) bool {
	return slugify(a) != "" && slugify(a) == slugify(b)
}

func (app *App) syncUserProfileToFriendsJSON(oldUser, newUser User) error {
	accountType := normalizeAccountType(newUser.Role, newUser.AccountType)
	if accountType == accountSystem || newUser.Disabled || newUser.Role == roleAdmin {
		return nil
	}

	dataPath := filepath.Join(app.cfg.DataDir, "friends.json")
	if err := os.MkdirAll(filepath.Dir(dataPath), 0755); err != nil {
		return err
	}

	existing := []PublicFriend{}
	if oldData, err := os.ReadFile(dataPath); err == nil && len(oldData) > 0 {
		_ = json.Unmarshal(oldData, &existing)
	}

	name := firstNonEmpty(newUser.DisplayName, newUser.Username)
	slug := slugify(name)
	if slug == "" {
		slug = slugify(newUser.Username)
	}
	if slug == "" {
		slug = "friend"
	}

	postCount := 0
	postTitles := []string{}
	updated := ""
	for _, a := range app.store.AllArticles() {
		if a.Status != stPublished || a.Author != newUser.Username {
			continue
		}
		postCount++
		if len(postTitles) < 8 && strings.TrimSpace(a.Title) != "" {
			postTitles = append(postTitles, a.Title)
		}
		t := a.UpdatedAt
		if a.PublishedAt != nil {
			t = *a.PublishedAt
		}
		if !t.IsZero() && t.Format(time.RFC3339) > updated {
			updated = t.Format(time.RFC3339)
		}
	}

	next := PublicFriend{
		Username:    strings.TrimSpace(newUser.Username),
		DisplayName: name,
		Slug:        slug,
		URL:         "/friends/" + slug + "/",
		Bio:         strings.TrimSpace(newUser.Bio),
		Homepage:    strings.TrimSpace(newUser.Homepage),
		Avatar:      firstNonEmpty(strings.TrimSpace(newUser.Avatar), "/img/avatar-default.svg"),
		Cover:       strings.TrimSpace(newUser.Cover),
		PostCount:   postCount,
		PostTitles:  postTitles,
		UpdatedAt:   updated,
	}

	oldName := firstNonEmpty(oldUser.DisplayName, oldUser.Username)
	oldSlug := slugify(oldName)
	if oldSlug == "" {
		oldSlug = slugify(oldUser.Username)
	}

	found := -1
	for i, f := range existing {
		if strings.TrimSpace(f.Username) != "" && strings.EqualFold(strings.TrimSpace(f.Username), newUser.Username) {
			found = i
			break
		}
		if strings.TrimSpace(f.URL) != "" && (strings.TrimSpace(f.URL) == "/friends/"+oldSlug+"/" || strings.TrimSpace(f.URL) == "/friends/"+slug+"/") {
			found = i
			break
		}
		if sameProfileFriendKey(f.Slug, oldSlug) || sameProfileFriendKey(f.Slug, slug) || sameProfileFriendKey(f.DisplayName, oldName) || sameProfileFriendKey(f.DisplayName, name) {
			found = i
			break
		}
	}

	if found >= 0 {
		// 账号资料是公开朋友页资料的权威来源；文章数保留实时统计。
		existing[found].Username = next.Username
		existing[found].DisplayName = next.DisplayName
		existing[found].Slug = next.Slug
		existing[found].URL = next.URL
		existing[found].Bio = next.Bio
		existing[found].Homepage = next.Homepage
		existing[found].Avatar = next.Avatar
		existing[found].Cover = next.Cover
		existing[found].PostCount = next.PostCount
		existing[found].PostTitles = next.PostTitles
		existing[found].UpdatedAt = next.UpdatedAt
	} else {
		existing = append(existing, next)
	}

	b, err := json.MarshalIndent(existing, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(dataPath, b, 0644)
}

func (app *App) syncPublicFriends() error {
	generatedFriends := app.publicFriends()

	dataPath := filepath.Join(app.cfg.DataDir, "friends.json")
	existingFriends := []PublicFriend{}
	if oldData, err := os.ReadFile(dataPath); err == nil && len(oldData) > 0 {
		_ = json.Unmarshal(oldData, &existingFriends)
	}
	friends := mergePublicFriends(existingFriends, generatedFriends)

	b, err := json.MarshalIndent(friends, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(dataPath, b, 0644); err != nil {
		return err
	}

	base := filepath.Clean(app.cfg.HugoContentDir)
	contentRoot := filepath.Dir(base)
	friendsRoot := filepath.Join(contentRoot, "friends")
	if err := os.MkdirAll(friendsRoot, 0755); err != nil {
		return err
	}

	settings, _ := app.loadSiteSettings()
	listCover := firstNonEmpty(settings.Pages.FriendsHeroImage, "/img/hero-friends.svg")
	defaultFriendCover := firstNonEmpty(settings.Pages.FriendDefaultCover, settings.Pages.FriendsHeroImage, "/img/hero-friends.svg")
	indexMD := fmt.Sprintf("---\ntitle: %q\nlayout: %q\ngenerated_by: %q\ndraft: false\n---\n\n", "朋友", "friends-list", "songline-friends-sync")
	if err := os.WriteFile(filepath.Join(friendsRoot, "_index.md"), []byte(indexMD), 0644); err != nil {
		return err
	}
	_ = listCover

	// 清理旧的自动生成朋友页，避免改名后残留旧 URL。
	old, _ := filepath.Glob(filepath.Join(friendsRoot, "*", "index.md"))
	for _, fp := range old {
		data, err := os.ReadFile(fp)
		if err == nil && strings.Contains(string(data), "generated_by: songline-friends-sync") {
			_ = os.RemoveAll(filepath.Dir(fp))
		}
	}

	for _, f := range friends {
		dir := filepath.Join(friendsRoot, f.Slug)
		if err := os.MkdirAll(dir, 0755); err != nil {
			return err
		}
		title := f.DisplayName
		bio := f.Bio
		cover := f.Cover
		if cover == "" {
			cover = defaultFriendCover
		}
		md := fmt.Sprintf("---\ntitle: %q\nlayout: %q\ngenerated_by: %q\nfriend_username: %q\nfriend_display_name: %q\nfriend_bio: %q\nfriend_homepage: %q\nfriend_avatar: %q\nfriend_cover: %q\nfriend_post_count: %d\ndraft: false\n---\n\n", title, "friend-profile", "songline-friends-sync", f.Username, f.DisplayName, bio, f.Homepage, f.Avatar, cover, f.PostCount)
		if err := os.WriteFile(filepath.Join(dir, "index.md"), []byte(md), 0644); err != nil {
			return err
		}
	}
	return nil
}

func (app *App) syncPublishedArticles() error {
	for _, a := range app.store.AllArticles() {
		if a.Status != stPublished {
			continue
		}
		if strings.TrimSpace(a.Slug) == "" {
			continue
		}
		if err := app.writeHugoArticle(a); err != nil {
			return err
		}
	}
	return nil
}

func (app *App) ensureBuiltinContentPages() error {
	base := filepath.Clean(app.cfg.HugoContentDir)
	contentRoot := filepath.Dir(base)

	toolsRoot := filepath.Join(contentRoot, "tools")
	if err := os.MkdirAll(filepath.Join(toolsRoot, "markdown-previewer"), 0755); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Join(toolsRoot, "random-number"), 0755); err != nil {
		return err
	}
	toolsIndex := "---\ntitle: \"工具\"\nlayout: \"tools\"\ngenerated_by: \"songline-tools-fallback\"\ndraft: false\n---\n\n"
	if err := os.WriteFile(filepath.Join(toolsRoot, "_index.md"), []byte(toolsIndex), 0644); err != nil {
		return err
	}
	mdIndex := "---\ntitle: \"Markdown 预览器\"\nlayout: \"markdown-previewer\"\ngenerated_by: \"songline-tools-fallback\"\ndraft: false\n---\n\n"
	if err := os.WriteFile(filepath.Join(toolsRoot, "markdown-previewer", "_index.md"), []byte(mdIndex), 0644); err != nil {
		return err
	}
	randomIndex := "---\ntitle: \"随机数生成器\"\nlayout: \"random-number\"\ngenerated_by: \"songline-tools-fallback\"\ndraft: false\n---\n\n"
	if err := os.WriteFile(filepath.Join(toolsRoot, "random-number", "_index.md"), []byte(randomIndex), 0644); err != nil {
		return err
	}

	noticeRoot := filepath.Join(contentRoot, "tags", "site-notice")
	if err := os.MkdirAll(noticeRoot, 0755); err != nil {
		return err
	}
	noticeIndex := "---\ntitle: \"站点公告\"\nlayout: \"site-notice\"\ngenerated_by: \"songline-notice-fallback\"\ndraft: false\n---\n\n"
	if _, err := os.Stat(filepath.Join(noticeRoot, "_index.md")); errors.Is(err, os.ErrNotExist) {
		if err := os.WriteFile(filepath.Join(noticeRoot, "_index.md"), []byte(noticeIndex), 0644); err != nil {
			return err
		}
	}
	return nil
}

func (app *App) runHugo(ctx context.Context) error {
	app.buildMu.Lock()
	defer app.buildMu.Unlock()

	if err := app.ensureSiteDefaults(); err != nil {
		return err
	}
	if err := app.ensureThemeDefaults(); err != nil {
		return err
	}
	if err := app.syncPublishedArticles(); err != nil {
		return err
	}
	// 朋友页改为以 data/friends.json 为唯一长期数据源。
	// 这里不再由后台根据 users.json 自动重写 friends.json，避免发布文章或重建时把星图朋友数据缩成 1 人。
	// 公开朋友数据会在构建前同步到静态资源目录。
	if err := app.ensureBuiltinContentPages(); err != nil {
		return err
	}
	if err := app.writeRuntimeConfig(); err != nil {
		return err
	}
	if strings.TrimSpace(app.cfg.HugoCommand) == "" {
		return nil
	}
	cctx, cancel := context.WithTimeout(ctx, app.cfg.HugoBuildTimeout)
	defer cancel()
	parts := strings.Fields(app.cfg.HugoCommand)
	if app.cfg.PublicSiteURL != "" && strings.EqualFold(filepath.Base(parts[0]), "hugo") {
		parts = append(parts, "--baseURL", app.cfg.PublicSiteURL)
	}
	cmd := exec.CommandContext(cctx, parts[0], parts[1:]...)
	cmd.Dir = "."
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("%v\n%s", err, string(out))
	}
	return nil
}

func (app *App) writeRuntimeConfig() error {
	if err := os.MkdirAll("static", 0755); err != nil {
		return err
	}
	payload, err := json.Marshal(struct {
		PublicAPIURL string `json:"publicApiUrl"`
	}{PublicAPIURL: app.cfg.PublicAPIURL})
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join("static", "runtime-config.js"), append([]byte("window.BlogRuntimeConfig = Object.freeze("), append(payload, []byte(");\n")...)...), 0644)
}

func (app *App) siteSettingsPath() string {
	return filepath.Join(app.cfg.DataDir, "site.json")
}

func normalizeContactHref(raw string, defaultScheme string) string {
	v := strings.TrimSpace(raw)
	v = strings.ReplaceAll(v, "：", ":")
	if v == "" {
		return ""
	}
	lower := strings.ToLower(v)
	if strings.HasPrefix(lower, "mailto:") {
		addr := strings.TrimSpace(v[len("mailto:"):])
		if addr == "" {
			return ""
		}
		return "mailto:" + addr
	}
	if strings.HasPrefix(lower, "http://") || strings.HasPrefix(lower, "https://") || strings.HasPrefix(lower, "tel:") {
		return v
	}
	if defaultScheme == "mailto" {
		return "mailto:" + v
	}
	return v
}

func defaultOrbitSettings() OrbitSettings {
	return OrbitSettings{
		Title:   "星际入口",
		Posts:   OrbitEntry{Label: "文章", Kicker: "Archive", Title: "文章", Description: "浏览所有文章，按时间回看学习、项目和创作记录。", Href: "/posts/", LinkText: "进入文章"},
		Tags:    OrbitEntry{Label: "标签", Kicker: "Tags", Title: "标签", Description: "按标签寻找主题，把零散内容重新归档成线索。", Href: "/tags/", LinkText: "查看标签"},
		Friends: OrbitEntry{Label: "朋友", Kicker: "Friends", Title: "朋友", Description: "查看朋友们的主页与文字，进入这个小小的创作星图。", Href: "/friends/", LinkText: "查看朋友"},
		Tools:   OrbitEntry{Label: "工具", Kicker: "Tools", Title: "工具", Description: "打开站内小工具和实验页面，放一些顺手好用的东西。", Href: "/tools/", LinkText: "进入工具"},
		Notice:  OrbitEntry{Label: "公告", Kicker: "Notice", Title: "公告", Description: "查看站点更新、投稿说明和一些需要被看见的小通知。", Href: "#site-notice", LinkText: "查看公告"},
		About:   OrbitEntry{Label: "关于本站", Kicker: "About", Title: "关于本站", Description: "查看站点说明，了解这个小空间被放在这里的原因。", Href: "#site-intro", LinkText: "查看关于"},
	}
}

func fillOrbitEntry(v *OrbitEntry, d OrbitEntry) {
	if strings.TrimSpace(v.Label) == "" {
		v.Label = d.Label
	}
	if strings.TrimSpace(v.Kicker) == "" {
		v.Kicker = d.Kicker
	}
	if strings.TrimSpace(v.Title) == "" {
		v.Title = d.Title
	}
	if strings.TrimSpace(v.Description) == "" {
		v.Description = d.Description
	}
	if strings.TrimSpace(v.Href) == "" {
		v.Href = d.Href
	}
	if strings.TrimSpace(v.LinkText) == "" {
		v.LinkText = d.LinkText
	}
}

func cleanOrbitHref(raw string, fallback string) string {
	v := strings.TrimSpace(raw)
	if v == "" {
		return fallback
	}
	if strings.HasPrefix(v, "#") || strings.HasPrefix(v, "/") || strings.HasPrefix(v, "http://") || strings.HasPrefix(v, "https://") {
		return v
	}
	return fallback
}

func defaultSiteSettings() SiteSettings {
	return SiteSettings{
		Site: SiteBasic{Title: "Songline Blog", DisplayName: "Blog", FooterText: "由热爱驱动，持续记录", ICP: "暂无", Logo: "Songline Blog", LogoIcon: "/img/avatar-default.svg", Favicon: "/img/avatar-default.svg", EnableDarkToggle: true},
		Home: HomeSettings{HeroTitle: "欢迎来到 Blog", HeroSubtitle: "记录学习、创作与生活的每一段足迹，在文字中连接思想，在分享中共同成长。", HeroImage: "/img/hero-home.svg", IntroTitle: "这个站是什么？", IntroBody: "Blog 是一个个人博客，专注于分享我在技术、创作、项目与生活中的所思所学。\n这里没有噱头与套路，只有真诚的记录与持续的输出。\n希望它能成为我的数字花园，也能为你带来一些启发与帮助。", FoundedAt: "2026/5/8", RecommendedCount: 6},
		Pages: PageSettings{
			PostsHeroTitle: "文章", PostsHeroSubtitle: "记录思考，分享见解，探索技术与生活的更多可能。", PostsHeroImage: "/img/hero-posts.svg",
			TagsHeroTitle: "标签", TagsHeroSubtitle: "按主题浏览，发现感兴趣的内容。", TagsHeroImage: "/img/hero-tags.svg",
			FriendsHeroTitle: "朋友", FriendsHeroSubtitle: "在这里，遇见一群热爱写作与分享的朋友。\n他们用文字记录生活，也温暖着彼此。", FriendsHeroImage: "/img/hero-friends.svg",
			ArticleDefaultCover: "/img/hero-article.svg", TagDefaultCover: "/img/hero-tech.svg", FriendDefaultCover: "/img/hero-friends.svg", ToolsHeroTitle: "工具", ToolsHeroSubtitle: "一些轻量小工具。",
		},
		Boot:       BootSettings{WelcomeText: "欢迎回来"},
		Orbit:      defaultOrbitSettings(),
		Manuscript: ManuscriptSettings{DefaultSummary: "这篇文章暂时还没有填写简介，先点进去看看正文吧。"},
		Background: BackgroundSettings{Image: "", Height: "420px", Blur: "18px", Opacity: "0.38"},
		AboutCard:  AboutCard{Title: "关于本站", AvatarText: "B", Name: "Blog", Body: "这是一个记录学习、创作与生活的个人博客。\n在这里，分享思考，沉淀成长，遇见更好的自己。"},
		Social:     SocialSettings{GitHub: "https://github.com/", Email: "mailto:hello@example.com", Bilibili: "https://space.bilibili.com/", ShowGitHub: true, ShowEmail: true, ShowBilibili: true, BilibiliIcon: "/img/bilibili.svg"},
		ContentAreas: []ContentArea{
			{Title: "技术笔记", Description: "记录开发过程中的知识、踩坑与解决方案。", Icon: "code", Link: "/tags/技术笔记/"},
			{Title: "创作记录", Description: "设计、写作、摄影等创作过程与灵感。", Icon: "pen", Link: "/tags/创作记录/"},
			{Title: "项目日志", Description: "独立项目的构思、开发与复盘总结。", Icon: "folder", Link: "/tags/项目日志/"},
			{Title: "生活随笔", Description: "关于阅读、思考与日常生活的片段。", Icon: "cup", Link: "/tags/生活随笔/"},
		},
	}
}

func (app *App) loadSiteSettings() (SiteSettings, error) {
	s := defaultSiteSettings()
	b, err := os.ReadFile(app.siteSettingsPath())
	if errors.Is(err, os.ErrNotExist) {
		return s, nil
	}
	if err != nil {
		return s, err
	}
	if len(strings.TrimSpace(string(b))) == 0 {
		return s, nil
	}
	if err := json.Unmarshal(b, &s); err != nil {
		return s, err
	}
	defaults := defaultSiteSettings()
	if len(s.ContentAreas) == 0 {
		s.ContentAreas = defaults.ContentAreas
	}
	if s.Pages.PostsHeroTitle == "" {
		s.Pages.PostsHeroTitle = defaults.Pages.PostsHeroTitle
	}
	if s.Pages.PostsHeroSubtitle == "" {
		s.Pages.PostsHeroSubtitle = defaults.Pages.PostsHeroSubtitle
	}
	if s.Pages.TagsHeroTitle == "" {
		s.Pages.TagsHeroTitle = defaults.Pages.TagsHeroTitle
	}
	if s.Pages.TagsHeroSubtitle == "" {
		s.Pages.TagsHeroSubtitle = defaults.Pages.TagsHeroSubtitle
	}
	if s.Pages.FriendsHeroTitle == "" {
		s.Pages.FriendsHeroTitle = defaults.Pages.FriendsHeroTitle
	}
	if s.Pages.FriendsHeroSubtitle == "" {
		s.Pages.FriendsHeroSubtitle = defaults.Pages.FriendsHeroSubtitle
	}
	if s.Home.FoundedAt == "" {
		s.Home.FoundedAt = defaults.Home.FoundedAt
	}
	if s.Home.RecommendedCount <= 0 {
		s.Home.RecommendedCount = defaults.Home.RecommendedCount
	}
	if s.Pages.ToolsHeroTitle == "" {
		s.Pages.ToolsHeroTitle = defaults.Pages.ToolsHeroTitle
	}
	if s.Pages.ToolsHeroSubtitle == "" {
		s.Pages.ToolsHeroSubtitle = defaults.Pages.ToolsHeroSubtitle
	}
	if strings.TrimSpace(s.Boot.WelcomeText) == "" {
		s.Boot.WelcomeText = defaults.Boot.WelcomeText
	}
	if strings.TrimSpace(s.Orbit.Title) == "" {
		s.Orbit.Title = defaults.Orbit.Title
	}
	fillOrbitEntry(&s.Orbit.Posts, defaults.Orbit.Posts)
	fillOrbitEntry(&s.Orbit.Tags, defaults.Orbit.Tags)
	fillOrbitEntry(&s.Orbit.Friends, defaults.Orbit.Friends)
	fillOrbitEntry(&s.Orbit.Tools, defaults.Orbit.Tools)
	fillOrbitEntry(&s.Orbit.Notice, defaults.Orbit.Notice)
	fillOrbitEntry(&s.Orbit.About, defaults.Orbit.About)
	if s.Manuscript.DefaultSummary == "" {
		s.Manuscript.DefaultSummary = defaults.Manuscript.DefaultSummary
	}
	if s.Background.Height == "" {
		s.Background.Height = defaults.Background.Height
	}
	if s.Background.Blur == "" {
		s.Background.Blur = defaults.Background.Blur
	}
	if s.Background.Opacity == "" {
		s.Background.Opacity = defaults.Background.Opacity
	}
	return s, nil
}

func (app *App) saveSiteSettings(s SiteSettings) error {
	if err := os.MkdirAll(app.cfg.DataDir, 0700); err != nil {
		return err
	}
	b, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}
	tmp := app.siteSettingsPath() + ".tmp"
	if err := os.WriteFile(tmp, b, 0600); err != nil {
		return err
	}
	return os.Rename(tmp, app.siteSettingsPath())
}

func (app *App) ensureSiteDefaults() error {
	if _, err := os.Stat(app.siteSettingsPath()); errors.Is(err, os.ErrNotExist) {
		return app.saveSiteSettings(defaultSiteSettings())
	}
	return nil
}

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

func safeIntRange(raw string, min int, max int, fallback int) int {
	v := strings.TrimSpace(raw)
	if v == "" {
		return fallback
	}
	var n int
	if _, err := fmt.Sscanf(v, "%d", &n); err != nil {
		return fallback
	}
	if n < min {
		return min
	}
	if n > max {
		return max
	}
	return n
}

func cleanPublicPath(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	if strings.HasPrefix(s, "http://") || strings.HasPrefix(s, "https://") || strings.HasPrefix(s, "/") {
		return s
	}
	return "/" + s
}

func safeUploadName(name string) string {
	name = filepath.Base(strings.TrimSpace(name))
	name = strings.ReplaceAll(name, " ", "-")
	name = strings.ReplaceAll(name, "：", "-")
	ext := strings.ToLower(filepath.Ext(name))
	base := strings.TrimSuffix(name, filepath.Ext(name))
	re := regexp.MustCompile(`[^a-zA-Z0-9_-]+`)
	base = re.ReplaceAllString(base, "-")
	base = strings.Trim(base, "-")
	if base == "" {
		return ""
	}
	return fmt.Sprintf("%s%s", base, ext)
}

func uniqueUploadName(dir, name string) string {
	ext := strings.ToLower(filepath.Ext(name))
	base := strings.TrimSuffix(name, filepath.Ext(name))
	candidate := name
	if _, err := os.Stat(filepath.Join(dir, candidate)); errors.Is(err, os.ErrNotExist) {
		return candidate
	}
	stamp := time.Now().Format("20060102150405")
	candidate = fmt.Sprintf("%s-%s%s", base, stamp, ext)
	if _, err := os.Stat(filepath.Join(dir, candidate)); errors.Is(err, os.ErrNotExist) {
		return candidate
	}
	for i := 2; i < 1000; i++ {
		candidate = fmt.Sprintf("%s-%s-%d%s", base, stamp, i, ext)
		if _, err := os.Stat(filepath.Join(dir, candidate)); errors.Is(err, os.ErrNotExist) {
			return candidate
		}
	}
	return fmt.Sprintf("%s-%s-%d%s", base, stamp, time.Now().UnixNano(), ext)
}

func mediaOwner(username string) string {
	u := cleanUsername(username)
	if u == "" {
		return "unknown"
	}
	return u
}

func mediaRootDir() string {
	return filepath.Join("static", "uploads")
}

func userMediaDir(username string) string {
	return filepath.Join(mediaRootDir(), mediaOwner(username))
}

func userMediaPublicPrefix(username string) string {
	return "/uploads/" + mediaOwner(username) + "/"
}

func userMediaPublicPath(username, name string) string {
	return userMediaPublicPrefix(username) + name
}

func isMediaPathOwnedBy(username, publicPath string) (string, error) {
	v := strings.TrimSpace(publicPath)
	prefix := userMediaPublicPrefix(username)
	if !strings.HasPrefix(v, prefix) {
		return "", fmt.Errorf("not owned")
	}
	name := strings.TrimPrefix(v, prefix)
	if name == "" || strings.Contains(name, "/") || strings.Contains(name, "\\") || strings.Contains(name, "..") {
		return "", fmt.Errorf("invalid media name")
	}
	return name, nil
}

func (app *App) handleMediaLibrary(w http.ResponseWriter, r *http.Request) {
	u, _ := app.currentUser(r)
	owner := mediaOwner(u.Username)
	dir := userMediaDir(owner)
	if err := os.MkdirAll(dir, 0755); err != nil {
		http.Error(w, err.Error(), 500)
		return
	}

	renderMedia := func(extra map[string]any) {
		data := map[string]any{
			"User":  u,
			"Owner": owner,
			"Files": listMediaFiles(dir, userMediaPublicPrefix(owner)),
			"Flash": r.URL.Query().Get("msg"),
		}
		for k, v := range extra {
			data[k] = v
		}
		app.render(w, "media.html", data)
	}

	if r.Method == http.MethodPost {
		action := strings.TrimSpace(r.FormValue("action"))
		if action == "rename" {
			oldPath := strings.TrimSpace(r.FormValue("old_path"))
			newRaw := strings.TrimSpace(r.FormValue("new_name"))
			oldName, err := isMediaPathOwnedBy(owner, oldPath)
			if err != nil {
				renderMedia(map[string]any{"Error": "重命名失败：只能重命名你自己媒体库里的文件"})
				return
			}
			newName := safeUploadName(newRaw)
			if newName == "" {
				renderMedia(map[string]any{"Error": "重命名失败：新文件名不能为空"})
				return
			}
			oldExt := strings.ToLower(filepath.Ext(oldName))
			newExt := strings.ToLower(filepath.Ext(newName))
			allowed := map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".webp": true, ".svg": true, ".gif": true, ".ico": true, ".pdf": true, ".zip": true, ".mp3": true, ".wav": true, ".txt": true, ".md": true, ".markdown": true}
			if !allowed[newExt] {
				renderMedia(map[string]any{"Error": "重命名失败：只允许图片、pdf、zip、mp3、wav、txt、md"})
				return
			}
			if oldExt != "" && newExt != oldExt {
				renderMedia(map[string]any{"Error": "重命名失败：为了避免引用失效，请保持原扩展名 " + oldExt})
				return
			}
			oldFile := filepath.Join(dir, oldName)
			newFile := filepath.Join(dir, newName)
			if oldFile == newFile {
				app.redirect(w, r, "/admin/media?msg="+url.QueryEscape("文件名没有变化："+userMediaPublicPath(owner, oldName)), http.StatusSeeOther)
				return
			}
			if _, err := os.Stat(newFile); err == nil {
				renderMedia(map[string]any{"Error": "重命名失败：新文件名已存在"})
				return
			}
			if err := os.Rename(oldFile, newFile); err != nil {
				renderMedia(map[string]any{"Error": "重命名失败：" + err.Error()})
				return
			}
			if err := app.runHugo(r.Context()); err != nil {
				log.Printf("hugo build after media rename error: %v", err)
			}
			app.redirect(w, r, "/admin/media?msg="+url.QueryEscape("已重命名为："+userMediaPublicPath(owner, newName)), http.StatusSeeOther)
			return
		}

		if action == "delete" {
			oldPath := strings.TrimSpace(r.FormValue("old_path"))
			oldName, err := isMediaPathOwnedBy(owner, oldPath)
			if err != nil {
				renderMedia(map[string]any{"Error": "删除失败：只能删除你自己媒体库里的文件"})
				return
			}
			if err := os.Remove(filepath.Join(dir, oldName)); err != nil {
				renderMedia(map[string]any{"Error": "删除失败：" + err.Error()})
				return
			}
			if err := app.runHugo(r.Context()); err != nil {
				log.Printf("hugo build after media delete error: %v", err)
			}
			app.redirect(w, r, "/admin/media?msg="+url.QueryEscape("已删除："+userMediaPublicPath(owner, oldName)), http.StatusSeeOther)
			return
		}

		r.Body = http.MaxBytesReader(w, r.Body, app.cfg.MaxUploadBytes)
		if err := r.ParseMultipartForm(app.cfg.MaxUploadBytes); err != nil {
			renderMedia(map[string]any{"Error": "上传失败：文件过大或表单格式错误"})
			return
		}
		file, header, err := r.FormFile("media")
		if err != nil {
			renderMedia(map[string]any{"Error": "请选择文件"})
			return
		}
		defer file.Close()
		ext := strings.ToLower(filepath.Ext(header.Filename))
		allowed := map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".webp": true, ".svg": true, ".gif": true, ".ico": true, ".pdf": true, ".zip": true, ".mp3": true, ".wav": true, ".txt": true, ".md": true, ".markdown": true}
		if !allowed[ext] {
			renderMedia(map[string]any{"Error": "只允许上传图片、pdf、zip、mp3、wav、txt、md"})
			return
		}
		customName := strings.TrimSpace(r.FormValue("filename"))
		name := safeUploadName(customName)
		if name == "" {
			name = uniqueUploadName(dir, safeUploadName(header.Filename))
		}
		if filepath.Ext(name) == "" {
			name += ext
		}
		if strings.ToLower(filepath.Ext(name)) != ext {
			renderMedia(map[string]any{"Error": "上传失败：自定义文件名扩展名需要和原文件一致"})
			return
		}
		dst := filepath.Join(dir, name)
		out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_EXCL, 0644)
		if err != nil {
			if errors.Is(err, os.ErrExist) {
				renderMedia(map[string]any{"Error": "上传失败：同名文件已存在，请换一个文件名"})
				return
			}
			http.Error(w, err.Error(), 500)
			return
		}
		defer out.Close()
		if _, err := io.Copy(out, file); err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		if err := app.runHugo(r.Context()); err != nil {
			log.Printf("hugo build after media upload error: %v", err)
		}
		app.redirect(w, r, "/admin/media?msg=已上传："+url.QueryEscape(userMediaPublicPath(owner, name)), http.StatusSeeOther)
		return
	}
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", 405)
		return
	}
	renderMedia(nil)
}

type MediaFile struct {
	Path string
	Name string
	Ext  string
}

func listMediaFiles(dir string, publicPrefix string) []MediaFile {
	entries, _ := os.ReadDir(dir)
	out := []MediaFile{}
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		out = append(out, MediaFile{Path: publicPrefix + name, Name: name, Ext: strings.TrimPrefix(strings.ToLower(filepath.Ext(name)), ".")})
	}
	sort.Slice(out, func(i, j int) bool { return strings.ToLower(out[i].Name) < strings.ToLower(out[j].Name) })
	return out
}

func mediaNameFromPublicPath(p string) (string, error) {
	v := strings.TrimSpace(p)
	if !strings.HasPrefix(v, "/uploads/") {
		return "", fmt.Errorf("invalid media path")
	}
	rest := strings.TrimPrefix(v, "/uploads/")
	if rest == "" || strings.Contains(rest, "\\") || strings.Contains(rest, "..") {
		return "", fmt.Errorf("invalid media name")
	}
	return rest, nil
}

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

func (app *App) requireLogin(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if _, ok := app.currentUser(r); !ok {
			app.redirect(w, r, "/login", http.StatusSeeOther)
			return
		}
		next(w, r)
	}
}
func (app *App) requireAdmin(next http.HandlerFunc) http.HandlerFunc {
	return app.requireLogin(func(w http.ResponseWriter, r *http.Request) {
		u, _ := app.currentUser(r)
		if u.Role != roleAdmin {
			http.Error(w, "forbidden", 403)
			return
		}
		next(w, r)
	})
}

func (app *App) currentUser(r *http.Request) (User, bool) {
	c, err := r.Cookie("session")
	if err != nil {
		return User{}, false
	}
	username, ok := app.verifySession(c.Value)
	if !ok {
		return User{}, false
	}
	u, ok := app.store.GetUser(username)
	if !ok || u.Disabled {
		return User{}, false
	}
	return u, true
}

func (app *App) setSession(w http.ResponseWriter, username string, remember bool) {
	duration := 12 * time.Hour
	maxAge := 0
	if remember {
		duration = 30 * 24 * time.Hour
		maxAge = 30 * 24 * 3600
	}
	exp := time.Now().Add(duration).Unix()
	payload := fmt.Sprintf("%s:%d", username, exp)
	raw := payload + ":" + app.sign(payload)
	http.SetCookie(w, &http.Cookie{Name: "session", Value: base64.RawURLEncoding.EncodeToString([]byte(raw)), Path: "/", MaxAge: maxAge, HttpOnly: true, SameSite: http.SameSiteLaxMode})
}
func (app *App) verifySession(v string) (string, bool) {
	b, err := base64.RawURLEncoding.DecodeString(v)
	if err != nil {
		return "", false
	}
	parts := strings.Split(string(b), ":")
	if len(parts) != 3 {
		return "", false
	}
	payload := parts[0] + ":" + parts[1]
	if subtle.ConstantTimeCompare([]byte(app.sign(payload)), []byte(parts[2])) != 1 {
		return "", false
	}
	var exp int64
	_, _ = fmt.Sscan(parts[1], &exp)
	if time.Now().Unix() > exp {
		return "", false
	}
	return parts[0], true
}
func (app *App) sign(s string) string {
	mac := hmac.New(sha256.New, []byte(app.cfg.SessionSecret))
	mac.Write([]byte(s))
	return hex.EncodeToString(mac.Sum(nil))
}

func HashPassword(password string) (string, error) {
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	dk := pbkdf2Key([]byte(password), salt, passwordPBKDF2Iterations, passwordHashBytes)
	return fmt.Sprintf("pbkdf2$%d$%s$%s", passwordPBKDF2Iterations, base64.RawStdEncoding.EncodeToString(salt), base64.RawStdEncoding.EncodeToString(dk)), nil
}
func VerifyPassword(password, encoded string) bool {
	parts := strings.Split(encoded, "$")
	if len(parts) != 4 || parts[0] != "pbkdf2" {
		return false
	}
	salt, err1 := base64.RawStdEncoding.DecodeString(parts[2])
	want, err2 := base64.RawStdEncoding.DecodeString(parts[3])
	if err1 != nil || err2 != nil {
		return false
	}
	dk := pbkdf2Key([]byte(password), salt, passwordPBKDF2Iterations, len(want))
	return subtle.ConstantTimeCompare(dk, want) == 1
}
func pbkdf2Key(password, salt []byte, iter, keyLen int) []byte {
	hLen := 32
	numBlocks := (keyLen + hLen - 1) / hLen
	out := make([]byte, 0, numBlocks*hLen)
	for block := 1; block <= numBlocks; block++ {
		mac := hmac.New(sha256.New, password)
		mac.Write(salt)
		mac.Write([]byte{byte(block >> 24), byte(block >> 16), byte(block >> 8), byte(block)})
		u := mac.Sum(nil)
		t := append([]byte(nil), u...)
		for i := 1; i < iter; i++ {
			mac = hmac.New(sha256.New, password)
			mac.Write(u)
			u = mac.Sum(nil)
			for j := range t {
				t[j] ^= u[j]
			}
		}
		out = append(out, t...)
	}
	return out[:keyLen]
}

func securityHeaders(cfg Config, next http.Handler) http.Handler {
	connectSources := []string{"'self'"}
	seen := map[string]bool{"'self'": true}
	for _, raw := range []string{cfg.PublicSiteURL, cfg.PublicAPIURL} {
		u, err := url.Parse(raw)
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
			continue
		}
		origin := u.Scheme + "://" + u.Host
		if !seen[origin] {
			seen[origin] = true
			connectSources = append(connectSources, origin)
		}
	}
	csp := "default-src 'self'; connect-src " + strings.Join(connectSources, " ") + "; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' blob: data:; base-uri 'self'; frame-ancestors 'none'"
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "same-origin")
		w.Header().Set("Content-Security-Policy", csp)
		next.ServeHTTP(w, r)
	})
}

func (app *App) withRate(name string, max int, per time.Duration, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ip, _, _ := net.SplitHostPort(r.RemoteAddr)
		if ip == "" {
			ip = r.RemoteAddr
		}
		if !app.limiter.Allow(name+":"+ip, max, per) {
			http.Error(w, "请求太频繁，等一下再试", 429)
			return
		}
		next(w, r)
	}
}

type Limiter struct {
	mu      sync.Mutex
	buckets map[string][]time.Time
}

func NewLimiter() *Limiter { return &Limiter{buckets: map[string][]time.Time{}} }
func (l *Limiter) Allow(key string, max int, per time.Duration) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	cutoff := now.Add(-per)
	xs := l.buckets[key][:0]
	for _, t := range l.buckets[key] {
		if t.After(cutoff) {
			xs = append(xs, t)
		}
	}
	if len(xs) >= max {
		l.buckets[key] = xs
		return false
	}
	xs = append(xs, now)
	l.buckets[key] = xs
	return true
}

func parseFrontMatter(text string) (map[string]string, string) {
	out := map[string]string{}
	text = strings.ReplaceAll(text, "\r\n", "\n")
	if !strings.HasPrefix(text, "---\n") {
		return out, text
	}
	idx := strings.Index(text[4:], "\n---")
	if idx < 0 {
		return out, text
	}
	front := text[4 : 4+idx]
	body := strings.TrimLeft(text[4+idx+len("\n---"):], "\n")
	for _, line := range strings.Split(front, "\n") {
		parts := strings.SplitN(line, ":", 2)
		if len(parts) != 2 {
			continue
		}
		k := strings.ToLower(strings.TrimSpace(parts[0]))
		v := strings.TrimSpace(parts[1])
		v = strings.Trim(v, `"'`)
		if strings.HasPrefix(v, "[") && strings.HasSuffix(v, "]") {
			v = strings.Trim(v, "[]")
			v = strings.ReplaceAll(v, `"`, "")
		}
		out[k] = v
	}
	return out, body
}

func firstMarkdownHeading(body string) string {
	for _, line := range strings.Split(body, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "# ") {
			return strings.TrimSpace(strings.TrimPrefix(line, "# "))
		}
	}
	return ""
}

func makeSummary(body string) string {
	body = regexp.MustCompile("(?m)^#+\\s*").ReplaceAllString(body, "")
	body = regexp.MustCompile("`{3}[\\s\\S]*?`{3}").ReplaceAllString(body, "")
	body = strings.Join(strings.Fields(body), " ")
	r := []rune(body)
	if len(r) > 120 {
		return string(r[:120]) + "..."
	}
	return body
}

func firstNonEmpty(xs ...string) string {
	for _, x := range xs {
		x = strings.TrimSpace(x)
		if x != "" {
			return x
		}
	}
	return ""
}

func urlMsg(s string) string { return url.QueryEscape(s) }

func newID() string { b := make([]byte, 8); _, _ = rand.Read(b); return hex.EncodeToString(b) }
func cleanUsername(s string) string {
	return regexp.MustCompile(`[^a-zA-Z0-9_-]`).ReplaceAllString(strings.ToLower(strings.TrimSpace(s)), "")
}
func slugify(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s = regexp.MustCompile(`[^a-z0-9\p{Han}]+`).ReplaceAllString(s, "-")
	s = strings.Trim(s, "-")
	if len([]rune(s)) > 80 {
		s = string([]rune(s)[:80])
	}
	return s
}

func normalizeCoverMode(raw string) string {
	v := strings.TrimSpace(raw)
	switch v {
	case "contain", "cover":
		return v
	default:
		return "cover"
	}
}

func cleanAssetPath(raw string) string {
	v := strings.TrimSpace(raw)
	v = strings.ReplaceAll(v, "：", ":")
	if v == "" {
		return ""
	}
	lower := strings.ToLower(v)
	if strings.HasPrefix(lower, "http://") || strings.HasPrefix(lower, "https://") {
		return v
	}
	if !strings.HasPrefix(v, "/") {
		v = "/" + v
	}
	if strings.Contains(v, "..") || strings.Contains(v, "\\") || len(v) > 240 {
		return ""
	}
	return v
}

func splitTags(s string) []string {
	parts := strings.Split(s, ",")
	out := []string{}
	seen := map[string]bool{}
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" && len([]rune(p)) <= 32 && !seen[p] {
			out = append(out, p)
			seen[p] = true
		}
	}
	if len(out) > 10 {
		out = out[:10]
	}
	return out
}

func appendUniqueTag(tags []string, tag string) []string {
	tag = strings.TrimSpace(tag)
	if tag == "" {
		return tags
	}
	for _, t := range tags {
		if strings.EqualFold(strings.TrimSpace(t), tag) {
			return tags
		}
	}
	if len(tags) >= 10 {
		return tags
	}
	return append(tags, tag)
}

func isNoticeTag(tag string) bool {
	t := strings.TrimSpace(strings.ToLower(tag))
	return t == noticeTagSlug || t == "站点公告"
}

func filterProtectedNoticeTags(tags []string) []string {
	out := []string{}
	for _, tag := range tags {
		if isNoticeTag(tag) {
			continue
		}
		out = append(out, tag)
	}
	return out
}

func normalizeArticleBodyForHugo(s string) string {
	// 临时 Markdown 预览器会把 <br> 当换行；公开文章这里转成 Markdown 硬换行，
	// 避免 Hugo/Goldmark 环境差异导致文章阅读页不换行。源 Markdown 下载仍保留原文。
	br := regexp.MustCompile(`(?i)(<br\s*/?>|&lt;br\s*/?&gt;)`)
	return br.ReplaceAllString(s, "  \n")
}

func stripUnsafeHTML(s string) string {
	// Go regexp 不支持 \1 这种反向引用，所以这里不用成对匹配写法。
	// 第一版做保守过滤：移除危险标签、事件属性和 javascript: 链接。
	dangerousTags := regexp.MustCompile(`(?is)<\s*/?\s*(script|iframe|object|embed|style|link|meta)[^>]*>`)
	eventAttrs := regexp.MustCompile(`(?is)\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)`)
	jsLinks := regexp.MustCompile(`(?is)javascript\s*:`)
	s = dangerousTags.ReplaceAllString(s, "")
	s = eventAttrs.ReplaceAllString(s, "")
	s = jsLinks.ReplaceAllString(s, "")
	return s
}

func resetStatusText(s string) string {
	switch s {
	case "pending":
		return "待处理"
	case "approved":
		return "已批准"
	case "rejected":
		return "已拒绝"
	default:
		return s
	}
}
func statusText(s string) string {
	switch s {
	case stDraft:
		return "草稿"
	case stPending:
		return "待审核"
	case stPublished:
		return "已发布"
	case stRejected:
		return "已退回"
	case stDeleted:
		return "已删除"
	default:
		return s
	}
}
func statusClass(s string) string {
	switch s {
	case stDraft:
		return "draft"
	case stPending:
		return "pending"
	case stPublished:
		return "published"
	case stRejected:
		return "rejected"
	case stDeleted:
		return "deleted"
	default:
		return ""
	}
}
