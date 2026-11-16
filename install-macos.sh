#!/usr/bin/env bash
#
# Vercelab macOS installer.
#
# install.sh dispatches here automatically on Darwin, so the documented entry
# point is still:
#   ./install.sh
#   curl -fsSL https://raw.githubusercontent.com/dedkola/vercelab/main/install.sh | bash
#
# Everything this script installs or creates is recorded in
# .vercelab-install-manifest so ./uninstall.sh can remove exactly that and
# nothing else. Docker Desktop is the single exception: it is installed when
# missing but never removed by uninstall.sh.
#
# The whole runtime lives in one folder (default ~/vercelab):
#   <root>/data/...     PostgreSQL, InfluxDB, apps, logs, locks
#   <root>/traefik/...  dynamic config and the wildcard certificate
#
# This file must stay compatible with macOS bash 3.2: no mapfile, no
# associative arrays, no ${var,,}, no "local -n".

set -eo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly REPO_ROOT="$SCRIPT_DIR"
readonly ENV_FILE="$REPO_ROOT/.env"
readonly ENV_EXAMPLE="$REPO_ROOT/.env.example"
readonly COMPOSE_FILE="$REPO_ROOT/docker-compose.yml"
readonly MACOS_COMPOSE_FILE="$REPO_ROOT/docker-compose.macos.yml"
readonly MANIFEST_FILE="$REPO_ROOT/.vercelab-install-manifest"

readonly NODE_MAJOR="24"
readonly PNPM_VERSION="11.27.1"
readonly DEFAULT_NODE_ENV="production"
readonly DEFAULT_HOSTNAME="0.0.0.0"
readonly DEFAULT_PORT="3000"
readonly DOCKER_WAIT_SECONDS="300"

CONTROL_PLANE_HOSTNAME=""

BREW=""
OPENSSL_BIN=""
DOCKER_CMD=(docker)
COMPOSE_ARGS=()

ASSUME_YES=false
SKIP_HOST_BUILD=false
MANIFEST_TMP=""

C_RESET=""
C_BOLD=""
C_CYAN=""
C_GREEN=""
C_YELLOW=""

log() {
  printf '[vercelab] %s\n' "$*"
}

warn() {
  printf '[vercelab] %s\n' "$*" >&2
}

fail() {
  printf '[vercelab] %s\n' "$*" >&2
  exit 1
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

print_usage() {
  cat <<'EOF'
Usage: ./install.sh [--yes] [--help]

macOS production install. install.sh calls this script automatically on Darwin.

Options:
  --yes   Accept the proposed configuration without the review prompt.
  --help  Show this help text.

Environment:
  VERCELAB_HOST_ROOT          Single storage folder (default: ~/vercelab).
  VERCELAB_BASE_DOMAIN        Wildcard domain (default: derived from the LAN IPv4 via sslip.io).
  VERCELAB_ADMIN_HOST         Dashboard host (default: dash.<base domain>).
  VERCELAB_DOCKER_SOCKET_PATH Docker socket (default: auto-detected).
  VERCELAB_SKIP_HOST_BUILD=1  Skip the host-side production build smoke test.

Everything is stored under VERCELAB_HOST_ROOT. The installer records what it
created in .vercelab-install-manifest so ./uninstall.sh removes only that.
Docker Desktop is never removed by the uninstaller.
EOF
}

parse_args() {
  while (( $# > 0 )); do
    case "$1" in
      --yes|-y)
        ASSUME_YES=true
        ;;
      --help|-h)
        print_usage
        exit 0
        ;;
      *)
        fail "Unknown argument: $1"
        ;;
    esac

    shift
  done
}

# ── Install manifest ─────────────────────────────────────────────────────────
manifest_init() {
  MANIFEST_TMP="$(mktemp "${TMPDIR:-/tmp}/vercelab-manifest.XXXXXX")"

  if [[ -f "$MANIFEST_FILE" ]]; then
    cp "$MANIFEST_FILE" "$MANIFEST_TMP"
  fi
}

# Unique lines only: used for repeatable records such as DIR= and BREW_FORMULA=.
manifest_record() {
  local line="$1"

  [[ -n "$MANIFEST_TMP" ]] || return 0
  grep -Fqx -- "$line" "$MANIFEST_TMP" >/dev/null 2>&1 || printf '%s\n' "$line" >>"$MANIFEST_TMP"
}

# Single-value records: replaces a previous value from an earlier run.
manifest_set() {
  local key="$1"
  local value="$2"
  local filtered=""

  [[ -n "$MANIFEST_TMP" ]] || return 0
  filtered="$(mktemp "${TMPDIR:-/tmp}/vercelab-manifest-set.XXXXXX")"
  grep -v "^${key}=" "$MANIFEST_TMP" >"$filtered" 2>/dev/null || true
  printf '%s=%s\n' "$key" "$value" >>"$filtered"
  mv "$filtered" "$MANIFEST_TMP"
}

manifest_finalize() {
  local output=""

  [[ -n "$MANIFEST_TMP" ]] || return 0
  output="$(mktemp "${TMPDIR:-/tmp}/vercelab-manifest-out.XXXXXX")"

  {
    printf '%s\n' '# Vercelab install manifest. Written by install-macos.sh, read by uninstall.sh.'
    printf '%s\n' '# Only paths and packages listed here are removed by the uninstaller.'
    grep -v '^#' "$MANIFEST_TMP" 2>/dev/null | grep -v '^$' || true
  } >"$output"

  mv "$output" "$MANIFEST_FILE"
  chmod 644 "$MANIFEST_FILE"
  rm -f -- "$MANIFEST_TMP"
  MANIFEST_TMP=""
}

# ── Configuration helpers ────────────────────────────────────────────────────
read_env_value() {
  local key="$1"
  local value=""

  if [[ ! -f "$ENV_FILE" ]]; then
    return 0
  fi

  value="$(grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | tail -n 1 | cut -d= -f2- | tr -d '\r' || true)"
  printf '%s' "$value"
}

prompt_with_default() {
  local prompt="$1"
  local default_value="$2"
  local input=""

  if [[ "$ASSUME_YES" != true && -t 0 ]]; then
    read -r -p "$prompt [$default_value]: " input || true
  fi

  printf '%s' "${input:-$default_value}"
}

prompt_optional_secret() {
  local prompt="$1"
  local existing_value="$2"
  local input=""

  if [[ "$ASSUME_YES" == true || ! -t 0 ]]; then
    printf '%s' "$existing_value"
    return 0
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
    return 0
  fi

  if (( length <= 8 )); then
    printf '%s' "********"
    return 0
  fi

  printf '%s' "${value:0:4}********${value:length-4:4}"
}

confirm_configuration() {
  local answer=""

  if [[ "$ASSUME_YES" == true || ! -t 0 ]]; then
    return 0
  fi

  read -r -p "Continue with this configuration? [Y/n]: " answer || true

  case "${answer:-Y}" in
    y|Y|yes|YES|"")
      ;;
    *)
      fail "Installation canceled by user."
      ;;
  esac
}

