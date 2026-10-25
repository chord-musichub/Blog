package server

import "net/http"

// Shared source files are served before Hugo's first build. The public build
// copies the same files into /js and /css; no second source copy is maintained.
func registerSharedAssets(mux *http.ServeMux) {
	for route, file := range map[string]string{
		"/static/i18n.js":                "frontend/shared/js/i18n.js",
		"/static/i18n-catalog.js":        "frontend/shared/js/i18n-catalog.js",
		"/static/i18n.css":               "frontend/shared/css/i18n.css",
		"/static/markdown-renderer.js":   "frontend/shared/js/markdown-renderer.js",
		"/static/resource-readiness.js":  "frontend/shared/js/resource-readiness.js",
		"/static/document-transition.js": "frontend/shared/js/document-transition.js",
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
