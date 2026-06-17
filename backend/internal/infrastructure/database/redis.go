package database

import (
	"context"
	"fmt"
	"time"

	"ff-dashboard-mgmt/backend/internal/config"

	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

// NewRedisClient creates and validates a connection to the Redis server.
func NewRedisClient(cfg *config.Config, logger *zap.Logger) (*redis.Client, error) {
	rdb := redis.NewClient(&redis.Options{
		Addr:     fmt.Sprintf("%s:%s", cfg.RedisHost, cfg.RedisPort),
		Username: cfg.RedisUser,
		Password: cfg.RedisPassword,
		DB:       0, // Default DB
	})

	// Test the connection
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	pong, err := rdb.Ping(ctx).Result()
	if err != nil {
		return nil, fmt.Errorf("redis: failed to ping: %w", err)
	}

	logger.Info("connected successfully to redis server", zap.String("addr", rdb.Options().Addr), zap.String("ping", pong))
	return rdb, nil
}