validate_absolute_path() {
  local value="$1"
  local label="$2"

  [[ "$value" = /* ]] || fail "$label must be an absolute path."
}

validate_domain() {
  local value="$1"
  local label="$2"

  [[ "$value" =~ ^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || fail "$label must look like a real domain name."
}

validate_ipv4() {
  local value="$1"
  local label="$2"
  local octet=""

  [[ "$value" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || fail "$label must be a valid IPv4 address."

  IFS='.' read -r -a octets <<<"$value"

  for octet in "${octets[@]}"; do
    (( octet >= 0 && octet <= 255 )) || fail "$label must be a valid IPv4 address."
  done
}

# ── Host checks ──────────────────────────────────────────────────────────────
ensure_repo_layout() {
  [[ -f "$COMPOSE_FILE" ]] || fail "docker-compose.yml is missing from $REPO_ROOT."
  [[ -f "$MACOS_COMPOSE_FILE" ]] || fail "docker-compose.macos.yml is missing from $REPO_ROOT."
  [[ -f "$ENV_EXAMPLE" ]] || fail ".env.example is missing from $REPO_ROOT."
}

ensure_supported_host() {
  [[ "$(uname -s)" == "Darwin" ]] || fail "install-macos.sh supports macOS only. Run ./install.sh on Linux."

  if [[ -n "${REMOTE_CONTAINERS:-}" || -f /.dockerenv || -n "${CODESPACES:-}" ]]; then
    fail "This installer is for a macOS host, not a container. In a devcontainer use .devcontainer/docker-compose.yml."
  fi
}

detect_primary_ipv4() {
  local interface_name=""
  local detected_ip=""

  for interface_name in en0 en1 en2 en3 en4 en5; do
    detected_ip="$(ipconfig getifaddr "$interface_name" 2>/dev/null || true)"
    if [[ -n "$detected_ip" ]]; then
      printf '%s' "$detected_ip"
      return 0
    fi
  done

  detected_ip="$(ifconfig 2>/dev/null | awk '/inet / { if ($2 != "127.0.0.1") { print $2; exit } }')"
  printf '%s' "$detected_ip"
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
    return 0
  fi

  printf '%s' "myhomelan.com"
}

# ── Homebrew and build prerequisites ─────────────────────────────────────────
resolve_brew() {
  if command_exists brew; then
    BREW="$(command -v brew)"
    return 0
  fi

  if [[ -x /opt/homebrew/bin/brew ]]; then
    BREW="/opt/homebrew/bin/brew"
    return 0
  fi

  if [[ -x /usr/local/bin/brew ]]; then
    BREW="/usr/local/bin/brew"
    return 0
  fi

  BREW=""
  return 1
}

ensure_homebrew() {
  if resolve_brew; then
    export PATH="$(dirname -- "$BREW"):$PATH"
    log "Homebrew is already installed at $BREW."
    return 0
  fi

  log "Installing Homebrew (needed for git, OpenSSL, Node.js, and Docker Desktop)."
  NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" \
    || fail "Homebrew installation failed. Install it from https://brew.sh and rerun ./install.sh."

  resolve_brew || fail "Homebrew was installed but its brew executable was not found."
  export PATH="$(dirname -- "$BREW"):$PATH"
  manifest_record "HOMEBREW_INSTALLED=true"
}

brew_formula_installed() {
  local formula="$1"

  [[ -n "$BREW" ]] || return 1
  "$BREW" list --formula "$formula" >/dev/null 2>&1
}

brew_cask_installed() {
  local cask="$1"

  [[ -n "$BREW" ]] || return 1
  "$BREW" list --cask "$cask" >/dev/null 2>&1
}

ensure_brew_formula() {
  local formula="$1"

  if brew_formula_installed "$formula"; then
    log "$formula is already installed."
    return 0
  fi

  log "Installing $formula with Homebrew."
  "$BREW" install "$formula" || fail "Homebrew could not install $formula."
  manifest_record "BREW_FORMULA=$formula"
}

ensure_git() {
  if command_exists git; then
    log "git is already available at $(command -v git)."
    return 0
  fi

  ensure_brew_formula git
}

openssl_supports_addext() {
  local openssl_bin="$1"

  [[ -x "$openssl_bin" ]] || return 1
  "$openssl_bin" req -help 2>&1 | grep -q -- '-addext'
}

ensure_openssl() {
  local brew_openssl=""
  local system_openssl="/usr/bin/openssl"

  if brew_formula_installed "openssl@3"; then
    brew_openssl="$("$BREW" --prefix openssl@3)/bin/openssl"
    if openssl_supports_addext "$brew_openssl"; then
      OPENSSL_BIN="$brew_openssl"
      log "Using Homebrew OpenSSL at $OPENSSL_BIN."
      return 0
    fi
  fi

  if openssl_supports_addext "$system_openssl"; then
    OPENSSL_BIN="$system_openssl"
    log "Using the system OpenSSL at $OPENSSL_BIN."
    return 0
  fi

  ensure_brew_formula "openssl@3"
  brew_openssl="$("$BREW" --prefix openssl@3)/bin/openssl"
  openssl_supports_addext "$brew_openssl" || fail "Homebrew OpenSSL does not support -addext."
  OPENSSL_BIN="$brew_openssl"
}

node_major_version() {
  node -p 'process.versions.node.split(".")[0]' 2>/dev/null || true
}

ensure_nodejs() {
  local installed_major=""

  installed_major="$(node_major_version)"

  if [[ -n "$installed_major" ]] && (( installed_major >= NODE_MAJOR )); then
    log "Node.js $(node --version 2>/dev/null) is already installed."
    return 0
  fi

  log "Installing Node.js ${NODE_MAJOR}+ with Homebrew."
  ensure_brew_formula node
  export PATH="$("$BREW" --prefix)/bin:$PATH"
  hash -r 2>/dev/null || true

  installed_major="$(node_major_version)"
  [[ -n "$installed_major" ]] || fail "Node.js is still unavailable after the Homebrew install."
  (( installed_major >= NODE_MAJOR )) || fail "Node.js ${NODE_MAJOR}+ is required but $(node --version) is first in PATH."
  manifest_record "NODE_INSTALLED=true"
}

ensure_pnpm() {
  local installed_version=""
  local pnpm_prefix="$HOME/.local"

  installed_version="$(pnpm --version 2>/dev/null || true)"

  if [[ "$installed_version" == "$PNPM_VERSION" ]]; then
    log "pnpm ${PNPM_VERSION} is already installed."
    return 0
  fi

  command_exists npm || fail "npm is required to install pnpm ${PNPM_VERSION}."

  if [[ -n "$installed_version" ]]; then
    log "Updating pnpm from ${installed_version} to ${PNPM_VERSION} via npm."
  else
    log "Installing pnpm ${PNPM_VERSION} globally via npm."
  fi

  if ! npm install -g "pnpm@${PNPM_VERSION}" >/dev/null 2>&1; then
    warn "Global npm install failed; installing pnpm into ${pnpm_prefix} instead."
    npm install -g --prefix "$pnpm_prefix" "pnpm@${PNPM_VERSION}" \
      || fail "Could not install pnpm ${PNPM_VERSION}."
    export PATH="$pnpm_prefix/bin:$PATH"
    hash -r 2>/dev/null || true
    manifest_record "PNPM_PREFIX=$pnpm_prefix"
    warn "Add ${pnpm_prefix}/bin to PATH in ~/.zshrc so pnpm is available in new shells."
  fi

  command_exists pnpm || fail "pnpm was installed but is not on PATH."
  manifest_record "PNPM_INSTALLED=true"
}

# ── Docker Desktop ───────────────────────────────────────────────────────────
docker_daemon_reachable() {
  command_exists docker || return 1
  docker info >/dev/null 2>&1
}

wait_for_docker_daemon() {
  local waited=0
  local announced=0

  while (( waited < DOCKER_WAIT_SECONDS )); do
    if docker_daemon_reachable; then
      return 0
    fi

    if (( announced == 0 )); then
      log "Waiting for the Docker daemon (up to ${DOCKER_WAIT_SECONDS}s)."
      announced=1
    elif (( waited % 30 == 0 )); then
      log "Still waiting for Docker... ${waited}s elapsed."
    fi

    sleep 5
    waited=$(( waited + 5 ))
  done

  return 1
}

start_docker_desktop() {
  local app_path=""

  for app_path in "/Applications/Docker.app" "$HOME/Applications/Docker.app"; do
    if [[ -d "$app_path" ]]; then
      if pgrep -f "$app_path/Contents/MacOS/Docker" >/dev/null 2>&1; then
        log "Docker Desktop is already running."
      else
        log "Launching Docker Desktop."
        open -a "$app_path" >/dev/null 2>&1 || open -a Docker >/dev/null 2>&1 || true
      fi
      return 0
    fi
  done

  return 1
}

ensure_docker_desktop() {
  if docker_daemon_reachable; then
    log "Docker is installed and the daemon is reachable."
    return 0
  fi

  if command_exists colima; then
    log "Docker daemon is not reachable; trying colima start."
    colima start >/dev/null 2>&1 || true
    if docker_daemon_reachable; then
      log "Connected to the colima Docker daemon."
      return 0
    fi
  fi

  if ! start_docker_desktop; then
    log "Installing Docker Desktop."
    "$BREW" install --cask docker \
      || fail "Docker Desktop installation failed. Install it from https://www.docker.com/products/docker-desktop/ and rerun ./install.sh."
    manifest_record "DOCKER_DESKTOP_INSTALLED=true"
    open -a Docker >/dev/null 2>&1 || true
  fi

  wait_for_docker_daemon \
    || fail "Docker Desktop did not become ready. Open Docker.app, finish onboarding, then rerun ./install.sh."

  log "Docker daemon is reachable."
}

ensure_docker_compose() {
  docker compose version >/dev/null 2>&1 \
    || fail "Docker Compose v2 is required. Update Docker Desktop (brew upgrade --cask docker) and rerun ./install.sh."

  local compose_version=""
  local compose_major=""
  local compose_minor=""

  compose_version="$(docker compose version --short 2>/dev/null | sed 's/^v//' || true)"
  compose_major="${compose_version%%.*}"
  compose_minor="${compose_version#*.}"
  compose_minor="${compose_minor%%.*}"

  case "$compose_major" in
    ''|*[!0-9]*)
      warn "Could not detect the Docker Compose version; assuming the macOS override is supported."
      return 0
      ;;
  esac

  case "$compose_minor" in
    ''|*[!0-9]*)
      compose_minor=0
      ;;
  esac

  if (( compose_major < 2 )) || { (( compose_major == 2 )) && (( compose_minor < 24 )); }; then
    fail "Docker Compose ${compose_version} is too old for docker-compose.macos.yml (2.24+ required). Update Docker Desktop and rerun ./install.sh."
  fi

  log "Docker Compose ${compose_version} supports the macOS override."
}

resolve_docker_command() {
  docker_daemon_reachable || fail "Docker is installed but the daemon is not reachable."
  DOCKER_CMD=(docker)
}

detect_docker_socket() {
  local socket_path=""
  local candidate=""

  if command_exists docker; then
    socket_path="$(docker context inspect --format '{{.Endpoints.docker.Host}}' 2>/dev/null || true)"
    case "$socket_path" in
      unix://*)
        socket_path="${socket_path#unix://}"
        ;;
    esac

    case "$socket_path" in
      /*)
        ;;
      *)
        socket_path=""
        ;;
    esac

    if [[ -n "$socket_path" && -S "$socket_path" ]]; then
      printf '%s' "$socket_path"
      return 0
    fi
  fi

  for candidate in "${DOCKER_HOST:-}" "$HOME/.docker/run/docker.sock" "/var/run/docker.sock"; do
    case "$candidate" in
      unix://*)
        candidate="${candidate#unix://}"
        ;;
    esac

    if [[ -n "$candidate" && -S "$candidate" ]]; then
      printf '%s' "$candidate"
      return 0
    fi
  done

  printf '%s' ""
}

compose_project_name() {
  local project=""
  project="$(read_env_value COMPOSE_PROJECT_NAME)"

  if [[ -z "$project" && -f "$COMPOSE_FILE" ]]; then
    project="$(awk '$1 == "name:" { print $2; exit }' "$COMPOSE_FILE" 2>/dev/null || true)"
  fi

  printf '%s' "${project:-vercelab}"
}

# Traefik publishes 80 and 443, so a foreign listener makes the stack fail.
# Refuse up front instead of bootstrapping everything and failing at start.
ensure_ports_available() {
  local port=""
  local project=""
  local listeners=""
  local owners=""
  local foreign_names=""
  local foreign_projects=""
  local other_project=""

  if ! command_exists lsof; then
    return 0
  fi

  project="$(compose_project_name)"

  for port in 80 443; do
    listeners="$(lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | awk 'NR > 1 { print $1 }' | sort -u | tr '\n' ' ' || true)"

    [[ -n "$listeners" ]] || continue

    owners=""
    if docker_daemon_reachable; then
      owners="$(docker ps --filter "publish=$port" --format '{{.Label "com.docker.compose.project"}}|{{.Names}}' 2>/dev/null || true)"
    fi

    # Containers of this very stack are recreated by `compose up`, so they do
    # not block a reinstall.
    foreign_names="$(printf '%s\n' "$owners" | awk -F'|' -v own="$project" 'NF && $1 != own { print $2 }' | tr '\n' ' ')"
    foreign_projects="$(printf '%s\n' "$owners" | awk -F'|' -v own="$project" 'NF && $1 != own && $1 != "" { print $1 }' | sort -u | tr '\n' ' ')"

    if [[ -z "${foreign_names// /}" ]]; then
      if [[ -n "${owners// /}" ]]; then
        log "Port ${port} is already bound by this Vercelab stack; its containers will be recreated."
        continue
      fi

      warn "Port ${port} is required by the Traefik proxy but is already in use by: ${listeners% }."
      warn "Stop that process and run the installer again."

      return 1
    fi

    warn "Port ${port} is required by the Traefik proxy but is already in use by: ${foreign_names% }."

    if [[ -n "${foreign_projects// /}" ]]; then
      for other_project in $foreign_projects; do
        warn "Stop that Vercelab stack first: docker compose -p ${other_project} down"
      done
    else
      warn "Stop that container and run the installer again."
    fi

    return 1
  done
}

# ── Configuration ────────────────────────────────────────────────────────────
gather_configuration() {
  local existing_node_env existing_runtime_host existing_port existing_base_domain existing_admin_host existing_influx_explorer_host existing_influx_explorer_url existing_host_root existing_host_lan_ip existing_data_root existing_dynamic_dir existing_certs_dir existing_proxy_network existing_proxy_entrypoint existing_socket existing_apps_dir existing_logs_dir existing_locks_dir existing_database_provider existing_postgres_url existing_postgres_user existing_postgres_password existing_postgres_db existing_postgres_data_dir existing_influx_url existing_influx_database existing_influx_token existing_influx_retention_days existing_influx_data_dir existing_influx_explorer_data_dir existing_influx_explorer_config_dir existing_influx_explorer_session_secret existing_secret existing_github_token
  local default_base_domain default_host_lan_ip default_host_root

  existing_node_env="$(read_env_value NODE_ENV)"
  existing_runtime_host="$(read_env_value HOSTNAME)"
  existing_port="$(read_env_value PORT)"
  existing_base_domain="$(read_env_value VERCELAB_BASE_DOMAIN)"
  existing_admin_host="$(read_env_value VERCELAB_ADMIN_HOST)"
  existing_influx_explorer_host="$(read_env_value VERCELAB_INFLUXDB_EXPLORER_HOST)"
  existing_influx_explorer_url="$(read_env_value VERCELAB_INFLUXDB_EXPLORER_URL)"
  existing_host_root="$(read_env_value VERCELAB_HOST_ROOT)"
  existing_host_lan_ip="$(read_env_value VERCELAB_HOST_LAN_IP)"
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
  existing_influx_explorer_data_dir="$(read_env_value VERCELAB_INFLUXDB_EXPLORER_DATA_DIR)"
  existing_influx_explorer_config_dir="$(read_env_value VERCELAB_INFLUXDB_EXPLORER_CONFIG_DIR)"
  existing_influx_explorer_session_secret="$(read_env_value VERCELAB_INFLUXDB_EXPLORER_SESSION_SECRET)"
  existing_secret="$(read_env_value VERCELAB_ENCRYPTION_SECRET)"
  existing_github_token="$(read_env_value VERCELAB_GITHUB_TOKEN)"

  default_base_domain="$(detect_default_base_domain)"
  default_host_lan_ip="$(detect_primary_ipv4)"
  default_host_root="${existing_host_root:-$HOME/vercelab}"

  NODE_ENV="${NODE_ENV:-${existing_node_env:-$DEFAULT_NODE_ENV}}"
  PORT="${PORT:-${existing_port:-$DEFAULT_PORT}}"
  CONTROL_PLANE_HOSTNAME="${VERCELAB_CONTROL_PLANE_HOSTNAME:-${existing_runtime_host:-$DEFAULT_HOSTNAME}}"

  # One prompt: everything else is derived inside this folder.
  VERCELAB_HOST_ROOT="${VERCELAB_HOST_ROOT:-$(prompt_with_default "Storage folder (all Vercelab files)" "$default_host_root")}"

  case "$VERCELAB_HOST_ROOT" in
    "~")
      VERCELAB_HOST_ROOT="$HOME"
      ;;
    "~/"*)
      VERCELAB_HOST_ROOT="$HOME/${VERCELAB_HOST_ROOT#\~/}"
      ;;
  esac

  VERCELAB_HOST_ROOT="${VERCELAB_HOST_ROOT%/}"
  VERCELAB_HOST_ROOT="${VERCELAB_HOST_ROOT:-/}"
  validate_absolute_path "$VERCELAB_HOST_ROOT" "VERCELAB_HOST_ROOT"
  [[ "$VERCELAB_HOST_ROOT" != "/" ]] || fail "VERCELAB_HOST_ROOT cannot be /."

  # All storage paths are derived from the single storage folder, so the layout
  # matches the Linux installer. When a re-run keeps the same storage folder the
  # values already in .env win, which preserves a hand-edited layout; changing
  # the storage folder re-derives every path underneath the new location.
  if [[ -n "$existing_host_root" && "$existing_host_root" == "$VERCELAB_HOST_ROOT" ]]; then
    VERCELAB_DATA_ROOT="${VERCELAB_DATA_ROOT:-${existing_data_root:-$VERCELAB_HOST_ROOT/data}}"
    VERCELAB_TRAEFIK_DYNAMIC_DIR="${VERCELAB_TRAEFIK_DYNAMIC_DIR:-${existing_dynamic_dir:-$VERCELAB_HOST_ROOT/traefik/dynamic}}"
    VERCELAB_TRAEFIK_CERTS_DIR="${VERCELAB_TRAEFIK_CERTS_DIR:-${existing_certs_dir:-$VERCELAB_HOST_ROOT/traefik/certs}}"
  else
    VERCELAB_DATA_ROOT="${VERCELAB_DATA_ROOT:-$VERCELAB_HOST_ROOT/data}"
    VERCELAB_TRAEFIK_DYNAMIC_DIR="${VERCELAB_TRAEFIK_DYNAMIC_DIR:-$VERCELAB_HOST_ROOT/traefik/dynamic}"
    VERCELAB_TRAEFIK_CERTS_DIR="${VERCELAB_TRAEFIK_CERTS_DIR:-$VERCELAB_HOST_ROOT/traefik/certs}"
  fi

  if [[ -n "$existing_host_root" && "$existing_host_root" == "$VERCELAB_HOST_ROOT" ]]; then
    VERCELAB_APPS_DIR="${VERCELAB_APPS_DIR:-${existing_apps_dir:-$VERCELAB_DATA_ROOT/apps}}"
    VERCELAB_LOGS_DIR="${VERCELAB_LOGS_DIR:-${existing_logs_dir:-$VERCELAB_DATA_ROOT/logs}}"
    VERCELAB_LOCKS_DIR="${VERCELAB_LOCKS_DIR:-${existing_locks_dir:-$VERCELAB_DATA_ROOT/locks}}"
    VERCELAB_POSTGRES_DATA_DIR="${VERCELAB_POSTGRES_DATA_DIR:-${existing_postgres_data_dir:-$VERCELAB_DATA_ROOT/postgres}}"
    VERCELAB_INFLUXDB_DATA_DIR="${VERCELAB_INFLUXDB_DATA_DIR:-${existing_influx_data_dir:-$VERCELAB_DATA_ROOT/influxdb}}"
    VERCELAB_INFLUXDB_EXPLORER_DATA_DIR="${VERCELAB_INFLUXDB_EXPLORER_DATA_DIR:-${existing_influx_explorer_data_dir:-$VERCELAB_DATA_ROOT/influxdb-explorer}}"
    VERCELAB_INFLUXDB_EXPLORER_CONFIG_DIR="${VERCELAB_INFLUXDB_EXPLORER_CONFIG_DIR:-${existing_influx_explorer_config_dir:-$VERCELAB_DATA_ROOT/influxdb-explorer-config}}"
  else
    VERCELAB_APPS_DIR="${VERCELAB_APPS_DIR:-$VERCELAB_DATA_ROOT/apps}"
    VERCELAB_LOGS_DIR="${VERCELAB_LOGS_DIR:-$VERCELAB_DATA_ROOT/logs}"
    VERCELAB_LOCKS_DIR="${VERCELAB_LOCKS_DIR:-$VERCELAB_DATA_ROOT/locks}"
    VERCELAB_POSTGRES_DATA_DIR="${VERCELAB_POSTGRES_DATA_DIR:-$VERCELAB_DATA_ROOT/postgres}"
    VERCELAB_INFLUXDB_DATA_DIR="${VERCELAB_INFLUXDB_DATA_DIR:-$VERCELAB_DATA_ROOT/influxdb}"
    VERCELAB_INFLUXDB_EXPLORER_DATA_DIR="${VERCELAB_INFLUXDB_EXPLORER_DATA_DIR:-$VERCELAB_DATA_ROOT/influxdb-explorer}"
    VERCELAB_INFLUXDB_EXPLORER_CONFIG_DIR="${VERCELAB_INFLUXDB_EXPLORER_CONFIG_DIR:-$VERCELAB_DATA_ROOT/influxdb-explorer-config}"
  fi

  VERCELAB_BASE_DOMAIN="${VERCELAB_BASE_DOMAIN:-${existing_base_domain:-}}"
  VERCELAB_BASE_DOMAIN="${VERCELAB_BASE_DOMAIN:-$(prompt_with_default "Base wildcard domain" "$default_base_domain")}"

  if [[ -z "${VERCELAB_ADMIN_HOST:-}" ]]; then
    case "$existing_admin_host" in
      *".${VERCELAB_BASE_DOMAIN}")
        VERCELAB_ADMIN_HOST="$existing_admin_host"
        ;;
      *)
        VERCELAB_ADMIN_HOST="dash.${VERCELAB_BASE_DOMAIN}"
        ;;
    esac
  fi

  if [[ -z "${VERCELAB_INFLUXDB_EXPLORER_HOST:-}" ]]; then
    case "$existing_influx_explorer_host" in
      *".${VERCELAB_BASE_DOMAIN}")
        VERCELAB_INFLUXDB_EXPLORER_HOST="$existing_influx_explorer_host"
        ;;
      *)
        VERCELAB_INFLUXDB_EXPLORER_HOST="influx.${VERCELAB_BASE_DOMAIN}"
        ;;
    esac
  fi

  VERCELAB_INFLUXDB_EXPLORER_URL="${VERCELAB_INFLUXDB_EXPLORER_URL:-https://${VERCELAB_INFLUXDB_EXPLORER_HOST}}"
  VERCELAB_HOST_LAN_IP="${VERCELAB_HOST_LAN_IP:-${existing_host_lan_ip:-$default_host_lan_ip}}"

  VERCELAB_PROXY_NETWORK="${VERCELAB_PROXY_NETWORK:-${existing_proxy_network:-vercelab_proxy}}"
  VERCELAB_PROXY_ENTRYPOINT="${VERCELAB_PROXY_ENTRYPOINT:-${existing_proxy_entrypoint:-websecure}}"
  VERCELAB_DOCKER_SOCKET_PATH="${VERCELAB_DOCKER_SOCKET_PATH:-${existing_socket:-}}"
  VERCELAB_DOCKER_SOCKET_PATH="${VERCELAB_DOCKER_SOCKET_PATH:-$(detect_docker_socket)}"
  VERCELAB_DATABASE_PROVIDER="${VERCELAB_DATABASE_PROVIDER:-${existing_database_provider:-postgres}}"

  VERCELAB_POSTGRES_USER="${VERCELAB_POSTGRES_USER:-${existing_postgres_user:-vercelab}}"
  VERCELAB_POSTGRES_PASSWORD="${VERCELAB_POSTGRES_PASSWORD:-${existing_postgres_password:-$("$OPENSSL_BIN" rand -hex 16)}}"
  VERCELAB_POSTGRES_DB="${VERCELAB_POSTGRES_DB:-${existing_postgres_db:-vercelab}}"

  existing_postgres_url="${existing_postgres_url/@postgres:5432\//@vercelab-postgres:5432\/}"

  if [[ -n "${VERCELAB_POSTGRES_URL:-}" ]]; then
    :
  elif [[ -n "$existing_postgres_url" && "$existing_postgres_user" == "$VERCELAB_POSTGRES_USER" && "$existing_postgres_password" == "$VERCELAB_POSTGRES_PASSWORD" ]]; then
    VERCELAB_POSTGRES_URL="$existing_postgres_url"
  else
    VERCELAB_POSTGRES_URL="postgres://${VERCELAB_POSTGRES_USER}:${VERCELAB_POSTGRES_PASSWORD}@vercelab-postgres:5432/${VERCELAB_POSTGRES_DB}"
  fi

  VERCELAB_INFLUXDB_URL="${VERCELAB_INFLUXDB_URL:-${existing_influx_url:-http://influxdb:8181}}"
  VERCELAB_INFLUXDB_DATABASE="${VERCELAB_INFLUXDB_DATABASE:-${existing_influx_database:-vercelab_metrics}}"
  VERCELAB_INFLUXDB_TOKEN="${VERCELAB_INFLUXDB_TOKEN:-${existing_influx_token:-}}"
  VERCELAB_INFLUXDB_RETENTION_DAYS="${VERCELAB_INFLUXDB_RETENTION_DAYS:-${existing_influx_retention_days:-90}}"
  VERCELAB_INFLUXDB_EXPLORER_SESSION_SECRET="${VERCELAB_INFLUXDB_EXPLORER_SESSION_SECRET:-${existing_influx_explorer_session_secret:-$("$OPENSSL_BIN" rand -hex 32)}}"
  VERCELAB_ENCRYPTION_SECRET="${VERCELAB_ENCRYPTION_SECRET:-${existing_secret:-}}"

  # macOS specifics: Docker Desktop has no host PID namespace, so terminal
  # sessions run inside the control plane container and metrics read its /proc.
  VERCELAB_TERMINAL_TARGET="container"
  VERCELAB_HOST_PROC_PATH="/proc"

  validate_domain "$VERCELAB_BASE_DOMAIN" "VERCELAB_BASE_DOMAIN"
  validate_domain "$VERCELAB_ADMIN_HOST" "VERCELAB_ADMIN_HOST"
  validate_domain "$VERCELAB_INFLUXDB_EXPLORER_HOST" "VERCELAB_INFLUXDB_EXPLORER_HOST"
  validate_absolute_path "$VERCELAB_DATA_ROOT" "VERCELAB_DATA_ROOT"
  validate_absolute_path "$VERCELAB_TRAEFIK_DYNAMIC_DIR" "VERCELAB_TRAEFIK_DYNAMIC_DIR"
  validate_absolute_path "$VERCELAB_TRAEFIK_CERTS_DIR" "VERCELAB_TRAEFIK_CERTS_DIR"
  validate_absolute_path "$VERCELAB_APPS_DIR" "VERCELAB_APPS_DIR"
  validate_absolute_path "$VERCELAB_LOGS_DIR" "VERCELAB_LOGS_DIR"
  validate_absolute_path "$VERCELAB_LOCKS_DIR" "VERCELAB_LOCKS_DIR"
  validate_absolute_path "$VERCELAB_POSTGRES_DATA_DIR" "VERCELAB_POSTGRES_DATA_DIR"
  validate_absolute_path "$VERCELAB_INFLUXDB_DATA_DIR" "VERCELAB_INFLUXDB_DATA_DIR"
  validate_absolute_path "$VERCELAB_INFLUXDB_EXPLORER_DATA_DIR" "VERCELAB_INFLUXDB_EXPLORER_DATA_DIR"
  validate_absolute_path "$VERCELAB_INFLUXDB_EXPLORER_CONFIG_DIR" "VERCELAB_INFLUXDB_EXPLORER_CONFIG_DIR"
  validate_absolute_path "$VERCELAB_DOCKER_SOCKET_PATH" "VERCELAB_DOCKER_SOCKET_PATH"

  if [[ -n "$VERCELAB_HOST_LAN_IP" ]]; then
    validate_ipv4 "$VERCELAB_HOST_LAN_IP" "VERCELAB_HOST_LAN_IP"
  fi

  [[ "$VERCELAB_ADMIN_HOST" == "$VERCELAB_BASE_DOMAIN" || "$VERCELAB_ADMIN_HOST" == *".${VERCELAB_BASE_DOMAIN}" ]] \
    || fail "VERCELAB_ADMIN_HOST must be inside VERCELAB_BASE_DOMAIN."
  [[ "$VERCELAB_INFLUXDB_EXPLORER_HOST" == "$VERCELAB_BASE_DOMAIN" || "$VERCELAB_INFLUXDB_EXPLORER_HOST" == *".${VERCELAB_BASE_DOMAIN}" ]] \
    || fail "VERCELAB_INFLUXDB_EXPLORER_HOST must be inside VERCELAB_BASE_DOMAIN."
  [[ "$VERCELAB_DATABASE_PROVIDER" == "postgres" ]] || fail "VERCELAB_DATABASE_PROVIDER must be postgres."

  if [[ -z "$VERCELAB_ENCRYPTION_SECRET" ]]; then
    VERCELAB_ENCRYPTION_SECRET="$("$OPENSSL_BIN" rand -hex 32)"
  fi

  VERCELAB_GITHUB_TOKEN="${VERCELAB_GITHUB_TOKEN:-${existing_github_token:-}}"
  [[ -n "$VERCELAB_GITHUB_TOKEN" ]] || VERCELAB_GITHUB_TOKEN="$(prompt_optional_secret "GitHub personal access token (repo scope)" "")"
}

prepare_host_directories() {
  local directory=""

  log "Preparing the storage folder $VERCELAB_HOST_ROOT"

  for directory in \
    "$VERCELAB_HOST_ROOT" \
    "$VERCELAB_DATA_ROOT" \
    "$VERCELAB_TRAEFIK_DYNAMIC_DIR" \
    "$VERCELAB_TRAEFIK_CERTS_DIR" \
    "$VERCELAB_APPS_DIR" \
    "$VERCELAB_LOGS_DIR" \
    "$VERCELAB_LOCKS_DIR" \
    "$VERCELAB_POSTGRES_DATA_DIR" \
    "$VERCELAB_INFLUXDB_DATA_DIR" \
    "$VERCELAB_INFLUXDB_EXPLORER_DATA_DIR" \
    "$VERCELAB_INFLUXDB_EXPLORER_CONFIG_DIR"; do
    if [[ ! -d "$directory" ]]; then
      mkdir -p "$directory" || fail "Could not create $directory."
      manifest_record "DIR=$directory"
    fi
  done
}

validate_docker_socket() {
  [[ -S "$VERCELAB_DOCKER_SOCKET_PATH" ]] || fail "Docker socket was not found at $VERCELAB_DOCKER_SOCKET_PATH. Is Docker Desktop running?"
}

certificate_matches_domain() {
  local cert_file="$1"

  [[ -f "$cert_file" ]] || return 1

  "$OPENSSL_BIN" x509 -in "$cert_file" -noout -text 2>/dev/null | grep -F "DNS:${VERCELAB_BASE_DOMAIN}" >/dev/null 2>&1 \
    && "$OPENSSL_BIN" x509 -in "$cert_file" -noout -text 2>/dev/null | grep -F "DNS:*.${VERCELAB_BASE_DOMAIN}" >/dev/null 2>&1
}

ensure_certificate() {
  local cert_file="$VERCELAB_TRAEFIK_CERTS_DIR/wildcard.crt"
  local key_file="$VERCELAB_TRAEFIK_CERTS_DIR/wildcard.key"

  if certificate_matches_domain "$cert_file" && [[ -f "$key_file" ]]; then
    log "Reusing the existing wildcard certificate."
    return 0
  fi

  log "Generating a self-signed wildcard certificate for $VERCELAB_BASE_DOMAIN"
  "$OPENSSL_BIN" req \
    -x509 \
    -nodes \
    -days 825 \
    -newkey rsa:4096 \
    -keyout "$key_file" \
    -out "$cert_file" \
    -subj "/CN=${VERCELAB_BASE_DOMAIN}" \
    -addext "subjectAltName=DNS:${VERCELAB_BASE_DOMAIN},DNS:*.${VERCELAB_BASE_DOMAIN},DNS:${VERCELAB_ADMIN_HOST}" >/dev/null 2>&1 \
    || fail "Could not generate the wildcard certificate."

  chmod 600 "$key_file"
}

write_tls_config() {
  local tls_file="$VERCELAB_TRAEFIK_DYNAMIC_DIR/tls.yml"

  cat >"$tls_file" <<EOF
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

write_influx_explorer_config() {
  local config_file="$VERCELAB_INFLUXDB_EXPLORER_CONFIG_DIR/config.json"

  cat >"$config_file" <<EOF
{
  "DEFAULT_INFLUX_SERVER": "http://influxdb:8181",
  "DEFAULT_INFLUX_DATABASE": "$VERCELAB_INFLUXDB_DATABASE",
  "DEFAULT_API_TOKEN": "$VERCELAB_INFLUXDB_TOKEN",
  "DEFAULT_SERVER_NAME": "Vercelab InfluxDB"
}
EOF

  chmod 644 "$config_file"
}

write_env_file() {
  log "Writing $ENV_FILE"

  cat >"$ENV_FILE" <<EOF
NODE_ENV=$NODE_ENV
HOSTNAME=$CONTROL_PLANE_HOSTNAME
PORT=$PORT

VERCELAB_BASE_DOMAIN=$VERCELAB_BASE_DOMAIN
VERCELAB_ADMIN_HOST=$VERCELAB_ADMIN_HOST
VERCELAB_HOST_LAN_IP=$VERCELAB_HOST_LAN_IP
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
VERCELAB_INFLUXDB_EXPLORER_DATA_DIR=$VERCELAB_INFLUXDB_EXPLORER_DATA_DIR
VERCELAB_INFLUXDB_EXPLORER_CONFIG_DIR=$VERCELAB_INFLUXDB_EXPLORER_CONFIG_DIR
VERCELAB_DOCKER_SOCKET_PATH=$VERCELAB_DOCKER_SOCKET_PATH

VERCELAB_DATABASE_PROVIDER=$VERCELAB_DATABASE_PROVIDER
VERCELAB_POSTGRES_URL=$VERCELAB_POSTGRES_URL
VERCELAB_POSTGRES_USER=$VERCELAB_POSTGRES_USER
VERCELAB_POSTGRES_PASSWORD=$VERCELAB_POSTGRES_PASSWORD
VERCELAB_POSTGRES_DB=$VERCELAB_POSTGRES_DB

VERCELAB_INFLUXDB_URL=$VERCELAB_INFLUXDB_URL
VERCELAB_INFLUXDB_DATABASE=$VERCELAB_INFLUXDB_DATABASE
VERCELAB_INFLUXDB_EXPLORER_HOST=$VERCELAB_INFLUXDB_EXPLORER_HOST
VERCELAB_INFLUXDB_EXPLORER_URL=$VERCELAB_INFLUXDB_EXPLORER_URL
VERCELAB_INFLUXDB_EXPLORER_SESSION_SECRET=$VERCELAB_INFLUXDB_EXPLORER_SESSION_SECRET
VERCELAB_INFLUXDB_TOKEN=$VERCELAB_INFLUXDB_TOKEN
VERCELAB_INFLUXDB_RETENTION_DAYS=$VERCELAB_INFLUXDB_RETENTION_DAYS

# macOS: Docker Desktop cannot expose the macOS host shell, so terminal sessions
# run inside the control plane container and metrics read its own /proc.
VERCELAB_TERMINAL_TARGET=$VERCELAB_TERMINAL_TARGET
VERCELAB_HOST_PROC_PATH=$VERCELAB_HOST_PROC_PATH

VERCELAB_ENCRYPTION_SECRET=$VERCELAB_ENCRYPTION_SECRET
VERCELAB_GITHUB_TOKEN=$VERCELAB_GITHUB_TOKEN
EOF

  chmod 600 "$ENV_FILE"
}

# ── Stack lifecycle ──────────────────────────────────────────────────────────
run_compose() {
  (
    cd "$REPO_ROOT"
    "${DOCKER_CMD[@]}" compose "${COMPOSE_ARGS[@]}" "$@"
  )
}

install_host_node_dependencies() {
  command_exists pnpm || fail "pnpm is required to install host dependencies."

  log "Installing pnpm dependencies on the host for local maintenance workflows."

  (
    cd "$REPO_ROOT"
    pnpm install --frozen-lockfile
  ) || fail "pnpm install failed."

  manifest_record "HOST_DEPENDENCIES_INSTALLED=true"
}

run_host_build_smoke_test() {
  if [[ "$SKIP_HOST_BUILD" == true ]]; then
    log "Skipping the host-side production build smoke test (VERCELAB_SKIP_HOST_BUILD=1)."
    return 0
  fi

  log "Running a host-side production build smoke test."
  "$REPO_ROOT/scripts/host-build-smoke.sh" "$REPO_ROOT" \
    || fail "The host production build failed. Fix the build or set VERCELAB_SKIP_HOST_BUILD=1 to skip it."
}

start_stack() {
  local stale_services=()
  local service=""
  local up_args=(-d --build)

  log "Starting the Vercelab control plane stack."

  # Containers left behind by an interrupted start stay in the `created` state
  # and Docker reuses them without wiring their published ports, so recreate
  # exactly those services instead of starting a broken container.
  while IFS= read -r service; do
    if [[ -n "$service" ]]; then
      stale_services[${#stale_services[@]}]="$service"
    fi
  done < <(run_compose ps -a --format '{{.Service}} {{.State}}' 2>/dev/null | awk '$2 == "created" { print $1 }' || true)

  if (( ${#stale_services[@]} > 0 )); then
    log "Recreating containers left over from an interrupted start: ${stale_services[*]}"
    up_args+=(--force-recreate)
    up_args+=("${stale_services[@]}")
  fi

  if ! run_compose up "${up_args[@]}"; then
    docker compose logs --tail=40 control-plane >&2 2>/dev/null || true
    fail "The stack did not start. Inspect it with: docker compose -f docker-compose.yml -f docker-compose.macos.yml logs"
  fi
}

extract_postgres_url_host() {
  local authority="${1#*://}"

  authority="${authority%%/*}"
  authority="${authority##*@}"
  authority="${authority%%:*}"
  printf '%s' "$authority"
}

resolve_postgres_container_ip() {
  run_compose exec -T postgres sh -lc 'getent hosts "$(hostname)" 2>/dev/null || true' \
    | tr -d '\r' \
    | awk '{print $1}' \
    | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' \
    | head -n 1 || true
}

build_credential_probe_url() {
  local url="$1"
  local container_ip="$2"

  if [[ -z "$container_ip" ]]; then
    printf '%s' "$url"
    return 0
  fi

  sed -E "s#@[^/@]+(:[0-9]+)?/#@${container_ip}:5432/#" <<<"$url"
}

wait_for_postgres() {
  local attempt=0

  while (( attempt < 30 )); do
    if run_compose exec -T postgres pg_isready -U "$VERCELAB_POSTGRES_USER" -d "$VERCELAB_POSTGRES_DB" >/dev/null 2>&1; then
      return 0
    fi

    attempt=$(( attempt + 1 ))
    sleep 2
  done

  return 1
}

postgres_url_accepts_credentials() {
  run_compose exec -T postgres psql "$1" -v ON_ERROR_STOP=1 -tAc 'SELECT 1' >/dev/null 2>&1
}

run_postgres_admin_sql() {
  run_compose exec -T postgres psql -U "$VERCELAB_POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 -tAc "$1"
}

escape_postgres_literal() {
  local quote="'"

  printf '%s' "${1//$quote/$quote$quote}"
}

escape_postgres_identifier() {
  local quote='"'

  printf '%s' "${1//$quote/$quote$quote}"
}

ensure_postgres_credentials() {
  local postgres_host=""
  local container_ip=""
  local probe_url=""
  local escaped_user=""
  local escaped_db_name=""
  local user_literal=""
  local db_literal=""
  local password_literal=""

  postgres_host="$(extract_postgres_url_host "$VERCELAB_POSTGRES_URL")"

  if [[ "$postgres_host" != "vercelab-postgres" && "$postgres_host" != "postgres" ]]; then
    log "VERCELAB_POSTGRES_URL targets '${postgres_host}', so the bundled Postgres credential check is skipped."
    return 0
  fi

  log "Verifying that PostgreSQL accepts the credentials in $ENV_FILE."

  if ! wait_for_postgres; then
    fail "PostgreSQL did not become ready in time. Inspect it with: docker compose logs postgres"
  fi

  container_ip="$(resolve_postgres_container_ip)"
  probe_url="$(build_credential_probe_url "$VERCELAB_POSTGRES_URL" "$container_ip")"

  if postgres_url_accepts_credentials "$probe_url"; then
    log "PostgreSQL credentials are valid."
    return 0
  fi

  log "PostgreSQL rejected the credentials in $ENV_FILE. A reused data directory keeps the password it was initialized with."

  escaped_user="$(escape_postgres_identifier "$VERCELAB_POSTGRES_USER")"
  escaped_db_name="$(escape_postgres_identifier "$VERCELAB_POSTGRES_DB")"
  user_literal="$(escape_postgres_literal "$VERCELAB_POSTGRES_USER")"
  db_literal="$(escape_postgres_literal "$VERCELAB_POSTGRES_DB")"
  password_literal="$(escape_postgres_literal "$VERCELAB_POSTGRES_PASSWORD")"

  if [[ "$(run_postgres_admin_sql "SELECT 1 FROM pg_roles WHERE rolname = '${user_literal}'" 2>&1 || true)" != "1" ]]; then
    fail "The data directory at $VERCELAB_POSTGRES_DATA_DIR has no '${VERCELAB_POSTGRES_USER}' role. Point VERCELAB_POSTGRES_USER at the original owner, or move that directory aside and rerun ./install.sh."
  fi

  if ! run_postgres_admin_sql "ALTER ROLE \"${escaped_user}\" WITH LOGIN PASSWORD '${password_literal}'" >/dev/null; then
    fail "Could not update the password for role '${VERCELAB_POSTGRES_USER}'."
  fi

  if [[ "$(run_postgres_admin_sql "SELECT 1 FROM pg_database WHERE datname = '${db_literal}'" 2>&1 || true)" != "1" ]]; then
    if ! run_postgres_admin_sql "CREATE DATABASE \"${escaped_db_name}\" OWNER \"${escaped_user}\"" >/dev/null; then
      fail "Could not create the '${VERCELAB_POSTGRES_DB}' database."
    fi
    log "Created the missing '${VERCELAB_POSTGRES_DB}' database."
  fi

  if ! postgres_url_accepts_credentials "$probe_url"; then
    fail "PostgreSQL still rejects VERCELAB_POSTGRES_URL. Make sure it uses the same user and password as VERCELAB_POSTGRES_USER and VERCELAB_POSTGRES_PASSWORD in $ENV_FILE."
  fi

  log "Restarting the control plane so it reconnects with the reconciled credentials."
  run_compose restart control-plane >/dev/null

  log "PostgreSQL credentials now match $ENV_FILE."
}

ensure_influx_bootstrap() {
  local generated_token=""
  local influx_host="http://127.0.0.1:8181"
  local influx_recovery_host="http://127.0.0.1:8182"
  local retention_period="${VERCELAB_INFLUXDB_RETENTION_DAYS}d"
  local database_list_json=""
  local database_list_compact=""
  local database_create_output=""
  local token_command_output=""

  log "Ensuring the InfluxDB token and metrics database are ready."

  if [[ -z "$VERCELAB_INFLUXDB_TOKEN" ]]; then
    token_command_output="$(run_compose exec -T influxdb sh -lc 'influxdb3 create token --admin --format text 2>&1' || true)"
    generated_token="$(grep -Eo 'apiv3_[A-Za-z0-9_-]+' <<<"$token_command_output" | head -n 1 || true)"

    if [[ -z "$generated_token" ]] && grep -q 'token name already exists' <<<"$token_command_output"; then
      token_command_output="$(run_compose exec -T influxdb sh -lc "printf 'yes\\n' | influxdb3 create token --admin --regenerate --host '$influx_recovery_host' --format text 2>&1" || true)"
      generated_token="$(grep -Eo 'apiv3_[A-Za-z0-9_-]+' <<<"$token_command_output" | head -n 1 || true)"
    fi

    [[ -n "$generated_token" ]] || fail "Unable to create or recover an InfluxDB admin token. Output: $token_command_output"

    VERCELAB_INFLUXDB_TOKEN="$generated_token"
    write_env_file
    write_influx_explorer_config
    log "Generated VERCELAB_INFLUXDB_TOKEN and persisted it to .env"

    run_compose up -d --no-deps control-plane influxdb-explorer >/dev/null || true
  fi

  database_list_json="$(run_compose exec -T influxdb sh -lc "influxdb3 show databases --host '$influx_host' --token '$VERCELAB_INFLUXDB_TOKEN' --format json" 2>&1 || true)"

  if grep -Eqi '401|not authenticated' <<<"$database_list_json"; then
    log "Configured Influx token is invalid; regenerating the admin token."

    token_command_output="$(run_compose exec -T influxdb sh -lc "printf 'yes\\n' | influxdb3 create token --admin --regenerate --host '$influx_recovery_host' --format text 2>&1" || true)"
    generated_token="$(grep -Eo 'apiv3_[A-Za-z0-9_-]+' <<<"$token_command_output" | head -n 1 || true)"

    [[ -n "$generated_token" ]] || fail "Unable to regenerate the InfluxDB admin token. Output: $token_command_output"

    VERCELAB_INFLUXDB_TOKEN="$generated_token"
    write_env_file
    write_influx_explorer_config

    run_compose up -d --no-deps control-plane influxdb-explorer >/dev/null || true

    database_list_json="$(run_compose exec -T influxdb sh -lc "influxdb3 show databases --host '$influx_host' --token '$VERCELAB_INFLUXDB_TOKEN' --format json" 2>&1 || true)"
  fi

  if grep -Eqi '401|not authenticated' <<<"$database_list_json"; then
    fail "Unable to authenticate to InfluxDB with the configured admin token."
  fi

  database_list_compact="${database_list_json//[[:space:]]/}"

  if ! grep -Fq "\"name\":\"$VERCELAB_INFLUXDB_DATABASE\"" <<<"$database_list_compact"; then
    if ! database_create_output="$(run_compose exec -T influxdb sh -lc "influxdb3 create database --host '$influx_host' --token '$VERCELAB_INFLUXDB_TOKEN' --retention-period '$retention_period' '$VERCELAB_INFLUXDB_DATABASE'" 2>&1)"; then
      if ! grep -Fqi 'resource that already exists' <<<"$database_create_output"; then
        fail "Unable to create InfluxDB database $VERCELAB_INFLUXDB_DATABASE. Output: $database_create_output"
      fi
    fi
  fi

  write_influx_explorer_config
  run_compose up -d --no-deps influxdb-explorer >/dev/null || true
}

write_install_manifest() {
  manifest_set "PLATFORM" "macos"
  manifest_set "INSTALLED_AT" "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  manifest_set "INSTALL_ROOT" "$REPO_ROOT"
  manifest_set "HOST_ROOT" "$VERCELAB_HOST_ROOT"
  manifest_set "DATA_ROOT" "$VERCELAB_DATA_ROOT"
  manifest_set "TRAEFIK_DYNAMIC_DIR" "$VERCELAB_TRAEFIK_DYNAMIC_DIR"
  manifest_set "TRAEFIK_CERTS_DIR" "$VERCELAB_TRAEFIK_CERTS_DIR"
  manifest_set "ENV_FILE" "$ENV_FILE"
  manifest_record "COMPOSE_FILE=docker-compose.yml"
  manifest_record "COMPOSE_FILE=docker-compose.macos.yml"
  manifest_set "PNPM_VERSION" "$PNPM_VERSION"
  manifest_record "DIR=$VERCELAB_HOST_ROOT"
  manifest_record "DIR=$VERCELAB_DATA_ROOT"
  manifest_record "DIR=$VERCELAB_TRAEFIK_DYNAMIC_DIR"
  manifest_record "DIR=$VERCELAB_TRAEFIK_CERTS_DIR"
  manifest_record "DIR=$VERCELAB_APPS_DIR"
  manifest_record "DIR=$VERCELAB_LOGS_DIR"
  manifest_record "DIR=$VERCELAB_LOCKS_DIR"
  manifest_record "DIR=$VERCELAB_POSTGRES_DATA_DIR"
  manifest_record "DIR=$VERCELAB_INFLUXDB_DATA_DIR"
  manifest_record "DIR=$VERCELAB_INFLUXDB_EXPLORER_DATA_DIR"
  manifest_record "DIR=$VERCELAB_INFLUXDB_EXPLORER_CONFIG_DIR"
  manifest_finalize
  log "Recorded installed components in $MANIFEST_FILE"
}

print_configuration_review() {
  if [[ "$ASSUME_YES" == true || ! -t 0 ]]; then
    return 0
  fi

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
  printf '   VERCELAB_INFLUX_EXPLORER : %s\n' "$VERCELAB_INFLUXDB_EXPLORER_HOST"
  printf '   VERCELAB_HOST_LAN_IP     : %s\n' "$VERCELAB_HOST_LAN_IP"
  printf '\n'
  printf '%b Storage%b\n' "$C_YELLOW" "$C_RESET"
  printf '   VERCELAB_HOST_ROOT       : %s\n' "$VERCELAB_HOST_ROOT"
  printf '   VERCELAB_DATA_ROOT       : %s\n' "$VERCELAB_DATA_ROOT"
  printf '   VERCELAB_TRAEFIK_CERTS   : %s\n' "$VERCELAB_TRAEFIK_CERTS_DIR"
  printf '   VERCELAB_DOCKER_SOCKET   : %s\n' "$VERCELAB_DOCKER_SOCKET_PATH"
  printf '\n'
  printf '%b Databases%b\n' "$C_YELLOW" "$C_RESET"
  printf '   VERCELAB_POSTGRES_URL     : %s\n' "$VERCELAB_POSTGRES_URL"
  printf '   VERCELAB_INFLUXDB_DATABASE: %s\n' "$VERCELAB_INFLUXDB_DATABASE"
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
  local wildcard_example_url="https://demo.$VERCELAB_BASE_DOMAIN"

  printf '\n'
  printf '%b============================================================%b\n' "$C_GREEN" "$C_RESET"
  printf '%b                 Vercelab Setup Complete (macOS)           %b\n' "$C_BOLD" "$C_RESET"
  printf '%b============================================================%b\n' "$C_GREEN" "$C_RESET"
  printf ' %bDashboard%b   : %s\n' "$C_YELLOW" "$C_RESET" "$dashboard_url"
  printf ' %bInflux UI%b   : %s\n' "$C_YELLOW" "$C_RESET" "$VERCELAB_INFLUXDB_EXPLORER_URL"
  printf ' %bHealth API%b  : %s/api/health\n' "$C_YELLOW" "$C_RESET" "$dashboard_url"
  printf ' %bApp Example%b : %s\n' "$C_YELLOW" "$C_RESET" "$wildcard_example_url"
  printf '\n'
  printf ' %bStorage%b     : %s\n' "$C_YELLOW" "$C_RESET" "$VERCELAB_HOST_ROOT"
  printf ' %bEnv File%b    : %s\n' "$C_YELLOW" "$C_RESET" "$ENV_FILE"
  printf ' %bTLS Cert%b    : %s/wildcard.crt\n' "$C_YELLOW" "$C_RESET" "$VERCELAB_TRAEFIK_CERTS_DIR"
  printf ' %bManifest%b    : %s\n' "$C_YELLOW" "$C_RESET" "$MANIFEST_FILE"
  printf '\n'
  printf ' %bNext%b:\n' "$C_YELLOW" "$C_RESET"
  printf '  1) Trust the wildcard certificate (needs your password):\n'
  printf '     sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain %s/wildcard.crt\n' "$VERCELAB_TRAEFIK_CERTS_DIR"
  printf '  2) Open the Dashboard URL above.\n'
  printf '  3) Remove Vercelab again with ./uninstall.sh (add --purge to delete the storage folder).\n'
  printf '%b============================================================%b\n' "$C_GREEN" "$C_RESET"
}

cleanup() {
  if [[ -n "$MANIFEST_TMP" && -f "$MANIFEST_TMP" ]]; then
    rm -f -- "$MANIFEST_TMP"
  fi
}

main() {
  init_colors
  parse_args "$@"
  if [[ "${VERCELAB_SKIP_HOST_BUILD:-}" == "1" ]]; then
    SKIP_HOST_BUILD=true
  fi

  trap cleanup EXIT
  # Init early: dependency steps below record what they install, and those
  # records must survive into the final manifest.
  manifest_init

  ensure_supported_host
  ensure_repo_layout
  # Fail before touching dependencies if Traefik cannot bind its ports.
  ensure_ports_available || exit 1
  ensure_homebrew
  ensure_git
  ensure_openssl
  ensure_nodejs
  ensure_pnpm
  ensure_docker_desktop
  ensure_docker_compose
  resolve_docker_command

  gather_configuration
  print_configuration_review

  COMPOSE_ARGS=(-f "$COMPOSE_FILE" -f "$MACOS_COMPOSE_FILE")
  validate_docker_socket

  prepare_host_directories
  write_env_file
  write_tls_config
  ensure_certificate
  write_influx_explorer_config

  install_host_node_dependencies
  run_host_build_smoke_test

  write_install_manifest

  start_stack
  ensure_postgres_credentials
  ensure_influx_bootstrap

  print_summary
}

main "$@"
