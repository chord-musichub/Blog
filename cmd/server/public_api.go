package main

import (
	"encoding/json"
	"log"
	"net/http"
	"sort"
	"strings"
	"time"
)

// 本文件承载小游戏排行榜 API。
// 所有接口均复用统一的跨域、限流和 JSON 持久化策略。

func (app *App) snakeScoresPath() string {
	return app.scoreDataPath("snake_scores.json")
}

func (app *App) loadSnakeScores() []SnakeScoreRecord {
	return app.loadScoreRecords(app.snakeScoresPath(), "snake", normalizeHighScoreRecords)
}

func (app *App) saveSnakeScores(scores []SnakeScoreRecord) error {
	return app.saveScoreRecords(app.snakeScoresPath(), scores, normalizeHighScoreRecords)
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
		app.scoresMu.Lock()
		scores := app.loadSnakeScores()
		app.scoresMu.Unlock()
		_ = json.NewEncoder(w).Encode(map[string]any{"scores": scores})
		return
	case http.MethodPost:
		var req snakeScoreRequest
		if err := decodeJSONBody(http.MaxBytesReader(w, r.Body, scoreRequestMaxBytes), scoreRequestMaxBytes, &req); err != nil {
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}
		if req.Score <= 0 || req.Score > 999999 {
			http.Error(w, "invalid score", http.StatusBadRequest)
			return
		}
		app.scoresMu.Lock()
		record := SnakeScoreRecord{
			Score:     req.Score,
			CreatedAt: time.Now().UTC().Format(time.RFC3339),
		}
		applyScoreRecordIdentity(app, r, req, &record)
		scores := app.loadSnakeScores()
		scores = append(scores, record)
		if err := app.saveSnakeScores(scores); err != nil {
			app.scoresMu.Unlock()
			log.Printf("save snake scores error: %v", err)
			http.Error(w, "save failed", http.StatusInternalServerError)
			return
		}
		scores = app.loadSnakeScores()
		app.scoresMu.Unlock()
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

func (app *App) flappyScoresPath() string {
	return app.scoreDataPath("flappy_scores.json")
}

func (app *App) loadFlappyScores() []SnakeScoreRecord {
	return app.loadScoreRecords(app.flappyScoresPath(), "flappy", normalizeHighScoreRecords)
}

func (app *App) saveFlappyScores(scores []SnakeScoreRecord) error {
	return app.saveScoreRecords(app.flappyScoresPath(), scores, normalizeHighScoreRecords)
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
		app.scoresMu.Lock()
		scores := app.loadFlappyScores()
		app.scoresMu.Unlock()
		_ = json.NewEncoder(w).Encode(map[string]any{"scores": scores})
		return
	case http.MethodPost:
		var req snakeScoreRequest
		if err := decodeJSONBody(http.MaxBytesReader(w, r.Body, scoreRequestMaxBytes), scoreRequestMaxBytes, &req); err != nil {
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}
		if req.Score <= 0 || req.Score > 999999 {
			http.Error(w, "invalid score", http.StatusBadRequest)
			return
		}
		app.scoresMu.Lock()
		record := SnakeScoreRecord{
			Score:     req.Score,
			CreatedAt: time.Now().UTC().Format(time.RFC3339),
		}
		applyScoreRecordIdentity(app, r, req, &record)
		scores := app.loadFlappyScores()
		scores = append(scores, record)
		if err := app.saveFlappyScores(scores); err != nil {
			app.scoresMu.Unlock()
			log.Printf("save flappy scores error: %v", err)
			http.Error(w, "save failed", http.StatusInternalServerError)
			return
		}
		scores = app.loadFlappyScores()
		app.scoresMu.Unlock()
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
	return app.scoreDataPath("typing_scores.json")
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
	all := app.loadScoreRecords(app.typingScoresPath(), "typing", normalizeAllTypingScoreRecords)
	return normalizeTypingScoreRecords(all, mode)
}

func (app *App) saveTypingScores(scores []SnakeScoreRecord) error {
	return app.saveScoreRecords(app.typingScoresPath(), scores, normalizeAllTypingScoreRecords)
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
		app.scoresMu.Lock()
		scores := app.loadTypingScores(mode)
		app.scoresMu.Unlock()
		_ = json.NewEncoder(w).Encode(map[string]any{"mode": mode, "scores": scores})
		return
	case http.MethodPost:
		var req snakeScoreRequest
		if err := decodeJSONBody(http.MaxBytesReader(w, r.Body, scoreRequestMaxBytes), scoreRequestMaxBytes, &req); err != nil {
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
		app.scoresMu.Lock()
		all := normalizeAllTypingScoreRecords(append(app.loadTypingScores("english"), app.loadTypingScores("mixed")...))
		all = append(all, record)
		if err := app.saveTypingScores(all); err != nil {
			app.scoresMu.Unlock()
			log.Printf("save typing scores error: %v", err)
			http.Error(w, "save failed", http.StatusInternalServerError)
			return
		}
		scores := app.loadTypingScores(mode)
		app.scoresMu.Unlock()
		_ = json.NewEncoder(w).Encode(map[string]any{"mode": mode, "scores": scores})
		return
	default:
		w.Header().Set("Allow", "GET, POST")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
}

const noticeTagSlug = "site-notice"
const noticeTagLabel = "站点公告"
