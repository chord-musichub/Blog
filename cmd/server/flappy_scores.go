package main

import (
	"encoding/json"
	"log"
	"net/http"
	"time"
)

// 飞行小游戏排行榜接口。

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
