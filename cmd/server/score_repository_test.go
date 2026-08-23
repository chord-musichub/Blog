package main

import "testing"

func TestScoreRepositoryCachesReadsAndUpdatesAfterSave(t *testing.T) {
	app := &App{
		cfg:        Config{DataDir: t.TempDir()},
		scoreCache: make(map[string][]SnakeScoreRecord),
	}
	path := app.snakeScoresPath()
	initial := []SnakeScoreRecord{{Score: 10, PlayerID: "first", CreatedAt: "2026-08-24T00:00:00Z"}}
	if err := writeJSONFile(path, initial, 0644); err != nil {
		t.Fatalf("prepare score file: %v", err)
	}

	first := app.loadSnakeScores()
	if len(first) != 1 || first[0].Score != 10 {
		t.Fatalf("first load = %#v, want initial score", first)
	}
	if err := writeJSONFile(path, []SnakeScoreRecord{{Score: 99, PlayerID: "external", CreatedAt: "2026-08-24T00:00:01Z"}}, 0644); err != nil {
		t.Fatalf("overwrite score file: %v", err)
	}
	if got := app.loadSnakeScores(); len(got) != 1 || got[0].Score != 10 {
		t.Fatalf("cached load = %#v, want original cached score", got)
	}

	updated := append(first, SnakeScoreRecord{Score: 20, PlayerID: "second", CreatedAt: "2026-08-24T00:00:02Z"})
	if err := app.saveSnakeScores(updated); err != nil {
		t.Fatalf("saveSnakeScores() error = %v", err)
	}
	if got := app.loadSnakeScores(); len(got) != 2 || got[0].Score != 20 {
		t.Fatalf("load after save = %#v, want updated cached scores", got)
	}
}

func TestCloneScoreRecordsDoesNotAliasCache(t *testing.T) {
	records := []SnakeScoreRecord{{Score: 7}}
	copy := cloneScoreRecords(records)
	copy[0].Score = 99
	if records[0].Score != 7 {
		t.Fatal("cloneScoreRecords() returned an alias of the source slice")
	}
}
