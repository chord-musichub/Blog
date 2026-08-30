package main

import (
	"context"
	"log"
)

func main() {
	loadDotEnv(".env")
	cfg := loadConfig()
	mustMkdir(cfg.DataDir, 0700)
	mustMkdir(cfg.HugoContentDir, 0755)
	mustMkdir(cfg.PublicDir, 0755)

	store, err := NewStore(cfg.DataDir)
	if err != nil {
		log.Fatal(err)
	}
	if err := store.EnsureAdmin(cfg.AdminUser, cfg.AdminPass); err != nil {
		log.Fatal(err)
	}

	app := newApp(cfg, store)
	if err := app.runHugo(context.Background()); err != nil {
		log.Printf("initial site build error: %v", err)
	}
	srv := newHTTPServer(cfg, app)
	log.Printf("blog admin v20.18.5 listening on %s base=%q", cfg.Addr, cfg.AdminBasePath)
	log.Fatal(srv.ListenAndServe())
}
