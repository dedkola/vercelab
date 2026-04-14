#!/usr/bin/env bash

set -euo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly REPO_ROOT="$SCRIPT_DIR"
readonly ENV_FILE="$REPO_ROOT/.env"
readonly ENV_EXAMPLE="$REPO_ROOT/.env.example"
readonly COMPOSE_FILE="$REPO_ROOT/docker-compose.yml"
readonly NODE_MAJOR="22"
readonly DOCKER_MAJOR="28"
readonly PNPM_VERSION="10.0.0"
readonly DEFAULT_NODE_ENV="production"
readonly DEFAULT_HOSTNAME="0.0.0.0"
readonly DEFAULT_PORT="3000"

CONTROL_PLANE_HOSTNAME=""

SUDO=()
DOCKER_CMD=()

C_RESET=""
C_BOLD=""
C_CYAN=""
C_GREEN=""
C_YELLOW=""

log() {
  printf '[vercelab] %s\n' "$*"
}

fail() {
  printf '[vercelab] %s\n' "$*" >&2
  exit 1
}

run_privileged() {
  "${SUDO[@]}" "$@"
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

init_colors() {
  if [[ -t 1 && -z "${NO_COLOR:-}" && "${TERM:-}" != "dumb" ]]; then
    C_RESET=$'\033[0m'
    C_BOLD=$'\033[1m'
    C_CYAN=$'\033[36m'
    C_GREEN=$'\033[32m'
    C_YELLOW=$'\033[33m'
  fi
}

read_env_value() {
  local key="$1"
  local value=""

  if [[ ! -f "$ENV_FILE" ]]; then
    return 0
  fi

  # Normalize CRLF-edited .env files.
  value="$(grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | tail -n 1 | cut -d= -f2- | tr -d '\r' || true)"
  printf '%s' "$value"
}

prompt_with_default() {
  local prompt="$1"
  local default_value="$2"
  local input=""

  if [[ -t 0 ]]; then
    read -r -p "$prompt [$default_value]: " input || true
  fi

  printf '%s' "${input:-$default_value}"
}

prompt_optional_secret() {
  local prompt="$1"
  local existing_value="$2"
  local input=""

  if [[ ! -t 0 ]]; then
    printf '%s' "$existing_value"
    return
  fi

  if [[ -n "$existing_value" ]]; then
    read -r -s -p "$prompt [already set, press Enter to keep]: " input || true
    printf '\n' >&2
    printf '%s' "${input:-$existing_value}"
  else
    read -r -s -p "$prompt [press Enter to skip]: " input || true
    printf '\n' >&2
    printf '%s' "$input"
  fi
}

mask_secret() {
  local value="$1"
  local length=0

  length="${#value}"
  if (( length == 0 )); then
    printf '%s' "(empty)"
    return
  fi

  if (( length <= 8 )); then
    printf '%s' "********"
    return
  fi

  printf '%s' "${value:0:4}********${value:length-4:4}"
}

confirm_configuration() {
  if [[ ! -t 0 ]]; then
    return
  fi

  local answer=""
  read -r -p "Continue with this configuration? [Y/n]: " answer || true

  case "${answer:-Y}" in
    y|Y|yes|YES|"")
      ;;
    *)
      fail "Installation canceled by user."
      ;;
  esac
}

ensure_sudo() {
  if [[ ${EUID} -eq 0 ]]; then
    return
  fi

  if ! command_exists sudo; then
    fail "Run install.sh as root or install sudo first."
  fi

  SUDO=(sudo)
}

ensure_supported_os() {
  [[ -r /etc/os-release ]] || fail "Cannot detect the operating system."

  # shellcheck disable=SC1091
  . /etc/os-release

  [[ ${ID:-} == "ubuntu" ]] || fail "install.sh currently supports Ubuntu hosts only."
  [[ -n ${VERSION_CODENAME:-} ]] || fail "Ubuntu codename was not detected."
}

ensure_repo_layout() {
  [[ -f "$COMPOSE_FILE" ]] || fail "docker-compose.yml is missing from $REPO_ROOT."
  [[ -f "$ENV_EXAMPLE" ]] || fail ".env.example is missing from $REPO_ROOT."
}

install_packages() {
  run_privileged apt-get update
  run_privileged apt-get install -y --no-install-recommends "$@"
}

ensure_base_packages() {
  log "Installing base Linux packages."
  install_packages \
    apt-transport-https \
    ca-certificates \
    curl \
    git \
    gnupg \
    lsb-release \
    openssl \
    python3 \
    python3-pip \
    pkg-config \
    make \
    g++ \
    build-essential
}

