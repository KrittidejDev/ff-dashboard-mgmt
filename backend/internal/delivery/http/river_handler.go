package http

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"ff-dashboard-mgmt/backend/internal/domain"
	"ff-dashboard-mgmt/backend/internal/infrastructure/external"

	"github.com/go-playground/validator/v10"
	"github.com/gofiber/fiber/v3"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

type RiverHandler struct {
	client       *external.RiverServiceClient
	rdb          *redis.Client
	validate     *validator.Validate
	logger       *zap.Logger
	streamClient *external.StreamClient
}

func NewRiverHandler(client *external.RiverServiceClient, rdb *redis.Client, sc *external.StreamClient, logger *zap.Logger) *RiverHandler {
	return &RiverHandler{
		client:       client,
		rdb:          rdb,
		validate:     validator.New(),
		logger:       logger,
		streamClient: sc,
	}
}

// ── RiverOfficial Pages Handlers ───────────────────────────────────────────────

func (h *RiverHandler) GetOfficialPages(c fiber.Ctx) error {
	pages, err := h.client.GetOfficialPages(c.Context())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(pages)
}

func (h *RiverHandler) CreateOfficialPage(c fiber.Ctx) error {
	page := &domain.RiverOfficialPage{}
	if err := c.Bind().JSON(page); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	if err := h.validate.Struct(page); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	if err := h.client.CreateOfficialPage(c.Context(), page); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(fiber.StatusCreated).JSON(page)
}

func (h *RiverHandler) UpdateOfficialPage(c fiber.Ctx) error {
	idStr := c.Params("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid ID format"})
	}

	page := &domain.RiverOfficialPage{}
	if err := c.Bind().JSON(page); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}
	page.ID = id

	if err := h.validate.Struct(page); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	if err := h.client.UpdateOfficialPage(c.Context(), page); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(page)
}

func (h *RiverHandler) DeleteOfficialPage(c fiber.Ctx) error {
	idStr := c.Params("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid ID format"})
	}

	if err := h.client.DeleteOfficialPage(c.Context(), id); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"message": "Official page deleted successfully"})
}

// LinkMunicipality binds (or unbinds) a Mueangsmart Municipality UUID to an Official Page.
// PUT /api/v1/river/official-pages/:id/link-municipality
// Body: { "municipality_id": "uuid-string" }  OR { "municipality_id": null } to unlink
func (h *RiverHandler) LinkMunicipality(c fiber.Ctx) error {
	idStr := c.Params("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid official page ID"})
	}

	var body struct {
		MunicipalityID *string `json:"municipality_id"`
	}
	if err := c.Bind().JSON(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	page, err := h.client.LinkMunicipality(c.Context(), id, body.MunicipalityID)
	if err != nil {
		if err.Error() == "official page not found" {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
		}
		// Unique constraint violation — municipality already linked to another page
		if errMsg := err.Error(); len(errMsg) > 0 {
			if contains(errMsg, "uix_official_page_municipality_id") || contains(errMsg, "unique") {
				return c.Status(fiber.StatusConflict).JSON(fiber.Map{
					"error": "this municipality is already linked to another official page",
				})
			}
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(page)
}

// GetOfficialPageByMunicipalityID resolves the official page for a given Mueangsmart municipality UUID.
// GET /api/v1/river/official-pages/by-municipality/:municipalityId
// Used by ff-river-service to translate municipality.id → official_page.code for data isolation.
func (h *RiverHandler) GetOfficialPageByMunicipalityID(c fiber.Ctx) error {
	municipalityID := c.Params("municipalityId")
	if municipalityID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "municipalityId is required"})
	}

	page, err := h.client.GetOfficialPageByMunicipalityID(c.Context(), municipalityID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(page)
}

// contains is a helper for case-insensitive substring matching on error messages
func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr ||
		len(s) > 0 && len(substr) > 0 &&
			func() bool {
				for i := 0; i <= len(s)-len(substr); i++ {
					if s[i:i+len(substr)] == substr {
						return true
					}
				}
				return false
			}())
}

// ── Devices Handlers ─────────────────────────────────────────────────────────

func (h *RiverHandler) GetDevices(c fiber.Ctx) error {
	var pageID *int
	if pageIDStr := c.Query("official_page_id"); pageIDStr != "" {
		if val, err := strconv.Atoi(pageIDStr); err == nil {
			pageID = &val
		}
	}

	var status *string
	if statusStr := c.Query("status"); statusStr != "" {
		status = &statusStr
	}

	// Short-lived Redis cache for default device queries (10s) to absorb high-frequency War Room polling
	isDefaultQuery := (pageID == nil && status == nil)
	cacheKey := "ff:river:devices_cache:all"
	if isDefaultQuery && h.rdb != nil {
		if cached, err := h.rdb.Get(c.Context(), cacheKey).Result(); err == nil && cached != "" {
			var cachedDevices []*domain.RiverDevice
			if err := json.Unmarshal([]byte(cached), &cachedDevices); err == nil && len(cachedDevices) > 0 {
				return c.JSON(cachedDevices)
			}
		}
	}

	devices, err := h.client.GetDevices(c.Context(), pageID, status)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	if len(devices) > 0 && h.rdb != nil {
		keys := make([]string, len(devices))
		for i, dev := range devices {
			keys[i] = "ff:river:active_alert:" + dev.Serial
		}

		vals, err := h.rdb.MGet(c.Context(), keys...).Result()
		if err == nil {
			for i, val := range vals {
				if valStr, ok := val.(string); ok && valStr != "" {
					if len(valStr) >= 2 && valStr[0] == '"' && valStr[len(valStr)-1] == '"' {
						valStr = valStr[1 : len(valStr)-1]
					}
					devices[i].WarningStatus = valStr
				} else {
					devices[i].WarningStatus = "NORMAL"
				}
			}
		} else {
			for _, dev := range devices {
				dev.WarningStatus = "NORMAL"
			}
		}

		if isDefaultQuery {
			if data, err := json.Marshal(devices); err == nil {
				_ = h.rdb.Set(c.Context(), cacheKey, data, 10*time.Second)
			}
		}
	} else {
		for _, dev := range devices {
			dev.WarningStatus = "NORMAL"
		}
	}

	return c.JSON(devices)
}

