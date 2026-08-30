package main

import (
	"log"
	"net/http"
	"os"
	"strings"
)

func (app *App) adminURL(p string) string {
	return adminURLPath(app.cfg.AdminBasePath, p)
}

// redirect converts local destinations to their configured admin base path.
func (app *App) redirect(w http.ResponseWriter, r *http.Request, p string, code int) {
	if strings.HasPrefix(p, "http://") || strings.HasPrefix(p, "https://") {
		http.Redirect(w, r, p, code)
		return
	}
	http.Redirect(w, r, app.adminURL(p), code)
}

func mustMkdir(p string, mode os.FileMode) {
	if err := os.MkdirAll(p, mode); err != nil {
		log.Fatal(err)
	}
}
