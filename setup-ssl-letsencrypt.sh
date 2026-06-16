#!/bin/bash
set -euo pipefail

# Let's Encrypt SSL setup for Drum Coach static site
# Usage:
#   sudo ./setup-ssl-letsencrypt.sh full
#   sudo ./setup-ssl-letsencrypt.sh renew

DOMAIN="${DOMAIN:-drumbeat.top}"
EMAIL="${EMAIL:-vongola8757@gmail.com}"
MODE="${1:-full}"  # full|renew
AUTH_MODE="${AUTH_MODE:-standalone}"  # standalone|webroot
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${APP_DIR:-$SCRIPT_DIR}"
SITE_ROOT="${SITE_ROOT:-${APP_DIR}/dist}"
PUBLIC_SITE_ROOT="${PUBLIC_SITE_ROOT:-/var/www/drum-coach}"
ACME_ROOT="${ACME_ROOT:-/var/www/certbot}"
NGINX_SSL_TEMPLATE="${SCRIPT_DIR}/drum-coach-ssl-fixed.conf"
NGINX_SSL_TARGET="/etc/nginx/conf.d/drum-coach-ssl.conf"
NGINX_TEMP_TARGET="/etc/nginx/conf.d/drum-coach-temp.conf"
RENEW_CRON_WEBROOT='0 3,15 * * * /usr/bin/certbot renew --quiet && systemctl reload nginx'
RENEW_CRON_STANDALONE='0 3,15 * * * /usr/bin/certbot renew --quiet --pre-hook "systemctl stop nginx" --post-hook "systemctl start nginx"'

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
        echo "Usage: sudo ./setup-ssl-letsencrypt.sh [full|renew]"
        exit 1
    fi
}

validate_inputs() {
    if [[ "$MODE" != "full" && "$MODE" != "renew" ]]; then
        echo_error "Invalid mode: $MODE (expected: full or renew)"
        exit 1
    fi

    if [[ "$AUTH_MODE" != "standalone" && "$AUTH_MODE" != "webroot" ]]; then
        echo_error "Invalid AUTH_MODE: $AUTH_MODE (expected: standalone or webroot)"
        exit 1
    fi

    if [[ -z "$EMAIL" ]]; then
        echo_error "Please set EMAIL (env or edit script)."
        exit 1
    fi

    if [[ ! -f "$NGINX_SSL_TEMPLATE" ]]; then
        echo_error "Missing nginx SSL template: $NGINX_SSL_TEMPLATE"
        exit 1
    fi

    if [[ "$MODE" == "full" && ! -f "${SITE_ROOT}/index.html" ]]; then
        echo_error "Static site build not found: ${SITE_ROOT}/index.html"
        echo_error "Run npm run build first, or set SITE_ROOT to the built site directory."
        exit 1
    fi
}

prepare_web_roots() {
    echo_info "Preparing public web roots..."
    mkdir -p "${PUBLIC_SITE_ROOT}" "${ACME_ROOT}"
    cp -a "${SITE_ROOT}/." "${PUBLIC_SITE_ROOT}/"
    chmod -R a+rX "${PUBLIC_SITE_ROOT}" "${ACME_ROOT}"
}

install_packages() {
    echo_info "Installing required packages..."
    yum install -y --allowerasing certbot python3-certbot-nginx nginx || {
        echo_warning "Primary install failed; retrying with --nobest"
        yum install -y --allowerasing --nobest certbot python3-certbot-nginx nginx
    }
}

write_temp_nginx_config() {
    echo_info "Creating temporary Nginx configuration for domain verification..."
    cat > "$NGINX_TEMP_TARGET" <<EOF
server {
    listen 80;
    server_name $DOMAIN;

    location ^~ /.well-known/acme-challenge/ {
        root ${ACME_ROOT};
        default_type "text/plain";
        try_files \$uri =404;
    }

    location / {
        root ${PUBLIC_SITE_ROOT};
        try_files \$uri \$uri/ /index.html;
    }
}
EOF
}

render_production_nginx_config() {
    echo_info "Rendering production Nginx configuration from template..."
    sed \
        -e "s|__DOMAIN__|${DOMAIN}|g" \
        -e "s|__SITE_ROOT__|${PUBLIC_SITE_ROOT}|g" \
        -e "s|__ACME_ROOT__|${ACME_ROOT}|g" \
        "$NGINX_SSL_TEMPLATE" > "$NGINX_SSL_TARGET"
    rm -f "$NGINX_TEMP_TARGET"
}

