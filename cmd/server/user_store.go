package main

import (
	"errors"
	"sort"
	"strings"
	"time"
)

// 用户账户相关的数据读写。
// EnsureAdmin 保留旧函数名，保证环境变量 ADMIN_USER 是系统管理员。
// 站主优先依据历史 account_type=owner 识别：这是原后台中“站长 / 主账号”
// 的既有语义。只有旧数据里完全没有主账号时，才把 ADMIN_USER 兜底升级为站主。
func (s *Store) EnsureAdmin(username, password string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	username = cleanUsername(username)
	if username == "" {
		return errors.New("ADMIN_USER must be configured before creating the initial administrator")
	}
	ownerUsername := ""
	for key, existing := range s.users {
		if key == username {
			continue
		}
		if existing.Role == roleOwner || normalizeAccountType(existing.Role, existing.AccountType) == accountOwner {
			ownerUsername = key
			break
		}
	}
	if ownerUsername == "" {
		if existing, ok := s.users[username]; ok && (existing.Role == roleOwner || normalizeAccountType(existing.Role, existing.AccountType) == accountOwner) {
			ownerUsername = username
		}
	}
	changed := false
	for key, existing := range s.users {
		previousRole := existing.Role
		previousType := existing.AccountType
		if key == ownerUsername {
			existing.Role = roleOwner
			existing.AccountType = accountOwner
		} else if key == username {
			existing.Role = roleAdmin
			existing.AccountType = accountSystem
		} else {
			existing.Role = normalizeRole(existing.Role)
			existing.AccountType = normalizeAccountType(existing.Role, existing.AccountType)
		}
		if existing.Role != previousRole || existing.AccountType != previousType {
			changed = true
		}
		s.users[key] = existing
	}
	if _, ok := s.users[username]; ok {
		u := s.users[username]
		// 本地环境配置是初始管理员的唯一权威来源。
		// 这样 .env 中的密码修改会在每次重启后生效，其他用户仍由应用数据存储管理。
		if VerifyPassword(password, u.PasswordHash) {
			if changed {
				return s.saveLocked("users.json", s.users)
			}
			return nil
		}
		h, err := HashPassword(password)
		if err != nil {
			return err
		}
		u.PasswordHash = h
		if ownerUsername == username {
			u.Role = roleOwner
			u.AccountType = accountOwner
		} else {
			u.Role = roleAdmin
			u.AccountType = accountSystem
		}
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
	s.users[username] = User{Username: username, DisplayName: username, Role: roleOwner, AccountType: accountOwner, Avatar: defaultUserAvatar, PasswordHash: h, CreatedAt: time.Now(), ShowInFriends: false}
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
	role = normalizeRole(role)
	if role == roleOwner {
		return errors.New("站主由 ADMIN_USER 环境配置指定，不能在后台重复创建")
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
	s.users[username] = User{Username: username, DisplayName: strings.TrimSpace(displayName), Role: role, AccountType: accountType, Avatar: defaultUserAvatar, ShowInFriends: showInFriends, PasswordHash: h, CreatedAt: time.Now(), PasswordMustChange: role != roleOwner}
	return s.saveLocked("users.json", s.users)
}

func (s *Store) GetUser(username string) (User, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	u, ok := s.users[username]
	if ok {
		u.Role = normalizeRole(u.Role)
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
		u.Role = normalizeRole(u.Role)
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
	if isOwner(u) {
		return errors.New("不能禁用站主")
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
	if isOwner(u) {
		return errors.New("不能删除站主")
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
