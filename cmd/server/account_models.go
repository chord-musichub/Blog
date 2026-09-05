package main

import (
	"strings"
	"time"
)

// defaultUserAvatar 用于未上传头像的普通用户；站点 Logo 仍独立由站点设置控制。
const defaultUserAvatar = "/media/users/user-null.png"
const legacyDefaultUserAvatar = "/uploads/admin/main_logo.png"

// normalizeUserAvatar 兼容旧数据：此前空头像会被写成站点 Logo，
// 因此需要在构建朋友页时将这类历史默认值一并迁移。
func normalizeUserAvatar(value string) string {
	value = strings.TrimSpace(value)
	if value == "" || value == legacyDefaultUserAvatar {
		return defaultUserAvatar
	}
	return value
}

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

func normalizeAccountType(role, accountType string) string {
	accountType = strings.TrimSpace(accountType)
	switch accountType {
	case accountSystem, accountOwner, accountFriend:
		return accountType
	}
	if role == roleAdmin {
		return accountSystem
	}
	return accountFriend
}

func accountTypeText(t string) string {
	switch normalizeAccountType("", t) {
	case accountSystem:
		return "系统账号 / 公告"
	case accountOwner:
		return "站长 / 主账号"
	default:
		return "朋友作者"
	}
}

func isSystemAccount(t string) bool {
	return normalizeAccountType("", t) == accountSystem
}
