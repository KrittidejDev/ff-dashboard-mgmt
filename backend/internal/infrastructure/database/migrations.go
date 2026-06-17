package database

import (
	"context"
	"embed"
	"fmt"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"
)

//go:embed migrations/*.sql
var migrationFiles embed.FS

// RunMigrations executes all SQL files in the migrations directory.
func RunMigrations(ctx context.Context, pool *pgxpool.Pool, logger *zap.Logger) error {
	logger.Info("starting database auto-migration...")

	// Read migration files
	entries, err := migrationFiles.ReadDir("migrations")
	if err != nil {
		return fmt.Errorf("failed to read migrations directory: %w", err)
	}

	// Sort files by name to ensure consistent execution order
	sort.Slice(entries, func(i, j int) bool {
		return entries[i].Name() < entries[j].Name()
	})

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".sql") {
			continue
		}

		logger.Info("applying migration", zap.String("file", entry.Name()))
		content, err := migrationFiles.ReadFile("migrations/" + entry.Name())
		if err != nil {
			return fmt.Errorf("failed to read migration file %s: %w", entry.Name(), err)
		}

		// Execute SQL content
		_, err = pool.Exec(ctx, string(content))
		if err != nil {
			// Gracefully handle common "already exists" errors
			errMsg := strings.ToLower(err.Error())
			if strings.Contains(errMsg, "already exists") || 
			   strings.Contains(errMsg, "already a hypertable") {
				logger.Warn("migration item already exists, skipping", 
					zap.String("file", entry.Name()), 
					zap.String("detail", err.Error()))
				continue
			}
			return fmt.Errorf("failed to execute migration %s: %w", entry.Name(), err)
		}
	}

	logger.Info("database migration completed successfully")
	return nil
}
