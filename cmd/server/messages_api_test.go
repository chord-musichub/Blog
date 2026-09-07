package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
)

func TestMessagesAPIStoresAndReadsMessage(t *testing.T) {
	app := &App{
		cfg:     Config{DataDir: t.TempDir()},
		limiter: NewLimiter(),
	}
	handler := app.router()
	body := bytes.NewBufferString(`{"name":"测试访客","content":"**你好**"}`)
	post := httptest.NewRequest(http.MethodPost, "/api/messages", body)
	post.RemoteAddr = "127.0.0.1:39001"
	post.Header.Set("Content-Type", "application/json")
	postResult := httptest.NewRecorder()
	handler.ServeHTTP(postResult, post)
	if postResult.Code != http.StatusCreated {
		t.Fatalf("POST status = %d, body = %s", postResult.Code, postResult.Body.String())
	}
	var created struct {
		Messages []MessageRecord `json:"messages"`
	}
	if err := json.NewDecoder(postResult.Body).Decode(&created); err != nil {
		t.Fatal(err)
	}
	if len(created.Messages) != 1 || created.Messages[0].Name != "测试访客" || created.Messages[0].Content != "**你好**" {
		t.Fatalf("unexpected saved message: %#v", created.Messages)
	}

	getResult := httptest.NewRecorder()
	handler.ServeHTTP(getResult, httptest.NewRequest(http.MethodGet, "/api/messages", nil))
	if getResult.Code != http.StatusOK {
		t.Fatalf("GET status = %d", getResult.Code)
	}
	var loaded struct {
		Messages []MessageRecord `json:"messages"`
	}
	if err := json.NewDecoder(getResult.Body).Decode(&loaded); err != nil {
		t.Fatal(err)
	}
	if len(loaded.Messages) != 1 || loaded.Messages[0].ID == "" {
		t.Fatalf("unexpected GET response: %#v", loaded.Messages)
	}
	if _, err := os.Stat(app.messagesPath()); err != nil {
		t.Fatalf("message data was not persisted: %v", err)
	}
}

func TestMessagesAPIAcceptsAnonymousMessageAndRejectsEmptyContent(t *testing.T) {
	app := &App{cfg: Config{DataDir: t.TempDir()}, limiter: NewLimiter()}
	valid := httptest.NewRequest(http.MethodPost, "/api/messages", bytes.NewBufferString(`{"content":"匿名留言"}`))
	valid.RemoteAddr = "127.0.0.1:39002"
	validResponse := httptest.NewRecorder()
	app.router().ServeHTTP(validResponse, valid)
	if validResponse.Code != http.StatusCreated {
		t.Fatalf("anonymous status = %d, body = %s", validResponse.Code, validResponse.Body.String())
	}
	var created struct {
		Messages []MessageRecord `json:"messages"`
	}
	if err := json.NewDecoder(validResponse.Body).Decode(&created); err != nil {
		t.Fatal(err)
	}
	if len(created.Messages) != 1 || created.Messages[0].Name != "匿名" || created.Messages[0].Avatar != "/media/users/user-null.png" {
		t.Fatalf("unexpected anonymous message: %#v", created.Messages)
	}

	request := httptest.NewRequest(http.MethodPost, "/api/messages", bytes.NewBufferString(`{"content":""}`))
	request.RemoteAddr = "127.0.0.1:39003"
	response := httptest.NewRecorder()
	app.router().ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusBadRequest)
	}
}
