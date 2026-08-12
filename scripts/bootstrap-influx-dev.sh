#!/usr/bin/env bash

set -euo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
readonly ENV_LOCAL_FILE="${REPO_ROOT}/.env.local"
readonly EXPLORER_CONFIG_DIR="${VERCELAB_INFLUX_EXPLORER_CONFIG_DIR:-${REPO_ROOT}/data/influxdb-explorer-config}"
readonly EXPLORER_CONFIG_FILE="${EXPLORER_CONFIG_DIR}/config.json"
readonly INFLUX_CONTAINER="${VERCELAB_INFLUX_CONTAINER:-vercelab-dev-influxdb}"
readonly EXPLORER_CONTAINER="${VERCELAB_INFLUX_EXPLORER_CONTAINER:-vercelab-dev-influxdb-explorer}"
readonly INFLUX_HOST="http://127.0.0.1:8181"
readonly INFLUX_RECOVERY_HOST="http://127.0.0.1:8182"
readonly LOG_LABEL="${VERCELAB_INFLUX_BOOTSTRAP_LABEL:-dev-infra-bootstrap}"
readonly BOOTSTRAP_REQUIRED="${VERCELAB_INFLUX_BOOTSTRAP_REQUIRED:-false}"

log() {
  printf '[%s] %s\n' "${LOG_LABEL}" "$*" >&2
}

read_env_local_value() {
  local key="$1"

  if [[ ! -f "${ENV_LOCAL_FILE}" ]]; then
    return 0
  fi

  grep -E "^${key}=" "${ENV_LOCAL_FILE}" 2>/dev/null | tail -n 1 | cut -d= -f2- || true
}

write_env_local_value() {
  local key="$1"
  local value="$2"
  local temp_file

  temp_file="$(mktemp)"

  if [[ -f "${ENV_LOCAL_FILE}" ]]; then
    grep -Ev "^${key}=" "${ENV_LOCAL_FILE}" >"${temp_file}" || true
  fi

  printf '%s=%s\n' "${key}" "${value}" >>"${temp_file}"
  mv "${temp_file}" "${ENV_LOCAL_FILE}"
}

write_explorer_config() {
  local token="$1"
  local database_name="$2"

  mkdir -p "${EXPLORER_CONFIG_DIR}"

  cat >"${EXPLORER_CONFIG_FILE}" <<EOF
{
  "DEFAULT_INFLUX_SERVER": "http://influxdb:8181",
  "DEFAULT_INFLUX_DATABASE": "${database_name}",
  "DEFAULT_API_TOKEN": "${token}",
  "DEFAULT_SERVER_NAME": "Vercelab InfluxDB"
}
EOF

  chmod 0600 "${EXPLORER_CONFIG_FILE}"
}

run_influx_command() {
  local command="$1"

  docker exec "${INFLUX_CONTAINER}" sh -lc "${command}" 2>&1
}

extract_token() {
  local source="$1"

  grep -Eo 'apiv3_[A-Za-z0-9_-]+' <<<"${source}" | head -n 1 || true
}

wait_for_container() {
  local container="$1"
  local description="$2"
  local attempt=""
  local state=""

  for attempt in {1..60}; do
    state="$(docker inspect --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "${container}" 2>/dev/null || true)"

    case "${state}" in
      "running healthy" | "running none")
        return 0
        ;;
      "exited "* | "dead "*)
        log "${description} stopped before becoming healthy (${state})."
        return 1
        ;;
    esac

    sleep 1
  done

  log "Timed out waiting for ${description} to become healthy."
  return 1
}

create_or_recover_token() {
  local output=""
  local token=""

  output="$(run_influx_command "influxdb3 create token --admin --format text" || true)"
  token="$(extract_token "${output}")"

  if [[ -n "${token}" ]]; then
    printf '%s' "${token}"
    return 0
  fi

  output="$(run_influx_command "printf 'yes\\n' | influxdb3 create token --admin --regenerate --host '${INFLUX_RECOVERY_HOST}' --format text" || true)"
  token="$(extract_token "${output}")"

  if [[ -z "${token}" ]]; then
    log "The admin-token recovery endpoint is no longer listening; restarting InfluxDB to reopen it."
    docker restart "${INFLUX_CONTAINER}" >/dev/null
    wait_for_container "${INFLUX_CONTAINER}" "InfluxDB"
    output="$(run_influx_command "printf 'yes\\n' | influxdb3 create token --admin --regenerate --host '${INFLUX_RECOVERY_HOST}' --format text" || true)"
    token="$(extract_token "${output}")"
  fi

  printf '%s' "${token}"
}

