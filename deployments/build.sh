#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# Fahfon Dashboard – Build Script (Root)
#  Build Docker images และ export .tar.gz ไปยัง server/
#  สำหรับ deploy บน production
#
# Usage:
#   ./deployments/build.sh                    # Build backend + frontend
#   ./deployments/build.sh backend            # Build เฉพาะ backend
#   ./deployments/build.sh frontend           # Build เฉพาะ frontend
# ============================================================

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Check argument
CHOICE=""
if [ -n "${1:-}" ]; then
  case "$(echo "$1" | tr '[:upper:]' '[:lower:]')" in
    all|1)
      CHOICE="1"
      ;;
    backend|2)
      CHOICE="2"
      ;;
    frontend|3)
      CHOICE="3"
      ;;
    -h|--help)
      echo "Usage: $0 [all|backend|frontend]"
      echo "  all      - Build both backend & frontend"
      echo "  backend  - Build only backend service"
      echo "  frontend - Build only frontend service"
      exit 0
      ;;
    *)
      echo -e "${RED}Invalid argument: $1${NC}"
      echo "Usage: $0 [all|backend|frontend]"
      exit 1
      ;;
  esac
fi

# Interactive menu if no argument provided
if [ -z "$CHOICE" ]; then
  echo -e "${BLUE}============================================================${NC}"
  echo -e "${BLUE}    Fahfon Dashboard Management Build Selection Tool        ${NC}"
  echo -e "${BLUE}============================================================${NC}"
  echo "โปรดเลือกบริการที่ต้องการจะทำการ Build:"
  echo " 1) Build ทั้งหมด (Backend & Frontend)"
  echo " 2) Build เฉพาะ Backend (ff-mgmt-backend)"
  echo " 3) Build เฉพาะ Frontend (ff-mgmt-frontend)"
  read -p "ใส่ตัวเลขตัวเลือกของคุณ (1-3) [เริ่มต้น 1]: " CHOICE
  CHOICE=${CHOICE:-1}
fi

build_backend() {
    echo -e "${BLUE}=========================================${NC}"
    echo -e "${BLUE}  Building Backend...${NC}"
    echo -e "${BLUE}=========================================${NC}"
    cd "$(dirname "${BASH_SOURCE[0]}")/ff-mgmt-backend"
    bash build.sh
    cd - > /dev/null
    echo ""
}

build_frontend() {
    echo -e "${BLUE}=========================================${NC}"
    echo -e "${BLUE}  Building Frontend...${NC}"
    echo -e "${BLUE}=========================================${NC}"
    cd "$(dirname "${BASH_SOURCE[0]}")/ff-mgmt-frontend"
    bash build.sh
    cd - > /dev/null
    echo ""
}

cleanup_caches() {
    echo -e "${YELLOW}=========================================${NC}"
    echo -e "${YELLOW}  🧹 Clearing Go Build Cache & Docker System Prune...${NC}"
    echo -e "${YELLOW}=========================================${NC}"
    
    # 1. Clear Go build cache (if go binary exists)
    if command -v go &> /dev/null; then
        go clean -cache -modcache || true
        echo -e "${GREEN}  - Cleared Go build & module cache${NC}"
    fi

    # 2. Clear Docker system cache, dangling images, and volumes
    if command -v docker &> /dev/null; then
        docker system prune -a --volumes -f || true
        echo -e "${GREEN}  - Executed docker system prune -a --volumes -f${NC}"
    fi

    echo -e "${GREEN}✅ Cleaned up all build & Docker caches!${NC}"
    echo ""
}

case "$CHOICE" in
    1)
        echo -e ">> ${GREEN}เลือก: Build ทั้งหมด (Backend & Frontend)${NC}\n"
        build_backend
        build_frontend
        cleanup_caches
        ;;
    2)
        echo -e ">> ${GREEN}เลือก: Build เฉพาะ Backend (ff-mgmt-backend)${NC}\n"
        build_backend
        cleanup_caches
        ;;
    3)
        echo -e ">> ${GREEN}เลือก: Build เฉพาะ Frontend (ff-mgmt-frontend)${NC}\n"
        build_frontend
        cleanup_caches
        ;;
    *)
        echo -e "${RED}ตัวเลือกไม่ถูกต้อง กำลังยกเลิก...${NC}"
        exit 1
        ;;
esac

echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}  ✅ Build เสร็จสมบูรณ์${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""
echo -e "ไฟล์ .tar.gz อยู่ที่:"
echo -e "  - deployments/ff-mgmt-backend/server/"
echo -e "  - deployments/ff-mgmt-frontend/server/"
echo ""
echo -e "ขั้นตอนถัดไป:"
echo -e "  scp -r deployments/ff-mgmt-backend/server/ user@server:/opt/"
echo -e "  scp -r deployments/ff-mgmt-frontend/server/ user@server:/opt/"
echo -e "  scp -r deployments/ff-mgmt-infra/server/ user@server:/opt/"
echo -e "  แล้วบน server: cd /opt/server && ./server-up.sh"