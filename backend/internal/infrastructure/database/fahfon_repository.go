package database

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"ff-dashboard-mgmt/backend/internal/domain"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type fahfonRepository struct {
	pool *pgxpool.Pool
}

func NewFahfonRepository(pool *pgxpool.Pool) domain.FahfonRepository {
	return &fahfonRepository{pool: pool}
}

func (r *fahfonRepository) GetDevices(ctx context.Context, search string, sortBy string) ([]*domain.FahfonDeviceMaster, error) {
	query := `
		SELECT dm.id, 
		       COALESCE(dm.mongo_id, '') AS mongo_id, 
		       COALESCE(dm.station, '') AS station, 
		       COALESCE(dm.imei, '') AS imei, 
		       COALESCE(dm.owner, '') AS owner, 
		       COALESCE(dm.email, '') AS email, 
		       COALESCE(dm.site, '') AS site, 
		       COALESCE(NULLIF(fc.latitude, 0.0), dm.lat, 0.0) AS lat, 
		       COALESCE(NULLIF(fc.longitude, 0.0), dm.lng, 0.0) AS lng, 
		       COALESCE(dm.interval, 300) AS interval,
		       COALESCE(fc.time_onsite, '1970-01-01 00:00:00'::timestamp) AS time_onsite,
		       COALESCE(dm.uuid::text, '') AS uuid,
		       COALESCE(dm.account_id, '') AS account_id,
		       (fc.imei IS NOT NULL) AS has_telemetry,
		       COALESCE(NULLIF(fc.temp, -999.0), 0.0) AS temp,
		       COALESCE(NULLIF(fc.humid, -999.0), 0.0) AS humid,
		       COALESCE(NULLIF(fc.press, -999.0), 0.0) AS press,
		       COALESCE(NULLIF(fc.wind_speed, -999.0), 0.0) AS wind_speed,
		       COALESCE(NULLIF(fc.rain_rate, -999.0), 0.0) AS rain_rate,
		       COALESCE(NULLIF(fc.pm25, -999.0), 0.0) AS pm25,
		       COALESCE(NULLIF(fc.battery, -999.0), 0.0) AS battery,
		       COALESCE(NULLIF(fc.wind_direction, -999.0), 0.0) AS wind_direction,
		       COALESCE(NULLIF(fc.rain_hourly, -999.0), 0.0) AS rain_hourly,
		       COALESCE(NULLIF(fc.rain_daily, -999.0), 0.0) AS rain_daily,
		       COALESCE(NULLIF(fc.uv, -999.0), 0.0) AS uv,
		       COALESCE(NULLIF(fc.co2, -999.0), 0.0) AS co2,
		       COALESCE(NULLIF(fc.pm1, -999.0), 0.0) AS pm1,
		       COALESCE(NULLIF(fc.pm40, -999.0), 0.0) AS pm40,
		       COALESCE(NULLIF(fc.pm10, -999.0), 0.0) AS pm10,
		       COALESCE(NULLIF(fc.r_inten, -999.0), 0.0) AS r_inten,
		       COALESCE(NULLIF(fc.g_inten, -999.0), 0.0) AS g_inten,
		       COALESCE(NULLIF(fc.b_inten, -999.0), 0.0) AS b_inten,
		       COALESCE(NULLIF(fc.signal_strength, -999.0), 0.0) AS signal_strength
		FROM device_master dm
		LEFT JOIN LATERAL (
			SELECT 
				imei, time_onsite, latitude, longitude,
				temp, humid, press, wind_speed, rain_rate, pm25, battery,
				wind_direction, rain_hourly, rain_daily, uv, co2, pm1, pm40, pm10,
				r_inten, g_inten, b_inten, signal_strength
			FROM fahfon_current
			WHERE imei = dm.imei
			ORDER BY time_onsite DESC
			LIMIT 1
		) fc ON TRUE
	`
	
	var args []any
	var conditions []string

	if search != "" {
		conditions = append(conditions, "(dm.station ILIKE $1 OR dm.imei ILIKE $1 OR dm.owner ILIKE $1 OR dm.site ILIKE $1 OR dm.email ILIKE $1)")
		args = append(args, "%"+search+"%")
	}

	if len(conditions) > 0 {
		query += " WHERE " + strings.Join(conditions, " AND ")
	}

	// Add sorting by status or time onsite
	switch sortBy {
	case "station":
		query += " ORDER BY dm.station ASC"
	case "imei":
		query += " ORDER BY dm.imei ASC"
	default:
		// Default: sort by time_onsite DESC (most recent signal first)
		query += " ORDER BY time_onsite DESC"
	}

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("db: get devices: %w", err)
	}
	defer rows.Close()

	var devices []*domain.FahfonDeviceMaster

	// Load Bangkok timezone for correct timestamp offset in JSON output
	bangkok, err := time.LoadLocation("Asia/Bangkok")
	if err != nil {
		bangkok = time.FixedZone("ICT", 7*60*60) // Fallback to fixed +07:00
	}

	for rows.Next() {
		var dm domain.FahfonDeviceMaster
		var timeOnsite time.Time
		var hasTelemetry bool
		var temp, humid, press, windSpeed, rainRate, pm25, battery float64
		var windDirection, rainHourly, rainDaily, uv, co2, pm1, pm40, pm10, rInten, gInten, bInten, signalStrength float64
		
		err := rows.Scan(
			&dm.ID,
			&dm.MongoID,
			&dm.Station,
			&dm.Imei,
			&dm.Owner,
			&dm.Email,
			&dm.Site,
			&dm.Lat,
			&dm.Lng,
			&dm.Interval,
			&timeOnsite,
			&dm.UUID,
			&dm.AccountID,
			&hasTelemetry,
			&temp,
			&humid,
			&press,
			&windSpeed,
			&rainRate,
			&pm25,
			&battery,
			&windDirection,
			&rainHourly,
			&rainDaily,
			&uv,
			&co2,
			&pm1,
			&pm40,
			&pm10,
			&rInten,
			&gInten,
			&bInten,
			&signalStrength,
		)
		if err != nil {
			return nil, fmt.Errorf("db: scan device master: %w", err)
		}

		// Convert from UTC (pgx reads TIMESTAMP WITHOUT TZ as UTC) to Bangkok (+07:00)
		timeOnsiteBkk := time.Date(
			timeOnsite.Year(), timeOnsite.Month(), timeOnsite.Day(),
			timeOnsite.Hour(), timeOnsite.Minute(), timeOnsite.Second(),
			timeOnsite.Nanosecond(), bangkok,
		)

		// ACTIVE only if device has real telemetry AND it's within 6 hours
		// hasTelemetry=false means no fc row joined → device never sent data → OFFLINE
		dm.Status = "OFFLINE"
		if hasTelemetry && time.Now().In(bangkok).Sub(timeOnsiteBkk) <= 6*time.Hour {
			dm.Status = "ACTIVE"
		}
		dm.UpdatedAt = timeOnsiteBkk

		// Only set CurrentValue if device has real telemetry, so map/table shows N/A instead of 0.00
		if hasTelemetry {
			dm.CurrentValue = &domain.FahfonCurrent{
				Time:           timeOnsiteBkk,
				TimeOnsite:     timeOnsiteBkk,
				Temp:           temp,
				Humid:          humid,
				Press:          press,
				WindSpeed:      windSpeed,
				RainRate:       rainRate,
				PM25:           pm25,
				Battery:        battery,
				WindDirection:  windDirection,
				RainHourly:     rainHourly,
				RainDaily:      rainDaily,
				UV:             uv,
				CO2:            co2,
				PM1:            pm1,
				PM40:           pm40,
				PM10:           pm10,
				RInten:         rInten,
				GInten:         gInten,
				BInten:         bInten,
				SignalStrength: signalStrength,
			}
		}

		devices = append(devices, &dm)
	}
	return devices, nil
}