unavailable() {
  log "$1"

  if [[ "${BOOTSTRAP_REQUIRED}" == "true" ]]; then
    return 1
  fi

  return 0
}

main() {
  local db_name="${VERCELAB_INFLUXDB_DATABASE:-}"
  local retention_days="${VERCELAB_INFLUXDB_RETENTION_DAYS:-}"
  local explorer_url="${VERCELAB_INFLUXDB_EXPLORER_URL:-}"
  local retention_period=""
  local token=""
  local list_output=""
  local compact_list_output=""
  local create_output=""

  if ! command -v docker >/dev/null 2>&1; then
    unavailable "Docker CLI is unavailable; unable to bootstrap InfluxDB."
    return
  fi

  if ! wait_for_container "${INFLUX_CONTAINER}" "InfluxDB"; then
    unavailable "InfluxDB service is unavailable; unable to bootstrap it."
    return
  fi

  if [[ -z "${db_name}" ]]; then
    db_name="$(read_env_local_value "VERCELAB_INFLUXDB_DATABASE")"
  fi
  if [[ -z "${retention_days}" ]]; then
    retention_days="$(read_env_local_value "VERCELAB_INFLUXDB_RETENTION_DAYS")"
  fi
  if [[ -z "${explorer_url}" ]]; then
    explorer_url="$(read_env_local_value "VERCELAB_INFLUXDB_EXPLORER_URL")"
  fi

  db_name="${db_name:-vercelab_metrics}"
  retention_days="${retention_days:-90}"
  explorer_url="${explorer_url:-http://influx.localhost}"
  retention_period="${retention_days}d"
  token="$(read_env_local_value "VERCELAB_INFLUXDB_TOKEN")"

  if [[ -z "${token}" ]]; then
    token="$(create_or_recover_token)"
  fi

  if [[ -z "${token}" ]]; then
    log "Unable to get an InfluxDB admin token automatically."
    return 1
  fi

  if ! list_output="$(run_influx_command "influxdb3 show databases --host '${INFLUX_HOST}' --token '${token}' --format json")"; then
    if ! grep -Eqi '401|not authenticated' <<<"${list_output}"; then
      log "Unable to validate the configured InfluxDB token: ${list_output}"
      return 1
    fi

    log "The stored token belongs to another development InfluxDB store; recovering this store's admin token."
    token="$(create_or_recover_token)"

    if [[ -z "${token}" ]]; then
      log "InfluxDB token authentication failed and token recovery failed; leaving .env.local unchanged."
      return 1
    fi

    if ! list_output="$(run_influx_command "influxdb3 show databases --host '${INFLUX_HOST}' --token '${token}' --format json")"; then
      log "Recovered an InfluxDB token, but validation still failed: ${list_output}"
      return 1
    fi
  fi

  compact_list_output="$(tr -d '[:space:]' <<<"${list_output}")"

  if ! grep -Fq "\"name\":\"${db_name}\"" <<<"${compact_list_output}" &&
    ! grep -Fq "\"iox::database\":\"${db_name}\"" <<<"${compact_list_output}"; then
    if ! create_output="$(run_influx_command "influxdb3 create database --host '${INFLUX_HOST}' --token '${token}' --retention-period '${retention_period}' '${db_name}'")"; then
      if ! grep -Fqi "resource that already exists" <<<"${create_output}"; then
        log "Unable to create InfluxDB database: ${create_output}"
        return 1
      fi
    fi
  fi

  write_env_local_value "VERCELAB_INFLUXDB_TOKEN" "${token}"
  write_env_local_value "VERCELAB_INFLUXDB_EXPLORER_URL" "${explorer_url}"
  write_explorer_config "${token}" "${db_name}"

  docker restart "${EXPLORER_CONTAINER}" >/dev/null
  wait_for_container "${EXPLORER_CONTAINER}" "InfluxDB Explorer"

  log "InfluxDB bootstrap complete. The active store's token is in .env.local."
}

main "$@"
