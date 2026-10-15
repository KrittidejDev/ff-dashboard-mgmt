package external

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"time"

	"ff-dashboard-mgmt/backend/internal/domain"
)

// RiverServiceClient is an enterprise HTTP client communicating with ff-river-service.
type RiverServiceClient struct {
	baseURL    string
	httpClient *http.Client
}

func NewRiverServiceClient(baseURL string) *RiverServiceClient {
	if baseURL == "" {
		baseURL = "http://10.1.2.19:8081"
	}
	transport := &http.Transport{
		MaxIdleConns:        100,
		MaxIdleConnsPerHost: 50,
		IdleConnTimeout:     90 * time.Second,
	}
	return &RiverServiceClient{
		baseURL: baseURL,
		httpClient: &http.Client{
			Transport: transport,
			Timeout:   15 * time.Second,
		},
	}
}

func (c *RiverServiceClient) BaseURL() string {
	return c.baseURL
}

func (c *RiverServiceClient) doRequest(ctx context.Context, method, path string, body interface{}, out interface{}) error {
	fullURL := fmt.Sprintf("%s%s", c.baseURL, path)

	var reqBody io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("marshal request: %w", err)
		}
		reqBody = bytes.NewReader(b)
	}

	req, err := http.NewRequestWithContext(ctx, method, fullURL, reqBody)
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	masterKey := os.Getenv("CPS_INTERNAL_MASTER_KEY")
	if masterKey == "" {
		masterKey = "cps_master_4e281783f2dbfdd0a632da8b294a5492858c5b7ba1fb7c2c3eb7c8e0f8d008e2"
	}
	req.Header.Set("X-Master-Key", masterKey)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("execute request to %s: %w", fullURL, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		respBytes, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("river-service error (%d): %s", resp.StatusCode, string(respBytes))
	}

	if out != nil {
		if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
			return fmt.Errorf("decode response: %w", err)
		}
	}
	return nil
}

// ── Official Pages ───────────────────────────────────────────────────────────

func (c *RiverServiceClient) GetOfficialPages(ctx context.Context) ([]*domain.RiverOfficialPage, error) {
	var res []*domain.RiverOfficialPage
	err := c.doRequest(ctx, http.MethodGet, "/api/v1/official-pages", nil, &res)
	return res, err
}

func (c *RiverServiceClient) CreateOfficialPage(ctx context.Context, page *domain.RiverOfficialPage) error {
	return c.doRequest(ctx, http.MethodPost, "/api/v1/official-pages", page, page)
}

func (c *RiverServiceClient) UpdateOfficialPage(ctx context.Context, page *domain.RiverOfficialPage) error {
	path := fmt.Sprintf("/api/v1/official-pages/%d", page.ID)
	return c.doRequest(ctx, http.MethodPut, path, page, page)
}

func (c *RiverServiceClient) DeleteOfficialPage(ctx context.Context, id int) error {
	path := fmt.Sprintf("/api/v1/official-pages/%d", id)
	return c.doRequest(ctx, http.MethodDelete, path, nil, nil)
}

func (c *RiverServiceClient) LinkMunicipality(ctx context.Context, officialPageID int, municipalityID *string) (*domain.RiverOfficialPage, error) {
	path := fmt.Sprintf("/api/v1/official-pages/%d/link-municipality", officialPageID)
	payload := map[string]interface{}{"municipality_id": municipalityID}
	var res domain.RiverOfficialPage
	err := c.doRequest(ctx, http.MethodPost, path, payload, &res)
	return &res, err
}

func (c *RiverServiceClient) GetOfficialPageByMunicipalityID(ctx context.Context, municipalityID string) (*domain.RiverOfficialPage, error) {
	path := fmt.Sprintf("/api/v1/official-pages/by-municipality/%s", url.PathEscape(municipalityID))
	var res domain.RiverOfficialPage
	err := c.doRequest(ctx, http.MethodGet, path, nil, &res)
	return &res, err
}

// ── Devices ──────────────────────────────────────────────────────────────────

func (c *RiverServiceClient) GetDevices(ctx context.Context, pageID *int, status *string) ([]*domain.RiverDevice, error) {
	q := url.Values{}
	if pageID != nil {
		q.Set("official_page_id", strconv.Itoa(*pageID))
	}
	if status != nil {
		q.Set("status", *status)
	}
	path := "/api/v1/devices"
	if len(q) > 0 {
		path += "?" + q.Encode()
	}
	var res []*domain.RiverDevice
	err := c.doRequest(ctx, http.MethodGet, path, nil, &res)
	return res, err
}