configure_nginx() {
    echo_info "Testing Nginx configuration..."
    nginx -t
    systemctl enable nginx
    systemctl restart nginx
}

configure_firewall() {
    echo_info "Configuring firewall..."
    if command -v firewall-cmd >/dev/null 2>&1 && systemctl is-active --quiet firewalld; then
        firewall-cmd --add-port=80/tcp --permanent
        firewall-cmd --add-port=443/tcp --permanent
        firewall-cmd --reload
        echo_success "firewalld updated for ports 80 and 443."
        return
    fi

    if command -v ufw >/dev/null 2>&1; then
        ufw allow 80/tcp || true
        ufw allow 443/tcp || true
        echo_success "ufw updated for ports 80 and 443."
        return
    fi

    echo_warning "No active firewalld/ufw detected. Open TCP 80 and 443 in your OS firewall or cloud security group."
}

obtain_certificate() {
    echo_info "Obtaining SSL certificate from Let's Encrypt..."
    echo_warning "Make sure your domain $DOMAIN points to this server"
    read -p "Press Enter to continue when DNS is configured..."

    if [[ "$AUTH_MODE" == "standalone" ]]; then
        systemctl stop nginx || true
        certbot certonly --standalone -d "$DOMAIN" --email "$EMAIL" --agree-tos --non-interactive
        return
    fi

    certbot certonly --webroot -w "$ACME_ROOT" -d "$DOMAIN" --email "$EMAIL" --agree-tos --non-interactive
}

renew_certificate() {
    echo_info "Renewing certificate (non-interactive)..."
    if [[ "$AUTH_MODE" == "standalone" ]]; then
        certbot renew --quiet --pre-hook "systemctl stop nginx" --post-hook "systemctl start nginx"
        return
    fi

    certbot renew --quiet
    systemctl reload nginx
}

install_renew_cron() {
    echo_info "Setting up automatic certificate renewal..."
    local existing_cron
    local renew_cron
    existing_cron="$(crontab -l 2>/dev/null || true)"

    if [[ "$AUTH_MODE" == "standalone" ]]; then
        renew_cron="$RENEW_CRON_STANDALONE"
    else
        renew_cron="$RENEW_CRON_WEBROOT"
    fi

    if grep -Fq "$renew_cron" <<<"$existing_cron"; then
        echo_info "Auto-renew cron already exists."
        return
    fi
    (printf "%s\n" "$existing_cron"; printf "%s\n" "$renew_cron") | awk 'NF' | crontab -
    echo_success "Auto-renew cron installed."
}

print_summary() {
    echo ""
    echo_success "Let's Encrypt SSL ${MODE} completed!"
    echo ""
    echo "🔗 HTTPS site:"
    echo "  • https://$DOMAIN/"
    echo ""
    if [[ "$MODE" == "full" ]]; then
        echo "✅ Auto-renew cron installed (server local time 03:00 and 15:00) with nginx reload."
    else
        echo "ℹ️ Renew command completed and nginx reloaded."
    fi
    echo ""
    echo_success "Test: curl -I https://$DOMAIN/"
}

main() {
    echo "🔒 Let's Encrypt SSL setup (${MODE})"
    echo "===================================="
    echo

    require_root
    validate_inputs

    echo_info "Domain: $DOMAIN"
    echo_info "Email: $EMAIL"
    echo_info "Auth mode: $AUTH_MODE"
    echo_info "Site root: $SITE_ROOT"
    echo_info "Public root: $PUBLIC_SITE_ROOT"
    echo_info "ACME root: $ACME_ROOT"
    echo ""

    if [[ "$MODE" == "full" ]]; then
        install_packages
        configure_firewall
        if [[ "$AUTH_MODE" == "webroot" ]]; then
            prepare_web_roots
            write_temp_nginx_config
            configure_nginx
        fi
        obtain_certificate
        prepare_web_roots
        render_production_nginx_config
        configure_nginx
        install_renew_cron
    else
        renew_certificate
    fi

    print_summary
}

main "$@"