func (r *fahfonRepository) GetDeviceDetail(ctx context.Context, station string) (*domain.FahfonDeviceMaster, *domain.FahfonCurrent, error) {
	// 1. Fetch metadata (Supports dynamic query by UUID, Station Name, or IMEI for absolute compatibility)
	dmQuery := `
		SELECT id, 
		       COALESCE(mongo_id, '') AS mongo_id, 
		       COALESCE(station, '') AS station, 
		       COALESCE(imei, '') AS imei, 
		       COALESCE(owner, '') AS owner, 
		       COALESCE(email, '') AS email, 
		       COALESCE(site, '') AS site, 
		       COALESCE(lat, 0.0) AS lat, 
		       COALESCE(lng, 0.0) AS lng, 
		       COALESCE(secret_key, '') AS secret_key, 
		       COALESCE(interval, 300) AS interval, 
		       COALESCE(updated_at, '1970-01-01 00:00:00'::timestamp) AS updated_at,
		       COALESCE(uuid::text, '') AS uuid,
		       COALESCE(account_id, '') AS account_id
		FROM device_master
		WHERE uuid::text = $1 OR station = $1 OR imei = $1 OR imei = (SELECT imei FROM fahfon_current WHERE device_id = $1 LIMIT 1) LIMIT 1
	`
	var dm domain.FahfonDeviceMaster
	err := r.pool.QueryRow(ctx, dmQuery, station).Scan(
		&dm.ID,
		&dm.MongoID,
		&dm.Station,
		&dm.Imei,
		&dm.Owner,
		&dm.Email,
		&dm.Site,
		&dm.Lat,
		&dm.Lng,
		&dm.SecretKey,
		&dm.Interval,
		&dm.UpdatedAt,
		&dm.UUID,
		&dm.AccountID,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil, errors.New("device metadata not found")
		}
		return nil, nil, fmt.Errorf("db: get device detail: %w", err)
	}

	// 2. Fetch current values based on physical IMEI (to handle custom Thai station names cleanly)
	fcQuery := `
		SELECT device_id, time, time_onsite, imei, battery, signal_strength, latitude, longitude,
		       temp, humid, press, wind_speed, wind_direction, rain_rate, rain_hourly, rain_daily,
		       uv, co2, pm1, pm25, pm40, pm10, r_inten, g_inten, b_inten, n_inten, l_inten, updated_at
		FROM fahfon_current
		WHERE imei = $1 LIMIT 1
	`
	var fc domain.FahfonCurrent
	err = r.pool.QueryRow(ctx, fcQuery, dm.Imei).Scan(
		&fc.DeviceID,
		&fc.Time,
		&fc.TimeOnsite,
		&fc.Imei,
		&fc.Battery,
		&fc.SignalStrength,
		&fc.Latitude,
		&fc.Longitude,
		&fc.Temp,
		&fc.Humid,
		&fc.Press,
		&fc.WindSpeed,
		&fc.WindDirection,
		&fc.RainRate,
		&fc.RainHourly,
		&fc.RainDaily,
		&fc.UV,
		&fc.CO2,
		&fc.PM1,
		&fc.PM25,
		&fc.PM40,
		&fc.PM10,
		&fc.RInten,
		&fc.GInten,
		&fc.BInten,
		&fc.NInten,
		&fc.LInten,
		&fc.UpdatedAt,
	)
	
	// Active status mapping — apply Bangkok timezone fix (same as GetDevices)
	bangkokDet, errTz := time.LoadLocation("Asia/Bangkok")
	if errTz != nil {
		bangkokDet = time.FixedZone("ICT", 7*60*60)
	}
	dm.Status = "ACTIVE"
	if err == nil {
		// Re-interpret wall-clock as Bangkok time (DB stores TIMESTAMP WITHOUT TZ as local Bangkok)
		tsOnsiteBkk := time.Date(
			fc.TimeOnsite.Year(), fc.TimeOnsite.Month(), fc.TimeOnsite.Day(),
			fc.TimeOnsite.Hour(), fc.TimeOnsite.Minute(), fc.TimeOnsite.Second(),
			fc.TimeOnsite.Nanosecond(), bangkokDet,
		)
		if time.Now().In(bangkokDet).Sub(tsOnsiteBkk) > 6*time.Hour {
			dm.Status = "OFFLINE"
		}
		fc.Time = toBangkokTime(fc.Time)
		fc.TimeOnsite = tsOnsiteBkk
		fc.UpdatedAt = toBangkokTime(fc.UpdatedAt)
		dm.UpdatedAt = tsOnsiteBkk
	} else {
		dm.Status = "OFFLINE"
	}

	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return nil, nil, fmt.Errorf("db: get current values: %w", err)
	}

	if errors.Is(err, pgx.ErrNoRows) {
		return &dm, nil, nil
	}

	return &dm, &fc, nil
}

