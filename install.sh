#!/usr/bin/env bash

set -euo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly REPO_ROOT="$SCRIPT_DIR"
readonly ENV_FILE="$REPO_ROOT/.env"
readonly ENV_EXAMPLE="$REPO_ROOT/.env.example"
readonly COMPOSE_FILE="$REPO_ROOT/docker-compose.yml"
readonly NODE_MAJOR="22"
readonly DOCKER_MAJOR="28"

SUDO=()
DOCKER_CMD=()

log() {
  printf '[verclab] %s\n' "$*"
}

fail() {
  printf '[verclab] %s\n' "$*" >&2
  exit 1
}

run_privileged() {
  "${SUDO[@]}" "$@"
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

read_env_value() {
  local key="$1"

  if [[ ! -f "$ENV_FILE" ]]; then
    return 0
  fi

  grep -E "^${key}=" "$ENV_FILE" | tail -n 1 | cut -d= -f2-
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

  if [[ "$installed_major" == "$NODE_MAJOR" ]] && command_exists npm; then
    log "Node.js ${NODE_MAJOR} is already installed."
    return
  fi

  log "Installing Node.js ${NODE_MAJOR} and npm."
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

resolve_latest_package_version() {
  local package_name="$1"
  local version_prefix="$2"

  apt-cache madison "$package_name" | awk -v prefix="$version_prefix" '$3 ~ ("^" prefix) { print $3; exit }'
}

ensure_docker_engine() {
  local installed_major=""
  local docker_ce_version=""
  local docker_ce_cli_version=""

  if command_exists docker; then
    installed_major="$(docker version --format '{{.Server.Version}}' 2>/dev/null | cut -d. -f1 || true)"
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

install_host_node_dependencies() {
  log "Installing npm dependencies on the host for local maintenance workflows."

  (
    cd "$REPO_ROOT"
    npm ci
  )
}

run_host_build_smoke_test() {
  log "Running a host-side production build smoke test."

  (
    cd "$REPO_ROOT"
    npm run build
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

gather_configuration() {
  local existing_base_domain existing_admin_host existing_host_root existing_proxy_network existing_socket existing_database_provider existing_postgres_url existing_secret

  existing_base_domain="$(read_env_value VERCLAB_BASE_DOMAIN)"
  existing_admin_host="$(read_env_value VERCLAB_ADMIN_HOST)"
  existing_host_root="$(read_env_value VERCLAB_HOST_ROOT)"
  existing_proxy_network="$(read_env_value VERCLAB_PROXY_NETWORK)"
  existing_socket="$(read_env_value VERCLAB_DOCKER_SOCKET_PATH)"
  existing_database_provider="$(read_env_value VERCLAB_DATABASE_PROVIDER)"
  existing_postgres_url="$(read_env_value VERCLAB_POSTGRES_URL)"
  existing_secret="$(read_env_value VERCLAB_ENCRYPTION_SECRET)"

  VERCLAB_BASE_DOMAIN="${VERCLAB_BASE_DOMAIN:-${existing_base_domain:-}}"
  VERCLAB_BASE_DOMAIN="${VERCLAB_BASE_DOMAIN:-$(prompt_with_default "Base wildcard domain" "myhomelan.com")}" 

  VERCLAB_ADMIN_HOST="${VERCLAB_ADMIN_HOST:-${existing_admin_host:-}}"
  VERCLAB_ADMIN_HOST="${VERCLAB_ADMIN_HOST:-$(prompt_with_default "Control plane host" "verclab.${VERCLAB_BASE_DOMAIN}")}" 

  VERCLAB_HOST_ROOT="${VERCLAB_HOST_ROOT:-${existing_host_root:-}}"
  VERCLAB_HOST_ROOT="${VERCLAB_HOST_ROOT:-$(prompt_with_default "Shared host root for data and Traefik assets" "/opt/verclab")}" 

  VERCLAB_PROXY_NETWORK="${VERCLAB_PROXY_NETWORK:-${existing_proxy_network:-verclab_proxy}}"
  VERCLAB_DOCKER_SOCKET_PATH="${VERCLAB_DOCKER_SOCKET_PATH:-${existing_socket:-/var/run/docker.sock}}"
  VERCLAB_DATABASE_PROVIDER="${VERCLAB_DATABASE_PROVIDER:-${existing_database_provider:-sqlite}}"
  VERCLAB_POSTGRES_URL="${VERCLAB_POSTGRES_URL:-${existing_postgres_url:-}}"
  VERCLAB_ENCRYPTION_SECRET="${VERCLAB_ENCRYPTION_SECRET:-${existing_secret:-}}"

  validate_domain "$VERCLAB_BASE_DOMAIN" "VERCLAB_BASE_DOMAIN"
  validate_domain "$VERCLAB_ADMIN_HOST" "VERCLAB_ADMIN_HOST"
  validate_absolute_path "$VERCLAB_HOST_ROOT" "VERCLAB_HOST_ROOT"
  validate_absolute_path "$VERCLAB_DOCKER_SOCKET_PATH" "VERCLAB_DOCKER_SOCKET_PATH"

  [[ "$VERCLAB_ADMIN_HOST" == *".${VERCLAB_BASE_DOMAIN}" ]] || fail "VERCLAB_ADMIN_HOST must be inside VERCLAB_BASE_DOMAIN."
  [[ "$VERCLAB_DATABASE_PROVIDER" == "sqlite" || "$VERCLAB_DATABASE_PROVIDER" == "postgres" ]] || fail "VERCLAB_DATABASE_PROVIDER must be sqlite or postgres."

  if [[ "$VERCLAB_DATABASE_PROVIDER" == "postgres" && -z "$VERCLAB_POSTGRES_URL" ]]; then
    fail "Set VERCLAB_POSTGRES_URL when using the postgres provider."
  fi

  if [[ -z "$VERCLAB_ENCRYPTION_SECRET" ]]; then
    VERCLAB_ENCRYPTION_SECRET="$(openssl rand -hex 32)"
  fi
}

prepare_host_directories() {
  log "Preparing host directories under $VERCLAB_HOST_ROOT"
  run_privileged mkdir -p \
    "$VERCLAB_HOST_ROOT/traefik/dynamic" \
    "$VERCLAB_HOST_ROOT/traefik/certs" \
    "$VERCLAB_HOST_ROOT/data/apps" \
    "$VERCLAB_HOST_ROOT/data/logs" \
    "$VERCLAB_HOST_ROOT/data/locks" \
    "$VERCLAB_HOST_ROOT/data/db"
}

validate_docker_socket() {
  [[ -S "$VERCLAB_DOCKER_SOCKET_PATH" ]] || fail "Docker socket was not found at $VERCLAB_DOCKER_SOCKET_PATH."
}

certificate_matches_domain() {
  local cert_file="$1"

  [[ -f "$cert_file" ]] || return 1

  openssl x509 -in "$cert_file" -noout -text 2>/dev/null | grep -F "DNS:${VERCLAB_BASE_DOMAIN}" >/dev/null 2>&1 \
    && openssl x509 -in "$cert_file" -noout -text 2>/dev/null | grep -F "DNS:*.${VERCLAB_BASE_DOMAIN}" >/dev/null 2>&1
}

write_tls_config() {
  local tls_file="$VERCLAB_HOST_ROOT/traefik/dynamic/tls.yml"

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
  local cert_file="$VERCLAB_HOST_ROOT/traefik/certs/wildcard.crt"
  local key_file="$VERCLAB_HOST_ROOT/traefik/certs/wildcard.key"

  if certificate_matches_domain "$cert_file" && [[ -f "$key_file" ]]; then
    log "Reusing the existing wildcard certificate."
    return
  fi

  log "Generating a self-signed wildcard certificate for $VERCLAB_BASE_DOMAIN"
  run_privileged openssl req \
    -x509 \
    -nodes \
    -days 825 \
    -newkey rsa:4096 \
    -keyout "$key_file" \
    -out "$cert_file" \
    -subj "/CN=${VERCLAB_BASE_DOMAIN}" \
    -addext "subjectAltName=DNS:${VERCLAB_BASE_DOMAIN},DNS:*.${VERCLAB_BASE_DOMAIN},DNS:${VERCLAB_ADMIN_HOST}"
}

write_env_file() {
  log "Writing $ENV_FILE"

  tee "$ENV_FILE" >/dev/null <<EOF
VERCLAB_BASE_DOMAIN=$VERCLAB_BASE_DOMAIN
VERCLAB_ADMIN_HOST=$VERCLAB_ADMIN_HOST
VERCLAB_PROXY_NETWORK=$VERCLAB_PROXY_NETWORK
VERCLAB_PROXY_ENTRYPOINT=websecure
VERCLAB_HOST_ROOT=$VERCLAB_HOST_ROOT
VERCLAB_DOCKER_SOCKET_PATH=$VERCLAB_DOCKER_SOCKET_PATH
VERCLAB_DATABASE_PROVIDER=$VERCLAB_DATABASE_PROVIDER
VERCLAB_POSTGRES_URL=$VERCLAB_POSTGRES_URL
VERCLAB_ENCRYPTION_SECRET=$VERCLAB_ENCRYPTION_SECRET
EOF

  chmod 600 "$ENV_FILE"
}

start_stack() {
  log "Starting the Verclab control plane stack."
  (
    cd "$REPO_ROOT"
    "${DOCKER_CMD[@]}" compose up -d --build
  )
}

print_summary() {
  log "Verclab is starting at https://$VERCLAB_ADMIN_HOST"
  log "Health endpoint: https://$VERCLAB_ADMIN_HOST/api/health"
  log "Docker state root: $VERCLAB_HOST_ROOT"
  log "Import $VERCLAB_HOST_ROOT/traefik/certs/wildcard.crt into your client trust store to remove browser warnings."
}

main() {
  ensure_sudo
  ensure_supported_os
  ensure_repo_layout
  ensure_prerequisites
  ensure_docker_group_access
  resolve_docker_command
  install_host_node_dependencies
  run_host_build_smoke_test
  gather_configuration
  prepare_host_directories
  validate_docker_socket
  write_env_file
  write_tls_config
  ensure_certificate
  start_stack
  print_summary
}

main "$@"