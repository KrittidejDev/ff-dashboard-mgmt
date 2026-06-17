#!/usr/bin/env bash
set -euo pipefail

IMAGE_TAR="${IMAGE_TAR:-ff-dashboard-mgmt-frontend-image.tar.gz}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
APP_NAME="ff-dashboard-mgmt-frontend"

echo "========================================="
echo "  🚀 Deploy Frontend: ${APP_NAME}"
echo "========================================="

# 1. Validation
if ! command -v docker &> /dev/null; then
    echo "❌ Error: ไม่พบ Docker ในเครื่องนี้"
    exit 1
fi

if [[ ! -f "${IMAGE_TAR}" ]]; then
    echo "❌ Error: ไม่พบไฟล์ Image: ${IMAGE_TAR}"
    exit 1
fi

if [[ ! -f ".env.production" ]]; then
    echo "⚠️ Warning: ไม่พบไฟล์ .env.production"
    exit 1
fi

# 2. Backup current image for rollback
CURRENT_IMAGE_ID=$(docker images -q "${APP_NAME}:latest" 2>/dev/null || echo "")
if [[ -n "${CURRENT_IMAGE_ID}" ]]; then
    TIMESTAMP=$(date +%Y%m%d-%H%M%S)
    docker tag "${APP_NAME}:latest" "${APP_NAME}:rollback-${TIMESTAMP}"
    # Keep only 5 rollbacks
    OLD_ROLLBACKS=$(docker images --format "{{.Tag}} {{.CreatedAt}}" "${APP_NAME}" | grep "rollback-" | sort -rk 2 | awk '{print $1}' | tail -n +6)
    if [[ -n "${OLD_ROLLBACKS}" ]]; then
        for TAG in ${OLD_ROLLBACKS}; do
            docker rmi "${APP_NAME}:${TAG}" || true
        done
    fi
fi

# 3. Load new image
echo "📦 กำลังโหลด Image..."
if docker load -i "${IMAGE_TAR}"; then
    echo "✅ โหลด Image สำเร็จ"
else
    echo "❌ ไม่สามารถโหลด Image ได้"
    exit 1
fi

# 4. Cleanup old container + start new one
if docker ps -a --format '{{.Names}}' | grep -Eq "^${APP_NAME}$"; then
    echo "พบคอนเทนเนอร์เก่า กำลังลบ..."
    docker rm -f "${APP_NAME}" || true
fi

docker compose -f "${COMPOSE_FILE}" up -d --force-recreate

# 5. Health check
echo "🏥 กำลังตรวจสอบสถานะ..."
sleep 5
if docker ps --format '{{.Names}}' | grep -q "^${APP_NAME}$"; then
    echo "✅ ${APP_NAME} รันปกติ"
    docker compose -f "${COMPOSE_FILE}" ps
else
    echo "❌ Error: ${APP_NAME} ไม่สามารถรันได้"
    exit 1
fi

echo "========================================="
echo "  ✨ Deploy เสร็จสมบูรณ์"
echo "========================================="