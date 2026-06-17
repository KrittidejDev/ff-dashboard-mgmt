#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"

echo "========================================="
echo "  🔄 Restart Infrastructure"
echo "========================================="

docker compose -f "${COMPOSE_FILE}" down
docker compose -f "${COMPOSE_FILE}" up -d --force-recreate

echo "✅ Restart เสร็จ"
docker compose -f "${COMPOSE_FILE}" ps