func (h *RiverHandler) GetDeviceBySerial(c fiber.Ctx) error {
	serial := c.Params("serial")
	if serial == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "serial is required"})
	}

	dev, err := h.client.GetDeviceBySerial(c.Context(), serial)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	}

	if h.rdb != nil {
		alertKey := "ff:river:active_alert:" + dev.Serial
		if val, err := h.rdb.Get(c.Context(), alertKey).Result(); err == nil && val != "" {
			if len(val) >= 2 && val[0] == '"' && val[len(val)-1] == '"' {
				val = val[1 : len(val)-1]
			}
			dev.WarningStatus = val
		} else {
			dev.WarningStatus = "NORMAL"
		}
	} else {
		dev.WarningStatus = "NORMAL"
	}

	return c.JSON(dev)
}

type deviceRequest struct {
	ID               int    `json:"id"`
	Serial           string `json:"serial" validate:"required,max=50"`
	OfficialPageID   *int   `json:"official_page_id"`
	Name             string `json:"name" validate:"required,min=3,max=100"`
	Status           string `json:"status" validate:"required,oneof=ACTIVE INACTIVE MAINTENANCE"`
	Description      string `json:"description" validate:"max=500"`
	OwnerEmail       string `json:"owner_email"`
	OwnerID          string `json:"owner_id"`
	InstallLatitude  string `json:"install_latitude"`
	InstallLongitude string `json:"install_longitude"`
	OrganizationName string `json:"organization_name"`
	CCTVPath0        string `json:"cctv_path_0"`
	CCTVPath1        string `json:"cctv_path_1"`
	CCTVPath2        string `json:"cctv_path_2"`
}

func (h *RiverHandler) CreateDevice(c fiber.Ctx) error {
	req := &deviceRequest{}
	if err := c.Bind().JSON(req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body: " + err.Error()})
	}

	if err := h.validate.Struct(req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	dev := &domain.RiverDevice{
		ID:               req.ID,
		Serial:           req.Serial,
		OfficialPageID:   req.OfficialPageID,
		Name:             req.Name,
		Status:           req.Status,
		Description:      req.Description,
		OwnerEmail:       req.OwnerEmail,
		OwnerID:          req.OwnerID,
		InstallLatitude:  req.InstallLatitude,
		InstallLongitude: req.InstallLongitude,
		OrganizationName: req.OrganizationName,
		CCTVPath0:        req.CCTVPath0,
		CCTVPath1:        req.CCTVPath1,
		CCTVPath2:        req.CCTVPath2,
	}

	if err := h.client.CreateDevice(c.Context(), dev); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(fiber.StatusCreated).JSON(dev)
}

func (h *RiverHandler) UpdateDevice(c fiber.Ctx) error {
	serial := c.Params("serial")
	if serial == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "serial is required"})
	}

	req := &deviceRequest{}
	if err := c.Bind().JSON(req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body: " + err.Error()})
	}
	req.Serial = serial

	if err := h.validate.Struct(req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	dev := &domain.RiverDevice{
		Serial:           req.Serial,
		OfficialPageID:   req.OfficialPageID,
		Name:             req.Name,
		Status:           req.Status,
		Description:      req.Description,
		OwnerEmail:       req.OwnerEmail,
		OwnerID:          req.OwnerID,
		InstallLatitude:  req.InstallLatitude,
		InstallLongitude: req.InstallLongitude,
		OrganizationName: req.OrganizationName,
		CCTVPath0:        req.CCTVPath0,
		CCTVPath1:        req.CCTVPath1,
		CCTVPath2:        req.CCTVPath2,
	}

	if err := h.client.UpdateDevice(c.Context(), dev); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(dev)
}

func (h *RiverHandler) DeleteDevice(c fiber.Ctx) error {
	serial := c.Params("serial")
	if serial == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "serial is required"})
	}

	if err := h.client.DeleteDevice(c.Context(), serial); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"message": "Device deleted successfully"})
}

func (h *RiverHandler) GetUnregisteredSerials(c fiber.Ctx) error {
	serials, err := h.client.GetUnregisteredSerials(c.Context())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(serials)
}

func (h *RiverHandler) GetUnregisteredDevices(c fiber.Ctx) error {
	devices, err := h.client.GetUnregisteredDevices(c.Context())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(devices)
}

// ── Device Calc Config Handlers ──────────────────────────────────────────────

func (h *RiverHandler) GetDeviceCalcConfig(c fiber.Ctx) error {
	serial := c.Params("serial")
	if serial == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "serial is required"})
	}

	url := fmt.Sprintf("%s/api/v1/devices/%s/calc-config", h.client.BaseURL(), serial)
	req, err := http.NewRequestWithContext(c.Context(), http.MethodGet, url, nil)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to build request to river service"})
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": "failed to contact river service"})
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return c.Status(resp.StatusCode).Send(bodyBytes)
	}

	var cfg domain.DeviceCalcConfig
	if err := json.NewDecoder(resp.Body).Decode(&cfg); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to decode response"})
	}
	return c.JSON(cfg)
}

