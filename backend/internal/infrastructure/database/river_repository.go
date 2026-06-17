package database

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"ff-dashboard-mgmt/backend/internal/domain"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type pgRiverRepository struct {
	pool *pgxpool.Pool
}

func NewRiverRepository(pool *pgxpool.Pool) domain.RiverRepository {
	return &pgRiverRepository{pool: pool}
}

func (r *pgRiverRepository) getCtx(ctx context.Context) (context.Context, context.CancelFunc) {
	return context.WithTimeout(ctx, 10*time.Second)
}

// Ping checks database health
func (r *pgRiverRepository) Ping(ctx context.Context) error {
	dbCtx, cancel := r.getCtx(ctx)
	defer cancel()
	return r.pool.Ping(dbCtx)
}

// ── Official Pages ──────────────────────────────────────────────────────────

func (r *pgRiverRepository) GetOfficialPages(ctx context.Context) ([]*domain.RiverOfficialPage, error) {
	dbCtx, cancel := r.getCtx(ctx)
	defer cancel()

	rows, err := r.pool.Query(dbCtx, `
		SELECT id, name, code, description, municipality_id, created_at, updated_at
		FROM river_official_page
		ORDER BY id ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var pages []*domain.RiverOfficialPage
	for rows.Next() {
		p := &domain.RiverOfficialPage{}
		var desc *string
		if err := rows.Scan(&p.ID, &p.Name, &p.Code, &desc, &p.MunicipalityID, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		if desc != nil {
			p.Description = *desc
		}
		pages = append(pages, p)
	}
	return pages, nil
}


func (r *pgRiverRepository) CreateOfficialPage(ctx context.Context, page *domain.RiverOfficialPage) error {
	dbCtx, cancel := r.getCtx(ctx)
	defer cancel()

	query := `
		INSERT INTO river_official_page (name, code, description, municipality_id)
		VALUES ($1, $2, $3, $4)
		RETURNING id, created_at, updated_at
	`
	return r.pool.QueryRow(dbCtx, query, page.Name, page.Code, page.Description, page.MunicipalityID).
		Scan(&page.ID, &page.CreatedAt, &page.UpdatedAt)
}

func (r *pgRiverRepository) UpdateOfficialPage(ctx context.Context, page *domain.RiverOfficialPage) error {
	dbCtx, cancel := r.getCtx(ctx)
	defer cancel()

	query := `
		UPDATE river_official_page
		SET name = $1, code = $2, description = $3, municipality_id = $4, updated_at = NOW()
		WHERE id = $5
		RETURNING updated_at
	`
	err := r.pool.QueryRow(dbCtx, query, page.Name, page.Code, page.Description, page.MunicipalityID, page.ID).
		Scan(&page.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return errors.New("official page not found")
	}
	return err
}

func (r *pgRiverRepository) DeleteOfficialPage(ctx context.Context, id int) error {
	dbCtx, cancel := r.getCtx(ctx)
	defer cancel()

	cmd, err := r.pool.Exec(dbCtx, "DELETE FROM river_official_page WHERE id = $1", id)
	if err != nil {
		return err
	}
	if cmd.RowsAffected() == 0 {
		return errors.New("official page not found")
	}
	return nil
}

// LinkMunicipality sets (or clears) the municipality_id binding on an official page.
// Pass municipalityID = nil to unlink.
func (r *pgRiverRepository) LinkMunicipality(ctx context.Context, officialPageID int, municipalityID *string) (*domain.RiverOfficialPage, error) {
	dbCtx, cancel := r.getCtx(ctx)
	defer cancel()

	query := `
		UPDATE river_official_page
		SET municipality_id = $1, updated_at = NOW()
		WHERE id = $2
		RETURNING id, name, code, description, municipality_id, created_at, updated_at
	`
	p := &domain.RiverOfficialPage{}
	var desc *string
	err := r.pool.QueryRow(dbCtx, query, municipalityID, officialPageID).
		Scan(&p.ID, &p.Name, &p.Code, &desc, &p.MunicipalityID, &p.CreatedAt, &p.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, errors.New("official page not found")
	}
	if err != nil {
		return nil, err
	}
	if desc != nil {
		p.Description = *desc
	}
	return p, nil
}

// GetOfficialPageByMunicipalityID looks up an official page using the municipality UUID.
// This is the primary resolution path for ff-river-service: given a mueangsmart
// municipality.id, return the official_page.code to use for data isolation.
func (r *pgRiverRepository) GetOfficialPageByMunicipalityID(ctx context.Context, municipalityID string) (*domain.RiverOfficialPage, error) {
	dbCtx, cancel := r.getCtx(ctx)
	defer cancel()

	query := `
		SELECT id, name, code, description, municipality_id, created_at, updated_at
		FROM river_official_page
		WHERE municipality_id = $1
		LIMIT 1
	`
	p := &domain.RiverOfficialPage{}
	var desc *string
	err := r.pool.QueryRow(dbCtx, query, municipalityID).
		Scan(&p.ID, &p.Name, &p.Code, &desc, &p.MunicipalityID, &p.CreatedAt, &p.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("no official page linked to municipality %s", municipalityID)
	}
	if err != nil {
		return nil, err
	}
	if desc != nil {
		p.Description = *desc
	}
	return p, nil
}

// ── Devices ─────────────────────────────────────────────────────────────────

func (r *pgRiverRepository) GetDevices(ctx context.Context, pageID *int, status *string) ([]*domain.RiverDevice, error) {
	dbCtx, cancel := r.getCtx(ctx)
	defer cancel()

	query := `SELECT d.id, d.serial, d.official_page_id, d.name, d.status, d.description, 
	                 d.owner_email, d.owner_id, d.install_latitude, d.install_longitude, 
	                 d.organization_name, d.cctv_path_0, d.cctv_path_1, d.cctv_path_2, 
	                 d.created_at, d.updated_at,
	                 g.level_cm, g.net_water_level_cm, g.water_level_pct, to_timestamp(g.timestamp_utc),
	                 c.extra_config, c.bottom_to_bank_cm,
	                 g.snapshot_url0, g.snapshot_url1, g.snapshot_url2
	          FROM river_device d
	          LEFT JOIN river_current_group g ON d.serial = g.serial
	          LEFT JOIN river_device_config c ON d.serial = c.serial
	          WHERE 1=1`
	var args []interface{}
	argCount := 1

	if pageID != nil {
		query += " AND d.official_page_id = $1"
		args = append(args, *pageID)
		argCount++
	}
	if status != nil {
		query += fmt.Sprintf(" AND d.status = $%d", argCount)
		args = append(args, *status)
	}

	query += " ORDER BY d.serial ASC"

	rows, err := r.pool.Query(dbCtx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var devices []*domain.RiverDevice
	for rows.Next() {
		d := &domain.RiverDevice{}
		var desc, ownerEmail, ownerID, installLat, installLng, orgName, cctv0, cctv1, cctv2 *string
		var levelCM, netWaterLevelCM, waterLevelPct, bottomToBankCM *float64
		var lastSeen *time.Time
		var extraConfigB []byte
		var snap0, snap1, snap2 *string
		err := rows.Scan(
			&d.ID, &d.Serial, &d.OfficialPageID, &d.Name, &d.Status, &desc,
			&ownerEmail, &ownerID, &installLat, &installLng, &orgName,
			&cctv0, &cctv1, &cctv2, &d.CreatedAt, &d.UpdatedAt,
			&levelCM, &netWaterLevelCM, &waterLevelPct, &lastSeen,
			&extraConfigB, &bottomToBankCM,
			&snap0, &snap1, &snap2,
		)
		if err != nil {
			return nil, err
		}
		if desc != nil {
			d.Description = *desc
		}
		if ownerEmail != nil {
			d.OwnerEmail = *ownerEmail
		}
		if ownerID != nil {
			d.OwnerID = *ownerID
		}
		if installLat != nil {
			d.InstallLatitude = *installLat
		}
		if installLng != nil {
			d.InstallLongitude = *installLng
		}
		if orgName != nil {
			d.OrganizationName = *orgName
		}
		if snap0 != nil && *snap0 != "" {
			d.CCTVPath0 = *snap0
		} else if cctv0 != nil {
			d.CCTVPath0 = *cctv0
		}
		if snap1 != nil && *snap1 != "" {
			d.CCTVPath1 = *snap1
		} else if cctv1 != nil {
			d.CCTVPath1 = *cctv1
		}
		if snap2 != nil && *snap2 != "" {
			d.CCTVPath2 = *snap2
		} else if cctv2 != nil {
			d.CCTVPath2 = *cctv2
		}
		d.LevelCM = levelCM
		d.NetWaterLevelCM = netWaterLevelCM
		d.WaterLevelPct = waterLevelPct
		d.LastSeen = lastSeen
		d.BottomToBankCM = bottomToBankCM
		if len(extraConfigB) > 0 {
			var extra map[string]interface{}
			if err := json.Unmarshal(extraConfigB, &extra); err == nil {
				if val, ok := extra["offline_threshold_min"]; ok {
					if parsed, ok := val.(float64); ok {
						valInt := int(parsed)
						d.OfflineThresholdMin = &valInt
					}
				}
			}
		}
		devices = append(devices, d)
	}
	return devices, nil
}

func (r *pgRiverRepository) GetDevicesByOwner(ctx context.Context, email string) ([]*domain.RiverDevice, error) {
	dbCtx, cancel := r.getCtx(ctx)
	defer cancel()

	query := `SELECT id, serial, official_page_id, name, status, description, 
	                 owner_email, owner_id, install_latitude, install_longitude, 
	                 organization_name, cctv_path_0, cctv_path_1, cctv_path_2, 
	                 created_at, updated_at FROM river_device 
	          WHERE owner_email = $1 ORDER BY serial ASC`

	rows, err := r.pool.Query(dbCtx, query, email)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var devices []*domain.RiverDevice
	for rows.Next() {
		d := &domain.RiverDevice{}
		var desc, ownerEmail, ownerID, installLat, installLng, orgName, cctv0, cctv1, cctv2 *string
		err := rows.Scan(
			&d.ID, &d.Serial, &d.OfficialPageID, &d.Name, &d.Status, &desc,
			&ownerEmail, &ownerID, &installLat, &installLng, &orgName,
			&cctv0, &cctv1, &cctv2, &d.CreatedAt, &d.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		if desc != nil {
			d.Description = *desc
		}
		if ownerEmail != nil {
			d.OwnerEmail = *ownerEmail
		}
		if ownerID != nil {
			d.OwnerID = *ownerID
		}
		if installLat != nil {
			d.InstallLatitude = *installLat
		}
		if installLng != nil {
			d.InstallLongitude = *installLng
		}
		if orgName != nil {
			d.OrganizationName = *orgName
		}
		if cctv0 != nil {
			d.CCTVPath0 = *cctv0
		}
		if cctv1 != nil {
			d.CCTVPath1 = *cctv1
		}
		if cctv2 != nil {
			d.CCTVPath2 = *cctv2
		}
		devices = append(devices, d)
	}
	return devices, nil
}

func (r *pgRiverRepository) GetDeviceBySerial(ctx context.Context, serial string) (*domain.RiverDevice, error) {
	dbCtx, cancel := r.getCtx(ctx)
	defer cancel()

	d := &domain.RiverDevice{}
	var desc, ownerEmail, ownerID, installLat, installLng, orgName, cctv0, cctv1, cctv2 *string
	var levelCM, netWaterLevelCM, waterLevelPct, bottomToBankCM *float64
	var lastSeen *time.Time
	var snap0, snap1, snap2 *string
	query := `SELECT d.id, d.serial, d.official_page_id, d.name, d.status, d.description, 
	                 d.owner_email, d.owner_id, d.install_latitude, d.install_longitude, 
	                 d.organization_name, d.cctv_path_0, d.cctv_path_1, d.cctv_path_2, 
	                 d.created_at, d.updated_at,
	                 g.level_cm, g.net_water_level_cm, g.water_level_pct, to_timestamp(g.timestamp_utc),
	                 c.extra_config, c.bottom_to_bank_cm,
	                 g.snapshot_url0, g.snapshot_url1, g.snapshot_url2
	          FROM river_device d
	          LEFT JOIN river_current_group g ON d.serial = g.serial
	          LEFT JOIN river_device_config c ON d.serial = c.serial
	          WHERE d.serial = $1`
	var extraConfigB []byte
	err := r.pool.QueryRow(dbCtx, query, serial).Scan(
		&d.ID, &d.Serial, &d.OfficialPageID, &d.Name, &d.Status, &desc,
		&ownerEmail, &ownerID, &installLat, &installLng, &orgName,
		&cctv0, &cctv1, &cctv2, &d.CreatedAt, &d.UpdatedAt,
		&levelCM, &netWaterLevelCM, &waterLevelPct, &lastSeen,
		&extraConfigB, &bottomToBankCM,
		&snap0, &snap1, &snap2,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, errors.New("device not found")
	}
	if err != nil {
		return nil, err
	}
	if desc != nil {
		d.Description = *desc
	}
	if ownerEmail != nil {
		d.OwnerEmail = *ownerEmail
	}
	if ownerID != nil {
		d.OwnerID = *ownerID
	}
	if installLat != nil {
		d.InstallLatitude = *installLat
	}
	if installLng != nil {
		d.InstallLongitude = *installLng
	}
	if orgName != nil {
		d.OrganizationName = *orgName
	}
	if snap0 != nil && *snap0 != "" {
		d.CCTVPath0 = *snap0
	} else if cctv0 != nil {
		d.CCTVPath0 = *cctv0
	}
	if snap1 != nil && *snap1 != "" {
		d.CCTVPath1 = *snap1
	} else if cctv1 != nil {
		d.CCTVPath1 = *cctv1
	}
	if snap2 != nil && *snap2 != "" {
		d.CCTVPath2 = *snap2
	} else if cctv2 != nil {
		d.CCTVPath2 = *cctv2
	}
	d.LevelCM = levelCM
	d.NetWaterLevelCM = netWaterLevelCM
	d.WaterLevelPct = waterLevelPct
	d.LastSeen = lastSeen
	d.BottomToBankCM = bottomToBankCM
	if len(extraConfigB) > 0 {
		var extra map[string]interface{}
		if err := json.Unmarshal(extraConfigB, &extra); err == nil {
			if val, ok := extra["offline_threshold_min"]; ok {
				if parsed, ok := val.(float64); ok {
					valInt := int(parsed)
					d.OfflineThresholdMin = &valInt
				}
			}
		}
	}
	return d, nil
}

func (r *pgRiverRepository) CreateDevice(ctx context.Context, dev *domain.RiverDevice) error {
	dbCtx, cancel := r.getCtx(ctx)
	defer cancel()

	query := `
		INSERT INTO river_device (
			serial, official_page_id, name, status, description, 
			owner_email, owner_id, install_latitude, install_longitude, 
			organization_name, cctv_path_0, cctv_path_1, cctv_path_2
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
		RETURNING id, created_at, updated_at
	`
	return r.pool.QueryRow(dbCtx, query,
		dev.Serial, dev.OfficialPageID, dev.Name, dev.Status, dev.Description,
		dev.OwnerEmail, dev.OwnerID, dev.InstallLatitude, dev.InstallLongitude,
		dev.OrganizationName, dev.CCTVPath0, dev.CCTVPath1, dev.CCTVPath2,
	).Scan(&dev.ID, &dev.CreatedAt, &dev.UpdatedAt)
}

func (r *pgRiverRepository) UpdateDevice(ctx context.Context, dev *domain.RiverDevice) error {
	dbCtx, cancel := r.getCtx(ctx)
	defer cancel()

	query := `
		UPDATE river_device
		SET official_page_id = $1, name = $2, status = $3, description = $4, 
		    owner_email = $5, owner_id = $6, install_latitude = $7, install_longitude = $8, 
		    organization_name = $9, cctv_path_0 = $10, cctv_path_1 = $11, cctv_path_2 = $12,
		    updated_at = NOW()
		WHERE serial = $13
		RETURNING updated_at
	`
	err := r.pool.QueryRow(dbCtx, query,
		dev.OfficialPageID, dev.Name, dev.Status, dev.Description,
		dev.OwnerEmail, dev.OwnerID, dev.InstallLatitude, dev.InstallLongitude,
		dev.OrganizationName, dev.CCTVPath0, dev.CCTVPath1, dev.CCTVPath2,
		dev.Serial,
	).Scan(&dev.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return errors.New("device not found")
	}
	return err
}

func (r *pgRiverRepository) DeleteDevice(ctx context.Context, serial string) error {
	dbCtx, cancel := r.getCtx(ctx)
	defer cancel()

	cmd, err := r.pool.Exec(dbCtx, "DELETE FROM river_device WHERE serial = $1", serial)
	if err != nil {
		return err
	}
	if cmd.RowsAffected() == 0 {
		return errors.New("device not found")
	}
	return nil
}

func (r *pgRiverRepository) GetUnregisteredSerials(ctx context.Context) ([]string, error) {
	dbCtx, cancel := r.getCtx(ctx)
	defer cancel()

	query := `
		SELECT DISTINCT serial FROM river_current_group 
		WHERE serial NOT IN (SELECT serial FROM river_device) 
		ORDER BY serial ASC
	`
	rows, err := r.pool.Query(dbCtx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var serials []string
	for rows.Next() {
		var s string
		if err := rows.Scan(&s); err != nil {
			return nil, err
		}
		serials = append(serials, s)
	}
	return serials, nil
}

func (r *pgRiverRepository) GetUnregisteredDevices(ctx context.Context) ([]*domain.RiverDevice, error) {
	dbCtx, cancel := r.getCtx(ctx)
	defer cancel()

	query := `
		SELECT serial, latitude, longitude, level_cm, net_water_level_cm, water_level_pct, updated_at
		FROM river_current_group
		WHERE serial NOT IN (SELECT serial FROM river_device)
		ORDER BY serial ASC
	`
	rows, err := r.pool.Query(dbCtx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var devices []*domain.RiverDevice
	for rows.Next() {
		var serial string
		var lat, lng, level, netLevel, pct *float64
		var updatedAt time.Time
		err := rows.Scan(&serial, &lat, &lng, &level, &netLevel, &pct, &updatedAt)
		if err != nil {
			return nil, err
		}

		latStr := ""
		if lat != nil {
			latStr = fmt.Sprintf("%f", *lat)
		}
		lngStr := ""
		if lng != nil {
			lngStr = fmt.Sprintf("%f", *lng)
		}

		d := &domain.RiverDevice{
			Serial:           serial,
			Name:             "สถานีใหม่ยังไม่ลงทะเบียน",
			InstallLatitude:  latStr,
			InstallLongitude: lngStr,
			LevelCM:          level,
			NetWaterLevelCM:  netLevel,
			WaterLevelPct:    pct,
			WarningStatus:    "UNREGISTERED",
			LastSeen:         &updatedAt,
		}
		devices = append(devices, d)
	}
	return devices, nil
}

// ── Config / Calibration ────────────────────────────────────────────────────

func (r *pgRiverRepository) GetDeviceCalcConfig(ctx context.Context, serial string) (*domain.DeviceCalcConfig, error) {
	dbCtx, cancel := r.getCtx(ctx)
	defer cancel()

	cfg := &domain.DeviceCalcConfig{}
	var extraB []byte
	query := `SELECT id, serial, bottom_to_bank_cm, bank_to_sensor_cm, default_duration_sec, extra_config, created_at, updated_at 
	          FROM river_device_config WHERE serial = $1`
	err := r.pool.QueryRow(dbCtx, query, serial).Scan(
		&cfg.ID, &cfg.Serial, &cfg.BottomToBankCM, &cfg.BankToSensorCM, &cfg.DefaultDurationSec, &extraB, &cfg.CreatedAt, &cfg.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, errors.New("device calculation config not found")
	}
	if err != nil {
		return nil, err
	}

	_ = json.Unmarshal(extraB, &cfg.ExtraConfig)
	return cfg, nil
}

func (r *pgRiverRepository) SaveDeviceCalcConfig(ctx context.Context, cfg *domain.DeviceCalcConfig) error {
	dbCtx, cancel := r.getCtx(ctx)
	defer cancel()

	extraB, err := json.Marshal(cfg.ExtraConfig)
	if err != nil {
		return err
	}

	query := `
		INSERT INTO river_device_config (serial, bottom_to_bank_cm, bank_to_sensor_cm, default_duration_sec, extra_config, updated_at)
		VALUES ($1, $2, $3, $4, $5, NOW())
		ON CONFLICT (serial) DO UPDATE SET
			bottom_to_bank_cm = EXCLUDED.bottom_to_bank_cm,
			bank_to_sensor_cm = EXCLUDED.bank_to_sensor_cm,
			default_duration_sec = EXCLUDED.default_duration_sec,
			extra_config = EXCLUDED.extra_config,
			updated_at = NOW()
		RETURNING id, created_at, updated_at
	`
	return r.pool.QueryRow(dbCtx, query, cfg.Serial, cfg.BottomToBankCM, cfg.BankToSensorCM, cfg.DefaultDurationSec, extraB).
		Scan(&cfg.ID, &cfg.CreatedAt, &cfg.UpdatedAt)
}

func (r *pgRiverRepository) UpdateWaterLevel(ctx context.Context, serial string, netCM, pct float64) error {
	dbCtx, cancel := r.getCtx(ctx)
	defer cancel()

	query := `UPDATE river_current_group SET net_water_level_cm = $1, water_level_pct = $2, updated_at = NOW() WHERE serial = $3`
	_, err := r.pool.Exec(dbCtx, query, netCM, pct, serial)
	return err
}

// ── Alert Thresholds ────────────────────────────────────────────────────────

func (r *pgRiverRepository) GetAlertThresholds(ctx context.Context, serial string) ([]*domain.AlertThreshold, error) {
	dbCtx, cancel := r.getCtx(ctx)
	defer cancel()

	query := `SELECT id, serial, alert_level, threshold_cm, threshold_pct, freq_duration_sec, is_active, created_at, updated_at 
	          FROM river_alert_threshold WHERE serial = $1 ORDER BY threshold_cm ASC`
	rows, err := r.pool.Query(dbCtx, query, serial)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var thresholds []*domain.AlertThreshold
	for rows.Next() {
		t := &domain.AlertThreshold{}
		if err := rows.Scan(&t.ID, &t.Serial, &t.AlertLevel, &t.ThresholdCM, &t.ThresholdPct, &t.FreqDurationSec, &t.IsActive, &t.CreatedAt, &t.UpdatedAt); err != nil {
			return nil, err
		}
		thresholds = append(thresholds, t)
	}
	return thresholds, nil
}

func (r *pgRiverRepository) CreateAlertThreshold(ctx context.Context, t *domain.AlertThreshold) error {
	dbCtx, cancel := r.getCtx(ctx)
	defer cancel()

	query := `
		INSERT INTO river_alert_threshold (serial, alert_level, threshold_cm, threshold_pct, freq_duration_sec, is_active)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, created_at, updated_at
	`
	return r.pool.QueryRow(dbCtx, query, t.Serial, t.AlertLevel, t.ThresholdCM, t.ThresholdPct, t.FreqDurationSec, t.IsActive).
		Scan(&t.ID, &t.CreatedAt, &t.UpdatedAt)
}

func (r *pgRiverRepository) UpdateAlertThreshold(ctx context.Context, t *domain.AlertThreshold) error {
	dbCtx, cancel := r.getCtx(ctx)
	defer cancel()

	query := `
		UPDATE river_alert_threshold
		SET threshold_cm = $1, threshold_pct = $2, freq_duration_sec = $3, is_active = $4, updated_at = NOW()
		WHERE id = $5
		RETURNING updated_at, serial
	`
	err := r.pool.QueryRow(dbCtx, query, t.ThresholdCM, t.ThresholdPct, t.FreqDurationSec, t.IsActive, t.ID).
		Scan(&t.UpdatedAt, &t.Serial)
	return err
}

func (r *pgRiverRepository) DeleteAlertThreshold(ctx context.Context, id int) (string, error) {
	dbCtx, cancel := r.getCtx(ctx)
	defer cancel()

	var serial string
	err := r.pool.QueryRow(dbCtx, "DELETE FROM river_alert_threshold WHERE id = $1 RETURNING serial", id).Scan(&serial)
	return serial, err
}

// ── Alert History ───────────────────────────────────────────────────────────

func (r *pgRiverRepository) GetAlertHistory(ctx context.Context, serial string, limit int) ([]*domain.AlertHistory, error) {
	dbCtx, cancel := r.getCtx(ctx)
	defer cancel()

	if limit <= 0 {
		limit = 50
	}

	var query string
	var rows pgx.Rows
	var err error

	if serial == "ALL" {
		query = `SELECT id, time, serial, alert_level, alert_type, value, threshold, message, status, COALESCE(metadata, '{}'::jsonb), created_at 
		          FROM river_alert_history ORDER BY time DESC LIMIT $1`
		rows, err = r.pool.Query(dbCtx, query, limit)
	} else {
		query = `SELECT id, time, serial, alert_level, alert_type, value, threshold, message, status, COALESCE(metadata, '{}'::jsonb), created_at 
		          FROM river_alert_history WHERE serial = $1 ORDER BY time DESC LIMIT $2`
		rows, err = r.pool.Query(dbCtx, query, serial, limit)
	}

	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var history []*domain.AlertHistory
	for rows.Next() {
		h := &domain.AlertHistory{}
		var metaB []byte
		err := rows.Scan(&h.ID, &h.Time, &h.Serial, &h.AlertLevel, &h.AlertType, &h.Value, &h.Threshold, &h.Message, &h.Status, &metaB, &h.CreatedAt)
		if err != nil {
			return nil, err
		}
		_ = json.Unmarshal(metaB, &h.Metadata)
		history = append(history, h)
	}
	return history, nil
}

// ── Alert Subscriptions ─────────────────────────────────────────────────────

func (r *pgRiverRepository) GetSubscriptions(ctx context.Context, projectCode string) ([]*domain.AlertSubscription, error) {
	dbCtx, cancel := r.getCtx(ctx)
	defer cancel()

	query := `SELECT id, serial, project_code, callback_url, alert_types, is_active, created_at, updated_at 
	          FROM river_alert_subscription WHERE 1=1`
	var args []interface{}
	if projectCode != "" {
		query += " AND project_code = $1"
		args = append(args, projectCode)
	}

	rows, err := r.pool.Query(dbCtx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var subs []*domain.AlertSubscription
	for rows.Next() {
		s := &domain.AlertSubscription{}
		if err := rows.Scan(&s.ID, &s.Serial, &s.ProjectCode, &s.CallbackURL, &s.AlertTypes, &s.IsActive, &s.CreatedAt, &s.UpdatedAt); err != nil {
			return nil, err
		}
		subs = append(subs, s)
	}
	return subs, nil
}

func (r *pgRiverRepository) CreateSubscription(ctx context.Context, sub *domain.AlertSubscription) error {
	dbCtx, cancel := r.getCtx(ctx)
	defer cancel()

	query := `
		INSERT INTO river_alert_subscription (serial, project_code, callback_url, alert_types, is_active)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, created_at, updated_at
	`
	return r.pool.QueryRow(dbCtx, query, sub.Serial, sub.ProjectCode, sub.CallbackURL, sub.AlertTypes, sub.IsActive).
		Scan(&sub.ID, &sub.CreatedAt, &sub.UpdatedAt)
}

func (r *pgRiverRepository) UpdateSubscription(ctx context.Context, sub *domain.AlertSubscription) error {
	dbCtx, cancel := r.getCtx(ctx)
	defer cancel()

	query := `
		UPDATE river_alert_subscription
		SET serial = $1, project_code = $2, callback_url = $3, alert_types = $4, is_active = $5, updated_at = NOW()
		WHERE id = $6
		RETURNING updated_at
	`
	return r.pool.QueryRow(dbCtx, query, sub.Serial, sub.ProjectCode, sub.CallbackURL, sub.AlertTypes, sub.IsActive, sub.ID).
		Scan(&sub.UpdatedAt)
}

func (r *pgRiverRepository) DeleteSubscription(ctx context.Context, id int) error {
	dbCtx, cancel := r.getCtx(ctx)
	defer cancel()

	_, err := r.pool.Exec(dbCtx, "DELETE FROM river_alert_subscription WHERE id = $1", id)
	return err
}

// ── Freq Control ────────────────────────────────────────────────────────────

func (r *pgRiverRepository) GetFreqControl(ctx context.Context, serial string) (*domain.FreqControl, error) {
	dbCtx, cancel := r.getCtx(ctx)
	defer cancel()

	f := &domain.FreqControl{}
	query := `SELECT id, serial, original_duration_sec, current_duration_sec, trigger_reason, status, triggered_at, restored_at, cooldown_until, created_at 
	          FROM river_freq_control WHERE serial = $1`
	err := r.pool.QueryRow(dbCtx, query, serial).Scan(
		&f.ID, &f.Serial, &f.OriginalDurationSec, &f.CurrentDurationSec, &f.TriggerReason, &f.Status, &f.TriggeredAt, &f.RestoredAt, &f.CooldownUntil, &f.CreatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, errors.New("frequency control record not found")
	}
	return f, err
}

func (r *pgRiverRepository) GetActiveEscalations(ctx context.Context) ([]*domain.FreqControl, error) {
	dbCtx, cancel := r.getCtx(ctx)
	defer cancel()

	query := `SELECT id, serial, original_duration_sec, current_duration_sec, trigger_reason, status, triggered_at, restored_at, cooldown_until, created_at 
	          FROM river_freq_control WHERE status = 'ESCALATED'`
	rows, err := r.pool.Query(dbCtx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var escalations []*domain.FreqControl
	for rows.Next() {
		f := &domain.FreqControl{}
		err := rows.Scan(&f.ID, &f.Serial, &f.OriginalDurationSec, &f.CurrentDurationSec, &f.TriggerReason, &f.Status, &f.TriggeredAt, &f.RestoredAt, &f.CooldownUntil, &f.CreatedAt)
		if err != nil {
			return nil, err
		}
		escalations = append(escalations, f)
	}
	return escalations, nil
}

func (r *pgRiverRepository) RestoreFreqControl(ctx context.Context, serial string) error {
	dbCtx, cancel := r.getCtx(ctx)
	defer cancel()

	query := `UPDATE river_freq_control SET status = 'RESTORED', restored_at = NOW() WHERE serial = $1 AND status = 'ESCALATED'`
	_, err := r.pool.Exec(dbCtx, query, serial)
	return err
}

// ── Device Health ───────────────────────────────────────────────────────────

func (r *pgRiverRepository) GetDeviceHealth(ctx context.Context, serial string) ([]*domain.DeviceHealth, error) {
	dbCtx, cancel := r.getCtx(ctx)
	defer cancel()

	query := `SELECT id, serial, health_status, issue_type, message, last_seen_at, created_at 
	          FROM river_device_health WHERE serial = $1 ORDER BY created_at DESC LIMIT 50`
	rows, err := r.pool.Query(dbCtx, query, serial)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var health []*domain.DeviceHealth
	for rows.Next() {
		h := &domain.DeviceHealth{}
		if err := rows.Scan(&h.ID, &h.Serial, &h.HealthStatus, &h.IssueType, &h.Message, &h.LastSeenAt, &h.CreatedAt); err != nil {
			return nil, err
		}
		health = append(health, h)
	}
	return health, nil
}

func (r *pgRiverRepository) GetOfflineDevices(ctx context.Context) ([]*domain.DeviceHealth, error) {
	dbCtx, cancel := r.getCtx(ctx)
	defer cancel()

	query := `SELECT DISTINCT ON (serial) id, serial, health_status, issue_type, message, last_seen_at, created_at 
	          FROM river_device_health ORDER BY serial, created_at DESC`
	rows, err := r.pool.Query(dbCtx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var offlines []*domain.DeviceHealth
	for rows.Next() {
		h := &domain.DeviceHealth{}
		if err := rows.Scan(&h.ID, &h.Serial, &h.HealthStatus, &h.IssueType, &h.Message, &h.LastSeenAt, &h.CreatedAt); err != nil {
			return nil, err
		}
		if h.HealthStatus == "OFFLINE" {
			offlines = append(offlines, h)
		}
	}
	return offlines, nil
}

// ── Data Quality ────────────────────────────────────────────────────────────

func (r *pgRiverRepository) GetDQReports(ctx context.Context, serial string, limit int) ([]*domain.DQReport, error) {
	dbCtx, cancel := r.getCtx(ctx)
	defer cancel()

	if limit <= 0 {
		limit = 50
	}

	query := `SELECT id, time, serial, check_type, severity, message, details, detected_at, created_at 
	          FROM river_dq_report WHERE serial = $1 ORDER BY time DESC LIMIT $2`
	rows, err := r.pool.Query(dbCtx, query, serial, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var reports []*domain.DQReport
	for rows.Next() {
		d := &domain.DQReport{}
		var detailsB []byte
		err := rows.Scan(&d.ID, &d.Time, &d.Serial, &d.CheckType, &d.Severity, &d.Message, &detailsB, &d.DetectedAt, &d.CreatedAt)
		if err != nil {
			return nil, err
		}
		_ = json.Unmarshal(detailsB, &d.Details)
		reports = append(reports, d)
	}
	return reports, nil
}

func (r *pgRiverRepository) GetDQSummary(ctx context.Context) (map[string]interface{}, error) {
	dbCtx, cancel := r.getCtx(ctx)
	defer cancel()

	// 1. Get metrics counts from active issues
	queryMetrics := `
		SELECT check_type, COUNT(*) as count 
		FROM river_dq_active_issue 
		WHERE status = 'ACTIVE'
		GROUP BY check_type
	`
	rowsMetrics, err := r.pool.Query(dbCtx, queryMetrics)
	if err != nil {
		return nil, err
	}
	defer rowsMetrics.Close()

	metrics := map[string]int{
		"ANOMALY":      0,
		"DUPLICATE":    0,
		"GAP":          0,
		"STALE":        0,
		"INCONSISTENT": 0,
	}

	for rowsMetrics.Next() {
		var checkType string
		var count int
		if err := rowsMetrics.Scan(&checkType, &count); err != nil {
			return nil, err
		}
		metrics[checkType] = count
	}

	// 2. Get active reports
	queryReports := `
		SELECT serial, check_type, severity, message, details, detected_at 
		FROM river_dq_active_issue 
		WHERE status = 'ACTIVE'
		ORDER BY detected_at DESC
	`
	rowsReports, err := r.pool.Query(dbCtx, queryReports)
	if err != nil {
		return nil, err
	}
	defer rowsReports.Close()

	var reports []*domain.DQReport
	for rowsReports.Next() {
		d := &domain.DQReport{}
		var detailsB []byte
		err := rowsReports.Scan(&d.Serial, &d.CheckType, &d.Severity, &d.Message, &detailsB, &d.DetectedAt)
		if err != nil {
			return nil, err
		}
		_ = json.Unmarshal(detailsB, &d.Details)
		d.Time = d.DetectedAt
		d.CreatedAt = d.DetectedAt
		reports = append(reports, d)
	}

	summary := map[string]interface{}{
		"metrics":   metrics,
		"reports":   reports,
		"timestamp": time.Now(),
	}
	return summary, nil
}


// ── Settings ────────────────────────────────────────────────────────────────

func (r *pgRiverRepository) GetSettingByKey(ctx context.Context, key string) (*domain.Setting, error) {
	dbCtx, cancel := r.getCtx(ctx)
	defer cancel()

	s := &domain.Setting{}
	var valJSON []byte
	var desc *string
	query := "SELECT id, key, value, description, created_at, updated_at FROM river_setting WHERE key = $1"
	err := r.pool.QueryRow(dbCtx, query, key).Scan(&s.ID, &s.Key, &valJSON, &desc, &s.CreatedAt, &s.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, errors.New("setting not found")
	}
	if err != nil {
		return nil, err
	}

	_ = json.Unmarshal(valJSON, &s.Value)
	if desc != nil {
		s.Description = *desc
	}
	return s, nil
}

func (r *pgRiverRepository) SaveSetting(ctx context.Context, setting *domain.Setting) error {
	dbCtx, cancel := r.getCtx(ctx)
	defer cancel()

	valJSON, err := json.Marshal(setting.Value)
	if err != nil {
		return err
	}

	query := `
		INSERT INTO river_setting (key, value, description)
		VALUES ($1, $2, $3)
		ON CONFLICT (key) DO UPDATE
		SET value = EXCLUDED.value, description = EXCLUDED.description, updated_at = NOW()
		RETURNING id, created_at, updated_at
	`
	return r.pool.QueryRow(dbCtx, query, setting.Key, valJSON, setting.Description).Scan(&setting.ID, &setting.CreatedAt, &setting.UpdatedAt)
}

// ── Read Raw Data / Telemetry ───────────────────────────────────────────────

func (r *pgRiverRepository) GetLatestCurrentGroup(ctx context.Context, serial string) (*domain.CurrentGroup, error) {
	dbCtx, cancel := r.getCtx(ctx)
	defer cancel()

	g := &domain.CurrentGroup{}
	var freqDefJSON []byte
	var freqRespJSON []byte

	query := `
		SELECT serial, session, common_site_name, latitude, longitude, timestamp_utc, local_time_on_site, 
		       time_zone, time_zone_offset_in_sec, last_ping_latitude, last_ping_longitude, 
		       level_cm, snapshot_url0, snapshot_url1, snapshot_url2, deep_cm, cost, 
		       frequency_define, frequency_response, duration_sec, net_water_level_cm, water_level_pct, updated_at 
		FROM river_current_group 
		WHERE serial = $1
	`
	err := r.pool.QueryRow(dbCtx, query, serial).Scan(
		&g.Serial, &g.Session, &g.CommonSiteName, &g.Latitude, &g.Longitude, &g.TimestampUTC, &g.LocalTimeOnSite,
		&g.TimeZone, &g.TimeZoneOffsetSec, &g.LastPingLatitude, &g.LastPingLongitude,
		&g.LevelCM, &g.SnapshotURL0, &g.SnapshotURL1, &g.SnapshotURL2, &g.DeepCM, &g.Cost,
		&freqDefJSON, &freqRespJSON, &g.DurationSec, &g.NetWaterLevelCM, &g.WaterLevelPct, &g.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, errors.New("no current data for device")
	}
	if err != nil {
		return nil, err
	}

	_ = json.Unmarshal(freqDefJSON, &g.FrequencyDefine)
	_ = json.Unmarshal(freqRespJSON, &g.FrequencyResponse)
	return g, nil
}

func (r *pgRiverRepository) GetHistoricalStats(ctx context.Context, serial string, start, end time.Time) ([]*domain.CurrentStat, error) {
	dbCtx, cancel := r.getCtx(ctx)
	defer cancel()

	var query string
	var rows pgx.Rows
	var err error

	diff := end.Sub(start)
	if diff > 15 * 24 * time.Hour { // e.g. 30 days
		query = `
			SELECT time_bucket('1 hour', time) AS bucket_time, serial, MAX(session), MAX(common_site_name), 
			       AVG(latitude), AVG(longitude), time_bucket('1 hour', local_time_on_site) AS local_time, 
			       COALESCE(AVG(level_cm), 0), COALESCE(MAX(snapshot_url0), ''), COALESCE(MAX(snapshot_url1), ''), COALESCE(MAX(snapshot_url2), ''), 
			       NULL::jsonb, NULL::jsonb, COALESCE(AVG(net_water_level_cm), 0), COALESCE(AVG(water_level_pct), 0), MAX(created_at)
			FROM river_current_stat 
			WHERE serial = $1 AND time BETWEEN $2 AND $3 
			GROUP BY bucket_time, serial 
			ORDER BY bucket_time ASC
		`
		rows, err = r.pool.Query(dbCtx, query, serial, start, end)
	} else if diff > 48 * time.Hour { // e.g. 7 days
		query = `
			SELECT time_bucket('15 minutes', time) AS bucket_time, serial, MAX(session), MAX(common_site_name), 
			       AVG(latitude), AVG(longitude), time_bucket('15 minutes', local_time_on_site) AS local_time, 
			       COALESCE(AVG(level_cm), 0), COALESCE(MAX(snapshot_url0), ''), COALESCE(MAX(snapshot_url1), ''), COALESCE(MAX(snapshot_url2), ''), 
			       NULL::jsonb, NULL::jsonb, COALESCE(AVG(net_water_level_cm), 0), COALESCE(AVG(water_level_pct), 0), MAX(created_at)
			FROM river_current_stat 
			WHERE serial = $1 AND time BETWEEN $2 AND $3 
			GROUP BY bucket_time, serial 
			ORDER BY bucket_time ASC
		`
		rows, err = r.pool.Query(dbCtx, query, serial, start, end)
	} else {
		query = `
			SELECT time, serial, session, common_site_name, latitude, longitude, local_time_on_site, 
			       level_cm, snapshot_url0, snapshot_url1, snapshot_url2, 
			       frequency_define, frequency_response, net_water_level_cm, water_level_pct, created_at 
			FROM river_current_stat 
			WHERE serial = $1 AND time BETWEEN $2 AND $3 
			ORDER BY time ASC
		`
		rows, err = r.pool.Query(dbCtx, query, serial, start, end)
	}

	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var stats []*domain.CurrentStat
	for rows.Next() {
		s := &domain.CurrentStat{}
		var freqDefJSON []byte
		var freqRespJSON []byte

		err := rows.Scan(
			&s.Time, &s.Serial, &s.Session, &s.CommonSiteName, &s.Latitude, &s.Longitude, &s.LocalTimeOnSite,
			&s.LevelCM, &s.SnapshotURL0, &s.SnapshotURL1, &s.SnapshotURL2,
			&freqDefJSON, &freqRespJSON, &s.NetWaterLevelCM, &s.WaterLevelPct, &s.CreatedAt,
		)
		if err != nil {
			return nil, err
		}

		_ = json.Unmarshal(freqDefJSON, &s.FrequencyDefine)
		_ = json.Unmarshal(freqRespJSON, &s.FrequencyResponse)
		stats = append(stats, s)
	}
	return stats, nil
}

func (r *pgRiverRepository) GetWarningHistory(ctx context.Context, serial string, limit int) ([]*domain.WarningHistory, error) {
	dbCtx, cancel := r.getCtx(ctx)
	defer cancel()

	if limit <= 0 {
		limit = 100
	}

	query := `
		SELECT id, serial, warning_type, message, value, threshold, created_at 
		FROM river_warning_history 
		WHERE serial = $1 
		ORDER BY created_at DESC 
		LIMIT $2
	`
	rows, err := r.pool.Query(dbCtx, query, serial, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var history []*domain.WarningHistory
	for rows.Next() {
		w := &domain.WarningHistory{}
		if err := rows.Scan(&w.ID, &w.Serial, &w.WarningType, &w.Message, &w.Value, &w.Threshold, &w.CreatedAt); err != nil {
			return nil, err
		}
		history = append(history, w)
	}
	return history, nil
}
