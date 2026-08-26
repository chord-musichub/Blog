package main

import (
	"encoding/json"
	"log"
	"net/http"
	"sort"
	"strings"
	"time"
)

// 2048 排行榜接口与记录归一化逻辑。

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
	return app.scoreDataPath("2048_scores.json")
}

func (app *App) loadGame2048Scores() []SnakeScoreRecord {
	return app.loadScoreRecords(app.game2048ScoresPath(), "2048", normalizeGame2048ScoreRecords)
}

func (app *App) saveGame2048Scores(scores []SnakeScoreRecord) error {
	return app.saveScoreRecords(app.game2048ScoresPath(), scores, normalizeGame2048ScoreRecords)
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
		app.scoresMu.Lock()
		scores := app.loadGame2048Scores()
		app.scoresMu.Unlock()
		_ = json.NewEncoder(w).Encode(map[string]any{"scores": scores})
		return
	case http.MethodPost:
		var req snakeScoreRequest
		if err := decodeJSONBody(http.MaxBytesReader(w, r.Body, scoreRequestMaxBytes), scoreRequestMaxBytes, &req); err != nil {
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
		app.scoresMu.Lock()
		scores := app.loadGame2048Scores()
		scores = append(scores, record)
		if err := app.saveGame2048Scores(scores); err != nil {
			app.scoresMu.Unlock()
			log.Printf("save 2048 scores error: %v", err)
			http.Error(w, "save failed", http.StatusInternalServerError)
			return
		}
		scores = app.loadGame2048Scores()
		app.scoresMu.Unlock()
		_ = json.NewEncoder(w).Encode(map[string]any{"scores": scores})
		return
	default:
		w.Header().Set("Allow", "GET, POST")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
}