func (h *RiverHandler) SaveDeviceCalcConfig(c fiber.Ctx) error {
	serial := c.Params("serial")
	if serial == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "serial is required"})
	}

	bodyBytes := c.Body()
	url := fmt.Sprintf("%s/api/v1/devices/%s/calc-config", h.client.BaseURL(), serial)
	req, err := http.NewRequestWithContext(c.Context(), http.MethodPost, url, bytes.NewReader(bodyBytes))
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to build request to river service"})
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": "failed to contact river service"})
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		respBodyBytes, _ := io.ReadAll(resp.Body)
		return c.Status(resp.StatusCode).Send(respBodyBytes)
	}

	// 1. Evict configuration from Redis cache immediately
	if h.rdb != nil {
		cacheKey := "ff:river:config:" + serial
		if err := h.rdb.Del(c.Context(), cacheKey).Err(); err != nil {
			h.logger.Warn("failed to delete redis config cache key", zap.String("key", cacheKey), zap.Error(err))
		}
		
		// Invalidate current group cache key to force UI update
		currentCacheKey := "ff:river:current:" + serial
		_ = h.rdb.Del(c.Context(), currentCacheKey).Err()
	}

	// 2. Perform immediate recalculation on the latest telemetry point
	latest, err := h.client.GetLatestCurrentGroup(c.Context(), serial)
	if err == nil {
		var cfg domain.DeviceCalcConfig
		if err := json.Unmarshal(bodyBytes, &cfg); err == nil {
			if cfg.BottomToBankCM > 0 || cfg.BankToSensorCM > 0 {
				netCM := (cfg.BottomToBankCM + cfg.BankToSensorCM) - latest.LevelCM
				if netCM < 0 {
					netCM = 0
				}
				var pct float64
				if cfg.BottomToBankCM > 0 {
					pct = (netCM / cfg.BottomToBankCM) * 100.0
				}

				// Round to 2 decimal places for storage consistency
				netCM = math.Round(netCM*100) / 100
				pct = math.Round(pct*100) / 100

				// Update the database
				_ = h.client.UpdateWaterLevel(c.Context(), serial, netCM, pct)

				// Trigger immediate alert evaluation in workers
				if h.rdb != nil {
					alertEv := map[string]interface{}{
						"serial":             serial,
						"net_water_level_cm": netCM,
						"water_level_pct":    pct,
						"timestamp":          latest.LocalTimeOnSite,
					}
					if jsonBytes, err := json.Marshal(alertEv); err == nil {
						_ = h.rdb.Publish(c.Context(), "ff:river:calc_done", string(jsonBytes)).Err()
					}
				}
			}
		}
	}

	var retCfg domain.DeviceCalcConfig
	_ = json.Unmarshal(bodyBytes, &retCfg)
	return c.JSON(retCfg)
}

func (h *RiverHandler) CalibrateDevice(c fiber.Ctx) error {
	serial := c.Params("serial")
	if serial == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Serial is required"})
	}

	type CalibrateReq struct {
		TargetDistanceCM *float64 `json:"target_distance_cm,omitempty"`
	}
	var req CalibrateReq
	_ = c.Bind().JSON(&req)

	cfg, err := h.client.CalibrateDeviceBaseline(c.Context(), serial, req.TargetDistanceCM)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	// Invalidate Redis caches used by ff-river-worker.
	// Fix #2 (BUG): Worker reads config from key "config:{serial}" (see calc_worker.go:252).
	// Previous key "ff:river:config:{serial}" was WRONG — DEL had zero effect on the worker cache.
	// Also invalidate "filter:state:{serial}" so the Worker resets its trend state immediately,
	// preventing stale IsFloodActive / ConsecutiveRisingSteps from persisting post-calibration.
	if h.rdb != nil {
		_ = h.rdb.Del(c.Context(),
			"config:"+serial,        // Worker device config cache (correct key)
			"filter:state:"+serial,  // Worker FilterState (reset trend on recalibration)
			"current:"+serial,       // Dashboard real-time cache
		).Err()
	}

	h.logger.Info("device calibrated to ground baseline successfully",
		zap.String("serial", serial),
		zap.Float64("bank_to_sensor_cm", cfg.BankToSensorCM),
	)

	return c.JSON(fiber.Map{
		"message": "Device calibrated to ground baseline successfully",
		"config":  cfg,
	})
}

// ── Alert Thresholds Handlers ────────────────────────────────────────────────

func (h *RiverHandler) triggerAlertEvaluation(ctx context.Context, serial string) {
	if h.rdb == nil {
		return
	}
	latest, err := h.client.GetLatestCurrentGroup(ctx, serial)
	if err == nil {
		alertEv := map[string]interface{}{
			"serial":             serial,
			"net_water_level_cm": latest.NetWaterLevelCM,
			"water_level_pct":    latest.WaterLevelPct,
			"timestamp":          latest.LocalTimeOnSite,
		}
		if jsonBytes, err := json.Marshal(alertEv); err == nil {
			_ = h.rdb.Publish(ctx, "ff:river:calc_done", string(jsonBytes)).Err()
		}
	}
}

func (h *RiverHandler) GetAlertThresholds(c fiber.Ctx) error {
	serial := c.Params("serial")
	if serial == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "serial is required"})
	}

	thresholds, err := h.client.GetAlertThresholds(c.Context(), serial)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(thresholds)
}

func (h *RiverHandler) CreateAlertThreshold(c fiber.Ctx) error {
	serial := c.Params("serial")
	if serial == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "serial is required"})
	}

	t := &domain.AlertThreshold{}
	if err := c.Bind().JSON(t); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}
	t.Serial = serial

	if err := h.validate.Struct(t); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	if err := h.client.CreateAlertThreshold(c.Context(), t); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	// Evict threshold cache
	if h.rdb != nil {
		cacheKey := "ff:river:thresholds:" + serial
		_ = h.rdb.Del(c.Context(), cacheKey).Err()
	}

	h.triggerAlertEvaluation(c.Context(), serial)

	return c.Status(fiber.StatusCreated).JSON(t)
}

func (h *RiverHandler) UpdateAlertThreshold(c fiber.Ctx) error {
	idStr := c.Params("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid ID format"})
	}

	t := &domain.AlertThreshold{}
	if err := c.Bind().JSON(t); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}
	t.ID = id

	if err := h.client.UpdateAlertThreshold(c.Context(), t); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	// Evict threshold cache
	if h.rdb != nil && t.Serial != "" {
		cacheKey := "ff:river:thresholds:" + t.Serial
		_ = h.rdb.Del(c.Context(), cacheKey).Err()
	}

	if t.Serial != "" {
		h.triggerAlertEvaluation(c.Context(), t.Serial)
	}

	return c.JSON(t)
}

func (h *RiverHandler) DeleteAlertThreshold(c fiber.Ctx) error {
	idStr := c.Params("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid ID format"})
	}

	serial, err := h.client.DeleteAlertThreshold(c.Context(), id)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	// Evict threshold cache
	if h.rdb != nil && serial != "" {
		cacheKey := "ff:river:thresholds:" + serial
		_ = h.rdb.Del(c.Context(), cacheKey).Err()
	}

	if serial != "" {
		h.triggerAlertEvaluation(c.Context(), serial)
	}

	return c.JSON(fiber.Map{"message": "Alert threshold deleted successfully"})
}

