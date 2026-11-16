#!/usr/bin/env bash

set -euo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly REPO_ROOT="$SCRIPT_DIR"
readonly ENV_FILE="$REPO_ROOT/.env"
readonly MANIFEST_FILE="$REPO_ROOT/.vercelab-install-manifest"

# Volumes Compose creates from an explicit `name:` in a compose file. They carry
# the project label too, but they are also removed by name in case it was lost.
readonly KNOWN_VOLUMES=("vercelab-influxdb-explorer-data")

PURGE_RUNTIME_STATE=false
PURGE_IMAGES=false
PURGE_ALL=false
REMOVE_DOCKER=false
ASSUME_YES=false

DOCKER_CLEANUP_SKIPPED=false
HOST_TOOLING_CLEANUP_DONE=false
HOST_TOOLING_CLEANUP_SKIPPED=false
MANIFEST_PRESENT=false

PLATFORM="$(uname -s)"
IS_MACOS=false

VERCELAB_HOST_ROOT=""
VERCELAB_DATA_ROOT=""
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

# Removes a path, escalating only when the current user cannot write to it.
run_destructive() {
  local target="${!#}"

  if [[ ${EUID} -eq 0 ]]; then
    "$@"
    return
  fi

  if [[ -z "$target" ]] || [[ -w "$(dirname -- "$target")" ]]; then
    "$@"
    return
  fi

  if (( ${#SUDO[@]} > 0 )); then
    "${SUDO[@]}" "$@"
    return
  fi

  "$@"
}

# ── Configuration readers ────────────────────────────────────────────────────
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

# Single-value manifest key ("" when the manifest or the key is missing).
manifest_value() {
  local key="$1"

  if [[ ! -f "$MANIFEST_FILE" ]]; then
    return 0
  fi

  grep "^${key}=" "$MANIFEST_FILE" 2>/dev/null | tail -n 1 | cut -d= -f2- | tr -d '\r' || true
}

# Repeatable manifest key, one value per line, duplicates removed.
manifest_values() {
  local key="$1"

  if [[ ! -f "$MANIFEST_FILE" ]]; then
    return 0
  fi

  grep "^${key}=" "$MANIFEST_FILE" 2>/dev/null | cut -d= -f2- | tr -d '\r' | awk '!seen[$0]++' || true
}

manifest_flag() {
  [[ "$(manifest_value "$1")" == "true" ]]
}

default_host_root() {
  if [[ "$IS_MACOS" == true ]]; then
    printf '%s/vercelab' "${HOME%/}"
    return 0
  fi

  printf '/opt/vercelab'
}

platform_name() {
  if [[ "$IS_MACOS" == true ]]; then
    printf 'macOS'
    return 0
  fi

  printf 'Linux'
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
Usage: ./uninstall.sh [--purge] [--purge-images] [--all] [options]

Stops and removes the Vercelab control plane plus managed deployment containers.
Only artifacts recorded by install.sh / install-macos.sh are ever removed.

Options:
  --purge          Remove the storage folders the installer created (data, database,
                   certificates, apps, logs) and the generated .env file.
  --purge-images   Remove Docker images labeled for Vercelab compose projects.
  --all            Everything from --purge --purge-images, plus the host tooling the
                   installer installed (Node.js, pnpm, Homebrew formulas) and local
                   build artifacts (node_modules/.next). Docker is kept.
  --remove-docker  Linux only: also remove the Docker Engine packages install.sh added.
                   Never implied by --all. Docker Desktop on macOS is always kept.
  --yes            Skip the interactive confirmation prompt.
  --help           Show this help text.

Never removed:
  - Docker / Docker Desktop (use --remove-docker on Linux, or remove the macOS app yourself).
  - Homebrew itself, git, curl, or anything that existed before the install.
  - This git checkout, even when it doubles as the storage folder (~/vercelab).

Without --purge the .env file, storage folders, database, and Docker volumes are kept.
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
      --remove-docker)
        REMOVE_DOCKER=true
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
  local env_host_root env_data_root env_proxy_network
  local manifest_host_root manifest_data_root

  env_host_root="$(read_first_env_value VERCELAB_HOST_ROOT)"
  env_data_root="$(read_first_env_value VERCELAB_DATA_ROOT)"
  env_proxy_network="$(read_first_env_value VERCELAB_PROXY_NETWORK)"

  manifest_host_root="$(manifest_value HOST_ROOT)"
  manifest_data_root="$(manifest_value DATA_ROOT)"

  VERCELAB_HOST_ROOT="${VERCELAB_HOST_ROOT:-${manifest_host_root:-${env_host_root:-$(default_host_root)}}}"
  VERCELAB_DATA_ROOT="${VERCELAB_DATA_ROOT:-${manifest_data_root:-${env_data_root:-}}}"
  VERCELAB_PROXY_NETWORK="${VERCELAB_PROXY_NETWORK:-${env_proxy_network:-vercelab_proxy}}"

  if [[ -f "$MANIFEST_FILE" ]]; then
    MANIFEST_PRESENT=true
  fi
}

print_uninstall_review() {
  local manifest_state="missing (falling back to .env)"

  if [[ "$ASSUME_YES" == true || ! -t 0 ]]; then
    return
  fi

  if [[ "$MANIFEST_PRESENT" == true ]]; then
    manifest_state="present"
  fi

  printf '\n'
  printf '%b============================================================%b\n' "$C_CYAN" "$C_RESET"
  printf '%b                  Vercelab Uninstall Review                 %b\n' "$C_BOLD" "$C_RESET"
  printf '%b============================================================%b\n' "$C_CYAN" "$C_RESET"
  printf ' %bPlatform%b             : %s\n' "$C_YELLOW" "$C_RESET" "$(platform_name)"
  printf ' %bPurge runtime state%b  : %s\n' "$C_YELLOW" "$C_RESET" "$PURGE_RUNTIME_STATE"
  printf ' %bPurge images%b         : %s\n' "$C_YELLOW" "$C_RESET" "$PURGE_IMAGES"
  printf ' %bPurge host tooling%b   : %s\n' "$C_YELLOW" "$C_RESET" "$PURGE_ALL"
  printf ' %bRemove Docker%b        : %s (never implied by --all)\n' "$C_YELLOW" "$C_RESET" "$REMOVE_DOCKER"
  printf ' %bEnv file%b             : %s\n' "$C_YELLOW" "$C_RESET" "$ENV_FILE"
  printf ' %bStorage folder%b       : %s\n' "$C_YELLOW" "$C_RESET" "$VERCELAB_HOST_ROOT"
  printf ' %bInstall manifest%b     : %s\n' "$C_YELLOW" "$C_RESET" "$manifest_state"
  printf ' %bProxy network%b        : %s\n' "$C_YELLOW" "$C_RESET" "$VERCELAB_PROXY_NETWORK"
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
    log "It will also remove the storage folders the installer created and $ENV_FILE."
  else
    log "It will keep the storage folders, the database, and $ENV_FILE."
  fi

  if [[ "$PURGE_IMAGES" == true ]]; then
    log "It will also remove Docker images labeled for Vercelab compose projects."
  fi

  if [[ "$PURGE_ALL" == true ]]; then
    log "It will also remove host tooling recorded as installed by the installer (Node.js, pnpm, Homebrew formulas) and local build artifacts."
  fi

  log "Docker is never removed by this script."

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

# ── Docker cleanup ───────────────────────────────────────────────────────────
docker_ids() {
  local resource_type="$1"

  shift

  case "$resource_type" in
    container)
      "${DOCKER_CMD[@]}" ps -aq "$@" 2>/dev/null || true
      ;;
    network)
      "${DOCKER_CMD[@]}" network ls -q "$@" 2>/dev/null || true
      ;;
    volume)
      "${DOCKER_CMD[@]}" volume ls -q "$@" 2>/dev/null || true
      ;;
    image)
      "${DOCKER_CMD[@]}" image ls -q "$@" 2>/dev/null | awk '!seen[$0]++' || true
      ;;
    *)
      fail "Unknown resource type: $resource_type"
      ;;
  esac
}

