package main

import "net/http"

// Read shared language assets directly, including before the first Hugo build.
func registerLanguageAssets(mux *http.ServeMux) {
	for route, file := range map[string]string{
		"/static/i18n.js":         "static/js/i18n.js",
		"/static/i18n-catalog.js": "static/js/i18n-catalog.js",
		"/static/i18n.css":        "static/css/i18n.css",
	} {
		mux.HandleFunc(route, func(w http.ResponseWriter, r *http.Request) {
			if r.Method != http.MethodGet && r.Method != http.MethodHead {
				http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
				return
			}
			w.Header().Set("Cache-Control", "public, no-cache")
			http.ServeFile(w, r, file)
		})
	}
}