func (r *fahfonRepository) GetDeviceHistory(ctx context.Context, deviceID string, start, end time.Time, rangeType string) ([]*domain.FahfonCurrent, error) {
	var truncateUnit string
	switch rangeType {
	case "daily":
		truncateUnit = "day"
	case "monthly":
		truncateUnit = "month"
	default:
		truncateUnit = "hour"
	}

	var query string
	if rangeType == "hourly" {
		query = `
			SELECT time AS bucket_time,
			       battery, signal_strength,
			       latitude, longitude,
			       temp, humid, press,
			       wind_speed, wind_direction,
			       rain_rate, rain_hourly, rain_daily,
			       uv, co2, pm1, pm25, pm40, pm10,
			       r_inten, g_inten, b_inten, n_inten, l_inten
			FROM fahfon_current_stat
			WHERE device_id = $1 AND time BETWEEN $2 AND $3
			ORDER BY bucket_time DESC
			LIMIT 1000
		`
	} else {
		query = fmt.Sprintf(`
			SELECT date_trunc('%s', time) AS bucket_time,
			       AVG(battery) AS battery, AVG(signal_strength) AS signal_strength,
			       AVG(latitude) AS latitude, AVG(longitude) AS longitude,
			       AVG(temp) AS temp, AVG(humid) AS humid, AVG(press) AS press,
			       AVG(wind_speed) AS wind_speed, AVG(wind_direction) AS wind_direction,
			       AVG(rain_rate) AS rain_rate, AVG(rain_hourly) AS rain_hourly, AVG(rain_daily) AS rain_daily,
			       AVG(uv) AS uv, AVG(co2) AS co2, AVG(pm1) AS pm1, AVG(pm25) AS pm25, AVG(pm40) AS pm40, AVG(pm10) AS pm10,
			       AVG(r_inten) AS r_inten, AVG(g_inten) AS g_inten, AVG(b_inten) AS b_inten, AVG(n_inten) AS n_inten, AVG(l_inten) AS l_inten
			FROM fahfon_current_stat
			WHERE device_id = $1 AND time BETWEEN $2 AND $3
			GROUP BY bucket_time
			ORDER BY bucket_time DESC
			LIMIT 1000
		`, truncateUnit)
	}

	rows, err := r.pool.Query(ctx, query, deviceID, start, end)
	if err != nil {
		return nil, fmt.Errorf("db: get device history aggregated: %w", err)
	}
	defer rows.Close()

	var history []*domain.FahfonCurrent
	for rows.Next() {
		var h domain.FahfonCurrent
		var bucketTime time.Time
		h.DeviceID = deviceID
		err := rows.Scan(
			&bucketTime,
			&h.Battery,
			&h.SignalStrength,
			&h.Latitude,
			&h.Longitude,
			&h.Temp,
			&h.Humid,
			&h.Press,
			&h.WindSpeed,
			&h.WindDirection,
			&h.RainRate,
			&h.RainHourly,
			&h.RainDaily,
			&h.UV,
			&h.CO2,
			&h.PM1,
			&h.PM25,
			&h.PM40,
			&h.PM10,
			&h.RInten,
			&h.GInten,
			&h.BInten,
			&h.NInten,
			&h.LInten,
		)
		if err != nil {
			return nil, fmt.Errorf("db: scan history bucket: %w", err)
		}
		h.Time = toBangkokTime(bucketTime)
		h.TimeOnsite = toBangkokTime(bucketTime)
		history = append(history, &h)
	}
	return history, nil
}

