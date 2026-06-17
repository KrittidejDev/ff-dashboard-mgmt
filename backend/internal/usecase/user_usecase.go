package usecase

import (
	"context"
	"errors"
	"time"

	"ff-dashboard-mgmt/backend/internal/domain"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

type userUsecase struct {
	repo      domain.UserRepository
	jwtSecret string
	lifetime  time.Duration
}

func NewUserUsecase(repo domain.UserRepository, jwtSecret string, lifetime time.Duration) domain.UserUsecase {
	if lifetime <= 0 {
		lifetime = 24 * time.Hour
	}
	return &userUsecase{
		repo:      repo,
		jwtSecret: jwtSecret,
		lifetime:  lifetime,
	}
}

type UserClaims struct {
	UserID   string `json:"user_id"`
	Username string `json:"username"`
	Role     string `json:"role"`
	jwt.RegisteredClaims
}

func (u *userUsecase) Register(ctx context.Context, req *domain.UserRegisterRequest) (*domain.SystemUser, error) {
	if req.Username == "" || req.Email == "" || req.Password == "" {
		return nil, errors.New("username, email and password are required")
	}

	// Validate Role
	if req.Role != domain.RoleSuperAdmin && req.Role != domain.RoleAdmin && req.Role != domain.RoleUser {
		req.Role = domain.RoleUser
	}

	// Check duplicates
	existing, _ := u.repo.GetUserByUsername(ctx, req.Username)
	if existing != nil {
		return nil, errors.New("username is already registered")
	}

	// Hash password
	hashed, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, errors.New("failed to hash password")
	}

	newUser := &domain.SystemUser{
		ID:           uuid.New(),
		Username:     req.Username,
		Email:        req.Email,
		PasswordHash: string(hashed),
		Role:         req.Role,
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}

	if err := u.repo.CreateUser(ctx, newUser); err != nil {
		return nil, err
	}

	return newUser, nil
}

func (u *userUsecase) Login(ctx context.Context, req *domain.LoginRequest) (*domain.LoginResponse, error) {
	if req.Username == "" || req.Password == "" {
		return nil, errors.New("username and password are required")
	}

	user, err := u.repo.GetUserByUsername(ctx, req.Username)
	if err != nil {
		return nil, errors.New("invalid username or password")
	}

	// Compare password
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		return nil, errors.New("invalid username or password")
	}

	// Generate JWT claims
	claims := &UserClaims{
		UserID:   user.ID.String(),
		Username: user.Username,
		Role:     string(user.Role),
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(u.lifetime)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString([]byte(u.jwtSecret))
	if err != nil {
		return nil, errors.New("failed to sign access token")
	}

	return &domain.LoginResponse{
		Token: tokenString,
		User:  *user,
	}, nil
}

func (u *userUsecase) ChangePassword(ctx context.Context, userID uuid.UUID, req *domain.ChangePasswordRequest) error {
	// Validate required fields
	if req.CurrentPassword == "" || req.NewPassword == "" || req.ConfirmNewPassword == "" {
		return errors.New("current password, new password and confirm password are required")
	}

	// Check new passwords match
	if req.NewPassword != req.ConfirmNewPassword {
		return errors.New("new password and confirm password do not match")
	}

	// Validate password strength (minimum 6 characters)
	if len(req.NewPassword) < 6 {
		return errors.New("new password must be at least 6 characters")
	}

	// Fetch user to verify current password
	user, err := u.repo.GetUserByID(ctx, userID)
	if err != nil {
		return errors.New("user not found")
	}

	// Verify current password
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.CurrentPassword)); err != nil {
		return errors.New("current password is incorrect")
	}

	// Hash new password
	hashed, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		return errors.New("failed to hash new password")
	}

	// Update in database
	return u.repo.UpdatePassword(ctx, userID, string(hashed))
}

func (u *userUsecase) GetUserByID(ctx context.Context, id uuid.UUID) (*domain.SystemUser, error) {
	return u.repo.GetUserByID(ctx, id)
}

func (u *userUsecase) ListUsers(ctx context.Context) ([]*domain.SystemUser, error) {
	return u.repo.ListUsers(ctx)
}

func (u *userUsecase) DeleteUser(ctx context.Context, id uuid.UUID) error {
	return u.repo.DeleteUser(ctx, id)
}
