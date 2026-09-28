package main

import (
	"crypto/sha256"
	"errors"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

const articleGenerator = "songline-article"

type publicationEntry struct {
	Slug        string
	Title       string
	Author      string
	ArticleID   string
	Managed     bool
	Fingerprint string
}

func (app *App) articleDirectory(slug string) (string, error) {
	if slug == "" || slug == "." || slug == ".." || strings.ContainsAny(slug, `/\\`) || strings.HasPrefix(slug, ".") {
		return "", errors.New("无效的文章目录")
	}
	root, err := filepath.Abs(app.cfg.HugoContentDir)
	if err != nil || strings.TrimSpace(app.cfg.HugoContentDir) == "" {
		return "", errors.New("未配置文章目录")
	}
	dir := filepath.Join(root, slug)
	if info, err := os.Lstat(dir); err == nil && (!info.IsDir() || info.Mode()&os.ModeSymlink != 0) {
		return "", errors.New("文章目录不是普通目录")
	} else if err != nil && !errors.Is(err, os.ErrNotExist) {
		return "", err
	}
	return dir, nil
}

func readPublication(dir string) (publicationEntry, bool, error) {
	file := filepath.Join(dir, "index.md")
	info, err := os.Lstat(file)
	if errors.Is(err, os.ErrNotExist) {
		return publicationEntry{}, false, nil
	}
	if err != nil {
		return publicationEntry{}, false, err
	}
	if !info.Mode().IsRegular() {
		return publicationEntry{}, false, errors.New("发布索引不是普通文件")
	}
	data, err := os.ReadFile(file)
	if err != nil {
		return publicationEntry{}, false, err
	}
	fm, _ := parseFrontMatter(string(data))
	// Generated front matter uses quoted scalars; decode escaped titles.
	if strings.HasPrefix(string(data), "---\n") {
		end := strings.Index(string(data[4:]), "\n---")
		if end >= 0 {
			for _, line := range strings.Split(string(data[4:4+end]), "\n") {
				k, v, ok := strings.Cut(line, ":")
				if !ok {
					continue
				}
				if value, err := strconv.Unquote(strings.TrimSpace(v)); err == nil {
					fm[strings.TrimSpace(k)] = value
				}
			}
		}
	}
	managed := fm["generated_by"] == articleGenerator && fm["article_id"] != ""
	legacy := fm["author_username"] != "" && fm["source_md_b64"] != "" && strings.HasPrefix(fm["source_md_url"], "/md-source/") && fm["account_type"] != ""
	entry := publicationEntry{Slug: filepath.Base(dir), Title: fm["title"], Author: fm["author_username"], ArticleID: fm["article_id"], Managed: managed, Fingerprint: fmt.Sprintf("%x", sha256.Sum256(data))}
	return entry, managed || legacy, nil
}

// Pre-ID output needs human review: unrelated posts can share titles/dates.
func (app *App) orphanPublications() ([]publicationEntry, error) {
	active := map[string]bool{}
	for _, a := range app.store.AllArticles() {
		active[a.Slug] = true
	}
	entries, err := os.ReadDir(app.cfg.HugoContentDir)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	result := []publicationEntry{}
	for _, item := range entries {
		if !item.IsDir() || strings.HasPrefix(item.Name(), ".") || active[item.Name()] {
			continue
		}
		dir, err := app.articleDirectory(item.Name())
		if err != nil {
			return nil, err
		}
		entry, generated, err := readPublication(dir)
		if err != nil {
			return nil, err
		}
		if generated {
			result = append(result, entry)
		}
	}
	return result, nil
}

func (app *App) archivePublication(slug string) error {
	dir, err := app.articleDirectory(slug)
	if err != nil {
		return err
	}
	if _, err := os.Stat(dir); errors.Is(err, os.ErrNotExist) {
		return nil
	} else if err != nil {
		return err
	}
	// Refuse links before copying. Private backups outside Hugo inputs also work
	// when data/ and content/ are on separate Docker volumes.
	err = filepath.WalkDir(dir, func(_ string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !entry.IsDir() && !entry.Type().IsRegular() {
			return errors.New("文章目录包含链接或特殊文件，请人工检查")
		}
		return nil
	})
	if err != nil {
		return err
	}
	backupRoot := filepath.Join(app.cfg.DataDir, "backups", "article-publication")
	if strings.TrimSpace(app.cfg.DataDir) == "" {
		return errors.New("未配置备份数据目录")
	}
	backupAbsolute, err := filepath.Abs(backupRoot)
	if err != nil {
		return err
	}
	contentAbsolute, err := filepath.Abs(app.cfg.HugoContentDir)
	if err != nil {
		return err
	}
	relative, err := filepath.Rel(contentAbsolute, backupAbsolute)
	if err != nil {
		return err
	}
	if relative == "." || (relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator))) {
		return errors.New("备份目录不能位于公开文章目录内")
	}
	if err := os.MkdirAll(backupRoot, 0700); err != nil {
		return err
	}
	backup, err := os.MkdirTemp(backupRoot, slug+"-")
	if err != nil {
		return err
	}
	err = filepath.WalkDir(dir, func(source string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(dir, source)
		if err != nil {
			return err
		}
		target := filepath.Join(backup, rel)
		if entry.IsDir() {
			return os.MkdirAll(target, 0700)
		}
		if !entry.Type().IsRegular() {
			return errors.New("文章目录在备份过程中发生变化")
		}
		data, err := os.ReadFile(source)
		if err != nil {
			return err
		}
		return os.WriteFile(target, data, 0600)
	})
	if err != nil {
		return fmt.Errorf("备份失败，原文件保留: %w", err)
	}
	return os.RemoveAll(dir) // Exact validated article directory, after full backup.
}

