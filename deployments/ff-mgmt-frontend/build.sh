#!/usr/bin/env bash
set -euo pipefail

APP_NAME="${APP_NAME:-ff-dashboard-mgmt-frontend}"
TAG="${TAG:-latest}"
IMAGE_TAR_NAME="${IMAGE_TAR_NAME:-ff-dashboard-mgmt-frontend-image.tar.gz}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="${DEPLOY_DIR}/server"

echo "========================================="
echo "  Building Frontend: ${APP_NAME}:${TAG}"
echo "========================================="

# Read NEXT_PUBLIC_API_URL from .env.production
ENV_FILE="${DEPLOY_DIR}/server/.env.production"
NEXT_PUBLIC_API_URL=""
if [[ -f "${ENV_FILE}" ]]; then
  NEXT_PUBLIC_API_URL=$(grep "^NEXT_PUBLIC_API_URL=" "${ENV_FILE}" | cut -d '=' -f2 | tr -d '[:space:]')
fi

# Build Docker image (target linux/amd64 for production server)
docker build \
  --platform linux/amd64 \
  --build-arg "NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}" \
  -t "${APP_NAME}:${TAG}" \
  "${ROOT_DIR}/frontend"

# Export to .tar.gz
mkdir -p "${OUT_DIR}"
docker save "${APP_NAME}:${TAG}" | gzip > "${OUT_DIR}/${IMAGE_TAR_NAME}"

echo "✅ Built: ${APP_NAME}:${TAG}"
echo "✅ Saved: ${OUT_DIR}/${IMAGE_TAR_NAME}"