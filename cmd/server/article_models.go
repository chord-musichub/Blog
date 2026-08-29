package main

import "time"

// Article 是后台保存、审核和发布的文章实体。
type Article struct {
	ID          string     `json:"id"`
	Title       string     `json:"title"`
	Slug        string     `json:"slug"`
	Author      string     `json:"author"`
	Tags        []string   `json:"tags"`
	Summary     string     `json:"summary"`
	Cover       string     `json:"cover,omitempty"`
	CoverMode   string     `json:"cover_mode,omitempty"`
	Body        string     `json:"body"`
	SourceMD    string     `json:"source_md,omitempty"`
	Status      string     `json:"status"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
	PublishedAt *time.Time `json:"published_at,omitempty"`
	RejectedAt  *time.Time `json:"rejected_at,omitempty"`
	RejectNote  string     `json:"reject_note,omitempty"`
}
