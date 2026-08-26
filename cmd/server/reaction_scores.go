package main

import (
	"encoding/json"
	"log"
	"net/http"
	"sort"
	"strings"
	"time"
)

// 反应速度排行榜接口与记录归一化逻辑。

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
	return app.scoreDataPath("reaction_scores.json")
}

func (app *App) loadReactionScores() []SnakeScoreRecord {
	return app.loadScoreRecords(app.reactionScoresPath(), "reaction", normalizeReactionScoreRecords)
}

func (app *App) saveReactionScores(scores []SnakeScoreRecord) error {
	return app.saveScoreRecords(app.reactionScoresPath(), scores, normalizeReactionScoreRecords)
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
		app.scoresMu.Lock()
		scores := app.loadReactionScores()
		app.scoresMu.Unlock()
		_ = json.NewEncoder(w).Encode(map[string]any{"scores": scores})
		return
	case http.MethodPost:
		var req snakeScoreRequest
		if err := decodeJSONBody(http.MaxBytesReader(w, r.Body, scoreRequestMaxBytes), scoreRequestMaxBytes, &req); err != nil {
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
		app.scoresMu.Lock()
		scores := app.loadReactionScores()
		scores = append(scores, record)
		if err := app.saveReactionScores(scores); err != nil {
			app.scoresMu.Unlock()
			log.Printf("save reaction scores error: %v", err)
			http.Error(w, "save failed", http.StatusInternalServerError)
			return
		}
		scores = app.loadReactionScores()
		app.scoresMu.Unlock()
		_ = json.NewEncoder(w).Encode(map[string]any{"scores": scores})
		return
	default:
		w.Header().Set("Allow", "GET, POST")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
}
