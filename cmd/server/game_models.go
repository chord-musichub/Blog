package main

// SnakeScoreRecord 是贪吃蛇积分榜中的公开记录。
type SnakeScoreRecord struct {
	Score       int    `json:"score"`
	CreatedAt   string `json:"created_at"`
	PlayerID    string `json:"player_id,omitempty"`
	Username    string `json:"username,omitempty"`
	DisplayName string `json:"display_name,omitempty"`
	Mode        string `json:"mode,omitempty"`
	ArticleID   string `json:"article_id,omitempty"`
}

type snakeScoreRequest struct {
	Score     int    `json:"score"`
	PlayerID  string `json:"player_id,omitempty"`
	Mode      string `json:"mode,omitempty"`
	ArticleID string `json:"article_id,omitempty"`
}
