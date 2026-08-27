package main

import (
	"fmt"
	"sort"
	"strings"
)

// 朋友公开资料的去重、合并与排序规则。
func friendMergeKey(f PublicFriend) string {
	if strings.TrimSpace(f.Username) != "" {
		return "u:" + strings.ToLower(strings.TrimSpace(f.Username))
	}
	if strings.TrimSpace(f.DisplayName) != "" {
		return "n:" + strings.ToLower(strings.TrimSpace(f.DisplayName))
	}
	if strings.TrimSpace(f.Slug) != "" {
		return "s:" + strings.ToLower(strings.TrimSpace(f.Slug))
	}
	return ""
}

func normalizePublicFriend(f PublicFriend) PublicFriend {
	f.Username = strings.TrimSpace(f.Username)
	f.DisplayName = strings.TrimSpace(f.DisplayName)
	if f.DisplayName == "" {
		f.DisplayName = f.Username
	}
	f.Slug = strings.TrimSpace(f.Slug)
	if f.Slug == "" {
		f.Slug = slugify(firstNonEmpty(f.DisplayName, f.Username))
	}
	if f.Slug == "" {
		f.Slug = "friend"
	}
	f.URL = strings.TrimSpace(f.URL)
	if f.URL == "" {
		f.URL = "/friends/" + f.Slug + "/"
	}
	f.Bio = strings.TrimSpace(f.Bio)
	f.Homepage = strings.TrimSpace(f.Homepage)
	f.Avatar = firstNonEmpty(strings.TrimSpace(f.Avatar), "/uploads/admin/main_logo.png")
	f.Cover = strings.TrimSpace(f.Cover)
	f.UpdatedAt = strings.TrimSpace(f.UpdatedAt)
	if f.PostTitles == nil {
		f.PostTitles = []string{}
	}
	return f
}

func mergePublicFriends(existing []PublicFriend, generated []PublicFriend) []PublicFriend {
	merged := map[string]PublicFriend{}
	order := []string{}
	put := func(f PublicFriend, preferNew bool) {
		f = normalizePublicFriend(f)
		key := friendMergeKey(f)
		if key == "" {
			return
		}
		old, ok := merged[key]
		if !ok {
			merged[key] = f
			order = append(order, key)
			return
		}
		if preferNew {
			// v20.2.3：账号资料负责更新朋友公开页资料，头像/横幅以用户资料为准。
			if strings.TrimSpace(f.Username) != "" {
				old.Username = f.Username
			}
			if strings.TrimSpace(f.DisplayName) != "" {
				old.DisplayName = f.DisplayName
			}
			if strings.TrimSpace(f.Slug) != "" {
				old.Slug = f.Slug
			}
			if strings.TrimSpace(f.URL) != "" {
				old.URL = f.URL
			}
			if strings.TrimSpace(f.Bio) != "" {
				old.Bio = f.Bio
			}
			if strings.TrimSpace(f.Homepage) != "" {
				old.Homepage = f.Homepage
			}
			if strings.TrimSpace(f.Avatar) != "" {
				old.Avatar = f.Avatar
			}
			if strings.TrimSpace(f.Cover) != "" {
				old.Cover = f.Cover
			}
			old.PostCount = f.PostCount
			old.PostTitles = f.PostTitles
			old.UpdatedAt = f.UpdatedAt
		} else {
			if strings.TrimSpace(old.Username) == "" {
				old.Username = f.Username
			}
			if strings.TrimSpace(old.DisplayName) == "" {
				old.DisplayName = f.DisplayName
			}
			if strings.TrimSpace(old.Bio) == "" {
				old.Bio = f.Bio
			}
			if strings.TrimSpace(old.Homepage) == "" {
				old.Homepage = f.Homepage
			}
			if strings.TrimSpace(old.Avatar) == "" {
				old.Avatar = f.Avatar
			}
			if strings.TrimSpace(old.Cover) == "" {
				old.Cover = f.Cover
			}
		}
		merged[key] = normalizePublicFriend(old)
	}
	for _, f := range existing {
		put(f, false)
	}
	for _, f := range generated {
		put(f, true)
	}

	usedSlugs := map[string]int{}
	out := []PublicFriend{}
	for _, key := range order {
		f := normalizePublicFriend(merged[key])
		base := slugify(firstNonEmpty(f.Slug, f.DisplayName, f.Username))
		if base == "" {
			base = "friend"
		}
		if n := usedSlugs[base]; n > 0 {
			usedSlugs[base] = n + 1
			f.Slug = fmt.Sprintf("%s-%d", base, n+1)
		} else {
			usedSlugs[base] = 1
			f.Slug = base
		}
		f.URL = "/friends/" + f.Slug + "/"
		out = append(out, f)
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].PostCount != out[j].PostCount {
			return out[i].PostCount > out[j].PostCount
		}
		return strings.ToLower(out[i].DisplayName) < strings.ToLower(out[j].DisplayName)
	})
	return out
}