collect_ids() {
  local resource_type="$1"

  shift

  local id=""
  local collected=()

  while IFS= read -r id; do
    if [[ -n "$id" ]]; then
      collected[${#collected[@]}]="$id"
    fi
  done < <(docker_ids "$resource_type" "$@")

  if (( ${#collected[@]} > 0 )); then
    printf '%s\n' "${collected[@]}"
  fi
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
  local id=""

  while IFS= read -r id; do
    if [[ -n "$id" ]]; then
      container_ids[${#container_ids[@]}]="$id"
    fi
  done < <(docker_ids container --filter label=com.docker.compose.project)

  while IFS= read -r id; do
    if [[ -n "$id" ]]; then
      network_ids[${#network_ids[@]}]="$id"
    fi
  done < <(docker_ids network --filter label=com.docker.compose.project)

  while IFS= read -r id; do
    if [[ -n "$id" ]]; then
      volume_ids[${#volume_ids[@]}]="$id"
    fi
  done < <(docker_ids volume --filter label=com.docker.compose.project)

  {
    if (( ${#container_ids[@]} > 0 )); then
      collect_projects_from_ids container "${container_ids[@]}"
    fi

    if (( ${#network_ids[@]} > 0 )); then
      collect_projects_from_ids network "${network_ids[@]}"
    fi

    if (( ${#volume_ids[@]} > 0 )); then
      collect_projects_from_ids volume "${volume_ids[@]}"
    fi
  } | awk '/^vercelab($|-)/' | sort -u
}

remove_resources_by_label() {
  local resource_type="$1"
  local project="$2"
  local ids=()
  local id=""

  while IFS= read -r id; do
    if [[ -n "$id" ]]; then
      ids[${#ids[@]}]="$id"
    fi
  done < <(collect_ids "$resource_type" --filter "label=com.docker.compose.project=$project")

  if (( ${#ids[@]} == 0 )); then
    return 0
  fi

  case "$resource_type" in
    container)
      log "Removing containers for compose project $project"
      "${DOCKER_CMD[@]}" rm -f "${ids[@]}" >/dev/null || true
      ;;
    network)
      log "Removing networks for compose project $project"
      "${DOCKER_CMD[@]}" network rm "${ids[@]}" >/dev/null 2>&1 || true
      ;;
    volume)
      log "Removing volumes for compose project $project"
      "${DOCKER_CMD[@]}" volume rm -f "${ids[@]}" >/dev/null 2>&1 || true
      ;;
    image)
      log "Removing images for compose project $project"
      "${DOCKER_CMD[@]}" rmi -f "${ids[@]}" >/dev/null 2>&1 || true
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

remove_known_volumes() {
  local volume_name=""

  if [[ "$PURGE_RUNTIME_STATE" != true ]] || (( ${#DOCKER_CMD[@]} == 0 )); then
    return
  fi

  for volume_name in "${KNOWN_VOLUMES[@]}"; do
    if "${DOCKER_CMD[@]}" volume inspect "$volume_name" >/dev/null 2>&1; then
      log "Removing Docker volume $volume_name"
      "${DOCKER_CMD[@]}" volume rm -f "$volume_name" >/dev/null 2>&1 || true
    fi
  done
}

remove_docker_resources() {
  local projects=()
  local project=""
  local pass=""

  if (( ${#DOCKER_CMD[@]} == 0 )); then
    return
  fi

  while IFS= read -r project; do
    if [[ -n "$project" ]]; then
      projects[${#projects[@]}]="$project"
    fi
  done < <(list_vercelab_projects)

  if (( ${#projects[@]} == 0 )); then
    log "No Vercelab Docker Compose projects were found."
    remove_proxy_network
    remove_known_volumes
    return
  fi

  # The base "vercelab" project goes last so deployment projects can still use
  # the shared networks while they are being removed.
  for pass in other base; do
    for project in "${projects[@]}"; do
      if [[ "$pass" == "other" && "$project" == "vercelab" ]]; then
        continue
      fi

      if [[ "$pass" == "base" && "$project" != "vercelab" ]]; then
        continue
      fi

      remove_project "$project"
    done
  done

  remove_proxy_network
  remove_known_volumes
}

# ── Filesystem cleanup ───────────────────────────────────────────────────────
# Removal targets have to be specific absolute paths: "/", "/Users", or "$HOME"
# itself are never valid.
path_is_specific() {
  local target="$1"

  [[ -n "$target" ]] || return 1
  [[ "$target" == /* ]] || return 1
  [[ "$target" != "/" ]] || return 1
  [[ "${target#/}" == */* ]] || return 1
  return 0
}

# True when $1 is $2 itself or one of its parents.
path_contains() {
  local ancestor="${1%/}"
  local child="${2%/}"

  [[ -n "$ancestor" && -n "$child" ]] || return 1
  [[ "$ancestor" == "$child" ]] && return 0
  [[ "$child" == "$ancestor"/* ]] && return 0
  return 1
}

remove_installed_dir() {
  local target="${1%/}"
  local label="${2:-installed path}"

  if ! path_is_specific "$target"; then
    warn "Skipping $label: '$target' is not a specific absolute path."
    return 0
  fi

  if path_contains "$target" "${HOME:-/nonexistent}"; then
    warn "Skipping $label: '$target' contains your home directory."
    return 0
  fi

  if path_contains "$target" "$REPO_ROOT"; then
    # The default macOS layout stores data inside the install folder, so the
    # checkout is protected rather than removed.
    warn "Keeping $target: it contains this checkout ($REPO_ROOT)."
    return 0
  fi

  if [[ ! -e "$target" ]]; then
    return 0
  fi

  log "Removing $label $target"

  if ! run_destructive rm -rf -- "$target"; then
    warn "Could not remove $target (permission denied)."
  fi
}

# Directories to remove on --purge: everything the manifest recorded, plus the
# paths older installers wrote into .env.
installed_directories() {
  local dir=""
  local manifest_has_dirs=false

  while IFS= read -r dir; do
    if [[ -n "$dir" ]]; then
      manifest_has_dirs=true
      printf '%s\n' "$dir"
    fi
  done < <(manifest_values DIR)

  if [[ "$manifest_has_dirs" == true ]]; then
    return 0
  fi

  if [[ -n "${VERCELAB_DATA_ROOT:-}" ]]; then
    printf '%s\n' "$VERCELAB_DATA_ROOT"
    printf '%s\n' "$VERCELAB_DATA_ROOT/apps"
    printf '%s\n' "$VERCELAB_DATA_ROOT/logs"
    printf '%s\n' "$VERCELAB_DATA_ROOT/locks"
    printf '%s\n' "$VERCELAB_DATA_ROOT/postgres"
    printf '%s\n' "$VERCELAB_DATA_ROOT/influxdb"
    printf '%s\n' "$VERCELAB_DATA_ROOT/influxdb-explorer"
    printf '%s\n' "$VERCELAB_DATA_ROOT/influxdb-explorer-config"
  fi

  if [[ -n "${VERCELAB_HOST_ROOT:-}" ]]; then
    printf '%s\n' "$VERCELAB_HOST_ROOT/traefik/dynamic"
    printf '%s\n' "$VERCELAB_HOST_ROOT/traefik/certs"
    printf '%s\n' "$VERCELAB_HOST_ROOT/traefik"
  fi
}

remove_storage_directories() {
  local dir=""

  while IFS= read -r dir; do
    if [[ -n "$dir" ]]; then
      remove_installed_dir "$dir" "storage directory"
    fi
  done < <(installed_directories | awk '!seen[$0]++')
}

remove_env_file() {
  if [[ ! -f "$ENV_FILE" ]]; then
    return 0
  fi

  log "Removing generated environment file $ENV_FILE"

  if ! run_destructive rm -f -- "$ENV_FILE"; then
    warn "Could not remove $ENV_FILE."
  fi
}

remove_manifest_file() {
  if [[ ! -f "$MANIFEST_FILE" ]]; then
    return 0
  fi

  log "Removing install manifest $MANIFEST_FILE"

  if ! run_destructive rm -f -- "$MANIFEST_FILE"; then
    warn "Could not remove $MANIFEST_FILE."
  fi
}

# Removes the storage folder itself only when it is empty and is not the checkout.
remove_empty_host_root() {
  local target="${VERCELAB_HOST_ROOT%/}"

  if [[ -z "$target" ]] || [[ ! -d "$target" ]]; then
    return 0
  fi

  if ! path_is_specific "$target"; then
    return 0
  fi

  if path_contains "$target" "${HOME:-/nonexistent}" || path_contains "$target" "$REPO_ROOT"; then
    return 0
  fi

  if rmdir -- "$target" 2>/dev/null; then
    log "Removed empty storage folder $target"
  else
    log "Keeping $target: it is not empty."
  fi
}

remove_runtime_state() {
  if [[ "$PURGE_RUNTIME_STATE" != true ]]; then
    return
  fi

  remove_storage_directories
  remove_env_file

  # Folders that existed only to hold the removed directories go too, but only
  # once they are empty.
  if [[ -n "${VERCELAB_DATA_ROOT:-}" ]]; then
    rmdir -- "${VERCELAB_DATA_ROOT%/}" 2>/dev/null || true
  fi

  if [[ -n "${VERCELAB_HOST_ROOT:-}" ]]; then
    rmdir -- "${VERCELAB_HOST_ROOT%/}/traefik" 2>/dev/null || true
  fi

  remove_empty_host_root
}

# ── Host tooling cleanup ─────────────────────────────────────────────────────
remove_repo_tooling_artifacts() {
  local target=""

  for target in "$REPO_ROOT/node_modules" "$REPO_ROOT/.next"; do
    if [[ -e "$target" ]]; then
      log "Removing local build artifact $target"

      if ! run_destructive rm -rf -- "$target"; then
        warn "Could not remove $target."
      fi
    fi
  done
}

remove_macos_host_tooling() {
  local formula=""
  local pnpm_prefix=""

  if manifest_flag PNPM_INSTALLED; then
    if command_exists npm; then
      log "Removing pnpm installed by the installer"
      npm uninstall -g pnpm >/dev/null 2>&1 || warn "Could not remove the global pnpm package."
    else
      warn "npm is unavailable; remove pnpm manually."
    fi
  fi

  pnpm_prefix="$(manifest_value PNPM_PREFIX)"

  if [[ -n "$pnpm_prefix" ]]; then
    remove_installed_dir "$pnpm_prefix/bin/pnpm" "pnpm binary"
    remove_installed_dir "$pnpm_prefix/bin/pnpx" "pnpx binary"

    # The npm prefix only existed for that global install.
    rmdir -- "$pnpm_prefix/bin" 2>/dev/null || true
    rmdir -- "$pnpm_prefix" 2>/dev/null || true
  fi

  if ! command_exists brew; then
    warn "Homebrew is unavailable; recorded formulas cannot be removed automatically."
    return 0
  fi

  while IFS= read -r formula; do
    if [[ -z "$formula" ]]; then
      continue
    fi

    if brew list --formula "$formula" >/dev/null 2>&1; then
      log "Removing Homebrew formula $formula installed by the installer"
      brew uninstall --formula "$formula" >/dev/null 2>&1 || warn "Could not uninstall Homebrew formula $formula."
    fi
  done < <(manifest_values BREW_FORMULA)

  # Homebrew and Docker Desktop are shared infrastructure: they stay, with a
  # pointer on how to remove them by hand.
  if manifest_flag HOMEBREW_INSTALLED; then
    log "Homebrew was installed by this installer and is kept; other tools depend on it."
    log "Remove it yourself with: /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/uninstall.sh)\""
  fi

  if manifest_flag DOCKER_DESKTOP_INSTALLED; then
    log "Docker Desktop was installed by this installer and is kept."
  fi

  HOST_TOOLING_CLEANUP_DONE=true
}

remove_linux_host_tooling() {
  if (( ${#SUDO[@]} == 0 )) && [[ ${EUID} -ne 0 ]]; then
    warn "--all requested but sudo is unavailable. Host package cleanup skipped."
    HOST_TOOLING_CLEANUP_SKIPPED=true
    return 0
  fi

  if command_exists npm; then
    log "Removing pnpm installed by the installer"
    run_privileged npm uninstall -g pnpm >/dev/null 2>&1 || true
  fi

  if command_exists corepack; then
    run_privileged corepack disable >/dev/null 2>&1 || true
  fi

  # install.sh installs Node.js from the NodeSource repository. Docker is not
  # touched here: it needs the explicit --remove-docker flag.
  log "Removing Node.js installed by install.sh"
  run_privileged apt-mark unhold nodejs >/dev/null 2>&1 || true
  run_privileged apt-get remove -y --purge nodejs >/dev/null 2>&1 || true
  run_privileged rm -f /etc/apt/sources.list.d/nodesource.list >/dev/null 2>&1 || true
  run_privileged rm -f /etc/apt/keyrings/nodesource.gpg >/dev/null 2>&1 || true
  run_privileged apt-get update >/dev/null 2>&1 || true

  HOST_TOOLING_CLEANUP_DONE=true
}

remove_host_tooling() {
  if [[ "$PURGE_ALL" != true ]]; then
    return
  fi

  log "Removing host tooling installed by the installer"
  remove_repo_tooling_artifacts

  if [[ "$IS_MACOS" == true ]]; then
    remove_macos_host_tooling
  else
    remove_linux_host_tooling
  fi
}

remove_docker_engine() {
  if [[ "$REMOVE_DOCKER" != true ]]; then
    return
  fi

  if [[ "$IS_MACOS" == true ]]; then
    warn "Docker Desktop is never removed by uninstall.sh."
    log "To remove it yourself: quit Docker Desktop, then move it from /Applications to the Trash."
    return 0
  fi

  if (( ${#SUDO[@]} == 0 )) && [[ ${EUID} -ne 0 ]]; then
    warn "--remove-docker requested but sudo is unavailable. Docker cleanup skipped."
    return 0
  fi

  log "Removing Docker Engine packages installed by install.sh"

  run_privileged apt-mark unhold docker-ce docker-ce-cli >/dev/null 2>&1 || true
  run_privileged apt-get remove -y --purge \
    docker-ce \
    docker-ce-cli \
    containerd.io \
    docker-buildx-plugin \
    docker-compose-plugin >/dev/null 2>&1 || true
  run_privileged apt-get autoremove -y >/dev/null 2>&1 || true
  run_privileged rm -f /etc/apt/sources.list.d/docker.list >/dev/null 2>&1 || true
  run_privileged rm -f /etc/apt/keyrings/docker.asc >/dev/null 2>&1 || true
  run_privileged apt-get update >/dev/null 2>&1 || true
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
    printf ' %bRuntime state%b       : purged (installer-created paths only)\n' "$C_YELLOW" "$C_RESET"
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

  if [[ "$PURGE_ALL" != true ]]; then
    printf ' %bHost tooling%b        : kept (Node.js, pnpm, Homebrew formulas)\n' "$C_YELLOW" "$C_RESET"
  elif [[ "$HOST_TOOLING_CLEANUP_DONE" == true ]]; then
    printf ' %bHost tooling%b        : removed (only what the installer added)\n' "$C_YELLOW" "$C_RESET"
  else
    printf ' %bHost tooling%b        : cleanup skipped or partial (check warnings above)\n' "$C_YELLOW" "$C_RESET"
  fi

  if [[ "$REMOVE_DOCKER" == true && "$IS_MACOS" != true ]]; then
    printf ' %bDocker Engine%b       : removed (--remove-docker)\n' "$C_YELLOW" "$C_RESET"
  else
    printf ' %bDocker%b              : kept\n' "$C_YELLOW" "$C_RESET"
  fi

  printf ' %bGit checkout%b        : kept at %s\n' "$C_YELLOW" "$C_RESET" "$REPO_ROOT"
  printf '%b============================================================%b\n' "$C_GREEN" "$C_RESET"
  printf '\n'
}

main() {
  if [[ "$PLATFORM" == "Darwin" ]]; then
    IS_MACOS=true
  fi

  init_colors
  parse_args "$@"
  ensure_sudo_if_available
  load_configuration
  resolve_docker_command
  confirm_uninstall
  remove_docker_resources
  remove_runtime_state
  remove_host_tooling
  remove_docker_engine

  # The manifest is the last thing to go: --all still needs it to know which
  # packages the installer added.
  if [[ "$PURGE_RUNTIME_STATE" == true ]]; then
    remove_manifest_file
  fi

  print_summary
}

main "$@"
