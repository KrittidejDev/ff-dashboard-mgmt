#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"

echo "========================================="
echo "  🚀 Deploy Infrastructure (Redis)"
echo "========================================="

# 1. Validation
if ! command -v docker &> /dev/null; then
    echo "❌ Error: ไม่พบ Docker ในเครื่องนี้"
    exit 1
fi

if [[ ! -f ".env.production" ]]; then
    echo "⚠️ Warning: ไม่พบไฟล์ .env.production"
    echo "กรุณา: cp .env.production.example .env.production"
    exit 1
fi

# 2. Start Redis
docker compose -f "${COMPOSE_FILE}" up -d --force-recreate

echo "✅ Infrastructure รันแล้ว"
docker compose -f "${COMPOSE_FILE}" ps