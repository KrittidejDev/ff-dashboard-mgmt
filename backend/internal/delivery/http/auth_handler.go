package http

import (
	"ff-dashboard-mgmt/backend/internal/domain"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
)

type AuthHandler struct {
	userUsecase  domain.UserUsecase
	auditUsecase domain.AuditLogUsecase
}

func NewAuthHandler(uu domain.UserUsecase, au domain.AuditLogUsecase) *AuthHandler {
	return &AuthHandler{
		userUsecase:  uu,
		auditUsecase: au,
	}
}

func (h *AuthHandler) Login(c fiber.Ctx) error {
	var req domain.LoginRequest
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "invalid request payload",
		})
	}

	resp, err := h.userUsecase.Login(c.Context(), &req)
	if err != nil {
		// Log failed login attempt
		h.auditUsecase.RecordLog(
			c.Context(),
			nil,
			req.Username,
			"USER_LOGIN_FAILED",
			"auth",
			map[string]any{"username": req.Username, "reason": err.Error()},
			c.IP(),
			c.Get("User-Agent"),
		)
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	// Log successful login
	h.auditUsecase.RecordLog(
		c.Context(),
		&resp.User.ID,
		resp.User.Username,
		"USER_LOGIN_SUCCESS",
		"auth",
		map[string]any{"username": resp.User.Username},
		c.IP(),
		c.Get("User-Agent"),
	)

	return c.JSON(resp)
}

func (h *AuthHandler) Me(c fiber.Ctx) error {
	userIDStr, ok := c.Locals("userID").(string)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "unauthorized",
		})
	}

	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "invalid user id in session",
		})
	}

	user, err := h.userUsecase.GetUserByID(c.Context(), userID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "user not found",
		})
	}

	return c.JSON(user)
}

func (h *AuthHandler) ChangePassword(c fiber.Ctx) error {
	userIDStr, ok := c.Locals("userID").(string)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "unauthorized",
		})
	}

	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "invalid user id in session",
		})
	}

	var req domain.ChangePasswordRequest
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "invalid request payload",
		})
	}

	if err := h.userUsecase.ChangePassword(c.Context(), userID, &req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	// Log password change event
	username, _ := c.Locals("username").(string)
	h.auditUsecase.RecordLog(
		c.Context(),
		&userID,
		username,
		"USER_PASSWORD_CHANGED",
		"auth",
		map[string]any{"user_id": userID.String()},
		c.IP(),
		c.Get("User-Agent"),
	)

	return c.JSON(fiber.Map{
		"message": "password changed successfully",
	})
}

func (h *AuthHandler) CreateUser(c fiber.Ctx) error {
	adminIDStr, _ := c.Locals("userID").(string)
	adminUsername, _ := c.Locals("username").(string)

	var req domain.UserRegisterRequest
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "invalid request payload",
		})
	}

	newUser, err := h.userUsecase.Register(c.Context(), &req)
	if err != nil {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	// Log creation event
	var adminID *uuid.UUID
	if parsed, err := uuid.Parse(adminIDStr); err == nil {
		adminID = &parsed
	}

	h.auditUsecase.RecordLog(
		c.Context(),
		adminID,
		adminUsername,
		"USER_CREATE",
		"system_users",
		map[string]any{
			"created_username": newUser.Username,
			"created_email":    newUser.Email,
			"created_role":     newUser.Role,
		},
		c.IP(),
		c.Get("User-Agent"),
	)

	return c.Status(fiber.StatusCreated).JSON(newUser)
}

func (h *AuthHandler) ListUsers(c fiber.Ctx) error {
	users, err := h.userUsecase.ListUsers(c.Context())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": err.Error(),
		})
	}
	return c.JSON(users)
}

func (h *AuthHandler) DeleteUser(c fiber.Ctx) error {
	adminIDStr, _ := c.Locals("userID").(string)
	adminUsername, _ := c.Locals("username").(string)

	idParam := c.Params("id")
	targetID, err := uuid.Parse(idParam)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "invalid user id format",
		})
	}

	// Prevent deleting yourself
	if idParam == adminIDStr {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "cannot delete your own account",
		})
	}

	targetUser, err := h.userUsecase.GetUserByID(c.Context(), targetID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "user not found",
		})
	}

	err = h.userUsecase.DeleteUser(c.Context(), targetID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	// Log deletion event
	var adminID *uuid.UUID
	if parsed, err := uuid.Parse(adminIDStr); err == nil {
		adminID = &parsed
	}

	h.auditUsecase.RecordLog(
		c.Context(),
		adminID,
		adminUsername,
		"USER_DELETE",
		"system_users",
		map[string]any{
			"deleted_username": targetUser.Username,
			"deleted_email":    targetUser.Email,
			"deleted_role":     targetUser.Role,
		},
		c.IP(),
		c.Get("User-Agent"),
	)

	return c.JSON(fiber.Map{
		"message": "user deleted successfully",
	})
}
