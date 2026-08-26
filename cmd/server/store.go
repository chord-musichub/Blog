package main

import (
	"errors"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// Store 是后台运行时数据的唯一读写入口。
// 它将用户、文章和密码申请的持久化策略集中管理，避免路由层直接触碰 JSON 文件。

func NewStore(dataDir string) (*Store, error) {
	s := &Store{dataDir: dataDir, users: map[string]User{}, articles: map[string]Article{}, resets: map[string]PasswordResetRequest{}}
	if err := s.load("users.json", &s.users); err != nil {
		return nil, err
	}
	if err := s.load("articles.json", &s.articles); err != nil {
		return nil, err
	}
	if err := s.load("password_resets.json", &s.resets); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *Store) load(name string, v any) error {
	return readJSONFile(filepath.Join(s.dataDir, name), v)
}

func (s *Store) saveLocked(name string, v any) error {
	return writeJSONFile(filepath.Join(s.dataDir, name), v, 0600)
}

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
	s.users[username] = User{Username: username, DisplayName: strings.TrimSpace(displayName), Role: role, AccountType: accountType, ShowInFriends: showInFriends, PasswordHash: h, CreatedAt: time.Now(), PasswordMustChange: role != roleAdmin}
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
		out = append(out, u)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.Before(out[j].CreatedAt) })
	return out
}

func (s *Store) AllArticles() []Article {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]Article, 0, len(s.articles))
	for _, a := range s.articles {
		if a.Status == stDeleted {
			continue
		}
		out = append(out, a)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].UpdatedAt.After(out[j].UpdatedAt) })
	return out
}

func (s *Store) ArticlesByStatus(status string) []Article {
	all := s.AllArticles()
	out := []Article{}
	for _, a := range all {
		if a.Status == status {
			out = append(out, a)
		}
	}
	return out
}

func (s *Store) ArticlesExceptStatus(status string) []Article {
	all := s.AllArticles()
	out := []Article{}
	for _, a := range all {
		if a.Status != status {
			out = append(out, a)
		}
	}
	return out
}

func (s *Store) ArticlesByAuthor(author string) []Article {
	all := s.AllArticles()
	out := []Article{}
	for _, a := range all {
		if a.Author == author {
			out = append(out, a)
		}
	}
	return out
}

func (s *Store) GetArticle(id string) (Article, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	a, ok := s.articles[id]
	return a, ok
}

func (s *Store) SaveArticle(a Article) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now()
	if a.ID == "" {
		a.ID = newID()
		a.CreatedAt = now
	}
	if a.Status == "" {
		a.Status = stDraft
	}
	a.UpdatedAt = now
	s.articles[a.ID] = a
	return s.saveLocked("articles.json", s.articles)
}

func (s *Store) SlugExists(slug, exceptID string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	for id, a := range s.articles {
		if id != exceptID && a.Status != stDeleted && a.Slug == slug {
			return true
		}
	}
	return false
}

func (s *Store) DeleteArticle(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.articles[id]; !ok {
		return errors.New("文章不存在")
	}
	delete(s.articles, id)
	return s.saveLocked("articles.json", s.articles)
}

func (s *Store) DeleteArticlesByStatus(statuses ...string) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	set := map[string]bool{}
	for _, st := range statuses {
		set[st] = true
	}
	removed := 0
	for id, a := range s.articles {
		if set[a.Status] {
			delete(s.articles, id)
			removed++
		}
	}
	return removed, s.saveLocked("articles.json", s.articles)
}

func (s *Store) DeleteAllArticles() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.articles = map[string]Article{}
	return s.saveLocked("articles.json", s.articles)
}

func (s *Store) ArticleCountByAuthor(username string) int {
	s.mu.Lock()
	defer s.mu.Unlock()
	count := 0
	for _, a := range s.articles {
		if a.Author == username && a.Status != stDeleted {
			count++
		}
	}
	return count
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
	u.Avatar = cleanAssetPath(avatar)
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
