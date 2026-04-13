#!/usr/bin/env bash

set -euo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly REPO_ROOT="$SCRIPT_DIR"
readonly ENV_FILE="$REPO_ROOT/.env"

PURGE_RUNTIME_STATE=false
PURGE_IMAGES=false
ASSUME_YES=false
DOCKER_CLEANUP_SKIPPED=false

VERCELAB_HOST_ROOT="/opt/vercelab"
VERCELAB_PROXY_NETWORK="vercelab_proxy"

SUDO=()
DOCKER_CMD=()

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

run_privileged() {
  "${SUDO[@]}" "$@"
}

read_env_value() {
  local key="$1"
  local value=""

  if [[ ! -f "$ENV_FILE" ]]; then
    return 0
  fi

  value="$(grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | tail -n 1 | cut -d= -f2- || true)"
  printf '%s' "$value"
}

read_first_env_value() {
  local key=""
  local value=""

  for key in "$@"; do
    value="$(read_env_value "$key")"

    if [[ -n "$value" ]]; then
      printf '%s' "$value"
      return 0
    fi
  done

  return 0
}

ensure_sudo_if_available() {
  if [[ ${EUID} -eq 0 ]]; then
    return
  fi

  if command_exists sudo; then
    SUDO=(sudo)
  fi
}

resolve_docker_command() {
  if ! command_exists docker; then
    warn "Docker is not installed. Docker cleanup will be skipped."
    DOCKER_CLEANUP_SKIPPED=true
    return
  fi

  if docker info >/dev/null 2>&1; then
    DOCKER_CMD=(docker)
    return
  fi

  if (( ${#SUDO[@]} > 0 )) && sudo docker info >/dev/null 2>&1; then
    DOCKER_CMD=(sudo docker)
    return
  fi

  warn "Docker is installed but the daemon is not reachable. Docker cleanup will be skipped."
  DOCKER_CLEANUP_SKIPPED=true
}

print_usage() {
  cat <<'EOF'
Usage: ./uninstall.sh [--purge] [--purge-images] [--yes]

Stops and removes the Vercelab control plane plus managed deployment containers.

Options:
  --purge         Remove the generated .env file, Vercelab host data, and Vercelab Docker volumes.
  --purge-images  Remove Docker images labeled for Vercelab compose projects.
  --yes           Skip the interactive confirmation prompt.
  --help          Show this help text.

Notes:
  - Docker Engine, the Docker Compose plugin, Node.js, and pnpm are left installed on the host.
  - Without --purge, the generated .env file, database, certificates, cloned apps, and Docker volumes are preserved.
EOF
}

parse_args() {
  while (( $# > 0 )); do
    case "$1" in
      --purge)
        PURGE_RUNTIME_STATE=true
        ;;
      --purge-images)
        PURGE_IMAGES=true
        ;;
      --yes)
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

load_configuration() {
  local existing_host_root existing_proxy_network

  existing_host_root="$(read_first_env_value VERCELAB_HOST_ROOT)"
  existing_proxy_network="$(read_first_env_value VERCELAB_PROXY_NETWORK)"

  VERCELAB_HOST_ROOT="${VERCELAB_HOST_ROOT:-${existing_host_root:-/opt/vercelab}}"
  VERCELAB_PROXY_NETWORK="${VERCELAB_PROXY_NETWORK:-${existing_proxy_network:-vercelab_proxy}}"
}

confirm_uninstall() {
  local answer=""

  if [[ "$ASSUME_YES" == true || ! -t 0 ]]; then
    return
  fi

  log "This will remove the Vercelab control plane and managed deployment containers."

  if [[ "$PURGE_RUNTIME_STATE" == true ]]; then
    log "It will also remove $ENV_FILE, $VERCELAB_HOST_ROOT, and Vercelab Docker volumes."
  else
    log "It will keep $ENV_FILE, $VERCELAB_HOST_ROOT, and Vercelab Docker volumes."
  fi

  if [[ "$PURGE_IMAGES" == true ]]; then
    log "It will also remove Docker images labeled for Vercelab compose projects."
  fi

  printf 'Continue? [y/N]: '
  read -r answer || true

  case "$answer" in
    y|Y|yes|YES)
      ;;
    *)
      fail "Uninstall cancelled."
      ;;
  esac
}

collect_projects_from_ids() {
  local inspect_kind="$1"

  shift

  if (( $# == 0 )); then
    return 0
  fi

  case "$inspect_kind" in
    container)
      "${DOCKER_CMD[@]}" inspect -f '{{ index .Config.Labels "com.docker.compose.project" }}' "$@" 2>/dev/null || true
      ;;
    network)
      "${DOCKER_CMD[@]}" network inspect -f '{{ index .Labels "com.docker.compose.project" }}' "$@" 2>/dev/null || true
      ;;
    volume)
      "${DOCKER_CMD[@]}" volume inspect -f '{{ index .Labels "com.docker.compose.project" }}' "$@" 2>/dev/null || true
      ;;
    *)
      fail "Unknown inspect kind: $inspect_kind"
      ;;
  esac
}

list_vercelab_projects() {
  local container_ids=()
  local network_ids=()
  local volume_ids=()
  local projects=()

  mapfile -t container_ids < <("${DOCKER_CMD[@]}" ps -aq --filter label=com.docker.compose.project)
  mapfile -t network_ids < <("${DOCKER_CMD[@]}" network ls -q --filter label=com.docker.compose.project)
  mapfile -t volume_ids < <("${DOCKER_CMD[@]}" volume ls -q --filter label=com.docker.compose.project)

  mapfile -t projects < <(
    {
      collect_projects_from_ids container "${container_ids[@]}"
      collect_projects_from_ids network "${network_ids[@]}"
      collect_projects_from_ids volume "${volume_ids[@]}"
    } | awk '/^vercelab($|-)/' | sort -u
  )

  printf '%s\n' "${projects[@]}"
}

