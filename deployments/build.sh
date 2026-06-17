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

PROJECT="${1:-all}"

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

case "$PROJECT" in
    all)
        build_backend
        build_frontend
        ;;
    backend)
        build_backend
        ;;
    frontend)
        build_frontend
        ;;
    *)
        echo -e "${RED}Usage: $0 [backend|frontend]${NC}"
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