// ── Alert History Handlers ───────────────────────────────────────────────────

func (h *RiverHandler) GetAlertHistory(c fiber.Ctx) error {
	serial := c.Params("serial")
	if serial == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "serial is required"})
	}

	limit := 50
	if limitStr := c.Query("limit"); limitStr != "" {
		if val, err := strconv.Atoi(limitStr); err == nil {
			limit = val
		}
	}

	history, err := h.client.GetAlertHistory(c.Context(), serial, limit)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(history)
}

// ── Alert Subscriptions Handlers ─────────────────────────────────────────────

func (h *RiverHandler) GetSubscriptions(c fiber.Ctx) error {
	projectCode := c.Query("project_code")
	subs, err := h.client.GetSubscriptions(c.Context(), projectCode)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(subs)
}

func (h *RiverHandler) CreateSubscription(c fiber.Ctx) error {
	sub := &domain.AlertSubscription{}
	if err := c.Bind().JSON(sub); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	if err := h.validate.Struct(sub); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	if err := h.client.CreateSubscription(c.Context(), sub); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(fiber.StatusCreated).JSON(sub)
}

func (h *RiverHandler) UpdateSubscription(c fiber.Ctx) error {
	idStr := c.Params("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid ID format"})
	}

	sub := &domain.AlertSubscription{}
	if err := c.Bind().JSON(sub); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}
	sub.ID = id

	if err := h.client.UpdateSubscription(c.Context(), sub); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(sub)
}

func (h *RiverHandler) DeleteSubscription(c fiber.Ctx) error {
	idStr := c.Params("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid ID format"})
	}

	if err := h.client.DeleteSubscription(c.Context(), id); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"message": "Subscription deleted successfully"})
}

// ── Freq Control Handlers ────────────────────────────────────────────────────

func (h *RiverHandler) GetFreqControl(c fiber.Ctx) error {
	serial := c.Params("serial")
	if serial == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "serial is required"})
	}

	fc, err := h.client.GetFreqControl(c.Context(), serial)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fc)
}

func (h *RiverHandler) GetActiveEscalations(c fiber.Ctx) error {
	escalations, err := h.client.GetActiveEscalations(c.Context())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(escalations)
}

func (h *RiverHandler) RestoreFreqControl(c fiber.Ctx) error {
	serial := c.Params("serial")
	if serial == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "serial is required"})
	}

	if err := h.client.RestoreFreqControl(c.Context(), serial); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"message": "Frequency transmission control successfully restored"})
}

// ── Device Health Handlers ───────────────────────────────────────────────────

func (h *RiverHandler) GetDeviceHealth(c fiber.Ctx) error {
	serial := c.Params("serial")
	if serial == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "serial is required"})
	}

	health, err := h.client.GetDeviceHealth(c.Context(), serial)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(health)
}

func (h *RiverHandler) GetOfflineDevices(c fiber.Ctx) error {
	offlines, err := h.client.GetOfflineDevices(c.Context())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(offlines)
}

func (h *RiverHandler) GetUptimeLogs(c fiber.Ctx) error {
	serial := c.Query("serial")
	status := c.Query("status")
	fromDate := c.Query("from_date")
	toDate := c.Query("to_date")

	page, _ := strconv.Atoi(c.Query("page", "1"))
	if page < 1 {
		page = 1
	}
	pageSize, _ := strconv.Atoi(c.Query("page_size", "50"))
	if pageSize < 1 {
		pageSize = 50
	}
	logs, total, err := h.client.GetUptimeLogs(c.Context(), serial, fromDate, toDate, status, page, pageSize)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{
		"data":       logs,
		"total":      total,
		"page":       page,
		"page_size":  pageSize,
		"total_page": (total + pageSize - 1) / pageSize,
	})
}

func (h *RiverHandler) GetUptimeSummary(c fiber.Ctx) error {
	summary, err := h.client.GetUptimeSummary(c.Context())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(summary)
}

// ── Data Quality Handlers ────────────────────────────────────────────────────

func (h *RiverHandler) GetDQReports(c fiber.Ctx) error {
	serial := c.Params("serial")
	if serial == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "serial is required"})
	}

	limit := 50
	if limitStr := c.Query("limit"); limitStr != "" {
		if val, err := strconv.Atoi(limitStr); err == nil {
			limit = val
		}
	}

	reports, err := h.client.GetDQReports(c.Context(), serial, limit)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(reports)
}

func (h *RiverHandler) GetDQSummary(c fiber.Ctx) error {
	summary, err := h.client.GetDQSummary(c.Context())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(summary)
}

// ── Real-time & Historical Data Handlers ─────────────────────────────────────

func (h *RiverHandler) GetLatestCurrentGroup(c fiber.Ctx) error {
	serial := c.Params("serial")
	if serial == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "serial is required"})
	}

	data, err := h.client.GetLatestCurrentGroup(c.Context(), serial)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(data)
}

func (h *RiverHandler) GetHistoricalStats(c fiber.Ctx) error {
	serial := c.Params("serial")
	if serial == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "serial is required"})
	}

	var start time.Time
	if startStr := c.Query("start"); startStr != "" {
		if t, err := time.Parse(time.RFC3339, startStr); err == nil {
			start = t
		}
	}

	var end time.Time
	if endStr := c.Query("end"); endStr != "" {
		if t, err := time.Parse(time.RFC3339, endStr); err == nil {
			end = t
		}
	}

	stats, err := h.client.GetHistoricalStats(c.Context(), serial, start, end)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(stats)
}

func (h *RiverHandler) GetWarningHistory(c fiber.Ctx) error {
	serial := c.Params("serial")
	if serial == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "serial is required"})
	}

	limit := 100
	if limitStr := c.Query("limit"); limitStr != "" {
		if val, err := strconv.Atoi(limitStr); err == nil {
			limit = val
		}
	}

	history, err := h.client.GetWarningHistory(c.Context(), serial, limit)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(history)
}

// ── Settings Handlers ────────────────────────────────────────────────────────

func (h *RiverHandler) GetSetting(c fiber.Ctx) error {
	key := c.Params("key")
	if key == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "key is required"})
	}

	setting, err := h.client.GetSettingByKey(c.Context(), key)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(setting)
}

