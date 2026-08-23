package main

import (
	"log"
	"path/filepath"
)

// loadScoreRecords 从内存缓存读取积分榜；首次访问才读取磁盘。
// 调用方必须持有 app.scoresMu，返回副本以免调用方意外修改缓存。
func (app *App) loadScoreRecords(path, label string, normalize func([]SnakeScoreRecord) []SnakeScoreRecord) []SnakeScoreRecord {
	if cached, ok := app.scoreCache[path]; ok {
		return cloneScoreRecords(cached)
	}

	var records []SnakeScoreRecord
	if err := readJSONFile(path, &records); err != nil {
		log.Printf("load %s scores error: %v", label, err)
	}
	cleaned := normalize(records)
	if app.scoreCache == nil {
		app.scoreCache = make(map[string][]SnakeScoreRecord)
	}
	app.scoreCache[path] = cloneScoreRecords(cleaned)
	return cleaned
}

// saveScoreRecords 将积分榜原子写入磁盘，并在成功后更新内存缓存。
// 调用方必须持有 app.scoresMu。
func (app *App) saveScoreRecords(path string, records []SnakeScoreRecord, normalize func([]SnakeScoreRecord) []SnakeScoreRecord) error {
	cleaned := normalize(records)
	if err := writeJSONFile(path, cleaned, 0644); err != nil {
		return err
	}
	if app.scoreCache == nil {
		app.scoreCache = make(map[string][]SnakeScoreRecord)
	}
	app.scoreCache[path] = cloneScoreRecords(cleaned)
	return nil
}

func cloneScoreRecords(records []SnakeScoreRecord) []SnakeScoreRecord {
	return append([]SnakeScoreRecord(nil), records...)
}

func (app *App) scoreDataPath(name string) string {
	return filepath.Join(app.cfg.DataDir, name)
}
