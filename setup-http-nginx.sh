#!/bin/bash
set -euo pipefail

DOMAIN="${DOMAIN:-drumbeat.top}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${APP_DIR:-$SCRIPT_DIR}"
SITE_ROOT="${SITE_ROOT:-${APP_DIR}/dist}"
PUBLIC_SITE_ROOT="${PUBLIC_SITE_ROOT:-/var/www/drum-coach}"
NGINX_TEMPLATE="${SCRIPT_DIR}/drum-coach-http.conf"
NGINX_TARGET="/etc/nginx/conf.d/drum-coach-http.conf"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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

require_root() {
    if [[ $EUID -ne 0 ]]; then
        echo_error "Run as root (or via sudo)."
        echo "Usage: sudo DOMAIN=drumbeat.top APP_DIR=$(pwd) bash ./setup-http-nginx.sh"
        exit 1
    fi
}

validate_inputs() {
    if [[ ! -f "$NGINX_TEMPLATE" ]]; then
        echo_error "Missing nginx template: $NGINX_TEMPLATE"
        exit 1
    fi

    if [[ ! -f "${SITE_ROOT}/index.html" ]]; then
        echo_error "Static site build not found: ${SITE_ROOT}/index.html"
        echo_error "Run npm run build first, or set SITE_ROOT to the built site directory."
        exit 1
    fi
}

install_packages() {
    if command -v nginx >/dev/null 2>&1; then
        return
    fi

    echo_info "Installing nginx..."
    if command -v yum >/dev/null 2>&1; then
        yum install -y --allowerasing nginx || yum install -y --allowerasing --nobest nginx
        return
    fi

    if command -v apt-get >/dev/null 2>&1; then
        apt-get update
        apt-get install -y nginx
        return
    fi

    echo_error "Unsupported package manager. Install nginx manually."
    exit 1
}

prepare_site_root() {
    echo_info "Publishing site to ${PUBLIC_SITE_ROOT}..."
    mkdir -p "${PUBLIC_SITE_ROOT}"
    cp -a "${SITE_ROOT}/." "${PUBLIC_SITE_ROOT}/"
    chmod -R a+rX "${PUBLIC_SITE_ROOT}"
}

render_nginx_config() {
    echo_info "Rendering nginx config..."
    sed \
        -e "s|__DOMAIN__|${DOMAIN}|g" \
        -e "s|__SITE_ROOT__|${PUBLIC_SITE_ROOT}|g" \
        "$NGINX_TEMPLATE" > "$NGINX_TARGET"
}

configure_firewall() {
    echo_info "Configuring firewall for port 80..."
    if command -v firewall-cmd >/dev/null 2>&1 && systemctl is-active --quiet firewalld; then
        firewall-cmd --add-port=80/tcp --permanent
        firewall-cmd --reload
        echo_success "firewalld updated for port 80."
        return
    fi

    if command -v ufw >/dev/null 2>&1; then
        ufw allow 80/tcp || true
        echo_success "ufw updated for port 80."
        return
    fi

    echo_warning "No active firewalld/ufw detected. Open TCP 80 in your OS firewall or cloud security group."
}

configure_nginx() {
    echo_info "Testing nginx config..."
    nginx -t
    systemctl enable nginx
    systemctl restart nginx
}

print_summary() {
    echo ""
    echo_success "HTTP site setup completed."
    echo "  URL: http://${DOMAIN}/"
    echo "  Root: ${PUBLIC_SITE_ROOT}"
    echo ""
    echo "Test:"
    echo "  curl -I http://${DOMAIN}/"
}

main() {
    require_root
    validate_inputs

    echo_info "Domain: ${DOMAIN}"
    echo_info "Site root: ${SITE_ROOT}"
    echo_info "Public root: ${PUBLIC_SITE_ROOT}"

    install_packages
    prepare_site_root
    render_nginx_config
    configure_firewall
    configure_nginx
    print_summary
}

main "$@"
