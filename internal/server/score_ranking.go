package server

import (
	"sort"
	"strings"
)

func cleanScorePlayerID(raw string) string {
	var b strings.Builder
	for _, r := range strings.TrimSpace(raw) {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			b.WriteRune(r)
		}
		if b.Len() >= 64 {
			break
		}
	}
	return b.String()
}

func scoreIdentity(item ScoreRecord) string {
	if name := strings.TrimSpace(item.Username); name != "" {
		return "user:" + name
	}
	if id := strings.TrimSpace(item.PlayerID); id != "" {
		return "guest:" + id
	}
	return "legacy:" + strings.TrimSpace(item.CreatedAt)
}

func reactionScoreDisplay(item ScoreRecord) string {
	if name := strings.TrimSpace(item.DisplayName); name != "" {
		return name
	}
	if name := strings.TrimSpace(item.Username); name != "" {
		return name
	}
	if id := strings.TrimSpace(item.PlayerID); id != "" {
		if len(id) > 6 {
			id = id[len(id)-6:]
		}
		return "游客 " + id
	}
	return "访客"
}

func typingScoreMode(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "mixed", "zh", "cn", "chinese":
		return "mixed"
	default:
		return "english"
	}
}

func (board scoreBoard) better(a, b ScoreRecord) bool {
	if a.Score == b.Score {
		return a.CreatedAt < b.CreatedAt
	}
	if board.ascending {
		return a.Score < b.Score
	}
	return a.Score > b.Score
}

// rank retains one best record per identity, breaking score ties by the earlier
// timestamp. Typing ranks each mode separately; historical unlabelled records
// belong to the English board.
func (board scoreBoard) rank(scores []ScoreRecord, mode string) []ScoreRecord {
	bestByIdentity := map[string]ScoreRecord{}
	for _, item := range scores {
		if item.Score <= 0 {
			continue
		}
		if board.byMode {
			if typingScoreMode(item.Mode) != mode {
				continue
			}
			item.Mode = mode
		}
		if board.visitorNames {
			item.DisplayName = reactionScoreDisplay(item)
		}
		key := scoreIdentity(item)
		old, ok := bestByIdentity[key]
		if !ok || board.better(item, old) {
			bestByIdentity[key] = item
		}
	}
	cleaned := make([]ScoreRecord, 0, len(bestByIdentity))
	for _, item := range bestByIdentity {
		cleaned = append(cleaned, item)
	}
	sort.SliceStable(cleaned, func(i, j int) bool { return board.better(cleaned[i], cleaned[j]) })
	if len(cleaned) > 3 {
		cleaned = cleaned[:3]
	}
	return cleaned
}

func (board scoreBoard) normalize(scores []ScoreRecord) []ScoreRecord {
	if board.byMode {
		cleaned := make([]ScoreRecord, 0, 6)
		cleaned = append(cleaned, board.rank(scores, "english")...)
		return append(cleaned, board.rank(scores, "mixed")...)
	}
	return board.rank(scores, "")
}