func (c *RiverServiceClient) GetDevicesByOwner(ctx context.Context, email string) ([]*domain.RiverDevice, error) {
	path := fmt.Sprintf("/api/v1/devices?owner_email=%s", url.QueryEscape(email))
	var res []*domain.RiverDevice
	err := c.doRequest(ctx, http.MethodGet, path, nil, &res)
	return res, err
}

func (c *RiverServiceClient) GetDeviceBySerial(ctx context.Context, serial string) (*domain.RiverDevice, error) {
	path := fmt.Sprintf("/api/v1/devices/%s", url.PathEscape(serial))
	var res domain.RiverDevice
	err := c.doRequest(ctx, http.MethodGet, path, nil, &res)
	return &res, err
}

func (c *RiverServiceClient) CreateDevice(ctx context.Context, dev *domain.RiverDevice) error {
	return c.doRequest(ctx, http.MethodPost, "/api/v1/devices", dev, dev)
}

func (c *RiverServiceClient) UpdateDevice(ctx context.Context, dev *domain.RiverDevice) error {
	path := fmt.Sprintf("/api/v1/devices/%s", url.PathEscape(dev.Serial))
	return c.doRequest(ctx, http.MethodPut, path, dev, dev)
}

func (c *RiverServiceClient) DeleteDevice(ctx context.Context, serial string) error {
	path := fmt.Sprintf("/api/v1/devices/%s", url.PathEscape(serial))
	return c.doRequest(ctx, http.MethodDelete, path, nil, nil)
}

func (c *RiverServiceClient) GetUnregisteredSerials(ctx context.Context) ([]string, error) {
	var res []string
	err := c.doRequest(ctx, http.MethodGet, "/api/v1/devices/unregistered-serials", nil, &res)
	return res, err
}

func (c *RiverServiceClient) GetUnregisteredDevices(ctx context.Context) ([]*domain.RiverDevice, error) {
	var res []*domain.RiverDevice
	err := c.doRequest(ctx, http.MethodGet, "/api/v1/devices/unregistered", nil, &res)
	return res, err
}

// ── Device Config ────────────────────────────────────────────────────────────

func (c *RiverServiceClient) GetDeviceCalcConfig(ctx context.Context, serial string) (*domain.DeviceCalcConfig, error) {
	path := fmt.Sprintf("/api/v1/devices/%s/config", url.PathEscape(serial))
	var res domain.DeviceCalcConfig
	err := c.doRequest(ctx, http.MethodGet, path, nil, &res)
	return &res, err
}

func (c *RiverServiceClient) SaveDeviceCalcConfig(ctx context.Context, cfg *domain.DeviceCalcConfig) error {
	path := fmt.Sprintf("/api/v1/devices/%s/config", url.PathEscape(cfg.Serial))
	return c.doRequest(ctx, http.MethodPost, path, cfg, cfg)
}

func (c *RiverServiceClient) CalibrateDeviceBaseline(ctx context.Context, serial string, targetDistanceCM *float64) (*domain.DeviceCalcConfig, error) {
	path := fmt.Sprintf("/api/v1/devices/%s/calibrate", url.PathEscape(serial))
	payload := map[string]interface{}{"target_distance_cm": targetDistanceCM}
	var res domain.DeviceCalcConfig
	err := c.doRequest(ctx, http.MethodPost, path, payload, &res)
	return &res, err
}

func (c *RiverServiceClient) UpdateWaterLevel(ctx context.Context, serial string, netCM, pct float64) error {
	path := fmt.Sprintf("/api/v1/devices/%s/water-level", url.PathEscape(serial))
	payload := map[string]interface{}{"net_water_level_cm": netCM, "water_level_pct": pct}
	return c.doRequest(ctx, http.MethodPost, path, payload, nil)
}

// ── Alert Thresholds ─────────────────────────────────────────────────────────

func (c *RiverServiceClient) GetAlertThresholds(ctx context.Context, serial string) ([]*domain.AlertThreshold, error) {
	path := fmt.Sprintf("/api/v1/devices/%s/thresholds", url.PathEscape(serial))
	var res []*domain.AlertThreshold
	err := c.doRequest(ctx, http.MethodGet, path, nil, &res)
	return res, err
}

func (c *RiverServiceClient) CreateAlertThreshold(ctx context.Context, t *domain.AlertThreshold) error {
	path := fmt.Sprintf("/api/v1/devices/%s/thresholds", url.PathEscape(t.Serial))
	return c.doRequest(ctx, http.MethodPost, path, t, t)
}

