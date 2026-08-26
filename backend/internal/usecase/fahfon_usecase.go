package usecase

import (
	"context"
	"encoding/json"
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

func (u *fahfonUsecase) ListDevices(ctx context.Context, search string, sortBy string, officialPage string) ([]*domain.FahfonDeviceMaster, error) {
	return u.repo.GetDevices(ctx, search, sortBy, officialPage)
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
	const cacheKey = "cache:fahfon:official_pages"

	// Check Redis cache first for high throughput
	if u.redis != nil {
		if cached, err := u.redis.Get(ctx, cacheKey).Result(); err == nil && cached != "" {
			var cachedPages []*domain.OfficialPage
			if err := json.Unmarshal([]byte(cached), &cachedPages); err == nil && len(cachedPages) > 0 {
				return cachedPages, nil
			}
		}
	}

	// 1. Primary: Fetch from PostgreSQL device_master (fast, indexed, reliable)
	pages, err := u.repo.GetOfficialPages(ctx)
	if err == nil && len(pages) > 0 {
		// Cache in Redis for 60 seconds
		if u.redis != nil {
			if data, err := json.Marshal(pages); err == nil {
				_ = u.redis.Set(ctx, cacheKey, string(data), 60*time.Second).Err()
			}
		}
		return pages, nil
	}

	// 2. Fallback: Query MongoDB if PostgreSQL returned 0 records or error
	if u.mongoRepo != nil {
		regs, mErr := u.mongoRepo.ListRegistrations(ctx)
		if mErr == nil && len(regs) > 0 {
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

			var mPages []*domain.OfficialPage
			for key, count := range counts {
				mPages = append(mPages, &domain.OfficialPage{
					Email:     key.Email,
					AccountID: key.AccountID,
					Count:     count,
				})
			}

			if len(mPages) > 0 {
				if u.redis != nil {
					if data, err := json.Marshal(mPages); err == nil {
						_ = u.redis.Set(ctx, cacheKey, string(data), 60*time.Second).Err()
					}
				}
				return mPages, nil
			}
		}
	}

	// Return whatever we have (even empty array) without throwing 500
	if pages == nil {
		pages = []*domain.OfficialPage{}
	}
	return pages, nil
}
