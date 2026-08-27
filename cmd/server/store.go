package main

import (
	"path/filepath"
)

// Store 是后台运行时数据的唯一读写入口。
// 它集中保存各类内存索引及其 JSON 文件读写能力，避免路由层直接触碰持久化文件。

func NewStore(dataDir string) (*Store, error) {
	s := &Store{dataDir: dataDir, users: map[string]User{}, articles: map[string]Article{}, resets: map[string]PasswordResetRequest{}}
	if err := s.load("users.json", &s.users); err != nil {
		return nil, err
	}
	if err := s.load("articles.json", &s.articles); err != nil {
		return nil, err
	}
	if err := s.load("password_resets.json", &s.resets); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *Store) load(name string, v any) error {
	return readJSONFile(filepath.Join(s.dataDir, name), v)
}

func (s *Store) saveLocked(name string, v any) error {
	return writeJSONFile(filepath.Join(s.dataDir, name), v, 0600)
}
