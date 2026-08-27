package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestAdminURLPath(t *testing.T) {
	cases := []struct {
		base string
		path string
		want string
	}{
		{"", "", "/"},
		{"", "login", "/login"},
		{"/write", "/login", "/write/login"},
		{"write/", "/", "/write/"},
	}
	for _, tc := range cases {
		if got := adminURLPath(cleanBasePath(tc.base), tc.path); got != tc.want {
			t.Errorf("adminURLPath(%q, %q) = %q, want %q", tc.base, tc.path, got, tc.want)
		}
	}
}

func TestNormalizedOrigin(t *testing.T) {
	cases := map[string]string{
		" https://example.com/path ": "https://example.com",
		"http://localhost:8080/api":  "http://localhost:8080",
		"ftp://example.com":          "",
		"not a URL":                  "",
	}
	for raw, want := range cases {
		if got := normalizedOrigin(raw); got != want {
			t.Errorf("normalizedOrigin(%q) = %q, want %q", raw, got, want)
		}
	}
}

func TestAllowPublicCORS(t *testing.T) {
	app := &App{cfg: Config{
		PublicSiteURL:     "https://blog.example.com",
		PublicAPIURL:      "https://api.example.com",
		PublicCORSOrigins: "https://editor.example.com, invalid",
	}}

	allowedRequest := httptest.NewRequest("GET", "/api/views", nil)
	allowedRequest.Header.Set("Origin", "https://editor.example.com")
	allowedResponse := httptest.NewRecorder()
	if !app.allowPublicCORS(allowedResponse, allowedRequest) {
		t.Fatal("expected configured origin to be allowed")
	}
	if got := allowedResponse.Header().Get("Access-Control-Allow-Origin"); got != "https://editor.example.com" {
		t.Fatalf("unexpected allow origin header: %q", got)
	}

	deniedRequest := httptest.NewRequest("GET", "/api/views", nil)
	deniedRequest.Header.Set("Origin", "https://other.example.com")
	if app.allowPublicCORS(httptest.NewRecorder(), deniedRequest) {
		t.Fatal("expected unknown origin to be denied")
	}
}

func TestAllowPublicCORSAcceptsSameOrigin(t *testing.T) {
	app := &App{cfg: Config{
		// 故意只配置生产地址，确保本地同源请求不依赖此项。
		PublicSiteURL: "https://blog.example.com",
	}}
	req := httptest.NewRequest(http.MethodPost, "http://127.0.0.1:8080/api/tools/snake-scores", nil)
	req.Header.Set("Origin", "http://127.0.0.1:8080")
	if !app.allowPublicCORS(httptest.NewRecorder(), req) {
		t.Fatal("expected same-origin request to be allowed")
	}
}

func TestRuntimeLimitParsing(t *testing.T) {
	if got := positiveDurationSeconds("90", 60); got != 90*time.Second {
		t.Fatalf("positiveDurationSeconds returned %s, want 90s", got)
	}
	if got := positiveDurationSeconds("invalid", 60); got != 60*time.Second {
		t.Fatalf("invalid duration returned %s, want fallback", got)
	}
	if got := positiveByteLimit("2048", 1024); got != 2048 {
		t.Fatalf("positiveByteLimit returned %d, want 2048", got)
	}
	if got := positiveByteLimit("0", 1024); got != 1024 {
		t.Fatalf("invalid byte limit returned %d, want fallback", got)
	}
}

func TestScoreRouteAliases(t *testing.T) {
	app := &App{store: &Store{}, limiter: NewLimiter()}
	for _, endpoint := range []string{"snake-scores", "2048-scores", "reaction-scores", "flappy-scores", "typing-scores"} {
		for _, prefix := range []string{"/api/tools/", "/write/api/tools/", "/static/api/", "/api/"} {
			req := httptest.NewRequest(http.MethodOptions, prefix+endpoint, nil)
			res := httptest.NewRecorder()
			app.router().ServeHTTP(res, req)
			if res.Code != http.StatusNoContent {
				t.Errorf("OPTIONS %s returned %d, want %d", prefix+endpoint, res.Code, http.StatusNoContent)
			}
		}
	}
}
