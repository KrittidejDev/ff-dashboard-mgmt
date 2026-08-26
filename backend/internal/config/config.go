package config

import (
	"errors"
	"os"
	"strconv"
	"time"
)

// Config holds all application configuration loaded from environment variables.
type Config struct {
	AppPort         string
	DBURL           string
	DBQueryTimeout  time.Duration
	MongoURI        string
	MongoDBName     string
	JWTSecret       string
	JWTLifetime     time.Duration
	LogLevel        string
	SMTPHost        string
	SMTPPort        int
	SMTPUser        string
	SMTPPass        string
	SMTPFrom        string
	SMTPEnabled     bool
	SMTPIntervalMin int

	// Redis
	RedisHost     string
	RedisPort     string
	RedisUser     string
	RedisPassword string

	// River Service
	RiverServiceURL    string
	RiverRedisHost     string
	RiverRedisPort     string
	RiverRedisPassword string

	// CCTV Stream Service
	CctvStreamServiceAddr   string
	CctvStreamServiceSecret string
}

// LoadConfig reads environment variables and returns a Config with defaults.
func LoadConfig() *Config {
	enabled, _ := strconv.ParseBool(getEnv("SMTP_ENABLED", "false"))
	return &Config{
		AppPort:         getEnv("APP_PORT", "8081"),
		DBURL:           getEnv("DB_URL", ""),
		DBQueryTimeout:  getEnvDuration("DB_QUERY_TIMEOUT", 5*time.Second),
		MongoURI:        getEnv("MONGO_URI", ""),
		MongoDBName:     getEnv("MONGO_DB", "fahfon-admin"),
		JWTSecret:       getEnv("JWT_SECRET", ""),
		JWTLifetime:     getEnvDuration("JWT_LIFETIME", 24*time.Hour),
		LogLevel:        getEnv("LOG_LEVEL", "info"),
		SMTPHost:        getEnv("SMTP_HOST", "smtp.gmail.com"),
		SMTPPort:        getEnvInt("SMTP_PORT", 587),
		SMTPUser:        getEnv("SMTP_USER", ""),
		SMTPPass:        getEnv("SMTP_PASS", ""),
		SMTPFrom:        getEnv("SMTP_FROM", "Fahfon Alerts <alerts@fahfon.com>"),
		SMTPEnabled:     enabled,
		SMTPIntervalMin: getEnvInt("SMTP_INTERVAL_MINS", 10),
		RedisHost:       getEnv("REDIS_HOST", "localhost"),
		RedisPort:       getEnv("REDIS_PORT", "6379"),
		RedisUser:       getEnv("REDIS_USER", "ff-system-rd"),
		RedisPassword:   getEnv("REDIS_PASSWORD", ""),
		RiverServiceURL:    getEnv("RIVER_SERVICE_URL", "http://10.1.2.19:8081"),
		RiverRedisHost:     getEnv("RIVER_REDIS_HOST", "10.1.2.19"),
		RiverRedisPort:     getEnv("RIVER_REDIS_PORT", "6382"),
		RiverRedisPassword: getEnv("RIVER_REDIS_PASSWORD", ""),
		CctvStreamServiceAddr:   getEnv("CCTV_STREAM_SERVICE_ADDR", "10.1.2.7:50051"),
		CctvStreamServiceSecret: getEnv("CCTV_STREAM_SERVICE_SECRET", ""),
	}
}

// Validate checks that all required fields are set and within bounds.
func (c *Config) Validate() error {
	if c.DBURL == "" {
		return errors.New("config: DB_URL is required")
	}
	if c.JWTSecret == "" {
		return errors.New("config: JWT_SECRET is required")
	}
	if c.RedisPassword == "" {
		return errors.New("config: REDIS_PASSWORD is required")
	}
	if c.DBQueryTimeout < time.Second {
		return errors.New("config: DB_QUERY_TIMEOUT must be >= 1s")
	}
	return nil
}

// Env helpers
func getEnv(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok {
		return v
	}
	return fallback
}

func getEnvDuration(key string, fallback time.Duration) time.Duration {
	if v, ok := os.LookupEnv(key); ok {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if v, ok := os.LookupEnv(key); ok {
		if i, err := strconv.Atoi(v); err == nil {
			return i
		}
	}
	return fallback
}
