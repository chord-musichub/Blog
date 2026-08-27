package main

import (
	"errors"
	"sort"
	"strings"
	"time"
)

// 密码重置申请的数据读写。
func (s *Store) CreatePasswordReset(username, note string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	username = cleanUsername(username)
	u, ok := s.users[username]
	if !ok || u.Role == roleAdmin {
		return errors.New("用户不存在，或管理员账号不能走申请流程")
	}
	if u.Disabled {
		return errors.New("账号已被禁用，请直接联系管理员")
	}
	for _, req := range s.resets {
		if req.Username == username && req.Status == "pending" {
			return errors.New("已有待处理的密码申请，请等待管理员处理")
		}
	}
	now := time.Now()
	id := newID()
	s.resets[id] = PasswordResetRequest{ID: id, Username: username, Note: strings.TrimSpace(note), Status: "pending", CreatedAt: now, UpdatedAt: now}
	return s.saveLocked("password_resets.json", s.resets)
}

func (s *Store) PasswordResetRequests() []PasswordResetRequest {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]PasswordResetRequest, 0, len(s.resets))
	for _, req := range s.resets {
		out = append(out, req)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Status != out[j].Status {
			return out[i].Status == "pending"
		}
		return out[i].CreatedAt.After(out[j].CreatedAt)
	})
	return out
}

func (s *Store) ResolvePasswordReset(id, admin, action, newPassword string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	req, ok := s.resets[id]
	if !ok {
		return errors.New("申请不存在")
	}
	if req.Status != "pending" {
		return errors.New("申请已处理")
	}
	now := time.Now()
	switch action {
	case "approve":
		if len(newPassword) < 8 {
			return errors.New("临时密码至少 8 位")
		}
		u, ok := s.users[req.Username]
		if !ok {
			return errors.New("用户不存在")
		}
		h, err := HashPassword(newPassword)
		if err != nil {
			return err
		}
		u.PasswordHash = h
		u.PasswordMustChange = true
		s.users[req.Username] = u
		req.Status = "approved"
	case "reject":
		req.Status = "rejected"
	default:
		return errors.New("未知操作")
	}
	req.UpdatedAt = now
	req.ResolvedBy = admin
	s.resets[id] = req
	if err := s.saveLocked("users.json", s.users); err != nil {
		return err
	}
	return s.saveLocked("password_resets.json", s.resets)
}

func (s *Store) ClearResolvedPasswordResets() (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	removed := 0
	for id, req := range s.resets {
		if req.Status != "pending" {
			delete(s.resets, id)
			removed++
		}
	}
	return removed, s.saveLocked("password_resets.json", s.resets)
}
