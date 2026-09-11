package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"path/filepath"
	"sort"
	"strings"
	"time"
	"unicode/utf8"
)

const (
	messageRequestMaxBytes int64 = 8 * 1024
	maxStoredMessages            = 240
)

// MessageRecord 是公开留言板的持久化记录。QQ 号只用于在提交时取得展示资料，
// 不写入记录，避免把不必要的个人标识长期保存在数据文件中。
type MessageRecord struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Content   string `json:"content"`
	Avatar    string `json:"avatar,omitempty"`
	CreatedAt string `json:"created_at"`
}

type messageRequest struct {
	QQ      string `json:"qq"`
	Name    string `json:"name"`
	Content string `json:"content"`
}

func (app *App) messagesPath() string {
	return filepath.Join(app.cfg.DataDir, "messages.json")
}

// 调用方必须持有 messagesMu。
func (app *App) loadMessages() []MessageRecord {
	if app.messagesCache != nil {
		return cloneMessageRecords(app.messagesCache)
	}
	var records []MessageRecord
	if err := readJSONFile(app.messagesPath(), &records); err != nil {
		log.Printf("load messages error: %v", err)
	}
	records = normalizeMessages(records)
	app.messagesCache = cloneMessageRecords(records)
	return cloneMessageRecords(records)
}

// 调用方必须持有 messagesMu。
func (app *App) saveMessages(records []MessageRecord) error {
	cleaned := normalizeMessages(records)
	if err := writeJSONFile(app.messagesPath(), cleaned, 0600); err != nil {
		return err
	}
	app.messagesCache = cloneMessageRecords(cleaned)
	return nil
}

// adminMessages is deliberately separate from the public API path so the
// administration screen never has to fetch its own data through a browser
// request.
func (app *App) adminMessages() []MessageRecord {
	app.messagesMu.Lock()
	defer app.messagesMu.Unlock()
	return app.loadMessages()
}

func (app *App) deleteMessage(id string) error {
	id = strings.TrimSpace(id)
	if id == "" {
		return fmt.Errorf("留言不存在")
	}
	app.messagesMu.Lock()
	defer app.messagesMu.Unlock()
	records := app.loadMessages()
	kept := make([]MessageRecord, 0, len(records))
	found := false
	for _, record := range records {
		if record.ID == id {
			found = true
			continue
		}
		kept = append(kept, record)
	}
	if !found {
		return fmt.Errorf("留言不存在")
	}
	return app.saveMessages(kept)
}

