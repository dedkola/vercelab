#!/usr/bin/env bash

set -euo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly REPO_ROOT="$SCRIPT_DIR"
readonly ENV_FILE="$REPO_ROOT/.env"

PURGE_RUNTIME_STATE=false
PURGE_IMAGES=false
PURGE_ALL=false
ASSUME_YES=false
DOCKER_CLEANUP_SKIPPED=false
HOST_TOOLING_CLEANUP_SKIPPED=false
HOST_TOOLING_CLEANUP_DONE=false

VERCELAB_HOST_ROOT="/opt/vercelab"
VERCELAB_PROXY_NETWORK="vercelab_proxy"

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

run_privileged() {
  "${SUDO[@]}" "$@"
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
Usage: ./uninstall.sh [--purge] [--purge-images] [--all] [--yes]

Stops and removes the Vercelab control plane plus managed deployment containers.

Options:
  --purge         Remove the generated .env file, Vercelab host data, and Vercelab Docker volumes.
  --purge-images  Remove Docker images labeled for Vercelab compose projects.
  --all           Do everything from --purge --purge-images and also remove host tooling installed by install.sh (Docker Engine/Compose plugins, Node.js, pnpm) plus local node_modules/.next.
  --yes           Skip the interactive confirmation prompt.
  --help          Show this help text.

Notes:
  - --all is destructive and removes host tooling used outside this project.
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
      --all)
        PURGE_ALL=true
        PURGE_RUNTIME_STATE=true
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

print_uninstall_review() {
  if [[ "$ASSUME_YES" == true || ! -t 0 ]]; then
    return
  fi

  printf '\n'
  printf '%b============================================================%b\n' "$C_CYAN" "$C_RESET"
  printf '%b                  Vercelab Uninstall Review                 %b\n' "$C_BOLD" "$C_RESET"
  printf '%b============================================================%b\n' "$C_CYAN" "$C_RESET"
  printf ' %bPurge runtime state%b : %s\n' "$C_YELLOW" "$C_RESET" "$PURGE_RUNTIME_STATE"
  printf ' %bPurge images%b        : %s\n' "$C_YELLOW" "$C_RESET" "$PURGE_IMAGES"
  printf ' %bPurge all tooling%b   : %s\n' "$C_YELLOW" "$C_RESET" "$PURGE_ALL"
  printf ' %bEnv file%b            : %s\n' "$C_YELLOW" "$C_RESET" "$ENV_FILE"
  printf ' %bHost root%b           : %s\n' "$C_YELLOW" "$C_RESET" "$VERCELAB_HOST_ROOT"
  printf ' %bProxy network%b       : %s\n' "$C_YELLOW" "$C_RESET" "$VERCELAB_PROXY_NETWORK"
  printf '%b============================================================%b\n' "$C_CYAN" "$C_RESET"
  printf '\n'
}