func (h *RiverHandler) SaveSetting(c fiber.Ctx) error {
	setting := &domain.Setting{}
	if err := c.Bind().JSON(setting); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	if err := h.validate.Struct(setting); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	if err := h.client.SaveSetting(c.Context(), setting); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	// Trigger instant background reconcile with new settings
	go func() {
		_ = h.client.ReconcileDeviceUptimeLogs(context.Background())
	}()

	return c.JSON(setting)
}

func (h *RiverHandler) ProxyImage(c fiber.Ctx) error {
	urlPath := c.Query("url")
	if urlPath == "" || urlPath == "-" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "url is required"})
	}

	storageBaseURL := os.Getenv("RIVER_STORAGE_BASE_URL")
	if storageBaseURL == "" {
		storageBaseURL = "http://10.1.2.20"
	}

	sourceURL := urlPath
	if !strings.HasPrefix(urlPath, "http://") && !strings.HasPrefix(urlPath, "https://") {
		if !strings.HasPrefix(urlPath, "/") {
			sourceURL = storageBaseURL + "/" + urlPath
		} else {
			sourceURL = storageBaseURL + urlPath
		}
	}

	// Option path format: /plain/%source_url
	path := "/plain/" + sourceURL

	// Retrieve Key & Salt from environment, fallback to production default configs
	keyHex := os.Getenv("RIVER_IMGPROXY_KEY")
	if keyHex == "" {
		keyHex = "9a7c3e5b8d2f1a6c4b8e0d9f2a4c6e8b1d3f5a7c9e0b2d4f6a8c0e2b4d6f8a0c"
	}
	saltHex := os.Getenv("RIVER_IMGPROXY_SALT")
	if saltHex == "" {
		saltHex = "1b3d5f7a9c1e3d5f7a9c1e3d5f7a9c1e3d5f7a9c1e3d5f7a9c1e3d5f7a9c1e3d"
	}

	keyBin, err := hex.DecodeString(keyHex)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "invalid signature key"})
	}
	saltBin, err := hex.DecodeString(saltHex)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "invalid signature salt"})
	}

	// Compute HMAC-SHA256 signature
	mac := hmac.New(sha256.New, keyBin)
	mac.Write(saltBin)
	mac.Write([]byte(path))
	signature := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))

	// Construct signed CDN redirect target URL
	cdnBaseURL := os.Getenv("RIVER_IMAGE_CDN_URL")
	if cdnBaseURL == "" {
		cdnBaseURL = "http://10.1.2.19:8088"
	}
	
	// Remove trailing slash if any on cdnBaseURL
	if len(cdnBaseURL) > 0 && cdnBaseURL[len(cdnBaseURL)-1] == '/' {
		cdnBaseURL = cdnBaseURL[:len(cdnBaseURL)-1]
	}

	signedURL := cdnBaseURL + "/" + signature + path

	return c.Redirect().To(signedURL)
}

type BatchStreamRequest struct {
	Serials []string `json:"serials"`
}

func (h *RiverHandler) InitializeBatchStream(c fiber.Ctx) error {
	var req BatchStreamRequest
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	if len(req.Serials) == 0 {
		return c.JSON(fiber.Map{"success": true, "warmed": 0})
	}

	if h.streamClient == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "stream client not initialized"})
	}

	// Deduplicate serials to prevent duplicate worker allocations
	uniqueSerials := make([]string, 0, len(req.Serials))
	seen := make(map[string]bool)
	for _, s := range req.Serials {
		serial := strings.TrimSpace(s)
		if serial != "" && !seen[serial] {
			seen[serial] = true
			uniqueSerials = append(uniqueSerials, serial)
		}
	}

	if len(uniqueSerials) == 0 {
		return c.JSON(fiber.Map{"success": true, "warmed": 0})
	}

	// Asynchronously warm up streams in background so HTTP response returns in <5ms,
	// preventing browser connection exhaustion and UI stalling on War Room
	go func(serials []string) {
		sem := make(chan struct{}, 4)
		for _, s := range serials {
			sem <- struct{}{}
			go func(ser string) {
				defer func() { <-sem }()

				bgCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
				defer cancel()

				rtspURL := ""
				rtspCacheKey := "ff:river:rtsp:" + ser
				if h.rdb != nil {
					if cached, err := h.rdb.Get(bgCtx, rtspCacheKey).Result(); err == nil && cached != "" {
						rtspURL = cached
					}
				}

				if rtspURL == "" {
					latest, err := h.client.GetLatestCurrentGroup(bgCtx, ser)
					if err == nil && latest != nil && latest.SnapshotURL1 != "" && latest.SnapshotURL1 != "-" {
						rtspURL = latest.SnapshotURL1
					} else {
						dev, err := h.client.GetDeviceBySerial(bgCtx, ser)
						if err == nil && dev != nil && dev.CCTVPath1 != "" && dev.CCTVPath1 != "-" {
							rtspURL = dev.CCTVPath1
						}
					}
					rtspURL = preferSubStream102(rtspURL)
					if rtspURL != "" && h.rdb != nil {
						_ = h.rdb.Set(bgCtx, rtspCacheKey, rtspURL, 1*time.Hour)
					}
				}

				if rtspURL != "" {
					rtspURL = preferSubStream102(rtspURL)
					_, _ = h.streamClient.InitializeStream(bgCtx, ser, rtspURL)
				}
			}(s)
		}
	}(uniqueSerials)

	return c.JSON(fiber.Map{
		"success": true,
		"warmed":  len(uniqueSerials),
	})
}

func (h *RiverHandler) InitializeStream(c fiber.Ctx) error {
	serial := c.Params("serial")
	if serial == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "serial is required"})
	}

	// 1. Get latest telemetry data to fetch snapshot_url1 (RTSP path)
	latest, err := h.client.GetLatestCurrentGroup(c.Context(), serial)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "device telemetry group not found"})
	}

	rtspURL := latest.SnapshotURL1
	if rtspURL == "" || rtspURL == "-" {
		// Fallback to static cctv_path_1 if snapshotURL1 is empty
		dev, err := h.client.GetDeviceBySerial(c.Context(), serial)
		if err == nil && dev.CCTVPath1 != "" && dev.CCTVPath1 != "-" {
			rtspURL = dev.CCTVPath1
		} else {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "live stream RTSP URL (snapshotURL1) is not configured for this device"})
		}
	}

	// Prioritize Sub Stream 102 for ultra-fast startup and smooth multi-channel playback
	rtspURL = preferSubStream102(rtspURL)

	// 2. Call StreamClient via gRPC
	if h.streamClient == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "stream client not initialized"})
	}

	resp, err := h.streamClient.InitializeStream(c.Context(), serial, rtspURL)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{
		"sdp_offer":   resp.SdpOffer,
		"ice_servers": resp.IceServers,
		"session_id":  resp.SessionId,
	})
}