func (r *fahfonRepository) GetConflictReport(ctx context.Context) ([]*domain.ConflictDevice, error) {
	query := `
		SELECT 'imei' AS field, 
		       COALESCE(imei, '') AS value, 
		       COUNT(*), 
		       array_agg(mongo_id::text),
		       json_agg(json_build_object(
		           'mongo_id', COALESCE(mongo_id::text, ''), 
		           'station', COALESCE(station, ''), 
		           'imei', COALESCE(imei, ''), 
		           'updated_at', COALESCE(updated_at, '1970-01-01 00:00:00'::timestamp)
		       )) AS records
		FROM device_master
		WHERE imei IS NOT NULL AND imei != ''
		GROUP BY imei
		HAVING COUNT(*) > 1
		UNION ALL
		SELECT 'station' AS field, 
		       COALESCE(station, '') AS value, 
		       COUNT(*), 
		       array_agg(mongo_id::text),
		       json_agg(json_build_object(
		           'mongo_id', COALESCE(mongo_id::text, ''), 
		           'station', COALESCE(station, ''), 
		           'imei', COALESCE(imei, ''), 
		           'updated_at', COALESCE(updated_at, '1970-01-01 00:00:00'::timestamp)
		       )) AS records
		FROM device_master
		WHERE station IS NOT NULL AND station != ''
		GROUP BY station
		HAVING COUNT(*) > 1
	`
	rows, err := r.pool.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("db: get conflict report: %w", err)
	}
	defer rows.Close()

	var conflicts []*domain.ConflictDevice
	for rows.Next() {
		var c domain.ConflictDevice
		var deviceIDs []string
		var recordsBytes []byte
		err := rows.Scan(&c.Field, &c.Value, &c.Count, &deviceIDs, &recordsBytes)
		if err != nil {
			return nil, fmt.Errorf("db: scan conflict: %w", err)
		}
		c.DeviceIDs = deviceIDs
		
		var recs []*domain.ConflictRecord
		if err := json.Unmarshal(recordsBytes, &recs); err != nil {
			fmt.Printf("db: unmarshal conflict records error: %v, json: %s\n", err, string(recordsBytes))
			c.Records = []*domain.ConflictRecord{}
		} else {
			c.Records = recs
		}

		conflicts = append(conflicts, &c)
	}
	return conflicts, nil
}

