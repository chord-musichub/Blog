package main

import (
	"testing"
	"time"
)

func TestEnsureAdminMigratesLegacyRolesToOwnerAdminAndUser(t *testing.T) {
	store := &Store{dataDir: t.TempDir(), users: map[string]User{}, articles: map[string]Article{}, resets: map[string]PasswordResetRequest{}}
	ownerHash, err := HashPassword("owner-pass")
	if err != nil {
		t.Fatal(err)
	}
	adminHash, err := HashPassword("admin-pass")
	if err != nil {
		t.Fatal(err)
	}
	store.users["admin"] = User{Username: "admin", Role: roleAdmin, AccountType: accountSystem, PasswordHash: adminHash, CreatedAt: time.Now()}
	store.users["songline"] = User{Username: "songline", Role: roleAuthor, AccountType: accountOwner, PasswordHash: ownerHash, CreatedAt: time.Now()}
	store.users["reviewer"] = User{Username: "reviewer", Role: roleAdmin, AccountType: accountSystem, PasswordHash: adminHash, CreatedAt: time.Now()}
	store.users["writer"] = User{Username: "writer", Role: roleAuthor, AccountType: accountFriend, PasswordHash: adminHash, CreatedAt: time.Now()}

	if err := store.EnsureAdmin("admin", "admin-pass"); err != nil {
		t.Fatal(err)
	}
	owner, _ := store.GetUser("songline")
	configuredAdmin, _ := store.GetUser("admin")
	admin, _ := store.GetUser("reviewer")
	user, _ := store.GetUser("writer")
	if !isOwner(owner) || !canManageArticles(owner) || canModerate(owner) {
		t.Fatalf("configured account should be owner: %+v", owner)
	}
	if normalizeRole(configuredAdmin.Role) != roleAdmin || isOwner(configuredAdmin) {
		t.Fatalf("ADMIN_USER should remain system administrator when an owner exists: %+v", configuredAdmin)
	}
	if normalizeRole(admin.Role) != roleAdmin || !canModerate(admin) || isOwner(admin) {
		t.Fatalf("other legacy admin should remain moderator: %+v", admin)
	}
	if normalizeRole(user.Role) != roleUser || canModerate(user) {
		t.Fatalf("legacy author should become normal user: %+v", user)
	}
}

func TestNormalUserCannotBeCreatedAsOwner(t *testing.T) {
	store := &Store{dataDir: t.TempDir(), users: map[string]User{}, articles: map[string]Article{}, resets: map[string]PasswordResetRequest{}}
	if err := store.CreateUser("second-owner", "Second", roleOwner, accountOwner, "secret1"); err == nil {
		t.Fatal("creating a second owner should fail")
	}
	if err := store.CreateUser("reader", "Reader", roleUser, accountFriend, "secret1"); err != nil {
		t.Fatalf("creating normal user failed: %v", err)
	}
}