// preferSubStream102 rewrites high-bitrate main stream (101) URLs to low-bitrate sub stream (102)
// to optimize multi-camera war room latency, reduce CPU load, and prevent 4G/VPN bandwidth saturation.
func preferSubStream102(rawURL string) string {
	if rawURL == "" || rawURL == "-" {
		return rawURL
	}
	if strings.Contains(rawURL, "Channels/101") {
		return strings.Replace(rawURL, "Channels/101", "Channels/102", 1)
	}
	if strings.Contains(rawURL, "/101") {
		return strings.Replace(rawURL, "/101", "/102", 1)
	}
	if strings.Contains(rawURL, "/main") {
		return strings.Replace(rawURL, "/main", "/sub", 1)
	}
	if strings.Contains(rawURL, "stream1") {
		return strings.Replace(rawURL, "stream1", "stream2", 1)
	}
	return rawURL
}

func (h *RiverHandler) TerminateStream(c fiber.Ctx) error {
	serial := c.Params("serial")
	if serial == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "serial is required"})
	}

	if h.streamClient == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "stream client not initialized"})
	}

	err := h.streamClient.TerminateStream(c.Context(), serial)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{"message": "stream terminated successfully"})
}

// ptzProxyClient is a shared HTTP client for proxying PTZ requests to ff-river-service.
// Timeout is intentionally short — PTZ is a real-time command.
var ptzProxyClient = &http.Client{
	Timeout: 6 * time.Second,
	Transport: &http.Transport{
		MaxIdleConns:        50,
		MaxIdleConnsPerHost: 10,
		IdleConnTimeout:     90 * time.Second,
	},
}

// ControlPTZ is a thin proxy — it forwards the PTZ request to ff-river-service
// which owns the camera credentials and ISAPI logic.
// Route: POST /api/v1/river/devices/:serial/ptz
func (h *RiverHandler) ControlPTZ(c fiber.Ctx) error {
	serial := c.Params("serial")
	if serial == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "serial is required"})
	}

	// Read raw body once and forward as-is to preserve the exact JSON payload
	body := c.Body()
	if len(body) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "request body is required"})
	}

	targetURL := fmt.Sprintf("%s/api/v1/devices/%s/ptz", h.client.BaseURL(), serial)

	req, err := http.NewRequestWithContext(c.Context(), http.MethodPost, targetURL, bytes.NewReader(body))
	if err != nil {
		h.logger.Error("PTZ proxy: build request failed", zap.String("serial", serial), zap.Error(err))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to build proxy request"})
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := ptzProxyClient.Do(req)
	if err != nil {
		h.logger.Error("PTZ proxy: upstream request failed", zap.String("serial", serial), zap.Error(err))
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": "upstream PTZ service unavailable: " + err.Error()})
	}
	defer func() {
		_, _ = io.Copy(io.Discard, resp.Body)
		resp.Body.Close()
	}()

	// Stream upstream status code + body back to caller
	c.Status(resp.StatusCode)
	c.Set("Content-Type", "application/json")
	_, _ = io.Copy(c.Response().BodyWriter(), resp.Body)
	return nil
}

// ── Export Handlers ──────────────────────────────────────────────────────────

var exportableColumnsMap = []struct {
	Key      string
	Label    string
	LabelEN  string
	Category string
}{
	{Key: "serial", Label: "รหัสเซ็นเซอร์ (Serial)", LabelEN: "Device Serial", Category: "Station Information"},
	{Key: "name", Label: "ชื่อสถานี", LabelEN: "Station Name", Category: "Station Information"},
	{Key: "organization_name", Label: "หน่วยงาน / เจ้าของ", LabelEN: "Organization", Category: "Station Information"},
	{Key: "status", Label: "สถานะการลงทะเบียน", LabelEN: "Device Status", Category: "Station Information"},
	{Key: "description", Label: "รายละเอียดเพิ่มเติม", LabelEN: "Description", Category: "Station Information"},
	{Key: "owner_email", Label: "อีเมลผู้ดูแล", LabelEN: "Owner Email", Category: "Station Information"},
	{Key: "install_latitude", Label: "ละติจูด (Latitude)", LabelEN: "Latitude", Category: "Geolocation"},
	{Key: "install_longitude", Label: "ลองจิจูด (Longitude)", LabelEN: "Longitude", Category: "Geolocation"},
	{Key: "net_water_level_cm", Label: "ระดับน้ำสุทธิ (cm)", LabelEN: "Net Water Level (cm)", Category: "Telemetry & Sensor Data"},
	{Key: "water_level_pct", Label: "ระดับน้ำ (%)", LabelEN: "Water Level (%)", Category: "Telemetry & Sensor Data"},
	{Key: "level_cm", Label: "ระดับน้ำดิบจากเซ็นเซอร์ (cm)", LabelEN: "Raw Water Level (cm)", Category: "Telemetry & Sensor Data"},
	{Key: "filtered_level_cm", Label: "ระดับน้ำหลังกรอง (cm)", LabelEN: "Filtered Level (cm)", Category: "Telemetry & Sensor Data"},
	{Key: "filter_status", Label: "สถานะการกรอง (Filter Status)", LabelEN: "Filter Status", Category: "Telemetry & Sensor Data"},
	{Key: "confidence_score", Label: "คะแนนความเชื่อมั่น (Confidence)", LabelEN: "Confidence Score", Category: "Telemetry & Sensor Data"},
	{Key: "sensor_mode", Label: "โหมดเซ็นเซอร์", LabelEN: "Sensor Mode", Category: "Station Information"},
	{Key: "warning_status", Label: "ระดับการเตือนภัย", LabelEN: "Alert Warning Status", Category: "Telemetry & Sensor Data"},
	{Key: "connection_status", Label: "สถานะการเชื่อมต่อ", LabelEN: "Connection Status", Category: "Telemetry & Sensor Data"},
	{Key: "last_seen", Label: "เวลาอัปเดตล่าสุด", LabelEN: "Last Telemetry Timestamp", Category: "System Metadata"},
	{Key: "created_at", Label: "วันที่สร้างสถานี", LabelEN: "Created At", Category: "System Metadata"},
}

