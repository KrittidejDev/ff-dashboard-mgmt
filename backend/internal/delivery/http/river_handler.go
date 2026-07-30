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
	repo             domain.RiverRepository
	rdb              *redis.Client
	validate         *validator.Validate
	logger           *zap.Logger
	streamClient     *external.StreamClient
	riverServiceURL  string // base URL of ff-river-service (e.g. http://10.1.2.19:8081)
}

func NewRiverHandler(repo domain.RiverRepository, rdb *redis.Client, sc *external.StreamClient, logger *zap.Logger, riverServiceURL string) *RiverHandler {
	return &RiverHandler{
		repo:            repo,
		rdb:             rdb,
		validate:        validator.New(),
		logger:          logger,
		streamClient:    sc,
		riverServiceURL: riverServiceURL,
	}
}

// ── RiverOfficial Pages Handlers ───────────────────────────────────────────────

func (h *RiverHandler) GetOfficialPages(c fiber.Ctx) error {
	pages, err := h.repo.GetOfficialPages(c.Context())
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

	if err := h.repo.CreateOfficialPage(c.Context(), page); err != nil {
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

	if err := h.repo.UpdateOfficialPage(c.Context(), page); err != nil {
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

	if err := h.repo.DeleteOfficialPage(c.Context(), id); err != nil {
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

	page, err := h.repo.LinkMunicipality(c.Context(), id, body.MunicipalityID)
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

	page, err := h.repo.GetOfficialPageByMunicipalityID(c.Context(), municipalityID)
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

	devices, err := h.repo.GetDevices(c.Context(), pageID, status)
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

	dev, err := h.repo.GetDeviceBySerial(c.Context(), serial)
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

	if err := h.repo.CreateDevice(c.Context(), dev); err != nil {
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

	if err := h.repo.UpdateDevice(c.Context(), dev); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(dev)
}

func (h *RiverHandler) DeleteDevice(c fiber.Ctx) error {
	serial := c.Params("serial")
	if serial == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "serial is required"})
	}

	if err := h.repo.DeleteDevice(c.Context(), serial); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"message": "Device deleted successfully"})
}

func (h *RiverHandler) GetUnregisteredSerials(c fiber.Ctx) error {
	serials, err := h.repo.GetUnregisteredSerials(c.Context())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(serials)
}

func (h *RiverHandler) GetUnregisteredDevices(c fiber.Ctx) error {
	devices, err := h.repo.GetUnregisteredDevices(c.Context())
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

	url := fmt.Sprintf("%s/api/v1/devices/%s/calc-config", h.riverServiceURL, serial)
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
	url := fmt.Sprintf("%s/api/v1/devices/%s/calc-config", h.riverServiceURL, serial)
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
	latest, err := h.repo.GetLatestCurrentGroup(c.Context(), serial)
	if err == nil {
		var cfg domain.DeviceCalcConfig
		if err := json.Unmarshal(bodyBytes, &cfg); err == nil {
			if cfg.BottomToBankCM > 0 {
				netCM := cfg.BottomToBankCM - (latest.LevelCM - cfg.BankToSensorCM)
				if netCM < 0 {
					netCM = 0
				}
				pct := (netCM / cfg.BottomToBankCM) * 100.0

				// Round to 2 decimal places for storage consistency
				netCM = math.Round(netCM*100) / 100
				pct = math.Round(pct*100) / 100

				// Update the database
				_ = h.repo.UpdateWaterLevel(c.Context(), serial, netCM, pct)

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

// ── Alert Thresholds Handlers ────────────────────────────────────────────────

func (h *RiverHandler) triggerAlertEvaluation(ctx context.Context, serial string) {
	if h.rdb == nil {
		return
	}
	latest, err := h.repo.GetLatestCurrentGroup(ctx, serial)
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

	thresholds, err := h.repo.GetAlertThresholds(c.Context(), serial)
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

	if err := h.repo.CreateAlertThreshold(c.Context(), t); err != nil {
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

	if err := h.repo.UpdateAlertThreshold(c.Context(), t); err != nil {
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

	serial, err := h.repo.DeleteAlertThreshold(c.Context(), id)
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

	history, err := h.repo.GetAlertHistory(c.Context(), serial, limit)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(history)
}

// ── Alert Subscriptions Handlers ─────────────────────────────────────────────

func (h *RiverHandler) GetSubscriptions(c fiber.Ctx) error {
	projectCode := c.Query("project_code")
	subs, err := h.repo.GetSubscriptions(c.Context(), projectCode)
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

	if err := h.repo.CreateSubscription(c.Context(), sub); err != nil {
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

	if err := h.repo.UpdateSubscription(c.Context(), sub); err != nil {
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

	if err := h.repo.DeleteSubscription(c.Context(), id); err != nil {
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

	fc, err := h.repo.GetFreqControl(c.Context(), serial)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fc)
}

func (h *RiverHandler) GetActiveEscalations(c fiber.Ctx) error {
	escalations, err := h.repo.GetActiveEscalations(c.Context())
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

	if err := h.repo.RestoreFreqControl(c.Context(), serial); err != nil {
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

	health, err := h.repo.GetDeviceHealth(c.Context(), serial)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(health)
}

func (h *RiverHandler) GetOfflineDevices(c fiber.Ctx) error {
	offlines, err := h.repo.GetOfflineDevices(c.Context())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(offlines)
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

	reports, err := h.repo.GetDQReports(c.Context(), serial, limit)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(reports)
}

func (h *RiverHandler) GetDQSummary(c fiber.Ctx) error {
	summary, err := h.repo.GetDQSummary(c.Context())
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

	data, err := h.repo.GetLatestCurrentGroup(c.Context(), serial)
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

	stats, err := h.repo.GetHistoricalStats(c.Context(), serial, start, end)
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

	history, err := h.repo.GetWarningHistory(c.Context(), serial, limit)
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

	setting, err := h.repo.GetSettingByKey(c.Context(), key)
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

	if err := h.repo.SaveSetting(c.Context(), setting); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
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

func (h *RiverHandler) InitializeStream(c fiber.Ctx) error {
	serial := c.Params("serial")
	if serial == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "serial is required"})
	}

	// 1. Get latest telemetry data to fetch snapshot_url1 (RTSP path)
	latest, err := h.repo.GetLatestCurrentGroup(c.Context(), serial)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "device telemetry group not found"})
	}

	rtspURL := latest.SnapshotURL1
	if rtspURL == "" || rtspURL == "-" {
		// Fallback to static cctv_path_1 if snapshotURL1 is empty
		dev, err := h.repo.GetDeviceBySerial(c.Context(), serial)
		if err == nil && dev.CCTVPath1 != "" && dev.CCTVPath1 != "-" {
			rtspURL = dev.CCTVPath1
		} else {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "live stream RTSP URL (snapshotURL1) is not configured for this device"})
		}
	}

	// ⚡ Optimize stream for cellular/SIM card network (RTSP Sub-Stream fallback)
	// Replace Hikvision Main-Stream (/Channels/101) with Sub-Stream (/Channels/102)
	// to reduce bandwidth consumption by 80-90% over the weak cellular signal on-site.
	if strings.Contains(rtspURL, "/Channels/101") {
		rtspURL = strings.Replace(rtspURL, "/Channels/101", "/Channels/102", 1)
	}

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

	targetURL := fmt.Sprintf("%s/api/v1/devices/%s/ptz", h.riverServiceURL, serial)

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
