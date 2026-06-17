package usecase

import (
	"context"
	"time"

	"ff-dashboard-mgmt/backend/internal/domain"

	"github.com/google/uuid"
	"go.uber.org/zap"
)

type auditUsecase struct {
	repo    domain.AuditLogRepository
	logger  *zap.Logger
	logChan chan *domain.SystemAuditLog
}

func NewAuditLogUsecase(repo domain.AuditLogRepository, logger *zap.Logger) domain.AuditLogUsecase {
	u := &auditUsecase{
		repo:    repo,
		logger:  logger,
		logChan: make(chan *domain.SystemAuditLog, 10000), // Capacity of 10k logs
	}

	// Start background log writer worker
	go u.worker()

	return u
}

func (u *auditUsecase) RecordLog(ctx context.Context, userID *uuid.UUID, username, action, resource string, details any, ip, ua string) {
	log := &domain.SystemAuditLog{
		UserID:    userID,
		Username:  username,
		Action:    action,
		Resource:  resource,
		Details:   details,
		IPAddress: ip,
		UserAgent: ua,
		CreatedAt: time.Now(),
	}

	select {
	case u.logChan <- log:
		// Successfully sent to queue
	default:
		// Queue is full, log warning and discard or write directly
		u.logger.Warn("audit log channel full, writing log synchronously", zap.String("action", action))
		go func() {
			dbCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			if err := u.repo.WriteLog(dbCtx, log); err != nil {
				u.logger.Error("failed to write audit log synchronously", zap.Error(err))
			}
		}()
	}
}

func (u *auditUsecase) ListLogs(ctx context.Context, page, limit int) ([]*domain.SystemAuditLog, error) {
	if page < 1 {
		page = 1
	}
	if limit < 1 {
		limit = 20
	}
	offset := (page - 1) * limit
	return u.repo.ListLogs(ctx, limit, offset)
}

func (u *auditUsecase) worker() {
	u.logger.Info("concurrent audit logging worker started successfully")
	for log := range u.logChan {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		if err := u.repo.WriteLog(ctx, log); err != nil {
			u.logger.Error("failed to write audit log from background worker", zap.Error(err))
		}
		cancel()
	}
}