func (h *RiverHandler) GetExportableColumns(c fiber.Ctx) error {
	cols := make([]domain.RiverColumnMeta, len(exportableColumnsMap))
	for i, item := range exportableColumnsMap {
		cols[i] = domain.RiverColumnMeta{
			Key:      item.Key,
			Label:    item.Label,
			LabelEN:  item.LabelEN,
			Category: item.Category,
		}
	}
	return c.JSON(cols)
}

func (h *RiverHandler) ExportDevicesCSV(c fiber.Ctx) error {
	var req domain.RiverExportRequest
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid export request body"})
	}

	// Fetch all registered devices
	devices, err := h.client.GetDevices(c.Context(), nil, nil)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	// Populate warning status from Redis
	if len(devices) > 0 && h.rdb != nil {
		keys := make([]string, len(devices))
		for i, dev := range devices {
			keys[i] = "ff:river:active_alert:" + dev.Serial
		}
		vals, err := h.rdb.MGet(c.Context(), keys...).Result()
		if err == nil {
			for i, val := range vals {
				if valStr, ok := val.(string); ok && valStr != "" {
					if len(valStr) >= 2 && valStr[0] == '"' && valStr[len(valStr)-1] == '"' {
						valStr = valStr[1 : len(valStr)-1]
					}
					devices[i].WarningStatus = valStr
				} else {
					devices[i].WarningStatus = "NORMAL"
				}
			}
		} else {
			for _, dev := range devices {
				dev.WarningStatus = "NORMAL"
			}
		}
	}

	// Helper offline detector
	isOffline := func(d *domain.RiverDevice) bool {
		if d.LastSeen == nil {
			return true
		}
		threshold := 360
		if d.OfflineThresholdMin != nil && *d.OfflineThresholdMin > 0 {
			threshold = *d.OfflineThresholdMin
		}
		return time.Since(*d.LastSeen) > time.Duration(threshold)*time.Minute
	}

	// Filter devices based on criteria if serials array is not provided
	selectedSerialsMap := make(map[string]bool)
	for _, s := range req.Serials {
		selectedSerialsMap[s] = true
	}

	searchLower := strings.ToLower(req.Search)
	var exportList []*domain.RiverDevice

	for _, dev := range devices {
		// Filter by Tab (online/offline)
		devOffline := isOffline(dev)
		if req.Tab == "online" && devOffline {
			continue
		}
		if req.Tab == "offline" && !devOffline {
			continue
		}

		// Filter by Warning Status
		if req.Status != "" && req.Status != "ALL" {
			devWarn := dev.WarningStatus
			if devWarn == "" {
				devWarn = "NORMAL"
			}
			if devWarn != req.Status {
				continue
			}
		}

		// Filter by Search term
		if searchLower != "" {
			matchSerial := strings.Contains(strings.ToLower(dev.Serial), searchLower)
			matchName := strings.Contains(strings.ToLower(dev.Name), searchLower)
			if !matchSerial && !matchName {
				continue
			}
		}

		// Check selection
		if req.SelectAll || len(selectedSerialsMap) == 0 || selectedSerialsMap[dev.Serial] {
			exportList = append(exportList, dev)
		}
	}

	// Column Allowlist mapping
	validColsMap := make(map[string]string)
	for _, col := range exportableColumnsMap {
		validColsMap[col.Key] = col.Label
	}

	var selectedHeaders []string
	var selectedKeys []string

	if len(req.Columns) > 0 {
		for _, key := range req.Columns {
			if label, ok := validColsMap[key]; ok {
				selectedKeys = append(selectedKeys, key)
				selectedHeaders = append(selectedHeaders, label)
			}
		}
	}

	// Default to all columns if none specified or invalid
	if len(selectedKeys) == 0 {
		for _, col := range exportableColumnsMap {
			selectedKeys = append(selectedKeys, col.Key)
			selectedHeaders = append(selectedHeaders, col.Label)
		}
	}

	// Set CSV headers & UTF-8 BOM for Excel
	fileName := fmt.Sprintf("river_telemetry_%s.csv", time.Now().Format("20060102_150405"))
	c.Set("Content-Type", "text/csv; charset=utf-8")
	c.Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", fileName))

	w := c.Response().BodyWriter()
	// Write UTF-8 BOM
	_, _ = w.Write([]byte{0xEF, 0xBB, 0xBF})

	// CSV Header
	var buf bytes.Buffer
	buf.WriteString(strings.Join(selectedHeaders, ",") + "\n")
	_, _ = w.Write(buf.Bytes())

	// Write rows
	for _, dev := range exportList {
		var row []string
		for _, key := range selectedKeys {
			valStr := ""
			switch key {
			case "serial":
				valStr = dev.Serial
			case "name":
				valStr = dev.Name
			case "organization_name":
				valStr = dev.OrganizationName
			case "status":
				valStr = dev.Status
			case "description":
				valStr = dev.Description
			case "owner_email":
				valStr = dev.OwnerEmail
			case "install_latitude":
				valStr = dev.InstallLatitude
			case "install_longitude":
				valStr = dev.InstallLongitude
			case "net_water_level_cm":
				if dev.NetWaterLevelCM != nil {
					valStr = fmt.Sprintf("%.2f", *dev.NetWaterLevelCM)
				}
			case "water_level_pct":
				if dev.WaterLevelPct != nil {
					valStr = fmt.Sprintf("%.2f", *dev.WaterLevelPct)
				}
			case "level_cm":
				if dev.LevelCM != nil {
					valStr = fmt.Sprintf("%.2f", *dev.LevelCM)
				}
			case "filtered_level_cm":
				if dev.FilteredLevelCM != nil {
					valStr = fmt.Sprintf("%.2f", *dev.FilteredLevelCM)
				}
			case "filter_status":
				if dev.FilterStatus != nil {
					valStr = *dev.FilterStatus
				} else {
					valStr = "NORMAL"
				}
			case "confidence_score":
				if dev.ConfidenceScore != nil {
					valStr = fmt.Sprintf("%.2f", *dev.ConfidenceScore)
				}
			case "sensor_mode":
				if dev.SensorMode != nil {
					valStr = *dev.SensorMode
				} else {
					valStr = "RIVER"
				}
			case "warning_status":
				valStr = dev.WarningStatus
				if valStr == "" {
					valStr = "NORMAL"
				}
			case "connection_status":
				if isOffline(dev) {
					valStr = "OFFLINE"
				} else {
					valStr = "ONLINE"
				}
			case "last_seen":
				if dev.LastSeen != nil {
					valStr = dev.LastSeen.Local().Format("2006-01-02 15:04:05")
				}
			case "created_at":
				valStr = dev.CreatedAt.Local().Format("2006-01-02 15:04:05")
			}

			// Escape CSV double quotes
			if strings.ContainsAny(valStr, ",\"\n\r") {
				valStr = fmt.Sprintf("\"%s\"", strings.ReplaceAll(valStr, "\"", "\"\""))
			}
			row = append(row, valStr)
		}

		rowBuf := strings.Join(row, ",") + "\n"
		_, _ = w.Write([]byte(rowBuf))
	}

	return nil
}

