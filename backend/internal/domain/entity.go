package domain

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
)

var ErrNotFound = errors.New("resource not found")

type UserRole string

const (
	RoleSuperAdmin UserRole = "SuperAdmin"
	RoleAdmin      UserRole = "Admin"
	RoleUser       UserRole = "user"
)

type SystemUser struct {
	ID           uuid.UUID `json:"id"`
	Username     string    `json:"username"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"-"`
	Role         UserRole  `json:"role"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type SystemAuditLog struct {
	ID        int64      `json:"id"`
	UserID    *uuid.UUID `json:"user_id,omitempty"`
	Username  string     `json:"username"`
	Action    string     `json:"action"`
	Resource  string     `json:"resource"`
	Details   any        `json:"details"`
	IPAddress string     `json:"ip_address"`
	UserAgent string     `json:"user_agent"`
	CreatedAt time.Time  `json:"created_at"`
}

type UserRegisterRequest struct {
	Username string   `json:"username"`
	Email    string   `json:"email"`
	Password string   `json:"password"`
	Role     UserRole `json:"role"`
}

type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type ChangePasswordRequest struct {
	CurrentPassword    string `json:"current_password"`
	NewPassword        string `json:"new_password"`
	ConfirmNewPassword string `json:"confirm_new_password"`
}

type LoginResponse struct {
	Token string     `json:"token"`
	User  SystemUser `json:"user"`
}

// Interfaces
type UserRepository interface {
	CreateUser(ctx context.Context, user *SystemUser) error
	GetUserByUsername(ctx context.Context, username string) (*SystemUser, error)
	GetUserByID(ctx context.Context, id uuid.UUID) (*SystemUser, error)
	ListUsers(ctx context.Context) ([]*SystemUser, error)
	DeleteUser(ctx context.Context, id uuid.UUID) error
	UpdatePassword(ctx context.Context, id uuid.UUID, newPasswordHash string) error
}

type AuditLogRepository interface {
	WriteLog(ctx context.Context, log *SystemAuditLog) error
	ListLogs(ctx context.Context, limit, offset int) ([]*SystemAuditLog, error)
}

type UserUsecase interface {
	Register(ctx context.Context, req *UserRegisterRequest) (*SystemUser, error)
	Login(ctx context.Context, req *LoginRequest) (*LoginResponse, error)
	GetUserByID(ctx context.Context, id uuid.UUID) (*SystemUser, error)
	ListUsers(ctx context.Context) ([]*SystemUser, error)
	DeleteUser(ctx context.Context, id uuid.UUID) error
	ChangePassword(ctx context.Context, userID uuid.UUID, req *ChangePasswordRequest) error
}

type AuditLogUsecase interface {
	RecordLog(ctx context.Context, userID *uuid.UUID, username, action, resource string, details any, ip, ua string)
	ListLogs(ctx context.Context, page, limit int) ([]*SystemAuditLog, error)
}

// ── Fahfon IoT Models ────────────────────────────────────────────────────────

type FahfonDeviceMaster struct {
	ID           int32          `json:"id"`
	UUID         string         `json:"uuid"`
	MongoID      string         `json:"mongo_id"`
	Station      string         `json:"station"`
	Imei         string         `json:"imei"`
	Owner        string         `json:"owner"`
	Email        string         `json:"email"`
	AccountID    string         `json:"account_id"`
	Site         string         `json:"site"`
	Lat          float64        `json:"lat"`
	Lng          float64        `json:"lng"`
	SecretKey    string         `json:"secret_key,omitempty"`
	Interval     int32          `json:"interval"`
	Status       string         `json:"status"` // OFFLINE, ACTIVE
	UpdatedAt    time.Time      `json:"updated_at"`
	CurrentValue *FahfonCurrent `json:"current_value,omitempty"`
}

type FahfonCurrent struct {
	DeviceID       string    `json:"device_id"`
	Time           time.Time `json:"time"`
	TimeOnsite     time.Time `json:"time_onsite"`
	Imei           string    `json:"imei"`
	Battery        float64   `json:"battery"`
	SignalStrength float64   `json:"signal_strength"`
	Latitude       float64   `json:"latitude"`
	Longitude      float64   `json:"longitude"`
	Temp           float64   `json:"temp"`
	Humid          float64   `json:"humid"`
	Press          float64   `json:"press"`
	WindSpeed      float64   `json:"wind_speed"`
	WindDirection  float64   `json:"wind_direction"`
	RainRate       float64   `json:"rain_rate"`
	RainHourly     float64   `json:"rain_hourly"`
	RainDaily      float64   `json:"rain_daily"`
	UV             float64   `json:"uv"`
	CO2            float64   `json:"co2"`
	PM1            float64   `json:"pm1"`
	PM25           float64   `json:"pm25"`
	PM40           float64   `json:"pm40"`
	PM10           float64   `json:"pm10"`
	RInten         float64   `json:"r_inten"`
	GInten         float64   `json:"g_inten"`
	BInten         float64   `json:"b_inten"`
	NInten         float64   `json:"n_inten"`
	LInten         float64   `json:"l_inten"`
	UpdatedAt      time.Time `json:"updated_at"`
}

type ConflictRecord struct {
	MongoID   string `json:"mongo_id"`
	Station   string `json:"station"`
	Imei      string `json:"imei"`
	UpdatedAt string `json:"updated_at"`
	CreatedAt string `json:"created_at,omitempty"`
}

type ConflictDevice struct {
	Field     string            `json:"field"` // "imei" or "station"
	Value     string            `json:"value"` // The duplicated value
	Count     int               `json:"count"`
	DeviceIDs []string          `json:"device_ids"` // List of mongo_ids sharing this value
	Records   []*ConflictRecord `json:"records"`    // Detailed records sharing this value
}

type DeviceAnomaly struct {
	ID           int32      `json:"id"`
	DeviceID     string     `json:"device_id"`
	SensorType   string     `json:"sensor_type"`
	ReportedVal  float64    `json:"reported_val"`
	MinThreshold float64    `json:"min_threshold"`
	MaxThreshold float64    `json:"max_threshold"`
	DetectedAt   time.Time  `json:"detected_at"`
	Resolved     bool       `json:"resolved"`
	ResolvedAt   *time.Time `json:"resolved_at,omitempty"`
}

type SensorThreshold struct {
	ID          int32   `json:"id"`
	SensorType  string  `json:"sensor_type"`
	MinVal      float64 `json:"min_val"`
	MaxVal      float64 `json:"max_val"`
	Description string  `json:"description"`
}

type SystemSetting struct {
	ID        int32     `json:"id"`
	Key       string    `json:"key"`
	Value     any       `json:"value"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type OfficialPage struct {
	Email     string `json:"email"`
	AccountID string `json:"account_id"`
	Count     int    `json:"device_count"`
}

type FahfonRepository interface {
	GetDevices(ctx context.Context, search string, sortBy string, officialPage string) ([]*FahfonDeviceMaster, error)
	GetDeviceDetail(ctx context.Context, station string) (*FahfonDeviceMaster, *FahfonCurrent, error)
	GetDeviceHistory(ctx context.Context, deviceID string, start, end time.Time, rangeType string) ([]*FahfonCurrent, error)
	GetConflictReport(ctx context.Context) ([]*ConflictDevice, error)
	GetOfficialPages(ctx context.Context) ([]*OfficialPage, error)

	// Anomalies & Settings
	GetAnomalies(ctx context.Context) ([]*DeviceAnomaly, error)
	GetNewAnomalies(ctx context.Context, lastID int32) ([]*DeviceAnomaly, error)
	GetSetting(ctx context.Context, key string) (*SystemSetting, error)
	SaveSetting(ctx context.Context, key string, value any) error
	UpdateDeviceStatus(ctx context.Context, station string, status string) error
	ResolveDeviceAnomalies(ctx context.Context, station string) error
	GetThresholds(ctx context.Context) ([]*SensorThreshold, error)
	UpdateThreshold(ctx context.Context, id int32, minVal, maxVal float64, desc string) error
}

type FahfonUsecase interface {
	ListDevices(ctx context.Context, search string, sortBy string, officialPage string) ([]*FahfonDeviceMaster, error)
	GetDeviceDetail(ctx context.Context, station string, rangeType string) (*FahfonDeviceMaster, *FahfonCurrent, []*FahfonCurrent, error)
	GetConflictReport(ctx context.Context) ([]*ConflictDevice, error)
	ListOfficialPages(ctx context.Context) ([]*OfficialPage, error)

	// Anomalies & Settings
	ListAnomalies(ctx context.Context) ([]*DeviceAnomaly, error)
	GetWarningEmails(ctx context.Context) ([]string, error)
	SaveWarningEmails(ctx context.Context, emails []string) error
	UpdateDeviceStatus(ctx context.Context, station string, status string) error
	GetThresholds(ctx context.Context) ([]*SensorThreshold, error)
	UpdateThreshold(ctx context.Context, id int32, minVal, maxVal float64, desc string) error
}

// ── MongoDB Dynamic Telemetry Schemas ────────────────────────────────────────

type MongoDeviceRegistered struct {
	ID             string  `json:"id" bson:"_id,omitempty"`
	AccountID      string  `json:"accountId" bson:"accountId"`
	Imei           string  `json:"imei" bson:"imei"`
	StationID      string  `json:"station" bson:"station"`
	RegisType      string  `json:"regisType" bson:"regisType"`
	CommonSiteName string  `json:"commonSiteName" bson:"commonSiteName"`
	OwnerName      string  `json:"owner" bson:"owner"`
	Email          string  `json:"email" bson:"email"`
	Latitude       float64 `json:"latitude" bson:"latitude"`
	Longitude      float64 `json:"longitude" bson:"longitude"`
	Height         float64 `json:"height" bson:"height"`
	ReportInterval int32   `json:"interval" bson:"interval"`
	IsVerify       int32   `json:"isverify" bson:"isverify"`
	Issue          string  `json:"issue" bson:"issue"`
	DIPort00       string  `json:"diPort00" bson:"diPort00"`
	DIPort01       string  `json:"diPort01" bson:"diPort01"`
	DIPort02       string  `json:"diPort02" bson:"diPort02"`
	DIPort03       string  `json:"diPort03" bson:"diPort03"`
	DIPort04       string  `json:"diPort04" bson:"diPort04"`
	DIPort05       string  `json:"diPort05" bson:"diPort05"`
	DIPort06       string  `json:"diPort06" bson:"diPort06"`
	DIPort07       string  `json:"diPort07" bson:"diPort07"`
}

type MongoDeviceInfo struct {
	ID               string `json:"id" bson:"_id,omitempty"`
	Imei             string `json:"imei" bson:"imei"`
	SerialNumber     string `json:"serial" bson:"serial"`
	SecretKey        string `json:"secretKey" bson:"secretKey"`
	CommonSiteName   string `json:"commonSiteName" bson:"commonSiteName"`
	RegistrationDate string `json:"registrationDate" bson:"registrationDate"`
	Station          string `json:"station" bson:"station"`
	RegisType        string `json:"regisType" bson:"regisType"`
	PurchaseDate     string `json:"purchaseDate" bson:"purchaseDate"`
	ShippingDate     string `json:"shippingDate" bson:"shippingDate"`
}

type MongoRepository interface {
	ListRegistrations(ctx context.Context) ([]*MongoDeviceRegistered, error)
	GetRegistration(ctx context.Context, id string) (*MongoDeviceRegistered, error)
	CreateRegistration(ctx context.Context, reg *MongoDeviceRegistered) (string, error)
	UpdateRegistration(ctx context.Context, id string, reg *MongoDeviceRegistered) error
	DeleteRegistration(ctx context.Context, id string) error

	ListSpecifications(ctx context.Context) ([]*MongoDeviceInfo, error)
	GetSpecification(ctx context.Context, id string) (*MongoDeviceInfo, error)
	CreateSpecification(ctx context.Context, spec *MongoDeviceInfo) (string, error)
	UpdateSpecification(ctx context.Context, id string, spec *MongoDeviceInfo) error
	DeleteSpecification(ctx context.Context, id string) error
}

type MongoUsecase interface {
	ListRegistrations(ctx context.Context) ([]*MongoDeviceRegistered, error)
	CreateRegistration(ctx context.Context, reg *MongoDeviceRegistered) (string, error)
	UpdateRegistration(ctx context.Context, id string, reg *MongoDeviceRegistered) error
	DeleteRegistration(ctx context.Context, id string) error

	ListSpecifications(ctx context.Context) ([]*MongoDeviceInfo, error)
	CreateSpecification(ctx context.Context, spec *MongoDeviceInfo) (string, error)
	UpdateSpecification(ctx context.Context, id string, spec *MongoDeviceInfo) error
	DeleteSpecification(ctx context.Context, id string) error
}
