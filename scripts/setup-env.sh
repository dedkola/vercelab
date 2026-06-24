#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Vercelab – interactive .env.local generator for local macOS dev
# Usage: bash scripts/setup-env.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ENV_FILE="$(cd "$(dirname "$0")/.." && pwd)/.env.local"
BOLD=$'\e[1m'; CYAN=$'\e[36m'; GREEN=$'\e[32m'; YELLOW=$'\e[33m'; RESET=$'\e[0m'

prompt() {
  # prompt <VAR_NAME> <description> <default>
  local var="$1" desc="$2" default="$3"
  printf "%b%s%b\n  %s\n  Default: %b%s%b\n  Value: " \
    "$CYAN" "$var" "$RESET" "$desc" "$YELLOW" "$default" "$RESET" >/dev/tty
  local input
  read -r input </dev/tty
  echo "${input:-$default}"
}

secret_prompt() {
  # secret_prompt <VAR_NAME> <description> <default>
  local var="$1" desc="$2" default="$3"
  printf "%b%s%b\n  %s\n  Default: %b%s%b\n  Value (hidden): " \
    "$CYAN" "$var" "$RESET" "$desc" "$YELLOW" "$default" "$RESET" >/dev/tty
  local input
  read -rs input </dev/tty
  printf "\n" >/dev/tty
  echo "${input:-$default}"
}

header() {
  printf "\n%b════════════════════════════════════════%b\n" "$BOLD$CYAN" "$RESET" >/dev/tty
  printf "%b  %s%b\n" "$BOLD" "$1" "$RESET" >/dev/tty
  printf "%b════════════════════════════════════════%b\n\n" "$BOLD$CYAN" "$RESET" >/dev/tty
}

# ── Detect LAN IP ────────────────────────────────────────────────────────────
detect_lan_ip() {
  # Prefer en0 (Wi-Fi), fall back to en1, then first non-loopback
  for iface in en0 en1 en2; do
    local ip
    ip=$(ipconfig getifaddr "$iface" 2>/dev/null || true)
    if [[ -n "$ip" ]]; then echo "$ip"; return; fi
  done
  # Generic fallback via route
  route -n get default 2>/dev/null | awk '/interface:/{print $2}' | \
    xargs -I{} ipconfig getifaddr {} 2>/dev/null || echo "127.0.0.1"
}

# ── Generate a random secret ─────────────────────────────────────────────────
random_secret() {
  openssl rand -hex 24 2>/dev/null || LC_ALL=C tr -dc 'a-zA-Z0-9' </dev/urandom | head -c 48
}

# ── Banner ───────────────────────────────────────────────────────────────────
printf "\n%b🚀  Vercelab .env.local Setup%b\n" "$BOLD$GREEN" "$RESET" >/dev/tty
printf "This script generates %b.env.local%b for local macOS development.\n" "$BOLD" "$RESET" >/dev/tty
printf "Press %bEnter%b to accept the default shown in yellow.\n\n" "$BOLD" "$RESET" >/dev/tty

# ── Postgres ─────────────────────────────────────────────────────────────────
header "PostgreSQL"
PG_USER=$(prompt  "VERCELAB_POSTGRES_USER"     "Postgres username"                  "vercelab")
PG_PASS=$(secret_prompt "VERCELAB_POSTGRES_PASSWORD" "Postgres password"            "vercelab")
PG_DB=$(prompt    "VERCELAB_POSTGRES_DB"       "Postgres database name"             "vercelab")
PG_PORT=$(prompt  "POSTGRES_PORT"              "Postgres port (local docker-compose)" "5432")
PG_URL="postgresql://${PG_USER}:${PG_PASS}@localhost:${PG_PORT}/${PG_DB}"
printf "  → VERCELAB_POSTGRES_URL will be set to: %b%s%b\n" "$YELLOW" "$PG_URL" "$RESET" >/dev/tty

# ── InfluxDB ─────────────────────────────────────────────────────────────────
header "InfluxDB 3 Core"
INFLUX_URL=$(prompt      "VERCELAB_INFLUXDB_URL"          "InfluxDB HTTP endpoint (docker-compose.dev.yml exposes :8181)" "http://localhost:8181")
INFLUX_DB=$(prompt       "VERCELAB_INFLUXDB_DATABASE"     "InfluxDB database/bucket name"     "vercelab_metrics")
INFLUX_EXPLORER=$(prompt "VERCELAB_INFLUXDB_EXPLORER_URL" "InfluxDB Explorer URL (Traefik routes influx.localhost → port 8080)" "http://influx.localhost")
INFLUX_TOKEN=$(secret_prompt "VERCELAB_INFLUXDB_TOKEN"    "InfluxDB auth token (leave blank if none)" "")

# ── Networking ───────────────────────────────────────────────────────────────
header "Networking & Proxy"
DETECTED_IP=$(detect_lan_ip)
LAN_IP=$(prompt      "VERCELAB_HOST_LAN_IP"      "Your Mac's LAN IP (auto-detected)"   "$DETECTED_IP")
BASE_DOMAIN=$(prompt "VERCELAB_BASE_DOMAIN"      "Base domain for deployed apps"        "myhomelan.com")
PROXY_NET=$(prompt   "VERCELAB_PROXY_NETWORK"    "Traefik proxy Docker network name"    "vercelab_dev_proxy")
PROXY_EP=$(prompt    "VERCELAB_PROXY_ENTRYPOINT" "Traefik entrypoint (web=HTTP for local dev, websecure=HTTPS for prod)" "web")

