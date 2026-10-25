package server

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"
)

// Each board declares only its scoring differences. Routes, request handling,
// identity and persistence share one implementation and keep existing URLs/files.
type scoreBoard struct {
	name               string
	minScore, maxScore int
	ascending          bool
	byMode             bool
	visitorNames       bool
}

var scoreBoards = []scoreBoard{
	{name: "snake", minScore: 1, maxScore: 999999},
	{name: "2048", minScore: 1, maxScore: maxAcceptedGameScore},
	// Reaction scores are browser estimates in ms, including values below 50ms.
	{name: "reaction", minScore: 1, maxScore: 5000, ascending: true, visitorNames: true},
	{name: "flappy", minScore: 1, maxScore: 999999},
	// Typing scores are completion times in ms, with separate language boards.
	{name: "typing", minScore: 1000, maxScore: 3600000, ascending: true, byMode: true},
}

func (app *App) scoreHandler(board scoreBoard) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
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
		var req scoreRequest
		switch r.Method {
		case http.MethodGet:
			req.Mode = r.URL.Query().Get("mode")
		case http.MethodPost:
			if err := decodeJSONBody(http.MaxBytesReader(w, r.Body, scoreRequestMaxBytes), scoreRequestMaxBytes, &req); err != nil {
				http.Error(w, "bad request", http.StatusBadRequest)
				return
			}
			if req.Score < board.minScore || req.Score > board.maxScore {
				http.Error(w, "invalid score", http.StatusBadRequest)
				return
			}
		default:
			w.Header().Set("Allow", "GET, POST")
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		mode := ""
		if board.byMode {
			mode = typingScoreMode(req.Mode)
		}
		var record ScoreRecord
		if r.Method == http.MethodPost {
			record = ScoreRecord{Score: req.Score, CreatedAt: time.Now().UTC().Format(time.RFC3339), PlayerID: cleanScorePlayerID(req.PlayerID)}
			if u, ok := app.currentUser(r); ok {
				record.Username = u.Username
				record.DisplayName = strings.TrimSpace(u.DisplayName)
				if record.DisplayName == "" {
					record.DisplayName = u.Username
				}
				record.PlayerID = ""
			}
			if board.byMode {
				record.Mode = mode
				record.ArticleID = cleanScorePlayerID(req.ArticleID)
			}
		}

		app.scoresMu.Lock()
		scores := app.loadScoreRecords(board)
		if r.Method == http.MethodPost {
			if err := app.saveScoreRecords(board, append(scores, record)); err != nil {
				app.scoresMu.Unlock()
				log.Printf("save %s scores error: %v", board.name, err)
				http.Error(w, "save failed", http.StatusInternalServerError)
				return
			}
			scores = app.loadScoreRecords(board)
		}
		app.scoresMu.Unlock()

		response := map[string]any{"scores": scores}
		if board.byMode {
			response["mode"] = mode
			response["scores"] = board.rank(scores, mode)
		}
		_ = json.NewEncoder(w).Encode(response)
	}
}