func (r *fahfonRepository) GetAnomalies(ctx context.Context) ([]*domain.DeviceAnomaly, error) {
	query := `
		SELECT id, device_id, sensor_type, reported_val, min_threshold, max_threshold, detected_at, resolved, resolved_at
		FROM device_anomalies
		ORDER BY detected_at DESC
		LIMIT 100
	`
	rows, err := r.pool.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("db: get active anomalies: %w", err)
	}
	defer rows.Close()

	var anomalies []*domain.DeviceAnomaly
	for rows.Next() {
		var a domain.DeviceAnomaly
		var resolvedAt sql.NullTime
		err := rows.Scan(
			&a.ID,
			&a.DeviceID,
			&a.SensorType,
			&a.ReportedVal,
			&a.MinThreshold,
			&a.MaxThreshold,
			&a.DetectedAt,
			&a.Resolved,
			&resolvedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("db: scan anomaly: %w", err)
		}
		a.DetectedAt = toBangkokTime(a.DetectedAt)
		if resolvedAt.Valid {
			bkkTime := toBangkokTime(resolvedAt.Time)
			a.ResolvedAt = &bkkTime
		}
		anomalies = append(anomalies, &a)
	}
	return anomalies, nil
}

func (r *fahfonRepository) GetNewAnomalies(ctx context.Context, lastID int32) ([]*domain.DeviceAnomaly, error) {
	query := `
		SELECT id, device_id, sensor_type, reported_val, min_threshold, max_threshold, detected_at, resolved, resolved_at
		FROM device_anomalies
		WHERE id > $1
		ORDER BY id ASC
	`
	rows, err := r.pool.Query(ctx, query, lastID)
	if err != nil {
		return nil, fmt.Errorf("db: get new anomalies: %w", err)
	}
	defer rows.Close()

	var anomalies []*domain.DeviceAnomaly
	for rows.Next() {
		var a domain.DeviceAnomaly
		var resolvedAt sql.NullTime
		err := rows.Scan(
			&a.ID,
			&a.DeviceID,
			&a.SensorType,
			&a.ReportedVal,
			&a.MinThreshold,
			&a.MaxThreshold,
			&a.DetectedAt,
			&a.Resolved,
			&resolvedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("db: scan new anomaly: %w", err)
		}
		a.DetectedAt = toBangkokTime(a.DetectedAt)
		if resolvedAt.Valid {
			bkkTime := toBangkokTime(resolvedAt.Time)
			a.ResolvedAt = &bkkTime
		}
		anomalies = append(anomalies, &a)
	}
	return anomalies, nil
}

func (r *fahfonRepository) GetSetting(ctx context.Context, key string) (*domain.SystemSetting, error) {
	query := `
		SELECT id, key, value, created_at, updated_at
		FROM system_settings
		WHERE key = $1 LIMIT 1
	`
	var s domain.SystemSetting
	var valBytes []byte
	err := r.pool.QueryRow(ctx, query, key).Scan(&s.ID, &s.Key, &valBytes, &s.CreatedAt, &s.UpdatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrNotFound
		}
		return nil, fmt.Errorf("db: get setting: %w", err)
	}

	var parsed any
	if err := json.Unmarshal(valBytes, &parsed); err == nil {
		s.Value = parsed
	} else {
		s.Value = string(valBytes)
	}
	return &s, nil
}

