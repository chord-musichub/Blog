package main

import "time"

// User 是后台账号及其公开个人资料。
type User struct {
	Username           string    `json:"username"`
	DisplayName        string    `json:"display_name"`
	Role               string    `json:"role"`
	AccountType        string    `json:"account_type,omitempty"`
	Bio                string    `json:"bio,omitempty"`
	Homepage           string    `json:"homepage,omitempty"`
	Avatar             string    `json:"avatar,omitempty"`
	Cover              string    `json:"cover,omitempty"`
	ShowInFriends      bool      `json:"show_in_friends,omitempty"`
	PasswordHash       string    `json:"password_hash"`
	CreatedAt          time.Time `json:"created_at"`
	Disabled           bool      `json:"disabled,omitempty"`
	PasswordMustChange bool      `json:"password_must_change,omitempty"`
}

// PasswordResetRequest 记录用户提交给管理员的密码重置申请。
type PasswordResetRequest struct {
	ID         string    `json:"id"`
	Username   string    `json:"username"`
	Note       string    `json:"note,omitempty"`
	Status     string    `json:"status"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
	ResolvedBy string    `json:"resolved_by,omitempty"`
}