// ── Noise Audit Log Handler ─────────────────────────────────────────────────

func (h *RiverHandler) GetNoiseAuditLogs(c fiber.Ctx) error {
	serial := c.Query("serial")
	eventType := c.Query("event_type")
	limit, _ := strconv.Atoi(c.Query("limit", "50"))
	offset, _ := strconv.Atoi(c.Query("offset", "0"))

	logs, total, err := h.client.GetNoiseAuditLogs(c.Context(), serial, eventType, limit, offset)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{
		"data":   logs,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
}

// posterClient is a shared HTTP client with connection pooling for proxying poster requests
var posterClient = &http.Client{
	Timeout: 5 * time.Second,
	Transport: &http.Transport{
		MaxIdleConns:        100,
		MaxIdleConnsPerHost: 20,
		IdleConnTimeout:     90 * time.Second,
	},
}

// GetDevicePoster proxies the requested camera poster frame from cctv-stream-service (Redis cache)
// Route: GET /api/v1/river/devices/:serial/poster
func (h *RiverHandler) GetDevicePoster(c fiber.Ctx) error {
	serial := c.Params("serial")
	if serial == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "serial is required"})
	}

	cctvBaseURL := os.Getenv("CCTV_STREAM_HTTP_URL")
	if cctvBaseURL == "" {
		cctvBaseURL = "http://10.1.2.7:8082"
	}
	cctvBaseURL = strings.TrimRight(cctvBaseURL, "/")

	reqURL := fmt.Sprintf("%s/api/v1/stream/poster/%s", cctvBaseURL, serial)
	req, err := http.NewRequestWithContext(c.Context(), http.MethodGet, reqURL, nil)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	resp, err := posterClient.Do(req)
	if err != nil {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": "failed to connect to stream service", "offline": true})
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusOK {
		c.Set("Content-Type", "image/jpeg")
		c.Set("Cache-Control", "public, max-age=15, stale-while-revalidate=45")
		data, err := io.ReadAll(resp.Body)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to read poster image"})
		}
		return c.Send(data)
	}

	return c.Status(resp.StatusCode).JSON(fiber.Map{
		"error":   "poster frame not available or camera offline",
		"offline": true,
	})
}

type syncCameraItem struct {
	Serial    string `json:"serial"`
	SourceURL string `json:"source_url"`
}

// StartPosterSyncWorker starts a background worker that fetches cameras from River DB,
// converts their URLs to Sub Stream 102, and registers them with cctv-stream-service.
func (h *RiverHandler) StartPosterSyncWorker(ctx context.Context) {
	go func() {
		// Initial sync after brief delay for server initialization
		time.Sleep(5 * time.Second)
		h.syncCamerasToStreamService()

		// Periodic sync every 10 minutes
		ticker := time.NewTicker(10 * time.Minute)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				h.syncCamerasToStreamService()
			}
		}
	}()
}

func (h *RiverHandler) syncCamerasToStreamService() {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	devices, err := h.client.GetDevices(ctx, nil, nil)
	if err != nil {
		h.logger.Warn("poster sync: failed to fetch devices from river service", zap.Error(err))
		return
	}

	var targets []syncCameraItem
	for _, dev := range devices {
		rtspURL := ""
		if dev.SnapshotURL1 != nil && *dev.SnapshotURL1 != "" && *dev.SnapshotURL1 != "-" {
			rtspURL = *dev.SnapshotURL1
		} else if dev.CCTVPath1 != "" && dev.CCTVPath1 != "-" {
			rtspURL = dev.CCTVPath1
		}
		if rtspURL != "" {
			subURL := preferSubStream102(rtspURL)
			targets = append(targets, syncCameraItem{
				Serial:    dev.Serial,
				SourceURL: subURL,
			})
		}
	}

	if len(targets) == 0 {
		return
	}

	cctvBaseURL := os.Getenv("CCTV_STREAM_HTTP_URL")
	if cctvBaseURL == "" {
		cctvBaseURL = "http://10.1.2.7:8082"
	}
	cctvBaseURL = strings.TrimRight(cctvBaseURL, "/")

	payload, err := json.Marshal(map[string]interface{}{
		"cameras": targets,
	})
	if err != nil {
		return
	}

	reqURL := fmt.Sprintf("%s/api/v1/stream/cameras/sync", cctvBaseURL)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, reqURL, bytes.NewReader(payload))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := posterClient.Do(req)
	if err != nil {
		h.logger.Warn("poster sync: failed to post camera targets to stream service", zap.Error(err))
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusOK {
		h.logger.Info("poster sync: successfully synced cameras with stream service", zap.Int("count", len(targets)))
	} else {
		h.logger.Warn("poster sync: stream service returned non-200", zap.Int("status", resp.StatusCode))
	}
}



