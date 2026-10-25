package server

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func inTemporaryRoot(t *testing.T) string {
	t.Helper()
	previous, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	root := t.TempDir()
	if err := os.Chdir(root); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chdir(previous) })
	return root
}

func TestRuntimeDefaultsPreserveExistingInstallations(t *testing.T) {
	inTemporaryRoot(t)
	if got := defaultRuntimePath("data", "data"); got != filepath.Join("runtime", "data") {
		t.Fatal(got)
	}
	if err := os.MkdirAll("data", 0700); err != nil {
		t.Fatal(err)
	}
	if got := defaultRuntimePath("data", "data"); got != "data" {
		t.Fatal(got)
	}
	if err := os.MkdirAll("content/posts", 0755); err != nil {
		t.Fatal(err)
	}
	if got := defaultRuntimePath("content/posts", "content/posts"); got != "content/posts" {
		t.Fatal(got)
	}
}

func TestBuildWorkspaceCombinesOnlyPublicInputs(t *testing.T) {
	root := inTemporaryRoot(t)
	write := func(name, value string) {
		t.Helper()
		if err := os.MkdirAll(filepath.Dir(name), 0755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(name, []byte(value), 0644); err != nil {
			t.Fatal(err)
		}
	}
	write(sitePath("hugo.toml"), "baseURL = '/'\n")
	write(sitePath("content", "tools", "_index.md"), "fixed tools")
	write(sitePath("layouts", "index.html"), "site template")
	write(sitePath("static", "css", "theme-vars.css"), "original source")
	write("frontend/shared/js/i18n.js", "shared language")
	write("runtime/content/posts/entry/index.md", "published article")
	write("runtime/content/tools/_index.md", "legacy tool snapshot")
	write("runtime/content/tags/site-notice/_index.md", "notice page")
	write("runtime/data/auth/users.json", "PRIVATE ACCOUNT DATA")
	write("runtime/data/content/articles.json", "PRIVATE DRAFT DATA")
	write(buildPath("data", "site.json"), `{"site":"public"}`)
	app := &App{cfg: Config{DataDir: "runtime/data", HugoContentDir: "runtime/content/posts", PublicDir: "build/public"}}
	if err := app.writeRuntimeConfig(); err != nil {
		t.Fatal(err)
	}
	if err := app.writeThemeCSS(defaultThemeSettings()); err != nil {
		t.Fatal(err)
	}
	workspace, err := app.prepareHugoBuildWorkspace()
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"config.toml", "content/tools/_index.md", "content/posts/entry/index.md", "content/tags/site-notice/_index.md", "static/js/i18n.js", "static/runtime-config.js", "static/css/theme-vars.css", "data/site.json"} {
		if _, err := os.Stat(filepath.Join(workspace, name)); err != nil {
			t.Errorf("missing public input %s: %v", name, err)
		}
	}
	if content, _ := os.ReadFile(filepath.Join(workspace, "content", "tools", "_index.md")); string(content) != "fixed tools" {
		t.Fatal("legacy runtime tools overrode frontend source")
	}
	for _, name := range []string{"data/auth/users.json", "data/content/articles.json", "runtime", "frontend/admin"} {
		if _, err := os.Stat(filepath.Join(workspace, name)); !os.IsNotExist(err) {
			t.Errorf("private/admin data included in Hugo workspace: %s", name)
		}
	}
	if source, _ := os.ReadFile(sitePath("static", "css", "theme-vars.css")); string(source) != "original source" {
		t.Fatal("build changed tracked theme CSS")
	}
	if _, err := os.Stat(sitePath("static", "runtime-config.js")); !os.IsNotExist(err) {
		t.Fatal("build wrote generated config into frontend sources")
	}
	if got, err := app.absolutePublicDir(); err != nil || got != filepath.Join(root, "build", "public") {
		t.Fatalf("output path = %s, %v", got, err)
	}
}

// This checks the full production templates, rather than a minimal Hugo fixture.
func TestRealHugoBuildWithSeparatedFrontend(t *testing.T) {
	if os.Getenv("ARTICLE_REAL_HUGO") != "1" {
		t.Skip("opt-in real Hugo integration")
	}
	previous, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	repo, err := filepath.Abs(filepath.Join("..", ".."))
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chdir(repo); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chdir(previous) })
	root := t.TempDir()
	store, err := NewStore(filepath.Join(root, "data"))
	if err != nil {
		t.Fatal(err)
	}
	app := newApp(Config{DataDir: filepath.Join(root, "data"), HugoContentDir: filepath.Join(root, "content", "posts"), PublicDir: filepath.Join(root, "public"), HugoCommand: "hugo --minify", HugoBuildTimeout: time.Minute}, store)
	if err := app.runHugo(context.Background()); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"index.html", "tools/index.html", "friends/index.html", "js/i18n.js", "js/markdown-renderer.js", "js/resource-readiness.js", "css/i18n.css", "runtime-config.js"} {
		if _, err := os.Stat(filepath.Join(app.cfg.PublicDir, name)); err != nil {
			t.Errorf("missing output %s: %v", name, err)
		}
	}
	for _, name := range []string{"auth/users.json", "data/auth/users.json", "frontend/admin/templates/login.html"} {
		if _, err := os.Stat(filepath.Join(app.cfg.PublicDir, name)); !os.IsNotExist(err) {
			t.Errorf("private/admin source in public output: %s", name)
		}
	}
}