func (app *App) reconcileManagedPublications() error {
	entries, err := os.ReadDir(app.cfg.HugoContentDir)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	for _, item := range entries {
		if !item.IsDir() || strings.HasPrefix(item.Name(), ".") {
			continue
		}
		dir, err := app.articleDirectory(item.Name())
		if err != nil {
			return err
		}
		entry, _, err := readPublication(dir)
		if err != nil {
			return err
		}
		if !entry.Managed {
			continue
		}
		a, exists := app.store.GetArticle(entry.ArticleID)
		if exists && a.Status == stPublished && a.Slug == item.Name() {
			continue
		}
		if err := app.archivePublication(item.Name()); err != nil {
			return err
		}
	}
	return nil
}

func (app *App) handlePublicationRepair(w http.ResponseWriter, r *http.Request) {
	u, _ := app.currentUser(r)
	if !canManageArticles(u) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	if r.Method != http.MethodGet && r.Method != http.MethodPost {
		http.Error(w, "method not allowed", 405)
		return
	}
	app.articleMu.Lock()
	defer app.articleMu.Unlock()
	app.buildMu.Lock()
	entries, err := app.orphanPublications()
	if err != nil {
		app.buildMu.Unlock()
		http.Error(w, "检查发布文件失败: "+err.Error(), 500)
		return
	}
	if r.Method == http.MethodGet {
		app.buildMu.Unlock()
		app.render(w, "publication_repair.html", map[string]any{"User": u, "Entries": entries, "Workspace": "admin", "Flash": r.URL.Query().Get("msg")})
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 8192)
	if err := r.ParseForm(); err != nil {
		app.buildMu.Unlock()
		http.Error(w, "bad request", 400)
		return
	}
	matched := false
	for _, entry := range entries {
		if entry.Slug == r.FormValue("slug") && entry.Fingerprint == r.FormValue("fingerprint") && r.FormValue("confirm") == "archive" {
			matched = true
			err = app.archivePublication(entry.Slug)
			break
		}
	}
	app.buildMu.Unlock()
	if !matched {
		http.Error(w, "目录已变化或不再是残留项，请刷新后检查", http.StatusConflict)
		return
	}
	if err != nil {
		http.Error(w, "移入备份失败: "+err.Error(), 500)
		return
	}
	message := "旧发布目录已移入 data/backups/article-publication，可恢复；公开站已重建"
	if err := app.runHugo(r.Context()); err != nil {
		log.Printf("hugo build after publication repair: %v", err)
		message = "目录已备份移出，但公开站重建失败，旧页面可能仍可见，请查看服务器日志"
	}
	app.redirect(w, r, "/admin/publication-repair?msg="+urlMsg(message), http.StatusSeeOther)
}
