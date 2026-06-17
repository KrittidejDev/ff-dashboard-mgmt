package http

import (
	"ff-dashboard-mgmt/backend/internal/domain"

	"github.com/gofiber/fiber/v3"
)

type MongoHandler struct {
	usecase domain.MongoUsecase
}

func NewMongoHandler(u domain.MongoUsecase) *MongoHandler {
	return &MongoHandler{usecase: u}
}

// ── Registrations Handler (iotRegistedIMEI) ──────────────────────────────────

func (h *MongoHandler) ListRegistrations(c fiber.Ctx) error {
	list, err := h.usecase.ListRegistrations(c.Context())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": err.Error(),
		})
	}
	return c.JSON(list)
}

func (h *MongoHandler) CreateRegistration(c fiber.Ctx) error {
	var req domain.MongoDeviceRegistered
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "invalid payload format",
		})
	}

	id, err := h.usecase.CreateRegistration(c.Context(), &req)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"message": "registration created successfully",
		"id":      id,
	})
}

func (h *MongoHandler) UpdateRegistration(c fiber.Ctx) error {
	id := c.Params("id")
	if id == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "id parameter is required",
		})
	}

	var req domain.MongoDeviceRegistered
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "invalid payload format",
		})
	}

	err := h.usecase.UpdateRegistration(c.Context(), id, &req)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"message": "registration updated successfully",
	})
}

func (h *MongoHandler) DeleteRegistration(c fiber.Ctx) error {
	id := c.Params("id")
	if id == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "id parameter is required",
		})
	}

	err := h.usecase.DeleteRegistration(c.Context(), id)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"message": "registration deleted successfully",
	})
}

// ── Specifications Handler (iotDeviceInfo) ───────────────────────────────────

func (h *MongoHandler) ListSpecifications(c fiber.Ctx) error {
	list, err := h.usecase.ListSpecifications(c.Context())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": err.Error(),
		})
	}
	return c.JSON(list)
}

func (h *MongoHandler) CreateSpecification(c fiber.Ctx) error {
	var req domain.MongoDeviceInfo
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "invalid payload format",
		})
	}

	id, err := h.usecase.CreateSpecification(c.Context(), &req)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"message": "specification created successfully",
		"id":      id,
	})
}

func (h *MongoHandler) UpdateSpecification(c fiber.Ctx) error {
	id := c.Params("id")
	if id == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "id parameter is required",
		})
	}

	var req domain.MongoDeviceInfo
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "invalid payload format",
		})
	}

	err := h.usecase.UpdateSpecification(c.Context(), id, &req)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"message": "specification updated successfully",
	})
}

func (h *MongoHandler) DeleteSpecification(c fiber.Ctx) error {
	id := c.Params("id")
	if id == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "id parameter is required",
		})
	}

	err := h.usecase.DeleteSpecification(c.Context(), id)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"message": "specification deleted successfully",
	})
}
