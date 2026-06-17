package usecase

import (
	"context"

	"ff-dashboard-mgmt/backend/internal/domain"
)

type mongoUsecase struct {
	repo domain.MongoRepository
}

func NewMongoUsecase(repo domain.MongoRepository) domain.MongoUsecase {
	return &mongoUsecase{repo: repo}
}

func (u *mongoUsecase) ListRegistrations(ctx context.Context) ([]*domain.MongoDeviceRegistered, error) {
	return u.repo.ListRegistrations(ctx)
}

func (u *mongoUsecase) CreateRegistration(ctx context.Context, reg *domain.MongoDeviceRegistered) (string, error) {
	return u.repo.CreateRegistration(ctx, reg)
}

func (u *mongoUsecase) UpdateRegistration(ctx context.Context, id string, reg *domain.MongoDeviceRegistered) error {
	return u.repo.UpdateRegistration(ctx, id, reg)
}

func (u *mongoUsecase) DeleteRegistration(ctx context.Context, id string) error {
	return u.repo.DeleteRegistration(ctx, id)
}

func (u *mongoUsecase) ListSpecifications(ctx context.Context) ([]*domain.MongoDeviceInfo, error) {
	return u.repo.ListSpecifications(ctx)
}

func (u *mongoUsecase) CreateSpecification(ctx context.Context, spec *domain.MongoDeviceInfo) (string, error) {
	return u.repo.CreateSpecification(ctx, spec)
}

func (u *mongoUsecase) UpdateSpecification(ctx context.Context, id string, spec *domain.MongoDeviceInfo) error {
	return u.repo.UpdateSpecification(ctx, id, spec)
}

func (u *mongoUsecase) DeleteSpecification(ctx context.Context, id string) error {
	return u.repo.DeleteSpecification(ctx, id)
}