func (app *App) handleMessagesAPI(w http.ResponseWriter, r *http.Request) {
	if !app.allowPublicCORS(w, r) {
		http.Error(w, "forbidden origin", http.StatusForbidden)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	switch r.Method {
	case http.MethodGet:
		app.messagesMu.Lock()
		messages := app.loadMessages()
		app.messagesMu.Unlock()
		writeMessagesJSON(w, messages, http.StatusOK)
	case http.MethodPost:
		if !app.allowMessageSubmission(r) {
			writeMessageError(w, "提交过于频繁，请稍后再试", http.StatusTooManyRequests)
			return
		}
		var req messageRequest
		if err := decodeJSONBody(http.MaxBytesReader(w, r.Body, messageRequestMaxBytes), messageRequestMaxBytes, &req); err != nil {
			writeMessageError(w, "留言格式不正确", http.StatusBadRequest)
			return
		}
		message, err := newMessageRecord(req)
		if err != nil {
			writeMessageError(w, err.Error(), http.StatusBadRequest)
			return
		}
		app.messagesMu.Lock()
		messages := append(app.loadMessages(), message)
		if err := app.saveMessages(messages); err != nil {
			app.messagesMu.Unlock()
			log.Printf("save message error: %v", err)
			writeMessageError(w, "保存失败，请稍后重试", http.StatusInternalServerError)
			return
		}
		messages = app.loadMessages()
		app.messagesMu.Unlock()
		writeMessagesJSON(w, messages, http.StatusCreated)
	default:
		w.Header().Set("Allow", "GET, POST")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (app *App) allowMessageSubmission(r *http.Request) bool {
	key := strings.TrimSpace(r.RemoteAddr)
	if host, _, err := net.SplitHostPort(key); err == nil && host != "" {
		key = host
	}
	return app.limiter.Allow("messages:"+key, 3, 10*time.Minute)
}

func writeMessagesJSON(w http.ResponseWriter, messages []MessageRecord, status int) {
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{"messages": messages, "count": len(messages)})
}

func writeMessageError(w http.ResponseWriter, message string, status int) {
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": message})
}

func newMessageRecord(req messageRequest) (MessageRecord, error) {
	qq := strings.TrimSpace(req.QQ)
	if qq != "" && !validQQ(qq) {
		return MessageRecord{}, fmt.Errorf("QQ 号格式不正确")
	}
	name := cleanMessageText(req.Name, 32)
	content := cleanMessageText(req.Content, 1000)
	if content == "" {
		return MessageRecord{}, fmt.Errorf("请写下留言内容")
	}

	profileName, avatar := resolveQQProfile(qq)
	if name == "" {
		name = profileName
	}
	if name == "" {
		if qq != "" {
			// 公开资料源不可用时仍以用户主动输入的 QQ 号作为稳定回退。
			name = qq
		} else {
			name = "匿名"
		}
	}
	if qq == "" {
		avatar = "/media/users/user-null.png"
	}
	now := time.Now().UTC()
	return MessageRecord{
		ID:        fmt.Sprintf("m-%d", now.UnixNano()),
		Name:      name,
		Content:   content,
		Avatar:    avatar,
		CreatedAt: now.Format(time.RFC3339),
	}, nil
}

func validQQ(value string) bool {
	if len(value) < 5 || len(value) > 12 {
		return false
	}
	for _, r := range value {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

func cleanMessageText(value string, maxRunes int) string {
	value = strings.TrimSpace(strings.ReplaceAll(value, "\r\n", "\n"))
	if value == "" || utf8.RuneCountInString(value) > maxRunes {
		return ""
	}
	return value
}

func normalizeMessages(records []MessageRecord) []MessageRecord {
	cleaned := make([]MessageRecord, 0, len(records))
	for _, item := range records {
		item.Name = cleanMessageText(item.Name, 32)
		item.Content = cleanMessageText(item.Content, 1000)
		if item.ID == "" || item.Name == "" || item.Content == "" {
			continue
		}
		if _, err := time.Parse(time.RFC3339, item.CreatedAt); err != nil {
			continue
		}
		cleaned = append(cleaned, item)
	}
	sort.SliceStable(cleaned, func(i, j int) bool { return cleaned[i].CreatedAt > cleaned[j].CreatedAt })
	if len(cleaned) > maxStoredMessages {
		cleaned = cleaned[:maxStoredMessages]
	}
	return cleaned
}

func cloneMessageRecords(records []MessageRecord) []MessageRecord {
	cloned := make([]MessageRecord, len(records))
	copy(cloned, records)
	return cloned
}

// QQ 头像通过 qlogo 的公开地址提供；昵称则尽力读取公开资料，失败时安全回退为 QQ 用户。
func resolveQQProfile(qq string) (string, string) {
	if qq == "" {
		return "", ""
	}
	avatar := "https://q1.qlogo.cn/g?b=qq&nk=" + url.QueryEscape(qq) + "&s=100"
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://r.qzone.qq.com/fcg-bin/cgi_get_portrait.fcg?uins="+url.QueryEscape(qq), nil)
	if err != nil {
		return "", avatar
	}
	resp, err := (&http.Client{Timeout: 2 * time.Second}).Do(req)
	if err != nil {
		return "", avatar
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", avatar
	}
	var payload map[string][]any
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
	if err != nil {
		return "", avatar
	}
	start := strings.IndexByte(string(raw), '{')
	end := strings.LastIndexByte(string(raw), '}')
	if start < 0 || end <= start || json.Unmarshal(raw[start:end+1], &payload) != nil {
		return "", avatar
	}
	if fields, ok := payload[qq]; ok && len(fields) > 1 {
		if name, ok := fields[1].(string); ok {
			return cleanMessageText(name, 32), avatar
		}
	}
	return "", avatar
}
