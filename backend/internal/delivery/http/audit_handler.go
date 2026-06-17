package http

import (
	"strconv"

	"ff-dashboard-mgmt/backend/internal/domain"

	"github.com/gofiber/fiber/v3"
)

type AuditHandler struct {
	auditUsecase domain.AuditLogUsecase
}

func NewAuditHandler(au domain.AuditLogUsecase) *AuditHandler {
	return &AuditHandler{auditUsecase: au}
}

func (h *AuditHandler) ListLogs(c fiber.Ctx) error {
	pageStr := c.Query("page", "1")
	limitStr := c.Query("limit", "20")

	page, err := strconv.Atoi(pageStr)
	if err != nil || page < 1 {
		page = 1
	}

	limit, err := strconv.Atoi(limitStr)
	if err != nil || limit < 1 {
		limit = 20
	}

	logs, err := h.auditUsecase.ListLogs(c.Context(), page, limit)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	return c.JSON(logs)
}
