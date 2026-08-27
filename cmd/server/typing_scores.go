package main

import (
	"encoding/json"
	"log"
	"net/http"
	"sort"
	"strings"
	"time"
)

// 打字练习排行榜接口与按模式的记录归一化逻辑。

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

func normalizeTypingScoreRecords(scores []SnakeScoreRecord, mode string) []SnakeScoreRecord {
	mode = typingScoreMode(mode)
	bestByIdentity := map[string]SnakeScoreRecord{}
	for _, item := range scores {
		if item.Score <= 0 || typingScoreMode(item.Mode) != mode {
			continue
		}
		item.Mode = mode
		key := scoreIdentity(item)
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

func (app *App) loadAllTypingScores() []SnakeScoreRecord {
	return app.loadScoreRecords(app.typingScoresPath(), "typing", normalizeAllTypingScoreRecords)
}

func (app *App) loadTypingScores(mode string) []SnakeScoreRecord {
	return normalizeTypingScoreRecords(app.loadAllTypingScores(), mode)
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
		all := app.loadAllTypingScores()
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
