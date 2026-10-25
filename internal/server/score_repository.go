package server

import (
	"log"
)

// loadScoreRecords 从内存缓存读取积分榜；首次访问才读取磁盘。
// 调用方必须持有 app.scoresMu，返回副本以免调用方意外修改缓存。
func (app *App) loadScoreRecords(board scoreBoard) []ScoreRecord {
	path := app.scoreDataPath(board.name + "_scores.json")
	if cached, ok := app.scoreCache[path]; ok {
		return cloneScoreRecords(cached)
	}

	var records []ScoreRecord
	if err := readJSONFile(path, &records); err != nil {
		log.Printf("load %s scores error: %v", board.name, err)
	}
	cleaned := board.normalize(records)
	if app.scoreCache == nil {
		app.scoreCache = make(map[string][]ScoreRecord)
	}
	app.scoreCache[path] = cloneScoreRecords(cleaned)
	return cleaned
}

// saveScoreRecords 将积分榜原子写入磁盘，并在成功后更新内存缓存。
// 调用方必须持有 app.scoresMu。
func (app *App) saveScoreRecords(board scoreBoard, records []ScoreRecord) error {
	path := app.scoreDataPath(board.name + "_scores.json")
	cleaned := board.normalize(records)
	if err := writeJSONFile(path, cleaned, 0644); err != nil {
		return err
	}
	if app.scoreCache == nil {
		app.scoreCache = make(map[string][]ScoreRecord)
	}
	app.scoreCache[path] = cloneScoreRecords(cleaned)
	return nil
}

func cloneScoreRecords(records []ScoreRecord) []ScoreRecord {
	return append([]ScoreRecord(nil), records...)
}

func (app *App) scoreDataPath(name string) string {
	return runtimeDataPath(app.cfg.DataDir, name)
}