ensure_nodejs() {
  local installed_major=""

  if command_exists node; then
    installed_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || true)"
  fi

  if [[ "$installed_major" == "$NODE_MAJOR" ]]; then
    log "Node.js ${NODE_MAJOR} is already installed."
    return
  fi

  log "Installing Node.js ${NODE_MAJOR}."
  run_privileged install -m 0755 -d /etc/apt/keyrings

  if [[ ! -f /etc/apt/keyrings/nodesource.gpg ]]; then
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
      | run_privileged gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
    run_privileged chmod a+r /etc/apt/keyrings/nodesource.gpg
  fi

  printf 'deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_%s.x nodistro main\n' "$NODE_MAJOR" \
    | run_privileged tee /etc/apt/sources.list.d/nodesource.list >/dev/null

  run_privileged apt-get update
  run_privileged apt-get install -y nodejs
}

ensure_pnpm() {
  if command_exists pnpm; then
    log "pnpm is already installed."
    return
  fi

  if command_exists corepack; then
    log "Installing pnpm ${PNPM_VERSION} via corepack."
    run_privileged corepack enable
    run_privileged corepack prepare "pnpm@${PNPM_VERSION}" --activate
    return
  fi

  command_exists npm || fail "npm is required to install pnpm when corepack is unavailable."

  log "corepack not found; installing pnpm ${PNPM_VERSION} globally via npm."
  run_privileged npm install -g "pnpm@${PNPM_VERSION}"
}

resolve_latest_package_version() {
  local package_name="$1"
  local version_prefix="$2"
  local package_versions=""

  package_versions="$(apt-cache madison "$package_name")"
  awk -v prefix="$version_prefix" '$3 ~ ("^" prefix) { print $3; exit }' <<<"$package_versions"
}

