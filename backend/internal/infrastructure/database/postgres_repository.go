package database

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"ff-dashboard-mgmt/backend/internal/domain"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

type pgRepository struct {
	pool *pgxpool.Pool
}

func NewPostgresRepository(pool *pgxpool.Pool) (domain.UserRepository, domain.AuditLogRepository) {
	repo := &pgRepository{pool: pool}
	return repo, repo
}

// ── UserRepository Implementation ───────────────────────────────────────────

func (r *pgRepository) CreateUser(ctx context.Context, user *domain.SystemUser) error {
	query := `
		INSERT INTO system_users (id, username, email, password_hash, role, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`
	_, err := r.pool.Exec(ctx, query,
		user.ID,
		user.Username,
		user.Email,
		user.PasswordHash,
		string(user.Role),
		user.CreatedAt,
		user.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("db: create user: %w", err)
	}
	return nil
}

func (r *pgRepository) GetUserByUsername(ctx context.Context, username string) (*domain.SystemUser, error) {
	query := `
		SELECT id, username, email, password_hash, role, created_at, updated_at
		FROM system_users
		WHERE username = $1 LIMIT 1
	`
	var user domain.SystemUser
	var roleStr string
	err := r.pool.QueryRow(ctx, query, username).Scan(
		&user.ID,
		&user.Username,
		&user.Email,
		&user.PasswordHash,
		&roleStr,
		&user.CreatedAt,
		&user.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, errors.New("user not found")
		}
		return nil, fmt.Errorf("db: get user by username: %w", err)
	}
	user.Role = domain.UserRole(roleStr)
	return &user, nil
}

func (r *pgRepository) GetUserByID(ctx context.Context, id uuid.UUID) (*domain.SystemUser, error) {
	query := `
		SELECT id, username, email, password_hash, role, created_at, updated_at
		FROM system_users
		WHERE id = $1 LIMIT 1
	`
	var user domain.SystemUser
	var roleStr string
	err := r.pool.QueryRow(ctx, query, id).Scan(
		&user.ID,
		&user.Username,
		&user.Email,
		&user.PasswordHash,
		&roleStr,
		&user.CreatedAt,
		&user.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, errors.New("user not found")
		}
		return nil, fmt.Errorf("db: get user by id: %w", err)
	}
	user.Role = domain.UserRole(roleStr)
	return &user, nil
}

func (r *pgRepository) ListUsers(ctx context.Context) ([]*domain.SystemUser, error) {
	query := `
		SELECT id, username, email, role, created_at, updated_at
		FROM system_users
		ORDER BY created_at DESC
	`
	rows, err := r.pool.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("db: list users: %w", err)
	}
	defer rows.Close()

	var users []*domain.SystemUser
	for rows.Next() {
		var user domain.SystemUser
		var roleStr string
		err := rows.Scan(
			&user.ID,
			&user.Username,
			&user.Email,
			&roleStr,
			&user.CreatedAt,
			&user.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("db: scan user: %w", err)
		}
		user.Role = domain.UserRole(roleStr)
		users = append(users, &user)
	}
	return users, nil
}

func (r *pgRepository) UpdatePassword(ctx context.Context, id uuid.UUID, newPasswordHash string) error {
	query := `UPDATE system_users SET password_hash = $1, updated_at = NOW() WHERE id = $2`
	tag, err := r.pool.Exec(ctx, query, newPasswordHash, id)
	if err != nil {
		return fmt.Errorf("db: update password: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return errors.New("user not found")
	}
	return nil
}

func (r *pgRepository) DeleteUser(ctx context.Context, id uuid.UUID) error {
	query := `DELETE FROM system_users WHERE id = $1`
	tag, err := r.pool.Exec(ctx, query, id)
	if err != nil {
		return fmt.Errorf("db: delete user: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return errors.New("user not found")
	}
	return nil
}

// ── AuditLogRepository Implementation ───────────────────────────────────────

func (r *pgRepository) WriteLog(ctx context.Context, log *domain.SystemAuditLog) error {
	query := `
		INSERT INTO system_audit_logs (user_id, username, action, resource, details, ip_address, user_agent, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`

	detailsJSON, err := json.Marshal(log.Details)
	if err != nil {
		detailsJSON = []byte("{}")
	}

	var userIDField pgtype.UUID
	if log.UserID != nil {
		userIDField = pgtype.UUID{Bytes: *log.UserID, Valid: true}
	} else {
		userIDField = pgtype.UUID{Valid: false}
	}

	_, err = r.pool.Exec(ctx, query,
		userIDField,
		log.Username,
		log.Action,
		log.Resource,
		detailsJSON,
		log.IPAddress,
		log.UserAgent,
		log.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("db: write log: %w", err)
	}
	return nil
}

func (r *pgRepository) ListLogs(ctx context.Context, limit, offset int) ([]*domain.SystemAuditLog, error) {
	query := `
		SELECT id, user_id, username, action, resource, details, ip_address, user_agent, created_at
		FROM system_audit_logs
		ORDER BY created_at DESC
		LIMIT $1 OFFSET $2
	`
	rows, err := r.pool.Query(ctx, query, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("db: list logs: %w", err)
	}
	defer rows.Close()

	var logs []*domain.SystemAuditLog
	for rows.Next() {
		var log domain.SystemAuditLog
		var userIDField pgtype.UUID
		var detailsBytes []byte

		err := rows.Scan(
			&log.ID,
			&userIDField,
			&log.Username,
			&log.Action,
			&log.Resource,
			&detailsBytes,
			&log.IPAddress,
			&log.UserAgent,
			&log.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("db: scan log: %w", err)
		}

		if userIDField.Valid {
			uID := uuid.UUID(userIDField.Bytes)
			log.UserID = &uID
		}

		var details map[string]any
		if err := json.Unmarshal(detailsBytes, &details); err == nil {
			log.Details = details
		} else {
			log.Details = string(detailsBytes)
		}

		logs = append(logs, &log)
	}
	return logs, nil
}
