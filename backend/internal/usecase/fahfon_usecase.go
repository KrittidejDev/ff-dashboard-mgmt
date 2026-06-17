package usecase

import (
	"context"
	"time"

	"ff-dashboard-mgmt/backend/internal/domain"

	"github.com/redis/go-redis/v9"
)

type fahfonUsecase struct {
	repo      domain.FahfonRepository
	mongoRepo domain.MongoRepository
	redis     *redis.Client
}

func NewFahfonUsecase(repo domain.FahfonRepository, mongoRepo domain.MongoRepository, rdb *redis.Client) domain.FahfonUsecase {
	return &fahfonUsecase{
		repo:      repo,
		mongoRepo: mongoRepo,
		redis:     rdb,
	}
}

type redisTelemetry struct {
	domain.FahfonCurrent
	RainAccHourly float64 `json:"rain_acc_hourly"`
}

func (u *fahfonUsecase) ListDevices(ctx context.Context, search string, sortBy string) ([]*domain.FahfonDeviceMaster, error) {
	return u.repo.GetDevices(ctx, search, sortBy)
}

func (u *fahfonUsecase) GetDeviceDetail(ctx context.Context, station string, rangeType string) (*domain.FahfonDeviceMaster, *domain.FahfonCurrent, []*domain.FahfonCurrent, error) {
	dm, fc, err := u.repo.GetDeviceDetail(ctx, station)
	if err != nil {
		return nil, nil, nil, err
	}

	// Load Asia/Bangkok timezone to query database with the correct ICT timezone range
	bangkok, errTz := time.LoadLocation("Asia/Bangkok")
	if errTz != nil {
		bangkok = time.FixedZone("ICT", 7*60*60)
	}

	endBkk := time.Now().In(bangkok)
	var startBkk time.Time
	switch rangeType {
	case "daily":
		startBkk = endBkk.Add(-30 * 24 * time.Hour) // Last 30 days
	case "monthly":
		startBkk = endBkk.Add(-12 * 30 * 24 * time.Hour) // Last 12 months (approx)
	default:
		startBkk = endBkk.Add(-24 * time.Hour) // Default last 24 hours
	}

	// Convert local ICT clock times to UTC clock time representation to match the database stored values (WITHOUT TIME ZONE)
	end := time.Date(endBkk.Year(), endBkk.Month(), endBkk.Day(), endBkk.Hour(), endBkk.Minute(), endBkk.Second(), endBkk.Nanosecond(), time.UTC)
	start := time.Date(startBkk.Year(), startBkk.Month(), startBkk.Day(), startBkk.Hour(), startBkk.Minute(), startBkk.Second(), startBkk.Nanosecond(), time.UTC)

	historyDeviceID := station
	if fc != nil && fc.DeviceID != "" {
		historyDeviceID = fc.DeviceID
	}

	history, err := u.repo.GetDeviceHistory(ctx, historyDeviceID, start, end, rangeType)
	if err != nil {
		history = []*domain.FahfonCurrent{}
	}

	return dm, fc, history, nil
}

func (u *fahfonUsecase) GetConflictReport(ctx context.Context) ([]*domain.ConflictDevice, error) {
	return u.repo.GetConflictReport(ctx)
}

func (u *fahfonUsecase) ListAnomalies(ctx context.Context) ([]*domain.DeviceAnomaly, error) {
	return u.repo.GetAnomalies(ctx)
}

func (u *fahfonUsecase) GetWarningEmails(ctx context.Context) ([]string, error) {
	setting, err := u.repo.GetSetting(ctx, "warning_emails")
	if err != nil {
		return []string{}, nil // default empty array
	}

	arr, ok := setting.Value.([]any)
	if !ok {
		return []string{}, nil
	}

	var emails []string
	for _, item := range arr {
		if s, ok := item.(string); ok {
			emails = append(emails, s)
		}
	}
	return emails, nil
}

func (u *fahfonUsecase) SaveWarningEmails(ctx context.Context, emails []string) error {
	return u.repo.SaveSetting(ctx, "warning_emails", emails)
}

func (u *fahfonUsecase) UpdateDeviceStatus(ctx context.Context, station string, status string) error {
	err := u.repo.UpdateDeviceStatus(ctx, station, status)
	if err != nil {
		return err
	}
	// If setting back to ACTIVE, automatically resolve active anomalies
	if status == "ACTIVE" {
		_ = u.repo.ResolveDeviceAnomalies(ctx, station)
	}
	return nil
}

func (u *fahfonUsecase) GetThresholds(ctx context.Context) ([]*domain.SensorThreshold, error) {
	return u.repo.GetThresholds(ctx)
}

func (u *fahfonUsecase) UpdateThreshold(ctx context.Context, id int32, minVal, maxVal float64, desc string) error {
	return u.repo.UpdateThreshold(ctx, id, minVal, maxVal, desc)
}

func (u *fahfonUsecase) ListOfficialPages(ctx context.Context) ([]*domain.OfficialPage, error) {
	regs, err := u.mongoRepo.ListRegistrations(ctx)
	if err != nil {
		return nil, err
	}

	type pageKey struct {
		Email     string
		AccountID string
	}

	counts := make(map[pageKey]int)
	for _, reg := range regs {
		if reg.Email != "" {
			key := pageKey{
				Email:     reg.Email,
				AccountID: reg.AccountID,
			}
			counts[key]++
		}
	}

	var pages []*domain.OfficialPage
	for key, count := range counts {
		pages = append(pages, &domain.OfficialPage{
			Email:     key.Email,
			AccountID: key.AccountID,
			Count:     count,
		})
	}

	return pages, nil
}
