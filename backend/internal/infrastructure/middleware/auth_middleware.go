package middleware

import (
	"strings"

	"ff-dashboard-mgmt/backend/internal/domain"
	"ff-dashboard-mgmt/backend/internal/usecase"

	"github.com/gofiber/fiber/v3"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// AuthRequired parses and validates JWT tokens, storing the claims in Fiber context Locals.
func AuthRequired(jwtSecret string) fiber.Handler {
	return func(c fiber.Ctx) error {
		authHeader := c.Get("Authorization")
		if authHeader == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "missing authorization header",
			})
		}

		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "invalid token format",
			})
		}

		tokenStr := parts[1]
		claims := &usecase.UserClaims{}

		token, err := jwt.ParseWithClaims(tokenStr, claims, func(token *jwt.Token) (interface{}, error) {
			return []byte(jwtSecret), nil
		})

		if err != nil || !token.Valid {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "invalid or expired token",
			})
		}

		// Inject user claims into local storage
		c.Locals("userID", claims.UserID)
		c.Locals("username", claims.Username)
		c.Locals("role", claims.Role)

		return c.Next()
	}
}

// RolesAllowed restricts access to specified roles only.
// Must be registered AFTER AuthRequired middleware.
func RolesAllowed(auditUsecase domain.AuditLogUsecase, allowedRoles ...domain.UserRole) fiber.Handler {
	return func(c fiber.Ctx) error {
		roleStr, ok := c.Locals("role").(string)
		if !ok {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error": "access denied",
			})
		}

		userRole := domain.UserRole(roleStr)
		isAllowed := false
		for _, r := range allowedRoles {
			if r == userRole {
				isAllowed = true
				break
			}
		}

		if !isAllowed {
			// Security alert - Log unauthorized attempt asynchronously
			userIDStr, _ := c.Locals("userID").(string)
			username, _ := c.Locals("username").(string)
			ip := c.IP()
			ua := c.Get("User-Agent")

			var uID *uuid.UUID
			if parsed, err := uuid.Parse(userIDStr); err == nil {
				uID = &parsed
			}

			auditUsecase.RecordLog(
				c.Context(),
				uID,
				username,
				"UNAUTHORIZED_ACCESS_ATTEMPT",
				c.Path(),
				map[string]any{
					"attempted_method": c.Method(),
					"attempted_path":   c.Path(),
					"user_role":        roleStr,
					"required_roles":   allowedRoles,
				},
				ip,
				ua,
			)

			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error": "insufficient permissions to access this resource",
			})
		}

		return c.Next()
	}
}
