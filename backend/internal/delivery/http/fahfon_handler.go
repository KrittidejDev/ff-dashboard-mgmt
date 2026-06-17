package http

import (
	"net/url"
	"strconv"

	"ff-dashboard-mgmt/backend/internal/domain"

	"github.com/gofiber/fiber/v3"
)

type FahfonHandler struct {
	usecase domain.FahfonUsecase
}

func NewFahfonHandler(u domain.FahfonUsecase) *FahfonHandler {
	return &FahfonHandler{usecase: u}
}

func (h *FahfonHandler) ListDevices(c fiber.Ctx) error {
	search := c.Query("search", "")
	sortBy := c.Query("sort", "") // "time_onsite", "station", "imei"

	devices, err := h.usecase.ListDevices(c.Context(), search, sortBy)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	if devices == nil {
		devices = []*domain.FahfonDeviceMaster{}
	}

	return c.JSON(devices)
}

func (h *FahfonHandler) GetDeviceDetail(c fiber.Ctx) error {
	rawStation := c.Params("station")
	if rawStation == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "station parameter is required",
		})
	}

	// Unescape localized dynamic route parameters (e.g. Thai text "%E0%B9...") into correct Unicode string
	station, err := url.PathUnescape(rawStation)
	if err != nil {
		station = rawStation // Fallback to raw param on unescape errors
	}

	rangeType := c.Query("range", "hourly") // "hourly", "daily", "monthly"

	dm, fc, history, err := h.usecase.GetDeviceDetail(c.Context(), station, rangeType)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"metadata": dm,
		"current":  fc,
		"history":  history,
	})
}

func (h *FahfonHandler) GetConflictReport(c fiber.Ctx) error {
	report, err := h.usecase.GetConflictReport(c.Context())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	return c.JSON(report)
}

func (h *FahfonHandler) GetAnomalies(c fiber.Ctx) error {
	anomalies, err := h.usecase.ListAnomalies(c.Context())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": err.Error(),
		})
	}
	return c.JSON(anomalies)
}

func (h *FahfonHandler) GetWarningEmails(c fiber.Ctx) error {
	emails, err := h.usecase.GetWarningEmails(c.Context())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": err.Error(),
		})
	}
	return c.JSON(emails)
}

type saveEmailsRequest struct {
	Emails []string `json:"emails"`
}

func (h *FahfonHandler) SaveWarningEmails(c fiber.Ctx) error {
	var req saveEmailsRequest
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "invalid payload format",
		})
	}

	err := h.usecase.SaveWarningEmails(c.Context(), req.Emails)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"message": "warning emails saved successfully",
	})
}

type updateStatusRequest struct {
	Status string `json:"status"`
}

func (h *FahfonHandler) UpdateDeviceStatus(c fiber.Ctx) error {
	rawStation := c.Params("station")
	if rawStation == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "station parameter is required",
		})
	}

	// Unescape localized dynamic route parameters (e.g. Thai text "%E0%B9...") into correct Unicode string
	station, err := url.PathUnescape(rawStation)
	if err != nil {
		station = rawStation // Fallback to raw param on unescape errors
	}

	var req updateStatusRequest
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "invalid payload format",
		})
	}

	err = h.usecase.UpdateDeviceStatus(c.Context(), station, req.Status)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"message": "device status updated successfully",
	})
}

func (h *FahfonHandler) GetThresholds(c fiber.Ctx) error {
	thresholds, err := h.usecase.GetThresholds(c.Context())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": err.Error(),
		})
	}
	return c.JSON(thresholds)
}

type updateThresholdRequest struct {
	MinVal      float64 `json:"min_val"`
	MaxVal      float64 `json:"max_val"`
	Description string  `json:"description"`
}

func (h *FahfonHandler) UpdateThreshold(c fiber.Ctx) error {
	idStr := c.Params("id")
	if idStr == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "id parameter is required",
		})
	}

	id, err := strconv.Atoi(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "invalid id format",
		})
	}

	var req updateThresholdRequest
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "invalid payload format",
		})
	}

	err = h.usecase.UpdateThreshold(c.Context(), int32(id), req.MinVal, req.MaxVal, req.Description)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"message": "sensor threshold updated successfully",
	})
}

func (h *FahfonHandler) GetOfficialPages(c fiber.Ctx) error {
	pages, err := h.usecase.ListOfficialPages(c.Context())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": err.Error(),
		})
	}
	return c.JSON(pages)
}
