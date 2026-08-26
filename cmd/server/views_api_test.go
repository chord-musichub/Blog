package main

import "testing"

func TestCleanViewPath(t *testing.T) {
	tests := []struct {
		name string
		raw  string
		want string
	}{
		{name: "relative path", raw: "posts/hello/", want: "/posts/hello/"},
		{name: "absolute URL", raw: "https://blog.example.com/posts/hello/?source=home", want: "/posts/hello/"},
		{name: "leading whitespace", raw: "  /tags/go/  ", want: "/tags/go/"},
		{name: "empty", raw: "", want: ""},
		{name: "path traversal", raw: "/posts/../secret", want: ""},
		{name: "windows separator", raw: "\\posts\\hello", want: ""},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := cleanViewPath(tc.raw); got != tc.want {
				t.Fatalf("cleanViewPath(%q) = %q, want %q", tc.raw, got, tc.want)
			}
		})
	}
}