func (r *fahfonRepository) SaveSetting(ctx context.Context, key string, value any) error {
	query := `
		INSERT INTO system_settings (key, value, updated_at)
		VALUES ($1, $2, NOW())
		ON CONFLICT (key) DO UPDATE SET
			value = EXCLUDED.value,
			updated_at = NOW()
	`
	valBytes, err := json.Marshal(value)
	if err != nil {
		return fmt.Errorf("db: marshal setting value: %w", err)
	}

	_, err = r.pool.Exec(ctx, query, key, valBytes)
	if err != nil {
		return fmt.Errorf("db: save setting: %w", err)
	}
	return nil
}

func (r *fahfonRepository) UpdateDeviceStatus(ctx context.Context, station string, status string) error {
	query := `UPDATE device_master SET status = $1, updated_at = NOW() WHERE uuid::text = $2 OR station = $2`
	_, err := r.pool.Exec(ctx, query, status, station)
	if err != nil {
		return fmt.Errorf("db: update device status: %w", err)
	}
	return nil
}

func (r *fahfonRepository) ResolveDeviceAnomalies(ctx context.Context, station string) error {
	query := `UPDATE device_anomalies SET resolved = true, resolved_at = NOW() WHERE device_id = $1 AND resolved = false`
	_, err := r.pool.Exec(ctx, query, station)
	if err != nil {
		return fmt.Errorf("db: resolve active anomalies: %w", err)
	}
	return nil
}

func (r *fahfonRepository) GetThresholds(ctx context.Context) ([]*domain.SensorThreshold, error) {
	query := `
		SELECT id, sensor_type, min_val, max_val, description
		FROM sensor_thresholds
		ORDER BY sensor_type ASC
	`
	rows, err := r.pool.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("db: get thresholds: %w", err)
	}
	defer rows.Close()

	var thresholds []*domain.SensorThreshold
	for rows.Next() {
		var t domain.SensorThreshold
		err := rows.Scan(&t.ID, &t.SensorType, &t.MinVal, &t.MaxVal, &t.Description)
		if err != nil {
			return nil, fmt.Errorf("db: scan threshold: %w", err)
		}
		thresholds = append(thresholds, &t)
	}
	return thresholds, nil
}

func (r *fahfonRepository) UpdateThreshold(ctx context.Context, id int32, minVal, maxVal float64, desc string) error {
	query := `
		UPDATE sensor_thresholds
		SET min_val = $1, max_val = $2, description = $3, updated_at = NOW()
		WHERE id = $4
	`
	_, err := r.pool.Exec(ctx, query, minVal, maxVal, desc, id)
	if err != nil {
		return fmt.Errorf("db: update threshold: %w", err)
	}
	return nil
}

func (r *fahfonRepository) GetOfficialPages(ctx context.Context) ([]*domain.OfficialPage, error) {
	query := `
		SELECT COALESCE(email, '') AS email, COALESCE(account_id, '') AS account_id, COUNT(*) AS device_count
		FROM device_master
		WHERE email IS NOT NULL AND email != ''
		GROUP BY email, account_id
		ORDER BY email ASC
	`
	rows, err := r.pool.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("db: get official pages: %w", err)
	}
	defer rows.Close()

	var pages []*domain.OfficialPage
	for rows.Next() {
		var p domain.OfficialPage
		err := rows.Scan(&p.Email, &p.AccountID, &p.Count)
		if err != nil {
			return nil, fmt.Errorf("db: scan official page: %w", err)
		}
		pages = append(pages, &p)
	}
	return pages, nil
}

func toBangkokTime(t time.Time) time.Time {
	if t.IsZero() {
		return t
	}
	bangkok, err := time.LoadLocation("Asia/Bangkok")
	if err != nil {
		bangkok = time.FixedZone("ICT", 7*60*60)
	}
	return time.Date(
		t.Year(), t.Month(), t.Day(),
		t.Hour(), t.Minute(), t.Second(),
		t.Nanosecond(), bangkok,
	)
}
