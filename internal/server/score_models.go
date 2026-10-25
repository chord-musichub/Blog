package server

// ScoreRecord 是各小游戏积分榜中的公开记录；JSON 字段兼容现有数据。
type ScoreRecord struct {
	Score       int    `json:"score"`
	CreatedAt   string `json:"created_at"`
	PlayerID    string `json:"player_id,omitempty"`
	Username    string `json:"username,omitempty"`
	DisplayName string `json:"display_name,omitempty"`
	Mode        string `json:"mode,omitempty"`
	ArticleID   string `json:"article_id,omitempty"`
}

type scoreRequest struct {
	Score     int    `json:"score"`
	PlayerID  string `json:"player_id,omitempty"`
	Mode      string `json:"mode,omitempty"`
	ArticleID string `json:"article_id,omitempty"`
}