func (c *RiverServiceClient) UpdateAlertThreshold(ctx context.Context, t *domain.AlertThreshold) error {
	path := fmt.Sprintf("/api/v1/thresholds/%d", t.ID)
	return c.doRequest(ctx, http.MethodPut, path, t, t)
}

func (c *RiverServiceClient) DeleteAlertThreshold(ctx context.Context, id int) (string, error) {
	path := fmt.Sprintf("/api/v1/thresholds/%d", id)
	var res map[string]interface{}
	err := c.doRequest(ctx, http.MethodDelete, path, nil, &res)
	serial, _ := res["serial"].(string)
	return serial, err
}

func (c *RiverServiceClient) GetAlertHistory(ctx context.Context, serial string, limit int) ([]*domain.AlertHistory, error) {
	path := fmt.Sprintf("/api/v1/devices/%s/alerts?limit=%d", url.PathEscape(serial), limit)
	var res []*domain.AlertHistory
	err := c.doRequest(ctx, http.MethodGet, path, nil, &res)
	return res, err
}

// ── Subscriptions ────────────────────────────────────────────────────────────

func (c *RiverServiceClient) GetSubscriptions(ctx context.Context, projectCode string) ([]*domain.AlertSubscription, error) {
	path := "/api/v1/subscriptions"
	if projectCode != "" {
		path += "?project_code=" + url.QueryEscape(projectCode)
	}
	var res []*domain.AlertSubscription
	err := c.doRequest(ctx, http.MethodGet, path, nil, &res)
	return res, err
}

func (c *RiverServiceClient) CreateSubscription(ctx context.Context, sub *domain.AlertSubscription) error {
	return c.doRequest(ctx, http.MethodPost, "/api/v1/subscriptions", sub, sub)
}

func (c *RiverServiceClient) UpdateSubscription(ctx context.Context, sub *domain.AlertSubscription) error {
	path := fmt.Sprintf("/api/v1/subscriptions/%d", sub.ID)
	return c.doRequest(ctx, http.MethodPut, path, sub, sub)
}

func (c *RiverServiceClient) DeleteSubscription(ctx context.Context, id int) error {
	path := fmt.Sprintf("/api/v1/subscriptions/%d", id)
	return c.doRequest(ctx, http.MethodDelete, path, nil, nil)
}

// ── Freq Control & Health ────────────────────────────────────────────────────

func (c *RiverServiceClient) GetFreqControl(ctx context.Context, serial string) (*domain.FreqControl, error) {
	path := fmt.Sprintf("/api/v1/devices/%s/freq-control", url.PathEscape(serial))
	var res domain.FreqControl
	err := c.doRequest(ctx, http.MethodGet, path, nil, &res)
	return &res, err
}

func (c *RiverServiceClient) GetActiveEscalations(ctx context.Context) ([]*domain.FreqControl, error) {
	var res []*domain.FreqControl
	err := c.doRequest(ctx, http.MethodGet, "/api/v1/freq-control/escalations", nil, &res)
	return res, err
}

func (c *RiverServiceClient) RestoreFreqControl(ctx context.Context, serial string) error {
	path := fmt.Sprintf("/api/v1/devices/%s/freq-control/restore", url.PathEscape(serial))
	return c.doRequest(ctx, http.MethodPost, path, nil, nil)
}

func (c *RiverServiceClient) GetDeviceHealth(ctx context.Context, serial string) ([]*domain.DeviceHealth, error) {
	path := fmt.Sprintf("/api/v1/devices/%s/health", url.PathEscape(serial))
	var res []*domain.DeviceHealth
	err := c.doRequest(ctx, http.MethodGet, path, nil, &res)
	return res, err
}

func (c *RiverServiceClient) GetOfflineDevices(ctx context.Context) ([]*domain.DeviceHealth, error) {
	var res []*domain.DeviceHealth
	err := c.doRequest(ctx, http.MethodGet, "/api/v1/health/offlines", nil, &res)
	return res, err
}

// ── Uptime Logs ──────────────────────────────────────────────────────────────

func (c *RiverServiceClient) GetUptimeLogs(ctx context.Context, serial, fromDate, toDate, status string, page, pageSize int) ([]*domain.RiverDeviceUptimeLog, int, error) {
	q := url.Values{}
	if serial != "" {
		q.Set("serial", serial)
	}
	if fromDate != "" {
		q.Set("from_date", fromDate)
	}
	if toDate != "" {
		q.Set("to_date", toDate)
	}
	if status != "" {
		q.Set("status", status)
	}
	q.Set("page", strconv.Itoa(page))
	q.Set("page_size", strconv.Itoa(pageSize))

	path := "/api/v1/uptime-logs?" + q.Encode()

	var resp struct {
		Data     []*domain.RiverDeviceUptimeLog `json:"data"`
		Total    int                            `json:"total"`
		Page     int                            `json:"page"`
		PageSize int                            `json:"page_size"`
	}

	err := c.doRequest(ctx, http.MethodGet, path, nil, &resp)
	return resp.Data, resp.Total, err
}

