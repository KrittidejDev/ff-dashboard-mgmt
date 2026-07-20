#!/usr/bin/env bash
set -euo pipefail

APP_NAME="${APP_NAME:-ff-dashboard-mgmt-backend}"
TAG="${TAG:-latest}"
IMAGE_TAR_NAME="${IMAGE_TAR_NAME:-ff-dashboard-mgmt-backend-image.tar.gz}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="${DEPLOY_DIR}/server"

echo "========================================="
echo "  Building Backend: ${APP_NAME}:${TAG}"
echo "========================================="

# Build Docker image (target linux/amd64 for production server)
docker build \
  --platform linux/amd64 \
  -t "${APP_NAME}:${TAG}" \
  "${ROOT_DIR}/backend"

# Export to .tar.gz
mkdir -p "${OUT_DIR}"
docker save "${APP_NAME}:${TAG}" | gzip > "${OUT_DIR}/${IMAGE_TAR_NAME}"

echo "✅ Built: ${APP_NAME}:${TAG}"
echo "✅ Saved: ${OUT_DIR}/${IMAGE_TAR_NAME}"

echo "========================================="
echo "  🧹 Cleaning up Docker cache..."
echo "========================================="
docker system prune -a --volumes -f
echo "✅ Docker cleanup complete!"