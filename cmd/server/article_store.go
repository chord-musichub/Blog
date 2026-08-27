package main

import (
	"errors"
	"sort"
	"time"
)

// 文章仓储：查询、保存、删除和 Slug 唯一性校验。

func (s *Store) AllArticles() []Article {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]Article, 0, len(s.articles))
	for _, a := range s.articles {
		if a.Status == stDeleted {
			continue
		}
		out = append(out, a)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].UpdatedAt.After(out[j].UpdatedAt) })
	return out
}

func (s *Store) ArticlesByStatus(status string) []Article {
	all := s.AllArticles()
	out := []Article{}
	for _, a := range all {
		if a.Status == status {
			out = append(out, a)
		}
	}
	return out
}

func (s *Store) ArticlesExceptStatus(status string) []Article {
	all := s.AllArticles()
	out := []Article{}
	for _, a := range all {
		if a.Status != status {
			out = append(out, a)
		}
	}
	return out
}

func (s *Store) ArticlesByAuthor(author string) []Article {
	all := s.AllArticles()
	out := []Article{}
	for _, a := range all {
		if a.Author == author {
			out = append(out, a)
		}
	}
	return out
}

func (s *Store) GetArticle(id string) (Article, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	a, ok := s.articles[id]
	return a, ok
}

func (s *Store) SaveArticle(a Article) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now()
	if a.ID == "" {
		a.ID = newID()
		a.CreatedAt = now
	}
	if a.Status == "" {
		a.Status = stDraft
	}
	a.UpdatedAt = now
	s.articles[a.ID] = a
	return s.saveLocked("articles.json", s.articles)
}

func (s *Store) SlugExists(slug, exceptID string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	for id, a := range s.articles {
		if id != exceptID && a.Status != stDeleted && a.Slug == slug {
			return true
		}
	}
	return false
}

func (s *Store) DeleteArticle(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.articles[id]; !ok {
		return errors.New("文章不存在")
	}
	delete(s.articles, id)
	return s.saveLocked("articles.json", s.articles)
}

func (s *Store) DeleteArticlesByStatus(statuses ...string) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	set := map[string]bool{}
	for _, st := range statuses {
		set[st] = true
	}
	removed := 0
	for id, a := range s.articles {
		if set[a.Status] {
			delete(s.articles, id)
			removed++
		}
	}
	return removed, s.saveLocked("articles.json", s.articles)
}

func (s *Store) DeleteAllArticles() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.articles = map[string]Article{}
	return s.saveLocked("articles.json", s.articles)
}

func (s *Store) ArticleCountByAuthor(username string) int {
	s.mu.Lock()
	defer s.mu.Unlock()
	count := 0
	for _, a := range s.articles {
		if a.Author == username && a.Status != stDeleted {
			count++
		}
	}
	return count
}
