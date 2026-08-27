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

const noticeTagSlug = "site-notice"
const noticeTagLabel = "站点公告"
