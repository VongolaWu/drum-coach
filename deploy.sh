#!/bin/bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="${BUILD_DIR:-${APP_DIR}/dist}"
PUBLIC_SITE_ROOT="${PUBLIC_SITE_ROOT:-/var/www/drum-coach}"
NPM_BIN="${NPM_BIN:-npm}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

if [[ "${EUID}" -eq 0 ]]; then
    SUDO=""
else
    SUDO="sudo"
fi

echo_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

echo_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

echo_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

echo_error() {
    echo -e "${RED}❌ $1${NC}"
}

require_command() {
    if ! command -v "$1" >/dev/null 2>&1; then
        echo_error "Missing required command: $1"
        exit 1
    fi
}

build_site() {
    echo_info "Building site..."
    cd "${APP_DIR}"
    "${NPM_BIN}" run build

    if [[ ! -f "${BUILD_DIR}/index.html" ]]; then
        echo_error "Build output not found: ${BUILD_DIR}/index.html"
        exit 1
    fi
}

publish_site() {
    echo_info "Publishing ${BUILD_DIR} to ${PUBLIC_SITE_ROOT}..."
    ${SUDO} mkdir -p "${PUBLIC_SITE_ROOT}"

    if command -v rsync >/dev/null 2>&1; then
        ${SUDO} rsync -a --delete "${BUILD_DIR}/" "${PUBLIC_SITE_ROOT}/"
        return
    fi

    echo_warning "rsync not found, falling back to cp."
    ${SUDO} find "${PUBLIC_SITE_ROOT}" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
    ${SUDO} cp -a "${BUILD_DIR}/." "${PUBLIC_SITE_ROOT}/"
}

reload_nginx() {
    echo_info "Validating nginx configuration..."
    ${SUDO} nginx -t
    echo_info "Reloading nginx..."
    ${SUDO} systemctl reload nginx
}

print_summary() {
    echo ""
    echo_success "Deployment completed."
    echo "  Build dir: ${BUILD_DIR}"
    echo "  Public dir: ${PUBLIC_SITE_ROOT}"
}

main() {
    require_command "${NPM_BIN}"
    require_command nginx
    require_command systemctl

    build_site
    publish_site
    reload_nginx
    print_summary
}

main "$@"