# ── Docker ───────────────────────────────────────────────────────────────────
header "Docker (macOS)"
# On macOS with Docker Desktop the socket is in $HOME/.docker/run/docker.sock
DOCKER_DEFAULT="$HOME/.docker/run/docker.sock"
if [[ -S "/var/run/docker.sock" ]]; then DOCKER_DEFAULT="/var/run/docker.sock"; fi
DOCKER_SOCK=$(prompt "VERCELAB_DOCKER_SOCKET_PATH" "Docker socket path"     "$DOCKER_DEFAULT")
HOST_PROC=$(prompt   "VERCELAB_HOST_PROC_PATH"     "Host /proc mount path"  "/host/proc")

# ── Security ─────────────────────────────────────────────────────────────────
header "Security"
GEN_SECRET=$(random_secret)
ENC_SECRET=$(secret_prompt "VERCELAB_ENCRYPTION_SECRET" \
  "32+ char secret for encrypting deploy tokens (auto-generated)" "$GEN_SECRET")
GH_TOKEN=$(secret_prompt "VERCELAB_GITHUB_TOKEN" \
  "GitHub personal access token for repo browsing (optional, Enter to skip)" "")

# ── Write file ───────────────────────────────────────────────────────────────
header "Writing .env.local"

# Pre-create local data directories so docker-compose.dev.yml volumes work
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
for dir in data/postgres data/influxdb data/influxdb-explorer data/influxdb-explorer-config data/traefik/dynamic data/traefik/certs; do
  mkdir -p "$REPO_ROOT/$dir"
done
printf "  ✓ Created ./data/* directories\n" >/dev/tty

# Backup if file already exists
if [[ -f "$ENV_FILE" ]]; then
  BACKUP="${ENV_FILE}.bak.$(date +%Y%m%d%H%M%S)"
  cp "$ENV_FILE" "$BACKUP"
  printf "  Existing file backed up to %b%s%b\n" "$YELLOW" "$BACKUP" "$RESET" >/dev/tty
fi

cat > "$ENV_FILE" <<EOF
# ──────────────────────────────────────────────────────────────────────────────
# Vercelab – local macOS development environment
# Generated by scripts/setup-env.sh on $(date)
# ──────────────────────────────────────────────────────────────────────────────

# ── PostgreSQL ────────────────────────────────────────────────────────────────
VERCELAB_POSTGRES_URL=${PG_URL}
VERCELAB_POSTGRES_USER=${PG_USER}
VERCELAB_POSTGRES_PASSWORD=${PG_PASS}
VERCELAB_POSTGRES_DB=${PG_DB}

# ── InfluxDB 3 Core ───────────────────────────────────────────────────────────
VERCELAB_INFLUXDB_URL=${INFLUX_URL}
VERCELAB_INFLUXDB_DATABASE=${INFLUX_DB}
$([ -n "$INFLUX_EXPLORER" ] && echo "VERCELAB_INFLUXDB_EXPLORER_URL=${INFLUX_EXPLORER}" || echo "# VERCELAB_INFLUXDB_EXPLORER_URL=")
$([ -n "$INFLUX_TOKEN"    ] && echo "VERCELAB_INFLUXDB_TOKEN=${INFLUX_TOKEN}"            || echo "# VERCELAB_INFLUXDB_TOKEN=")

# ── Networking & Proxy ────────────────────────────────────────────────────────
VERCELAB_HOST_LAN_IP=${LAN_IP}
VERCELAB_BASE_DOMAIN=${BASE_DOMAIN}
VERCELAB_PROXY_NETWORK=${PROXY_NET}
VERCELAB_PROXY_ENTRYPOINT=${PROXY_EP}

# ── Docker ────────────────────────────────────────────────────────────────────
VERCELAB_DOCKER_SOCKET_PATH=${DOCKER_SOCK}
VERCELAB_HOST_PROC_PATH=${HOST_PROC}

# ── Security ──────────────────────────────────────────────────────────────────
VERCELAB_ENCRYPTION_SECRET=${ENC_SECRET}
$([ -n "$GH_TOKEN" ] && echo "VERCELAB_GITHUB_TOKEN=${GH_TOKEN}" || echo "# VERCELAB_GITHUB_TOKEN=")
EOF

printf "\n%b✅  .env.local written to:%b\n   %s\n\n" "$GREEN$BOLD" "$RESET" "$ENV_FILE" >/dev/tty
printf "Next steps:\n" >/dev/tty
printf "  1. Start local infra:       %bdocker compose -f docker-compose.dev.yml up -d%b\n" "$BOLD" "$RESET" >/dev/tty
printf "     (Postgres :5432 · InfluxDB :8181 · Traefik :80 · Dashboard :8088)\n" >/dev/tty
printf "  2. Install dependencies:    %bpnpm install --frozen-lockfile%b\n" "$BOLD" "$RESET" >/dev/tty
printf "  3. Start dev server:        %bpnpm run dev%b\n" "$BOLD" "$RESET" >/dev/tty
printf "     → App at http://localhost:3000\n" >/dev/tty
printf "     → InfluxDB Explorer at http://influx.localhost\n" >/dev/tty
printf "     → Traefik dashboard at http://localhost:8088\n\n" >/dev/tty

