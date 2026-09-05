package main

import (
	"errors"
	"sort"
	"strings"
	"time"
)

// 用户账户相关的数据读写。
func (s *Store) EnsureAdmin(username, password string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	username = cleanUsername(username)
	if username == "" {
		return errors.New("ADMIN_USER must be configured before creating the initial administrator")
	}
	if _, ok := s.users[username]; ok {
		u := s.users[username]
		if u.Role != roleAdmin {
			return errors.New("ADMIN_USER already belongs to a non-admin account; choose a different username or resolve the account conflict")
		}
		// 本地环境配置是初始管理员的唯一权威来源。
		// 这样 .env 中的密码修改会在每次重启后生效，其他用户仍由应用数据存储管理。
		if VerifyPassword(password, u.PasswordHash) {
			return nil
		}
		h, err := HashPassword(password)
		if err != nil {
			return err
		}
		u.PasswordHash = h
		u.PasswordMustChange = false
		s.users[username] = u
		return s.saveLocked("users.json", s.users)
	}
	if password == "" {
		return errors.New("ADMIN_PASS must be configured before creating the initial administrator")
	}
	h, err := HashPassword(password)
	if err != nil {
		return err
	}
	s.users[username] = User{Username: username, DisplayName: "站点公告", Role: roleAdmin, AccountType: accountSystem, PasswordHash: h, CreatedAt: time.Now(), ShowInFriends: false}
	return s.saveLocked("users.json", s.users)
}

func (s *Store) CreateUser(username, displayName, role, accountType, password string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	username = cleanUsername(username)
	if username == "" {
		return errors.New("用户名只能包含字母、数字、下划线和短横线")
	}
	if len(password) < 6 {
		return errors.New("密码至少 6 位")
	}
	if _, ok := s.users[username]; ok {
		return errors.New("用户已经存在")
	}
	if role != roleAdmin {
		role = roleAuthor
	}
	accountType = normalizeAccountType(role, accountType)
	if strings.TrimSpace(displayName) == "" {
		if accountType == accountSystem {
			displayName = "站点公告"
		} else {
			displayName = username
		}
	}
	h, err := HashPassword(password)
	if err != nil {
		return err
	}
	showInFriends := accountType == accountFriend
	s.users[username] = User{Username: username, DisplayName: strings.TrimSpace(displayName), Role: role, AccountType: accountType, Avatar: defaultUserAvatar, ShowInFriends: showInFriends, PasswordHash: h, CreatedAt: time.Now(), PasswordMustChange: role != roleAdmin}
	return s.saveLocked("users.json", s.users)
}

func (s *Store) GetUser(username string) (User, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	u, ok := s.users[username]
	if ok {
		u.AccountType = normalizeAccountType(u.Role, u.AccountType)
		if u.DisplayName == "" {
			u.DisplayName = u.Username
		}
		u.Avatar = normalizeUserAvatar(u.Avatar)
	}
	return u, ok
}

func (s *Store) Users() []User {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]User, 0, len(s.users))
	for _, u := range s.users {
		u.AccountType = normalizeAccountType(u.Role, u.AccountType)
		if u.DisplayName == "" {
			u.DisplayName = u.Username
		}
		u.Avatar = normalizeUserAvatar(u.Avatar)
		out = append(out, u)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.Before(out[j].CreatedAt) })
	return out
}

func (s *Store) ToggleUser(username string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	u, ok := s.users[username]
	if !ok {
		return errors.New("用户不存在")
	}
	if u.Role == roleAdmin {
		return errors.New("不能禁用管理员")
	}
	u.Disabled = !u.Disabled
	s.users[username] = u
	return s.saveLocked("users.json", s.users)
}

func (s *Store) ResetPassword(username, password string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	u, ok := s.users[username]
	if !ok {
		return errors.New("用户不存在")
	}
	if len(password) < 6 {
		return errors.New("密码至少 6 位")
	}
	h, err := HashPassword(password)
	if err != nil {
		return err
	}
	u.PasswordHash = h
	u.PasswordMustChange = true
	s.users[username] = u
	return s.saveLocked("users.json", s.users)
}

func (s *Store) DeleteUser(username string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	u, ok := s.users[username]
	if !ok {
		return errors.New("用户不存在")
	}
	if u.Role == roleAdmin {
		return errors.New("不能删除管理员")
	}
	for _, a := range s.articles {
		if a.Author == username && a.Status != stDeleted {
			return errors.New("该用户还有文章，请先删除文章或改用禁用")
		}
	}
	delete(s.users, username)
	return s.saveLocked("users.json", s.users)
}

func (s *Store) SaveOwnProfile(username, displayName, bio, homepage, avatar, cover string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	u, ok := s.users[username]
	if !ok {
		return errors.New("用户不存在")
	}
	displayName = strings.TrimSpace(displayName)
	if displayName == "" {
		displayName = u.Username
	}
	u.DisplayName = displayName
	u.Bio = strings.TrimSpace(bio)
	u.Homepage = normalizeContactHref(homepage, "")
	u.Avatar = normalizeUserAvatar(cleanAssetPath(avatar))
	u.Cover = cleanAssetPath(cover)
	s.users[username] = u
	return s.saveLocked("users.json", s.users)
}

func (s *Store) ChangeOwnPassword(username, oldPassword, newPassword string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	u, ok := s.users[username]
	if !ok {
		return errors.New("用户不存在")
	}
	if !VerifyPassword(oldPassword, u.PasswordHash) {
		return errors.New("旧密码不正确")
	}
	if len(newPassword) < 8 {
		return errors.New("新密码至少 8 位")
	}
	h, err := HashPassword(newPassword)
	if err != nil {
		return err
	}
	u.PasswordHash = h
	u.PasswordMustChange = false
	s.users[username] = u
	return s.saveLocked("users.json", s.users)
}