remove_resources_by_label() {
  local resource_type="$1"
  local project="$2"
  local ids=()

  case "$resource_type" in
    container)
      mapfile -t ids < <("${DOCKER_CMD[@]}" ps -aq --filter "label=com.docker.compose.project=$project")

      if (( ${#ids[@]} > 0 )); then
        log "Removing containers for compose project $project"
        "${DOCKER_CMD[@]}" rm -f "${ids[@]}" >/dev/null
      fi
      ;;
    network)
      mapfile -t ids < <("${DOCKER_CMD[@]}" network ls -q --filter "label=com.docker.compose.project=$project")

      if (( ${#ids[@]} > 0 )); then
        log "Removing networks for compose project $project"
        "${DOCKER_CMD[@]}" network rm "${ids[@]}" >/dev/null 2>&1 || true
      fi
      ;;
    volume)
      mapfile -t ids < <("${DOCKER_CMD[@]}" volume ls -q --filter "label=com.docker.compose.project=$project")

      if (( ${#ids[@]} > 0 )); then
        log "Removing volumes for compose project $project"
        "${DOCKER_CMD[@]}" volume rm -f "${ids[@]}" >/dev/null 2>&1 || true
      fi
      ;;
    image)
      mapfile -t ids < <("${DOCKER_CMD[@]}" image ls -q --filter "label=com.docker.compose.project=$project" | awk '!seen[$0]++')

      if (( ${#ids[@]} > 0 )); then
        log "Removing images for compose project $project"
        "${DOCKER_CMD[@]}" rmi -f "${ids[@]}" >/dev/null 2>&1 || true
      fi
      ;;
    *)
      fail "Unknown resource type: $resource_type"
      ;;
  esac
}

remove_project() {
  local project="$1"

  remove_resources_by_label container "$project"
  remove_resources_by_label network "$project"

  if [[ "$PURGE_RUNTIME_STATE" == true ]]; then
    remove_resources_by_label volume "$project"
  fi

  if [[ "$PURGE_IMAGES" == true ]]; then
    remove_resources_by_label image "$project"
  fi
}

remove_proxy_network() {
  if (( ${#DOCKER_CMD[@]} == 0 )); then
    return
  fi

  if "${DOCKER_CMD[@]}" network inspect "$VERCELAB_PROXY_NETWORK" >/dev/null 2>&1; then
    log "Removing proxy network $VERCELAB_PROXY_NETWORK"
    "${DOCKER_CMD[@]}" network rm "$VERCELAB_PROXY_NETWORK" >/dev/null 2>&1 || true
  fi
}

validate_removal_path() {
  local target="$1"
  local label="$2"

  [[ -n "$target" ]] || fail "$label is empty. Refusing to remove it."
  [[ "$target" = /* ]] || fail "$label must be an absolute path."
  [[ "$target" != "/" ]] || fail "$label resolved to /. Refusing to remove it."
}

remove_runtime_state() {
  if [[ "$PURGE_RUNTIME_STATE" != true ]]; then
    return
  fi

  validate_removal_path "$VERCELAB_HOST_ROOT" "VERCELAB_HOST_ROOT"

  if [[ -e "$VERCELAB_HOST_ROOT" ]]; then
    log "Removing host data at $VERCELAB_HOST_ROOT"
    run_privileged rm -rf -- "$VERCELAB_HOST_ROOT"
  fi

  if [[ -f "$ENV_FILE" ]]; then
    log "Removing generated environment file $ENV_FILE"
    run_privileged rm -f -- "$ENV_FILE"
  fi
}

remove_docker_resources() {
  local projects=()
  local project=""

  if (( ${#DOCKER_CMD[@]} == 0 )); then
    return
  fi

  mapfile -t projects < <(list_vercelab_projects)

  if (( ${#projects[@]} == 0 )); then
    log "No Vercelab Docker Compose projects were found."
    remove_proxy_network
    return
  fi

  for project in "${projects[@]}"; do
    if [[ "$project" != "vercelab" ]]; then
      remove_project "$project"
    fi
  done

  for project in "${projects[@]}"; do
    if [[ "$project" == "vercelab" ]]; then
      remove_project "$project"
    fi
  done

  remove_proxy_network
}

print_summary() {
  if [[ "$PURGE_RUNTIME_STATE" == true ]]; then
    log "Vercelab has been removed from this host."
  else
    log "Vercelab containers have been removed, but runtime data was preserved."
    log "Preserved state remains in $ENV_FILE and under $VERCELAB_HOST_ROOT."
  fi

  if [[ "$PURGE_IMAGES" == true ]]; then
    log "Docker images labeled for Vercelab compose projects were also removed when possible."
  fi

  if [[ "$DOCKER_CLEANUP_SKIPPED" == true ]]; then
    warn "Docker cleanup was skipped. Any remaining Vercelab containers, networks, volumes, or images must be removed manually."
  fi

  log "Docker Engine, the Docker Compose plugin, Node.js, and pnpm were left installed on the host."
}

main() {
  parse_args "$@"
  ensure_sudo_if_available
  load_configuration
  resolve_docker_command
  confirm_uninstall
  remove_docker_resources
  remove_runtime_state
  print_summary
}

main "$@"