#!/usr/bin/env bash
set -euo pipefail

APP_NAME="ff-dashboard-mgmt-backend"

echo "========================================="
echo "  🗑️ ลบ Image: ${APP_NAME}"
echo "========================================="

OPTIONS=($(docker images --format "{{.Tag}} ({{.CreatedAt}})" "${APP_NAME}" | grep "rollback-" | sort -rk 2 || true))

if [ ${#OPTIONS[@]} -eq 0 ]; then
    echo "❌ ไม่พบ rollback images ที่จะลบ"
    exit 1
fi

echo "เลือกเวอร์ชันที่ต้องการลบ:"
select OPTION in "${OPTIONS[@]}"; do
    if [[ -n "$OPTION" ]]; then
        SELECTED_TAG=$(echo "$OPTION" | awk '{print $1}')
        break
    fi
done

read -p "ยืนยันลบ ${APP_NAME}:${SELECTED_TAG} ? (y/N): " CONFIRM
if [[ "$CONFIRM" =~ ^[Yy]$ ]]; then
    docker rmi "${APP_NAME}:${SELECTED_TAG}" && echo "✅ ลบแล้ว" || echo "❌ ลบไม่สำเร็จ"
fi