ensure_docker_engine() {
  local installed_major=""
  local docker_ce_version=""
  local docker_ce_cli_version=""

  if command_exists docker; then
    installed_major="$(docker version --format '{{.Server.Version}}' 2>/dev/null | cut -d. -f1 || true)"

    if [[ -z "$installed_major" ]] && (( ${#SUDO[@]} > 0 )); then
      installed_major="$(sudo docker version --format '{{.Server.Version}}' 2>/dev/null | cut -d. -f1 || true)"
    fi
  fi

  if [[ "$installed_major" == "$DOCKER_MAJOR" ]]; then
    log "Docker Engine ${DOCKER_MAJOR}.x is already installed."
    run_privileged systemctl enable --now docker
    run_privileged apt-mark hold docker-ce docker-ce-cli >/dev/null
    return
  fi

  log "Installing Docker Engine ${DOCKER_MAJOR}.x and Compose plugin."
  run_privileged install -m 0755 -d /etc/apt/keyrings

  if [[ ! -f /etc/apt/keyrings/docker.asc ]]; then
    run_privileged curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    run_privileged chmod a+r /etc/apt/keyrings/docker.asc
  fi

  # shellcheck disable=SC1091
  . /etc/os-release
  printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu %s stable\n' \
    "$(dpkg --print-architecture)" \
    "$VERSION_CODENAME" | run_privileged tee /etc/apt/sources.list.d/docker.list >/dev/null

  run_privileged apt-get update

  docker_ce_version="$(resolve_latest_package_version docker-ce "5:${DOCKER_MAJOR}.")"
  docker_ce_cli_version="$(resolve_latest_package_version docker-ce-cli "5:${DOCKER_MAJOR}.")"

  [[ -n "$docker_ce_version" ]] || fail "A compatible docker-ce ${DOCKER_MAJOR}.x package was not found in the Docker apt repository."
  [[ -n "$docker_ce_cli_version" ]] || fail "A compatible docker-ce-cli ${DOCKER_MAJOR}.x package was not found in the Docker apt repository."

  run_privileged apt-get install -y --allow-downgrades \
    docker-ce="$docker_ce_version" \
    docker-ce-cli="$docker_ce_cli_version" \
    containerd.io \
    docker-buildx-plugin \
    docker-compose-plugin

  run_privileged apt-mark hold docker-ce docker-ce-cli >/dev/null
  run_privileged systemctl enable --now docker
}

ensure_prerequisites() {
  ensure_base_packages
  ensure_nodejs
  ensure_pnpm
  ensure_docker_engine
}

ensure_docker_group_access() {
  local login_user="${SUDO_USER:-${USER:-}}"

  if [[ -n "$login_user" ]] && id -u "$login_user" >/dev/null 2>&1; then
    run_privileged usermod -aG docker "$login_user" || true
  fi
}

resolve_docker_command() {
  if docker info >/dev/null 2>&1; then
    DOCKER_CMD=(docker)
    return
  fi

  if (( ${#SUDO[@]} > 0 )) && sudo docker info >/dev/null 2>&1; then
    DOCKER_CMD=(sudo docker)
    return
  fi

  fail "Docker is installed but the daemon is not reachable."
}

detect_primary_ipv4() {
  local detected_ip=""

  if command_exists ip; then
    detected_ip="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i <= NF; i += 1) { if ($i == "src") { print $(i + 1); exit } }}')"
  fi

  if [[ -n "$detected_ip" ]]; then
    printf '%s' "$detected_ip"
    return
  fi

  hostname -I 2>/dev/null \
    | tr ' ' '\n' \
    | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' \
    | grep -v '^127\.' \
    | head -n 1
}

build_sslip_domain() {
  local ipv4_address="$1"

  printf '%s.sslip.io' "${ipv4_address//./-}"
}

detect_default_base_domain() {
  local primary_ipv4=""

  primary_ipv4="$(detect_primary_ipv4)"

  if [[ -n "$primary_ipv4" ]]; then
    build_sslip_domain "$primary_ipv4"
    return
  fi

  printf '%s' "myhomelan.com"
}

install_host_node_dependencies() {
  log "Installing pnpm dependencies on the host for local maintenance workflows."

  (
    cd "$REPO_ROOT"
    pnpm install --frozen-lockfile
  )
}

run_host_build_smoke_test() {
  log "Running a host-side production build smoke test."

  (
    cd "$REPO_ROOT"
    pnpm run build
  )
}

validate_absolute_path() {
  local value="$1"
  local label="$2"

  [[ "$value" = /* ]] || fail "$label must be an absolute Linux path."
}

validate_domain() {
  local value="$1"
  local label="$2"

  [[ "$value" =~ ^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || fail "$label must look like a real domain name."
}

ensure_path_inside_root() {
  local value="$1"
  local label="$2"

  case "$value" in
    "$VERCELAB_HOST_ROOT"|"$VERCELAB_HOST_ROOT"/*)
      ;;
    *)
      fail "$label must stay under VERCELAB_HOST_ROOT ($VERCELAB_HOST_ROOT)."
      ;;
  esac
}

gather_configuration() {
  local existing_node_env existing_runtime_host existing_port existing_base_domain existing_admin_host existing_host_root existing_data_root existing_dynamic_dir existing_certs_dir existing_proxy_network existing_proxy_entrypoint existing_socket existing_apps_dir existing_logs_dir existing_locks_dir existing_database_provider existing_postgres_url existing_postgres_user existing_postgres_password existing_postgres_db existing_postgres_data_dir existing_influx_url existing_influx_database existing_influx_token existing_influx_retention_days existing_influx_data_dir existing_secret existing_github_token default_base_domain

  existing_node_env="$(read_env_value NODE_ENV)"
  existing_runtime_host="$(read_env_value HOSTNAME)"
  existing_port="$(read_env_value PORT)"

  existing_base_domain="$(read_env_value VERCELAB_BASE_DOMAIN)"
  existing_admin_host="$(read_env_value VERCELAB_ADMIN_HOST)"
  existing_host_root="$(read_env_value VERCELAB_HOST_ROOT)"
  existing_data_root="$(read_env_value VERCELAB_DATA_ROOT)"
  existing_dynamic_dir="$(read_env_value VERCELAB_TRAEFIK_DYNAMIC_DIR)"
  existing_certs_dir="$(read_env_value VERCELAB_TRAEFIK_CERTS_DIR)"
  existing_proxy_network="$(read_env_value VERCELAB_PROXY_NETWORK)"
  existing_proxy_entrypoint="$(read_env_value VERCELAB_PROXY_ENTRYPOINT)"
  existing_socket="$(read_env_value VERCELAB_DOCKER_SOCKET_PATH)"
  existing_apps_dir="$(read_env_value VERCELAB_APPS_DIR)"
  existing_logs_dir="$(read_env_value VERCELAB_LOGS_DIR)"
  existing_locks_dir="$(read_env_value VERCELAB_LOCKS_DIR)"
  existing_database_provider="$(read_env_value VERCELAB_DATABASE_PROVIDER)"
  existing_postgres_url="$(read_env_value VERCELAB_POSTGRES_URL)"
  existing_postgres_user="$(read_env_value VERCELAB_POSTGRES_USER)"
  existing_postgres_password="$(read_env_value VERCELAB_POSTGRES_PASSWORD)"
  existing_postgres_db="$(read_env_value VERCELAB_POSTGRES_DB)"
  existing_postgres_data_dir="$(read_env_value VERCELAB_POSTGRES_DATA_DIR)"
  existing_influx_url="$(read_env_value VERCELAB_INFLUXDB_URL)"
  existing_influx_database="$(read_env_value VERCELAB_INFLUXDB_DATABASE)"
  existing_influx_token="$(read_env_value VERCELAB_INFLUXDB_TOKEN)"
  existing_influx_retention_days="$(read_env_value VERCELAB_INFLUXDB_RETENTION_DAYS)"
  existing_influx_data_dir="$(read_env_value VERCELAB_INFLUXDB_DATA_DIR)"
  existing_secret="$(read_env_value VERCELAB_ENCRYPTION_SECRET)"
  existing_github_token="$(read_env_value VERCELAB_GITHUB_TOKEN)"

  default_base_domain="$(detect_default_base_domain)"

  NODE_ENV="${NODE_ENV:-${existing_node_env:-$DEFAULT_NODE_ENV}}"
  PORT="${PORT:-${existing_port:-$DEFAULT_PORT}}"
  CONTROL_PLANE_HOSTNAME="${VERCELAB_CONTROL_PLANE_HOSTNAME:-${existing_runtime_host:-$DEFAULT_HOSTNAME}}"

  VERCELAB_BASE_DOMAIN="${VERCELAB_BASE_DOMAIN:-${existing_base_domain:-}}"
  VERCELAB_BASE_DOMAIN="${VERCELAB_BASE_DOMAIN:-$(prompt_with_default "Base wildcard domain" "$default_base_domain")}" 

  VERCELAB_ADMIN_HOST="${VERCELAB_ADMIN_HOST:-${existing_admin_host:-}}"
  VERCELAB_ADMIN_HOST="${VERCELAB_ADMIN_HOST:-$(prompt_with_default "Dashboard host" "dash.${VERCELAB_BASE_DOMAIN}")}"

  VERCELAB_HOST_ROOT="${VERCELAB_HOST_ROOT:-${existing_host_root:-}}"
  VERCELAB_HOST_ROOT="${VERCELAB_HOST_ROOT:-$(prompt_with_default "Shared host root for data and Traefik assets" "/opt/vercelab")}" 

  VERCELAB_DATA_ROOT="${VERCELAB_DATA_ROOT:-${existing_data_root:-${VERCELAB_HOST_ROOT}/data}}"
  VERCELAB_TRAEFIK_DYNAMIC_DIR="${VERCELAB_TRAEFIK_DYNAMIC_DIR:-${existing_dynamic_dir:-${VERCELAB_HOST_ROOT}/traefik/dynamic}}"
  VERCELAB_TRAEFIK_CERTS_DIR="${VERCELAB_TRAEFIK_CERTS_DIR:-${existing_certs_dir:-${VERCELAB_HOST_ROOT}/traefik/certs}}"
  VERCELAB_APPS_DIR="${VERCELAB_APPS_DIR:-${existing_apps_dir:-${VERCELAB_DATA_ROOT}/apps}}"
  VERCELAB_LOGS_DIR="${VERCELAB_LOGS_DIR:-${existing_logs_dir:-${VERCELAB_DATA_ROOT}/logs}}"
  VERCELAB_LOCKS_DIR="${VERCELAB_LOCKS_DIR:-${existing_locks_dir:-${VERCELAB_DATA_ROOT}/locks}}"
  VERCELAB_POSTGRES_DATA_DIR="${VERCELAB_POSTGRES_DATA_DIR:-${existing_postgres_data_dir:-${VERCELAB_DATA_ROOT}/postgres}}"
  VERCELAB_INFLUXDB_DATA_DIR="${VERCELAB_INFLUXDB_DATA_DIR:-${existing_influx_data_dir:-${VERCELAB_DATA_ROOT}/influxdb}}"

  VERCELAB_PROXY_NETWORK="${VERCELAB_PROXY_NETWORK:-${existing_proxy_network:-vercelab_proxy}}"
  VERCELAB_PROXY_ENTRYPOINT="${VERCELAB_PROXY_ENTRYPOINT:-${existing_proxy_entrypoint:-websecure}}"
  VERCELAB_DOCKER_SOCKET_PATH="${VERCELAB_DOCKER_SOCKET_PATH:-${existing_socket:-/var/run/docker.sock}}"
  VERCELAB_DATABASE_PROVIDER="${VERCELAB_DATABASE_PROVIDER:-${existing_database_provider:-postgres}}"
  VERCELAB_POSTGRES_USER="${VERCELAB_POSTGRES_USER:-${existing_postgres_user:-vercelab}}"
  VERCELAB_POSTGRES_PASSWORD="${VERCELAB_POSTGRES_PASSWORD:-${existing_postgres_password:-$(openssl rand -hex 16)}}"
  VERCELAB_POSTGRES_DB="${VERCELAB_POSTGRES_DB:-${existing_postgres_db:-vercelab}}"
  VERCELAB_POSTGRES_URL="${VERCELAB_POSTGRES_URL:-${existing_postgres_url:-postgres://${VERCELAB_POSTGRES_USER}:${VERCELAB_POSTGRES_PASSWORD}@postgres:5432/${VERCELAB_POSTGRES_DB}}}"
  VERCELAB_INFLUXDB_URL="${VERCELAB_INFLUXDB_URL:-${existing_influx_url:-http://influxdb:8181}}"
  VERCELAB_INFLUXDB_DATABASE="${VERCELAB_INFLUXDB_DATABASE:-${existing_influx_database:-vercelab_metrics}}"
  VERCELAB_INFLUXDB_TOKEN="${VERCELAB_INFLUXDB_TOKEN:-${existing_influx_token:-}}"
  VERCELAB_INFLUXDB_RETENTION_DAYS="${VERCELAB_INFLUXDB_RETENTION_DAYS:-${existing_influx_retention_days:-90}}"
  VERCELAB_ENCRYPTION_SECRET="${VERCELAB_ENCRYPTION_SECRET:-${existing_secret:-}}"

  validate_domain "$VERCELAB_BASE_DOMAIN" "VERCELAB_BASE_DOMAIN"
  validate_domain "$VERCELAB_ADMIN_HOST" "VERCELAB_ADMIN_HOST"
  validate_absolute_path "$VERCELAB_DATA_ROOT" "VERCELAB_DATA_ROOT"
  validate_absolute_path "$VERCELAB_HOST_ROOT" "VERCELAB_HOST_ROOT"
  validate_absolute_path "$VERCELAB_TRAEFIK_DYNAMIC_DIR" "VERCELAB_TRAEFIK_DYNAMIC_DIR"
  validate_absolute_path "$VERCELAB_TRAEFIK_CERTS_DIR" "VERCELAB_TRAEFIK_CERTS_DIR"
  validate_absolute_path "$VERCELAB_APPS_DIR" "VERCELAB_APPS_DIR"
  validate_absolute_path "$VERCELAB_LOGS_DIR" "VERCELAB_LOGS_DIR"
  validate_absolute_path "$VERCELAB_LOCKS_DIR" "VERCELAB_LOCKS_DIR"
  validate_absolute_path "$VERCELAB_POSTGRES_DATA_DIR" "VERCELAB_POSTGRES_DATA_DIR"
  validate_absolute_path "$VERCELAB_INFLUXDB_DATA_DIR" "VERCELAB_INFLUXDB_DATA_DIR"
  validate_absolute_path "$VERCELAB_DOCKER_SOCKET_PATH" "VERCELAB_DOCKER_SOCKET_PATH"

  [[ "$VERCELAB_ADMIN_HOST" == "$VERCELAB_BASE_DOMAIN" || "$VERCELAB_ADMIN_HOST" == *".${VERCELAB_BASE_DOMAIN}" ]] || fail "VERCELAB_ADMIN_HOST must be inside VERCELAB_BASE_DOMAIN."
  [[ "$VERCELAB_DATABASE_PROVIDER" == "postgres" ]] || fail "VERCELAB_DATABASE_PROVIDER must be postgres."

  ensure_path_inside_root "$VERCELAB_DATA_ROOT" "VERCELAB_DATA_ROOT"
  ensure_path_inside_root "$VERCELAB_TRAEFIK_DYNAMIC_DIR" "VERCELAB_TRAEFIK_DYNAMIC_DIR"
  ensure_path_inside_root "$VERCELAB_TRAEFIK_CERTS_DIR" "VERCELAB_TRAEFIK_CERTS_DIR"
  ensure_path_inside_root "$VERCELAB_APPS_DIR" "VERCELAB_APPS_DIR"
  ensure_path_inside_root "$VERCELAB_LOGS_DIR" "VERCELAB_LOGS_DIR"
  ensure_path_inside_root "$VERCELAB_LOCKS_DIR" "VERCELAB_LOCKS_DIR"
  ensure_path_inside_root "$VERCELAB_POSTGRES_DATA_DIR" "VERCELAB_POSTGRES_DATA_DIR"
  ensure_path_inside_root "$VERCELAB_INFLUXDB_DATA_DIR" "VERCELAB_INFLUXDB_DATA_DIR"

  if [[ -z "$VERCELAB_POSTGRES_URL" ]]; then
    fail "Set VERCELAB_POSTGRES_URL for the postgres provider."
  fi

  if [[ -z "$VERCELAB_ENCRYPTION_SECRET" ]]; then
    VERCELAB_ENCRYPTION_SECRET="$(openssl rand -hex 32)"
  fi

  # Reinstall behavior:
  # - explicit env value wins
  # - then existing .env value
  # - prompt only if still empty
  VERCELAB_GITHUB_TOKEN="${VERCELAB_GITHUB_TOKEN:-${existing_github_token:-}}"
  [[ -n "$VERCELAB_GITHUB_TOKEN" ]] || VERCELAB_GITHUB_TOKEN="$(prompt_optional_secret "GitHub personal access token (repo scope)" "")"
}

prepare_host_directories() {
  log "Preparing host directories under $VERCELAB_HOST_ROOT"
  run_privileged mkdir -p \
    "$VERCELAB_TRAEFIK_DYNAMIC_DIR" \
    "$VERCELAB_TRAEFIK_CERTS_DIR" \
    "$VERCELAB_APPS_DIR" \
    "$VERCELAB_LOGS_DIR" \
    "$VERCELAB_LOCKS_DIR" \
    "$VERCELAB_POSTGRES_DATA_DIR" \
    "$VERCELAB_INFLUXDB_DATA_DIR"

  # InfluxDB 3 runs as uid/gid 1500 in the official image.
  # Pre-setting ownership avoids permission errors on first boot.
  run_privileged chown -R 1500:1500 "$VERCELAB_INFLUXDB_DATA_DIR"
}

validate_docker_socket() {
  [[ -S "$VERCELAB_DOCKER_SOCKET_PATH" ]] || fail "Docker socket was not found at $VERCELAB_DOCKER_SOCKET_PATH."
}

certificate_matches_domain() {
  local cert_file="$1"

  [[ -f "$cert_file" ]] || return 1

  openssl x509 -in "$cert_file" -noout -text 2>/dev/null | grep -F "DNS:${VERCELAB_BASE_DOMAIN}" >/dev/null 2>&1 \
    && openssl x509 -in "$cert_file" -noout -text 2>/dev/null | grep -F "DNS:*.${VERCELAB_BASE_DOMAIN}" >/dev/null 2>&1
}

write_tls_config() {
  local tls_file="$VERCELAB_TRAEFIK_DYNAMIC_DIR/tls.yml"

  run_privileged tee "$tls_file" >/dev/null <<EOF
tls:
  stores:
    default:
      defaultCertificate:
        certFile: /etc/traefik/certs/wildcard.crt
        keyFile: /etc/traefik/certs/wildcard.key
  certificates:
    - certFile: /etc/traefik/certs/wildcard.crt
      keyFile: /etc/traefik/certs/wildcard.key
EOF
}

ensure_certificate() {
  local cert_file="$VERCELAB_TRAEFIK_CERTS_DIR/wildcard.crt"
  local key_file="$VERCELAB_TRAEFIK_CERTS_DIR/wildcard.key"

  if certificate_matches_domain "$cert_file" && [[ -f "$key_file" ]]; then
    log "Reusing the existing wildcard certificate."
    return
  fi

  log "Generating a self-signed wildcard certificate for $VERCELAB_BASE_DOMAIN"
  run_privileged openssl req \
    -x509 \
    -nodes \
    -days 825 \
    -newkey rsa:4096 \
    -keyout "$key_file" \
    -out "$cert_file" \
    -subj "/CN=${VERCELAB_BASE_DOMAIN}" \
    -addext "subjectAltName=DNS:${VERCELAB_BASE_DOMAIN},DNS:*.${VERCELAB_BASE_DOMAIN},DNS:${VERCELAB_ADMIN_HOST}"
}

write_env_file() {
  log "Writing $ENV_FILE"

  tee "$ENV_FILE" >/dev/null <<EOF
NODE_ENV=$NODE_ENV
HOSTNAME=$CONTROL_PLANE_HOSTNAME
PORT=$PORT

VERCELAB_BASE_DOMAIN=$VERCELAB_BASE_DOMAIN
VERCELAB_ADMIN_HOST=$VERCELAB_ADMIN_HOST
VERCELAB_PROXY_NETWORK=$VERCELAB_PROXY_NETWORK
VERCELAB_PROXY_ENTRYPOINT=$VERCELAB_PROXY_ENTRYPOINT

VERCELAB_HOST_ROOT=$VERCELAB_HOST_ROOT
VERCELAB_DATA_ROOT=$VERCELAB_DATA_ROOT
VERCELAB_TRAEFIK_DYNAMIC_DIR=$VERCELAB_TRAEFIK_DYNAMIC_DIR
VERCELAB_TRAEFIK_CERTS_DIR=$VERCELAB_TRAEFIK_CERTS_DIR
VERCELAB_APPS_DIR=$VERCELAB_APPS_DIR
VERCELAB_LOGS_DIR=$VERCELAB_LOGS_DIR
VERCELAB_LOCKS_DIR=$VERCELAB_LOCKS_DIR
VERCELAB_POSTGRES_DATA_DIR=$VERCELAB_POSTGRES_DATA_DIR
VERCELAB_INFLUXDB_DATA_DIR=$VERCELAB_INFLUXDB_DATA_DIR
VERCELAB_DOCKER_SOCKET_PATH=$VERCELAB_DOCKER_SOCKET_PATH

VERCELAB_DATABASE_PROVIDER=$VERCELAB_DATABASE_PROVIDER
VERCELAB_POSTGRES_URL=$VERCELAB_POSTGRES_URL
VERCELAB_POSTGRES_USER=$VERCELAB_POSTGRES_USER
VERCELAB_POSTGRES_PASSWORD=$VERCELAB_POSTGRES_PASSWORD
VERCELAB_POSTGRES_DB=$VERCELAB_POSTGRES_DB

VERCELAB_INFLUXDB_URL=$VERCELAB_INFLUXDB_URL
VERCELAB_INFLUXDB_DATABASE=$VERCELAB_INFLUXDB_DATABASE
VERCELAB_INFLUXDB_TOKEN=$VERCELAB_INFLUXDB_TOKEN
VERCELAB_INFLUXDB_RETENTION_DAYS=$VERCELAB_INFLUXDB_RETENTION_DAYS

VERCELAB_ENCRYPTION_SECRET=$VERCELAB_ENCRYPTION_SECRET
VERCELAB_GITHUB_TOKEN=$VERCELAB_GITHUB_TOKEN
EOF

  chmod 600 "$ENV_FILE"
}

start_stack() {
  log "Starting the Vercelab control plane stack."
  (
    cd "$REPO_ROOT"
    "${DOCKER_CMD[@]}" compose up -d --build
  )
}

print_configuration_review() {
  log "Configuration review"
  printf '\n'
  printf '%b============================================================%b\n' "$C_CYAN" "$C_RESET"
  printf '%b                    Vercelab Setup Review                   %b\n' "$C_BOLD" "$C_RESET"
  printf '%b============================================================%b\n' "$C_CYAN" "$C_RESET"
  printf '%b Runtime%b\n' "$C_YELLOW" "$C_RESET"
  printf '   NODE_ENV                 : %s\n' "$NODE_ENV"
  printf '   HOSTNAME                 : %s\n' "$CONTROL_PLANE_HOSTNAME"
  printf '   PORT                     : %s\n' "$PORT"
  printf '\n'
  printf '%b Domains & Routing%b\n' "$C_YELLOW" "$C_RESET"
  printf '   VERCELAB_BASE_DOMAIN     : %s\n' "$VERCELAB_BASE_DOMAIN"
  printf '   VERCELAB_ADMIN_HOST      : %s\n' "$VERCELAB_ADMIN_HOST"
  printf '   VERCELAB_PROXY_NETWORK   : %s\n' "$VERCELAB_PROXY_NETWORK"
  printf '   VERCELAB_PROXY_ENTRYPOINT: %s\n' "$VERCELAB_PROXY_ENTRYPOINT"
  printf '\n'
  printf '%b Paths%b\n' "$C_YELLOW" "$C_RESET"
  printf '   VERCELAB_HOST_ROOT       : %s\n' "$VERCELAB_HOST_ROOT"
  printf '   VERCELAB_DATA_ROOT       : %s\n' "$VERCELAB_DATA_ROOT"
  printf '   VERCELAB_APPS_DIR        : %s\n' "$VERCELAB_APPS_DIR"
  printf '   VERCELAB_LOGS_DIR        : %s\n' "$VERCELAB_LOGS_DIR"
  printf '   VERCELAB_LOCKS_DIR       : %s\n' "$VERCELAB_LOCKS_DIR"
  printf '   VERCELAB_POSTGRES_DATA_DIR: %s\n' "$VERCELAB_POSTGRES_DATA_DIR"
  printf '   VERCELAB_INFLUXDB_DATA_DIR: %s\n' "$VERCELAB_INFLUXDB_DATA_DIR"
  printf '   VERCELAB_DOCKER_SOCKET   : %s\n' "$VERCELAB_DOCKER_SOCKET_PATH"
  printf '\n'
  printf '%b Databases%b\n' "$C_YELLOW" "$C_RESET"
  printf '   VERCELAB_DATABASE_PROVIDER: %s\n' "$VERCELAB_DATABASE_PROVIDER"
  printf '   VERCELAB_POSTGRES_URL     : %s\n' "$VERCELAB_POSTGRES_URL"
  printf '   VERCELAB_INFLUXDB_URL     : %s\n' "$VERCELAB_INFLUXDB_URL"
  printf '   VERCELAB_INFLUXDB_DATABASE: %s\n' "$VERCELAB_INFLUXDB_DATABASE"
  printf '   VERCELAB_INFLUXDB_RET_DAYS: %s\n' "$VERCELAB_INFLUXDB_RETENTION_DAYS"
  printf '\n'
  printf '%b Security%b\n' "$C_YELLOW" "$C_RESET"
  printf '   VERCELAB_ENCRYPTION_SECRET: %s\n' "$(mask_secret "$VERCELAB_ENCRYPTION_SECRET")"
  printf '   VERCELAB_POSTGRES_PASSWORD: %s\n' "$(mask_secret "$VERCELAB_POSTGRES_PASSWORD")"
  printf '   VERCELAB_INFLUXDB_TOKEN   : %s\n' "$(mask_secret "$VERCELAB_INFLUXDB_TOKEN")"
  printf '   VERCELAB_GITHUB_TOKEN     : %s\n' "$(mask_secret "$VERCELAB_GITHUB_TOKEN")"
  printf '%b============================================================%b\n' "$C_CYAN" "$C_RESET"
  printf '\n'

  confirm_configuration
}

print_summary() {
  local dashboard_url="https://$VERCELAB_ADMIN_HOST"
  local health_url="$dashboard_url/api/health"
  local wildcard_example_url="https://demo.$VERCELAB_BASE_DOMAIN"

  printf '\n'
  printf '%b============================================================%b\n' "$C_GREEN" "$C_RESET"
  printf '%b                    Vercelab Setup Complete                 %b\n' "$C_BOLD" "$C_RESET"
  printf '%b============================================================%b\n' "$C_GREEN" "$C_RESET"
  printf ' %bDashboard%b   : %s\n' "$C_YELLOW" "$C_RESET" "$dashboard_url"
  printf ' %bHealth API%b  : %s\n' "$C_YELLOW" "$C_RESET" "$health_url"
  printf ' %bApp Example%b : %s\n' "$C_YELLOW" "$C_RESET" "$wildcard_example_url"
  printf '\n'
  printf ' %bHost Root%b   : %s\n' "$C_YELLOW" "$C_RESET" "$VERCELAB_HOST_ROOT"
  printf ' %bEnv File%b    : %s\n' "$C_YELLOW" "$C_RESET" "$ENV_FILE"
  printf ' %bTLS Cert%b    : %s/wildcard.crt\n' "$C_YELLOW" "$C_RESET" "$VERCELAB_TRAEFIK_CERTS_DIR"
  printf '\n'
  printf ' %bNext%b:\n' "$C_YELLOW" "$C_RESET"
  printf '  1) Import wildcard.crt into your browser/system trust store.\n'
  printf '  2) Open Dashboard URL above.\n'
  printf '  3) Check Health API if dashboard is unreachable.\n'
  printf '%b============================================================%b\n' "$C_GREEN" "$C_RESET"
}

main() {
  init_colors
  ensure_sudo
  ensure_supported_os
  ensure_repo_layout
  ensure_prerequisites
  ensure_docker_group_access
  gather_configuration
  print_configuration_review
  resolve_docker_command
  install_host_node_dependencies
  run_host_build_smoke_test
  prepare_host_directories
  validate_docker_socket
  write_env_file
  write_tls_config
  ensure_certificate
  start_stack
  print_summary
}

main "$@"