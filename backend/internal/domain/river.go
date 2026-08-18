package domain

import (
	"context"
	"time"
)

// RiverOfficialPage represents river_official_page in database
type RiverOfficialPage struct {
	ID             int       `json:"id"`
	Name           string    `json:"name" validate:"required,min=3,max=100"`
	Code           string    `json:"code" validate:"required,max=50"`
	Description    string    `json:"description" validate:"max=500"`
	MunicipalityID *string   `json:"municipality_id"` // UUID of Mueangsmart Municipality (nullable)
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

// RiverDevice represents river_device in database
type RiverDevice struct {
	ID                  int        `json:"id"`
	Serial              string     `json:"serial" validate:"required,max=50"`
	OfficialPageID      *int       `json:"official_page_id"`
	Name                string     `json:"name" validate:"required,min=3,max=100"`
	Status              string     `json:"status" validate:"required,oneof=ACTIVE INACTIVE MAINTENANCE"` // ACTIVE, INACTIVE, MAINTENANCE
	Description         string     `json:"description" validate:"max=500"`
	OwnerEmail          string     `json:"owner_email"`
	OwnerID             string     `json:"owner_id"`
	InstallLatitude     string     `json:"install_latitude"`
	InstallLongitude    string     `json:"install_longitude"`
	OrganizationName    string     `json:"organization_name"`
	CCTVPath0           string     `json:"cctv_path_0"`
	CCTVPath1           string     `json:"cctv_path_1"`
	CCTVPath2           string     `json:"cctv_path_2"`
	LevelCM             *float64   `json:"level_cm,omitempty"`
	NetWaterLevelCM     *float64   `json:"net_water_level_cm,omitempty"`
	WaterLevelPct       *float64   `json:"water_level_pct,omitempty"`
	CreatedAt           time.Time  `json:"created_at"`
	UpdatedAt           time.Time  `json:"updated_at"`
	WarningStatus       string     `json:"warning_status,omitempty"`
	LastSeen            *time.Time `json:"last_seen,omitempty"`
	OfflineThresholdMin *int       `json:"offline_threshold_min,omitempty"`
	BottomToBankCM      *float64   `json:"bottom_to_bank_cm,omitempty"`
}

// RiverExportRequest represents payload for exporting device CSV
type RiverExportRequest struct {
	Serials   []string `json:"serials"`
	Search    string   `json:"search"`
	Status    string   `json:"status"`
	Tab       string   `json:"tab"` // "online", "offline", "all"
	SelectAll bool     `json:"select_all"`
	Columns   []string `json:"columns"`
}

// RiverColumnMeta represents metadata of exportable database column
type RiverColumnMeta struct {
	Key      string `json:"key"`
	Label    string `json:"label"`
	LabelEN  string `json:"label_en"`
	Category string `json:"category"`
}


// CurrentGroup represents river_current_group in database
type CurrentGroup struct {
	Serial            string                 `json:"serial"`
	Session           string                 `json:"session"`
	CommonSiteName    string                 `json:"common_site_name"`
	Latitude          float64                `json:"latitude"`
	Longitude         float64                `json:"longitude"`
	TimestampUTC      int64                  `json:"timestamp_utc"`
	LocalTimeOnSite   time.Time              `json:"local_time_on_site"`
	TimeZone          string                 `json:"time_zone"`
	TimeZoneOffsetSec int                    `json:"time_zone_offset_in_sec"`
	LastPingLatitude  float64                `json:"last_ping_latitude"`
	LastPingLongitude float64                `json:"last_ping_longitude"`
	LevelCM           float64                `json:"level_cm"`
	SnapshotURL0      string                 `json:"snapshot_url0"`
	SnapshotURL1      string                 `json:"snapshot_url1"`
	SnapshotURL2      string                 `json:"snapshot_url2"`
	DeepCM            float64                `json:"deep_cm"`
	Cost              float64                `json:"cost"`
	FrequencyDefine   map[string]interface{} `json:"frequency_define"`
	FrequencyResponse map[string]interface{} `json:"frequency_response"`
	DurationSec       int                    `json:"duration_sec"`
	NetWaterLevelCM   *float64               `json:"net_water_level_cm"`
	WaterLevelPct     *float64               `json:"water_level_pct"`
	UpdatedAt         time.Time              `json:"updated_at"`
}

// CurrentStat represents river_current_stat in database
type CurrentStat struct {
	Time              time.Time              `json:"time"`
	Serial            string                 `json:"serial"`
	Session           string                 `json:"session"`
	CommonSiteName    string                 `json:"common_site_name"`
	Latitude          float64                `json:"latitude"`
	Longitude         float64                `json:"longitude"`
	LocalTimeOnSite   time.Time              `json:"local_time_on_site"`
	LevelCM           float64                `json:"level_cm"`
	SnapshotURL0      string                 `json:"snapshot_url0"`
	SnapshotURL1      string                 `json:"snapshot_url1"`
	SnapshotURL2      string                 `json:"snapshot_url2"`
	FrequencyDefine   map[string]interface{} `json:"frequency_define"`
	FrequencyResponse map[string]interface{} `json:"frequency_response"`
	NetWaterLevelCM   *float64               `json:"net_water_level_cm"`
	WaterLevelPct     *float64               `json:"water_level_pct"`
	CreatedAt         time.Time              `json:"created_at"`
}

// DeviceCalcConfig represents river_device_config in database
type DeviceCalcConfig struct {
	ID                 int                    `json:"id"`
	Serial             string                 `json:"serial" validate:"required,max=50"`
	BottomToBankCM     float64                `json:"bottom_to_bank_cm"`
	BankToSensorCM     float64                `json:"bank_to_sensor_cm"`
	DefaultDurationSec int                    `json:"default_duration_sec"`
	SensorMode         string                 `json:"sensor_mode"`
	ExtraConfig        map[string]interface{} `json:"extra_config"`
	CreatedAt          time.Time              `json:"created_at"`
	UpdatedAt          time.Time              `json:"updated_at"`
}

// AlertThreshold represents river_alert_threshold in database
type AlertThreshold struct {
	ID              int       `json:"id"`
	Serial          string    `json:"serial" validate:"required"`
	AlertLevel      string    `json:"alert_level" validate:"required,oneof=WARNING CRITICAL EMERGENCY"`
	ThresholdCM     *float64  `json:"threshold_cm"`
	ThresholdPct    *float64  `json:"threshold_pct"`
	FreqDurationSec *int      `json:"freq_duration_sec"`
	IsActive        bool      `json:"is_active"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

// AlertHistory represents river_alert_history in database
type AlertHistory struct {
	ID         int64                  `json:"id"`
	Time       time.Time              `json:"time"`
	Serial     string                 `json:"serial"`
	AlertLevel string                 `json:"alert_level"`
	AlertType  string                 `json:"alert_type"`
	Value      float64                `json:"value"`
	Threshold  float64                `json:"threshold"`
	Message    string                 `json:"message"`
	Status     string                 `json:"status"`
	Metadata   map[string]interface{} `json:"metadata"`
	CreatedAt  time.Time              `json:"created_at"`
}

// AlertSubscription represents river_alert_subscription in database
type AlertSubscription struct {
	ID          int       `json:"id"`
	Serial      *string   `json:"serial"`
	ProjectCode string    `json:"project_code" validate:"required"`
	CallbackURL string    `json:"callback_url" validate:"required,url"`
	AlertTypes  []string  `json:"alert_types"`
	IsActive    bool      `json:"is_active"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// FreqControl represents river_freq_control in database
type FreqControl struct {
	ID                  int        `json:"id"`
	Serial              string     `json:"serial"`
	OriginalDurationSec int        `json:"original_duration_sec"`
	CurrentDurationSec  int        `json:"current_duration_sec"`
	TriggerReason       string     `json:"trigger_reason"`
	Status              string     `json:"status"` // 'NORMAL', 'ESCALATED', 'RESTORED'
	TriggeredAt         *time.Time `json:"triggered_at"`
	RestoredAt          *time.Time `json:"restored_at"`
	CooldownUntil       *time.Time `json:"cooldown_until"`
	CreatedAt           time.Time  `json:"created_at"`
}

// DeviceHealth represents river_device_health in database
type DeviceHealth struct {
	ID           int64     `json:"id"`
	Serial       string    `json:"serial"`
	HealthStatus string    `json:"health_status"` // 'ONLINE', 'OFFLINE', 'SENSOR_ERROR', 'SESSION_UNSTABLE'
	IssueType    string    `json:"issue_type"`
	Message      string    `json:"message"`
	LastSeenAt   time.Time `json:"last_seen_at"`
	CreatedAt    time.Time `json:"created_at"`
}

// DQReport represents river_dq_report in database
type DQReport struct {
	ID         int64                  `json:"id"`
	Time       time.Time              `json:"time"`
	Serial     string                 `json:"serial"`
	CheckType  string                 `json:"check_type"` // 'ANOMALY', 'DUPLICATE', 'GAP', 'STALE', 'INCONSISTENT'
	Severity   string                 `json:"severity"`   // 'INFO', 'WARNING', 'CRITICAL'
	Message    string                 `json:"message"`
	Details    map[string]interface{} `json:"details"`
	DetectedAt time.Time              `json:"detected_at"`
	CreatedAt  time.Time              `json:"created_at"`
}

// WarningHistory represents river_warning_history in database
type WarningHistory struct {
	ID          int64     `json:"id"`
	Serial      string    `json:"serial"`
	WarningType string    `json:"warning_type"`
	Message     string    `json:"message"`
	Value       float64   `json:"value"`
	Threshold   float64   `json:"threshold"`
	CreatedAt   time.Time `json:"created_at"`
}

// Setting represents river_setting in database
type Setting struct {
	ID          int                    `json:"id"`
	Key         string                 `json:"key" validate:"required,max=100"`
	Value       map[string]interface{} `json:"value" validate:"required"`
	Description string                 `json:"description" validate:"max=500"`
	CreatedAt   time.Time              `json:"created_at"`
	UpdatedAt   time.Time              `json:"updated_at"`
}

// RiverRepository definitions
type RiverRepository interface {
	// Official Pages
	GetOfficialPages(ctx context.Context) ([]*RiverOfficialPage, error)
	CreateOfficialPage(ctx context.Context, page *RiverOfficialPage) error
	UpdateOfficialPage(ctx context.Context, page *RiverOfficialPage) error
	DeleteOfficialPage(ctx context.Context, id int) error
	// Municipality Linking — binds a Mueangsmart Municipality UUID to an Official Page
	LinkMunicipality(ctx context.Context, officialPageID int, municipalityID *string) (*RiverOfficialPage, error)
	GetOfficialPageByMunicipalityID(ctx context.Context, municipalityID string) (*RiverOfficialPage, error)

	// Devices
	GetDevices(ctx context.Context, pageID *int, status *string) ([]*RiverDevice, error)
	GetDevicesByOwner(ctx context.Context, email string) ([]*RiverDevice, error)
	GetDeviceBySerial(ctx context.Context, serial string) (*RiverDevice, error)
	CreateDevice(ctx context.Context, dev *RiverDevice) error
	UpdateDevice(ctx context.Context, dev *RiverDevice) error
	DeleteDevice(ctx context.Context, serial string) error
	GetUnregisteredSerials(ctx context.Context) ([]string, error)
	GetUnregisteredDevices(ctx context.Context) ([]*RiverDevice, error)

	// Config
	GetDeviceCalcConfig(ctx context.Context, serial string) (*DeviceCalcConfig, error)
	SaveDeviceCalcConfig(ctx context.Context, cfg *DeviceCalcConfig) error
	UpdateWaterLevel(ctx context.Context, serial string, netCM, pct float64) error

	// Alert Thresholds
	GetAlertThresholds(ctx context.Context, serial string) ([]*AlertThreshold, error)
	CreateAlertThreshold(ctx context.Context, t *AlertThreshold) error
	UpdateAlertThreshold(ctx context.Context, t *AlertThreshold) error
	DeleteAlertThreshold(ctx context.Context, id int) (string, error)

	// Alert History
	GetAlertHistory(ctx context.Context, serial string, limit int) ([]*AlertHistory, error)

	// Alert Subscriptions
	GetSubscriptions(ctx context.Context, projectCode string) ([]*AlertSubscription, error)
	CreateSubscription(ctx context.Context, sub *AlertSubscription) error
	UpdateSubscription(ctx context.Context, sub *AlertSubscription) error
	DeleteSubscription(ctx context.Context, id int) error

	// Freq Control
	GetFreqControl(ctx context.Context, serial string) (*FreqControl, error)
	GetActiveEscalations(ctx context.Context) ([]*FreqControl, error)
	RestoreFreqControl(ctx context.Context, serial string) error

	// Device Health
	GetDeviceHealth(ctx context.Context, serial string) ([]*DeviceHealth, error)
	GetOfflineDevices(ctx context.Context) ([]*DeviceHealth, error)

	// Data Quality
	GetDQReports(ctx context.Context, serial string, limit int) ([]*DQReport, error)
	GetDQSummary(ctx context.Context) (map[string]interface{}, error)

	// Settings
	GetSettingByKey(ctx context.Context, key string) (*Setting, error)
	SaveSetting(ctx context.Context, setting *Setting) error

	// Read Raw/Timeseries Data
	GetLatestCurrentGroup(ctx context.Context, serial string) (*CurrentGroup, error)
	GetHistoricalStats(ctx context.Context, serial string, start, end time.Time) ([]*CurrentStat, error)
	GetWarningHistory(ctx context.Context, serial string, limit int) ([]*WarningHistory, error)

	// Health Check
	Ping(ctx context.Context) error
}
