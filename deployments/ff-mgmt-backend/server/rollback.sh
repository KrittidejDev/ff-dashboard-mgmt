#!/usr/bin/env bash
set -euo pipefail

APP_NAME="ff-dashboard-mgmt-backend"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"

echo "========================================="
echo "  🔙 Rollback: ${APP_NAME}"
echo "========================================="

# Get available versions
OPTIONS=($(docker images --format "{{.Tag}} ({{.CreatedAt}})" "${APP_NAME}" | grep -E "latest|rollback-" | sort -rk 2 || true))

if [ ${#OPTIONS[@]} -eq 0 ]; then
    echo "❌ ไม่พบเวอร์ชันในระบบ"
    exit 1
fi

echo "เลือกเวอร์ชันที่ต้องการ Rollback:"
select OPTION in "${OPTIONS[@]}"; do
    if [[ -n "$OPTION" ]]; then
        SELECTED_TAG=$(echo "$OPTION" | awk '{print $1}')
        break
    else
        echo "❌ ไม่ถูกต้อง"
    fi
done

if [[ "$SELECTED_TAG" == "latest" ]]; then
    echo "กำลัง Restart container ตัวเดิม..."
    docker compose -f "${COMPOSE_FILE}" up -d --force-recreate
    echo "✅ Restart เสร็จ"
    exit 0
fi

echo "Rollback ไปยัง: $SELECTED_TAG"
docker tag "${APP_NAME}:${SELECTED_TAG}" "${APP_NAME}:latest"
docker compose -f "${COMPOSE_FILE}" up -d --force-recreate

echo "✅ Rollback สำเร็จ"