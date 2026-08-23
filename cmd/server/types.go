package main

import (
	"html/template"
	"sync"
	"time"
)

const (
	roleAdmin  = "admin"
	roleAuthor = "author"

	accountSystem = "system"
	accountOwner  = "owner"
	accountFriend = "friend"

	stDraft     = "draft"
	stPending   = "pending"
	stPublished = "published"
	stRejected  = "rejected"
	stDeleted   = "deleted"

	scoreRequestMaxBytes     int64 = 4 * 1024
	maxAcceptedGameScore           = 9_999_999
	passwordPBKDF2Iterations       = 120_000
	passwordHashBytes              = 32
)

type Config struct {
	Addr              string
	DataDir           string
	HugoContentDir    string
	PublicDir         string
	HugoCommand       string
	SessionSecret     string
	AdminUser         string
	AdminPass         string
	AdminBasePath     string
	PublicBaseURL     string
	PublicSiteURL     string
	PublicAPIURL      string
	PublicCORSOrigins string
	HugoBuildTimeout  time.Duration
	MaxUploadBytes    int64
}

type App struct {
	cfg       Config
	store     *Store
	tpl       *template.Template
	limiter   *Limiter
	startedAt time.Time
	buildMu   sync.Mutex
}

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

type SnakeScoreRecord struct {
	Score       int    `json:"score"`
	CreatedAt   string `json:"created_at"`
	PlayerID    string `json:"player_id,omitempty"`
	Username    string `json:"username,omitempty"`
	DisplayName string `json:"display_name,omitempty"`
	Mode        string `json:"mode,omitempty"`
	ArticleID   string `json:"article_id,omitempty"`
}

type snakeScoreRequest struct {
	Score     int    `json:"score"`
	PlayerID  string `json:"player_id,omitempty"`
	Mode      string `json:"mode,omitempty"`
	ArticleID string `json:"article_id,omitempty"`
}

type PublicFriend struct {
	Username    string   `json:"username"`
	DisplayName string   `json:"display_name"`
	Slug        string   `json:"slug"`
	URL         string   `json:"url"`
	Bio         string   `json:"bio,omitempty"`
	Homepage    string   `json:"homepage,omitempty"`
	Avatar      string   `json:"avatar,omitempty"`
	Cover       string   `json:"cover,omitempty"`
	PostCount   int      `json:"post_count"`
	PostTitles  []string `json:"post_titles,omitempty"`
	UpdatedAt   string   `json:"updated_at,omitempty"`
}

type Article struct {
	ID          string     `json:"id"`
	Title       string     `json:"title"`
	Slug        string     `json:"slug"`
	Author      string     `json:"author"`
	Tags        []string   `json:"tags"`
	Summary     string     `json:"summary"`
	Cover       string     `json:"cover,omitempty"`
	CoverMode   string     `json:"cover_mode,omitempty"`
	Body        string     `json:"body"`
	SourceMD    string     `json:"source_md,omitempty"`
	Status      string     `json:"status"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
	PublishedAt *time.Time `json:"published_at,omitempty"`
	RejectedAt  *time.Time `json:"rejected_at,omitempty"`
	RejectNote  string     `json:"reject_note,omitempty"`
}

type PasswordResetRequest struct {
	ID         string    `json:"id"`
	Username   string    `json:"username"`
	Note       string    `json:"note,omitempty"`
	Status     string    `json:"status"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
	ResolvedBy string    `json:"resolved_by,omitempty"`
}

type SiteSettings struct {
	Site         SiteBasic          `json:"site"`
	Home         HomeSettings       `json:"home"`
	Pages        PageSettings       `json:"pages"`
	Boot         BootSettings       `json:"boot"`
	Orbit        OrbitSettings      `json:"orbit"`
	Manuscript   ManuscriptSettings `json:"manuscript"`
	Background   BackgroundSettings `json:"background"`
	AboutCard    AboutCard          `json:"about_card"`
	Social       SocialSettings     `json:"social"`
	ContentAreas []ContentArea      `json:"content_areas"`
}