func (c *RiverServiceClient) GetUptimeSummary(ctx context.Context) (*domain.RiverUptimeSummary, error) {
	var res domain.RiverUptimeSummary
	err := c.doRequest(ctx, http.MethodGet, "/api/v1/uptime-summary", nil, &res)
	return &res, err
}

// ── DQ Reports & Raw Timeseries ──────────────────────────────────────────────

func (c *RiverServiceClient) GetDQReports(ctx context.Context, serial string, limit int) ([]*domain.DQReport, error) {
	path := fmt.Sprintf("/api/v1/devices/%s/dq-reports?limit=%d", url.PathEscape(serial), limit)
	var res []*domain.DQReport
	err := c.doRequest(ctx, http.MethodGet, path, nil, &res)
	return res, err
}

func (c *RiverServiceClient) GetDQSummary(ctx context.Context) (map[string]interface{}, error) {
	var res map[string]interface{}
	err := c.doRequest(ctx, http.MethodGet, "/api/v1/dq-summary", nil, &res)
	return res, err
}

func (c *RiverServiceClient) GetLatestCurrentGroup(ctx context.Context, serial string) (*domain.CurrentGroup, error) {
	path := fmt.Sprintf("/api/v1/devices/%s/current", url.PathEscape(serial))
	var res domain.CurrentGroup
	err := c.doRequest(ctx, http.MethodGet, path, nil, &res)
	return &res, err
}

func (c *RiverServiceClient) GetHistoricalStats(ctx context.Context, serial string, start, end time.Time) ([]*domain.CurrentStat, error) {
	q := url.Values{}
	q.Set("start", start.Format(time.RFC3339))
	q.Set("end", end.Format(time.RFC3339))
	path := fmt.Sprintf("/api/v1/devices/%s/stats?%s", url.PathEscape(serial), q.Encode())
	var res []*domain.CurrentStat
	err := c.doRequest(ctx, http.MethodGet, path, nil, &res)
	return res, err
}

func (c *RiverServiceClient) GetWarningHistory(ctx context.Context, serial string, limit int) ([]*domain.WarningHistory, error) {
	path := fmt.Sprintf("/api/v1/devices/%s/warnings?limit=%d", url.PathEscape(serial), limit)
	var res []*domain.WarningHistory
	err := c.doRequest(ctx, http.MethodGet, path, nil, &res)
	return res, err
}

// ── Settings ─────────────────────────────────────────────────────────────────

func (c *RiverServiceClient) GetSettingByKey(ctx context.Context, key string) (*domain.RiverSetting, error) {
	path := fmt.Sprintf("/api/v1/settings/%s", url.PathEscape(key))
	var res domain.RiverSetting
	err := c.doRequest(ctx, http.MethodGet, path, nil, &res)
	return &res, err
}

func (c *RiverServiceClient) SaveSetting(ctx context.Context, setting *domain.RiverSetting) error {
	return c.doRequest(ctx, http.MethodPost, "/api/v1/settings", setting, setting)
}

// ── Noise Audit & Reconcile ──────────────────────────────────────────────────

func (c *RiverServiceClient) GetNoiseAuditLogs(ctx context.Context, serial, eventType string, limit, offset int) ([]*domain.NoiseAuditLog, int, error) {
	q := url.Values{}
	if serial != "" {
		q.Set("serial", serial)
	}
	if eventType != "" {
		q.Set("event_type", eventType)
	}
	q.Set("limit", strconv.Itoa(limit))
	q.Set("offset", strconv.Itoa(offset))

	path := "/api/v1/noise-audit?" + q.Encode()

	var resp struct {
		Data   []*domain.NoiseAuditLog `json:"data"`
		Total  int                     `json:"total"`
		Limit  int                     `json:"limit"`
		Offset int                     `json:"offset"`
	}

	err := c.doRequest(ctx, http.MethodGet, path, nil, &resp)
	return resp.Data, resp.Total, err
}

func (c *RiverServiceClient) ReconcileDeviceUptimeLogs(ctx context.Context) error {
	return c.doRequest(ctx, http.MethodPost, "/api/v1/reconcile", nil, nil)
}

