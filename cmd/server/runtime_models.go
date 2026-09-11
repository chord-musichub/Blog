package main

import (
	"html/template"
	"sync"
	"time"
)

const (
	// 角色和账号类型分开：角色决定后台能力，账号类型决定公开朋友页的呈现。
	// roleAuthor 保留为旧数据兼容值，启动迁移后会写成 roleUser。
	roleOwner  = "owner"
	roleAdmin  = "admin"
	roleUser   = "user"
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

// Config 汇总服务启动时读取的运行环境配置。
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
	HTTPReadTimeout   time.Duration
	HTTPWriteTimeout  time.Duration
	RuntimeStaticDir  string
}

// App 保存 HTTP 服务运行所需的共享依赖和构建锁。
type App struct {
	cfg       Config
	store     *Store
	tpl       *template.Template
	limiter   *Limiter
	startedAt time.Time
	buildMu   sync.Mutex
	// 运行时统计文件不再占用用户/文章仓储锁，避免小游戏请求阻塞后台操作。
	viewsMu       sync.Mutex
	scoresMu      sync.Mutex
	scoreCache    map[string][]SnakeScoreRecord
	messagesMu    sync.Mutex
	messagesCache []MessageRecord
}

// Store 是后台长期数据的内存索引和文件访问入口。
type Store struct {
	mu       sync.Mutex
	dataDir  string
	users    map[string]User
	articles map[string]Article
	resets   map[string]PasswordResetRequest
}
