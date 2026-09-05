package main

import (
	"encoding/json"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type publicFriendAsset struct {
	ID          string   `json:"id"`
	DisplayName string   `json:"display_name"`
	Bio         string   `json:"bio"`
	URL         string   `json:"url"`
	Avatar      string   `json:"avatar"`
	Links       []string `json:"links"`
}

type localToolAsset struct {
	ID      string   `json:"id"`
	Href    string   `json:"href"`
	Icon    string   `json:"icon"`
	IconURL string   `json:"icon_url"`
	Title   string   `json:"title"`
	Desc    string   `json:"desc"`
	Tags    []string `json:"tags"`
	Keywords []string `json:"keywords"`
}

type externalToolAsset struct {
	IconURL string `json:"icon_url"`
	Title   string `json:"title"`
	Desc    string `json:"desc"`
	Href    string `json:"href"`
}

func readPublicAsset(t *testing.T, path string, target any) {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("..", "..", "assets", "data", path))
	if err != nil {
		t.Fatalf("read public asset %s: %v", path, err)
	}
	if err := json.Unmarshal(data, target); err != nil {
		t.Fatalf("decode public asset %s: %v", path, err)
	}
}

func requireHTTPURL(t *testing.T, raw, label string) {
	t.Helper()
	parsed, err := url.ParseRequestURI(strings.TrimSpace(raw))
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
		t.Fatalf("%s must be an absolute HTTP(S) URL, got %q", label, raw)
	}
}

func requireToolIcon(t *testing.T, rawURL, fallback, label string) {
	t.Helper()
	if strings.TrimSpace(rawURL) == "" {
		if strings.TrimSpace(fallback) == "" {
			t.Fatalf("%s needs icon_url or icon fallback", label)
		}
		return
	}
	if strings.HasPrefix(rawURL, "/") && !strings.HasPrefix(rawURL, "//") {
		relative := filepath.Clean(filepath.FromSlash(strings.TrimPrefix(rawURL, "/")))
		if relative == "." || strings.HasPrefix(relative, "..") {
			t.Fatalf("%s local icon must stay within static/, got %q", label, rawURL)
		}
		if _, err := os.Stat(filepath.Join("..", "..", "static", relative)); err != nil {
			t.Fatalf("%s local icon is missing: %q: %v", label, rawURL, err)
		}
		return
	}
	requireHTTPURL(t, rawURL, label)
}

func TestPublicFriendsAssetSchema(t *testing.T) {
	var friends []publicFriendAsset
	readPublicAsset(t, filepath.Join("friends", "external.json"), &friends)
	if len(friends) == 0 {
		t.Fatal("external friends must not be empty")
	}
	seen := map[string]struct{}{}
	for _, friend := range friends {
		if strings.TrimSpace(friend.ID) == "" || strings.TrimSpace(friend.DisplayName) == "" || strings.TrimSpace(friend.Bio) == "" || strings.TrimSpace(friend.Avatar) == "" {
			t.Fatalf("friend has required empty fields: %#v", friend)
		}
		if _, exists := seen[friend.ID]; exists {
			t.Fatalf("duplicate friend id %q", friend.ID)
		}
		seen[friend.ID] = struct{}{}
		requireHTTPURL(t, friend.URL, "friend "+friend.ID+" URL")
	}
}

func TestPublicToolsAssetSchema(t *testing.T) {
	var localTools []localToolAsset
	readPublicAsset(t, filepath.Join("tools", "local.json"), &localTools)
	if len(localTools) == 0 {
		t.Fatal("local tools must not be empty")
	}
	seen := map[string]struct{}{}
	for _, tool := range localTools {
		if strings.TrimSpace(tool.ID) == "" || strings.TrimSpace(tool.Title) == "" || strings.TrimSpace(tool.Desc) == "" {
			t.Fatalf("local tool has required empty fields: %#v", tool)
		}
		if !strings.HasPrefix(tool.Href, "/tools/") {
			t.Fatalf("local tool %q must point to /tools/, got %q", tool.ID, tool.Href)
		}
		if len(tool.Tags) == 0 || len(tool.Keywords) == 0 {
			t.Fatalf("local tool %q needs tags and keywords", tool.ID)
		}
		requireToolIcon(t, tool.IconURL, tool.Icon, "local tool "+tool.ID+" icon")
		if _, exists := seen[tool.ID]; exists {
			t.Fatalf("duplicate local tool id %q", tool.ID)
		}
		seen[tool.ID] = struct{}{}
	}

	var externalTools []externalToolAsset
	readPublicAsset(t, filepath.Join("tools", "external.json"), &externalTools)
	if len(externalTools) == 0 {
		t.Fatal("external tools must not be empty")
	}
	for _, tool := range externalTools {
		if strings.TrimSpace(tool.Title) == "" || strings.TrimSpace(tool.Desc) == "" || strings.TrimSpace(tool.IconURL) == "" {
			t.Fatalf("external tool has required empty fields: %#v", tool)
		}
		requireHTTPURL(t, tool.Href, "external tool "+tool.Title+" href")
		requireHTTPURL(t, tool.IconURL, "external tool "+tool.Title+" icon")
	}
}