confirm_uninstall() {
  local answer=""

  if [[ "$ASSUME_YES" == true || ! -t 0 ]]; then
    return
  fi

  print_uninstall_review

  log "This will remove the Vercelab control plane and managed deployment containers."

  if [[ "$PURGE_RUNTIME_STATE" == true ]]; then
    log "It will also remove $ENV_FILE, $VERCELAB_HOST_ROOT, and Vercelab Docker volumes."
  else
    log "It will keep $ENV_FILE, $VERCELAB_HOST_ROOT, and Vercelab Docker volumes."
  fi

  if [[ "$PURGE_IMAGES" == true ]]; then
    log "It will also remove Docker images labeled for Vercelab compose projects."
  fi

  if [[ "$PURGE_ALL" == true ]]; then
    log "It will also remove host tooling installed by install.sh (Docker Engine/Compose, Node.js, pnpm) and local build artifacts (node_modules/.next)."
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

remove_repo_tooling_artifacts() {
  local target=""

  for target in "$REPO_ROOT/node_modules" "$REPO_ROOT/.next"; do
    if [[ -e "$target" ]]; then
      log "Removing local tooling artifact $target"
      run_privileged rm -rf -- "$target"
    fi
  done
}

remove_host_tooling() {
  if [[ "$PURGE_ALL" != true ]]; then
    return
  fi

  if (( ${#SUDO[@]} == 0 )) && [[ ${EUID} -ne 0 ]]; then
    warn "--all requested but sudo is unavailable. Host package cleanup skipped."
    HOST_TOOLING_CLEANUP_SKIPPED=true
    remove_repo_tooling_artifacts
    return
  fi

  log "Removing host tooling installed by install.sh"

  remove_repo_tooling_artifacts

  if command_exists npm; then
    run_privileged npm uninstall -g pnpm >/dev/null 2>&1 || true
  fi

  if command_exists corepack; then
    run_privileged corepack disable >/dev/null 2>&1 || true
  fi

  run_privileged apt-mark unhold docker-ce docker-ce-cli >/dev/null 2>&1 || true

  run_privileged apt-get remove -y --purge \
    docker-ce \
    docker-ce-cli \
    containerd.io \
    docker-buildx-plugin \
    docker-compose-plugin \
    nodejs >/dev/null 2>&1 || true

  run_privileged apt-get autoremove -y >/dev/null 2>&1 || true

  run_privileged rm -f /etc/apt/sources.list.d/docker.list >/dev/null 2>&1 || true
  run_privileged rm -f /etc/apt/sources.list.d/nodesource.list >/dev/null 2>&1 || true
  run_privileged rm -f /etc/apt/keyrings/docker.asc >/dev/null 2>&1 || true
  run_privileged rm -f /etc/apt/keyrings/nodesource.gpg >/dev/null 2>&1 || true
  run_privileged apt-get update >/dev/null 2>&1 || true

  HOST_TOOLING_CLEANUP_DONE=true
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
  printf '\n'
  printf '%b============================================================%b\n' "$C_GREEN" "$C_RESET"
  printf '%b                 Vercelab Uninstall Complete                %b\n' "$C_BOLD" "$C_RESET"
  printf '%b============================================================%b\n' "$C_GREEN" "$C_RESET"

  if [[ "$DOCKER_CLEANUP_SKIPPED" == true ]]; then
    printf ' %bDocker cleanup%b      : skipped (daemon unavailable)\n' "$C_YELLOW" "$C_RESET"
  else
    printf ' %bDocker cleanup%b      : done\n' "$C_YELLOW" "$C_RESET"
  fi

  if [[ "$PURGE_RUNTIME_STATE" == true ]]; then
    printf ' %bRuntime state%b       : purged\n' "$C_YELLOW" "$C_RESET"
  else
    printf ' %bRuntime state%b       : preserved\n' "$C_YELLOW" "$C_RESET"
    printf '   - %s\n' "$ENV_FILE"
    printf '   - %s\n' "$VERCELAB_HOST_ROOT"
  fi

  if [[ "$PURGE_IMAGES" == true ]]; then
    printf ' %bImages%b              : purged when possible\n' "$C_YELLOW" "$C_RESET"
  else
    printf ' %bImages%b              : preserved\n' "$C_YELLOW" "$C_RESET"
  fi

  printf '\n'

  if [[ "$PURGE_ALL" != true ]]; then
    printf ' %bHost tooling kept%b   : Docker Engine, Compose plugin, Node.js, pnpm\n' "$C_YELLOW" "$C_RESET"
  elif [[ "$HOST_TOOLING_CLEANUP_DONE" == true ]]; then
    printf ' %bHost tooling%b        : removed (Docker Engine/Compose, Node.js, pnpm, local node_modules/.next)\n' "$C_YELLOW" "$C_RESET"
  else
    printf ' %bHost tooling%b        : cleanup skipped or partial (check warnings above)\n' "$C_YELLOW" "$C_RESET"
  fi

  printf '%b============================================================%b\n' "$C_GREEN" "$C_RESET"
}

main() {
  init_colors
  parse_args "$@"
  ensure_sudo_if_available
  load_configuration
  resolve_docker_command
  confirm_uninstall
  remove_docker_resources
  remove_runtime_state
  remove_host_tooling
  print_summary
}

main "$@"