type SiteBasic struct {
	Title            string `json:"title"`
	DisplayName      string `json:"display_name"`
	FooterText       string `json:"footer_text"`
	ICP              string `json:"icp"`
	Logo             string `json:"logo"`
	LogoIcon         string `json:"logo_icon"`
	Favicon          string `json:"favicon"`
	EnableDarkToggle bool   `json:"enable_dark_toggle"`
}

type HomeSettings struct {
	HeroTitle        string `json:"hero_title"`
	HeroSubtitle     string `json:"hero_subtitle"`
	HeroImage        string `json:"hero_image"`
	IntroTitle       string `json:"intro_title"`
	IntroBody        string `json:"intro_body"`
	FoundedAt        string `json:"founded_at"`
	RecommendedCount int    `json:"recommended_count"`
}

type PageSettings struct {
	PostsHeroTitle      string `json:"posts_hero_title"`
	PostsHeroSubtitle   string `json:"posts_hero_subtitle"`
	PostsHeroImage      string `json:"posts_hero_image"`
	TagsHeroTitle       string `json:"tags_hero_title"`
	TagsHeroSubtitle    string `json:"tags_hero_subtitle"`
	TagsHeroImage       string `json:"tags_hero_image"`
	FriendsHeroTitle    string `json:"friends_hero_title"`
	FriendsHeroSubtitle string `json:"friends_hero_subtitle"`
	FriendsHeroImage    string `json:"friends_hero_image"`
	ArticleDefaultCover string `json:"article_default_cover"`
	TagDefaultCover     string `json:"tag_default_cover"`
	FriendDefaultCover  string `json:"friend_default_cover"`
	ToolsHeroTitle      string `json:"tools_hero_title"`
	ToolsHeroSubtitle   string `json:"tools_hero_subtitle"`
}

type BootSettings struct {
	WelcomeText string `json:"welcome_text"`
}

type OrbitEntry struct {
	Label       string `json:"label"`
	Kicker      string `json:"kicker"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Href        string `json:"href"`
	LinkText    string `json:"link_text"`
}

type OrbitSettings struct {
	Title   string     `json:"title"`
	Posts   OrbitEntry `json:"posts"`
	Tags    OrbitEntry `json:"tags"`
	Friends OrbitEntry `json:"friends"`
	Tools   OrbitEntry `json:"tools"`
	Notice  OrbitEntry `json:"notice"`
	About   OrbitEntry `json:"about"`
}

type ManuscriptSettings struct {
	DefaultSummary string `json:"default_summary"`
}

type BackgroundSettings struct {
	Image   string `json:"image"`
	Height  string `json:"height"`
	Blur    string `json:"blur"`
	Opacity string `json:"opacity"`
}

type AboutCard struct {
	Title       string `json:"title"`
	AvatarText  string `json:"avatar_text"`
	AvatarImage string `json:"avatar_image"`
	Name        string `json:"name"`
	Body        string `json:"body"`
}

type SocialSettings struct {
	GitHub       string `json:"github"`
	Email        string `json:"email"`
	Bilibili     string `json:"bilibili"`
	ShowGitHub   bool   `json:"show_github"`
	ShowEmail    bool   `json:"show_email"`
	ShowBilibili bool   `json:"show_bilibili"`
	BilibiliIcon string `json:"bilibili_icon"`
}

type ContentArea struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	Icon        string `json:"icon"`
	Link        string `json:"link"`
}

type ThemeSettings struct {
	Preset       string `json:"preset"`
	Accent       string `json:"accent"`
	Accent2      string `json:"accent_2"`
	Background   string `json:"background"`
	Panel        string `json:"panel"`
	Text         string `json:"text"`
	Muted        string `json:"muted"`
	Radius       string `json:"radius"`
	Shadow       string `json:"shadow"`
	MaxWidth     string `json:"max_width"`
	HeroHeight   string `json:"hero_height"`
	ContentWidth string `json:"content_width"`
	BodyFontSize string `json:"body_font_size"`
	Watercolor   bool   `json:"watercolor"`
}

type Store struct {
	mu       sync.Mutex
	dataDir  string
	users    map[string]User
	articles map[string]Article
	resets   map[string]PasswordResetRequest
}
