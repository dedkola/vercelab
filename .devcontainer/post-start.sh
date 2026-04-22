#!/usr/bin/env bash

set -u

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
readonly DEVCONTAINER_COMPOSE_FILE="${REPO_ROOT}/.devcontainer/docker-compose.yml"
readonly ENV_LOCAL_FILE="${REPO_ROOT}/.env.local"
readonly EXPLORER_CONFIG_DIR="${REPO_ROOT}/.devcontainer/influxdb-explorer-config"
readonly EXPLORER_CONFIG_FILE="${EXPLORER_CONFIG_DIR}/config.json"
readonly INFLUX_HOST="http://127.0.0.1:8181"
readonly INFLUX_RECOVERY_HOST="http://127.0.0.1:8182"

log() {
  printf '[devcontainer-bootstrap] %s\n' "$*"
}

read_env_local_value() {
  local key="$1"

  if [[ ! -f "${ENV_LOCAL_FILE}" ]]; then
    return 0
  fi

  grep -E "^${key}=" "${ENV_LOCAL_FILE}" 2>/dev/null | tail -n 1 | cut -d= -f2-
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
}

run_influx_command() {
  local command="$1"

  docker compose -f "${DEVCONTAINER_COMPOSE_FILE}" exec -T influxdb sh -lc "${command}" 2>&1
}

extract_token() {
  local source="$1"

  grep -Eo 'apiv3_[A-Za-z0-9_-]+' <<<"${source}" | head -n 1 || true
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

  printf '%s' "${token}"
}

main() {
  local db_name="${VERCELAB_INFLUXDB_DATABASE:-vercelab_metrics}"
  local retention_days="${VERCELAB_INFLUXDB_RETENTION_DAYS:-90}"
  local retention_period="${retention_days}d"
  local token=""
  local list_output=""

  if ! command -v docker >/dev/null 2>&1; then
    log "Docker CLI is unavailable; skipping Influx bootstrap."
    return 0
  fi

  if ! docker compose -f "${DEVCONTAINER_COMPOSE_FILE}" ps influxdb >/dev/null 2>&1; then
    log "influxdb service is not available yet; skipping Influx bootstrap."
    return 0
  fi

  token="$(read_env_local_value "VERCELAB_INFLUXDB_TOKEN")"

  if [[ -z "${token}" ]]; then
    token="$(create_or_recover_token)"
  fi

  if [[ -z "${token}" ]]; then
    log "Unable to get an Influx admin token automatically; run token bootstrap manually."
    return 0
  fi

  write_env_local_value "VERCELAB_INFLUXDB_TOKEN" "${token}"
  write_env_local_value "VERCELAB_INFLUXDB_EXPLORER_URL" "http://localhost:8888"

  list_output="$(run_influx_command "influxdb3 show databases --host '${INFLUX_HOST}' --token '${token}' --format json" || true)"

  if grep -Eqi '401|not authenticated' <<<"${list_output}"; then
    token="$(create_or_recover_token)"

    if [[ -z "${token}" ]]; then
      log "Influx token auth failed and token recovery failed; leaving current .env.local as-is."
      return 0
    fi

    write_env_local_value "VERCELAB_INFLUXDB_TOKEN" "${token}"
    list_output="$(run_influx_command "influxdb3 show databases --host '${INFLUX_HOST}' --token '${token}' --format json" || true)"
  fi

  if ! grep -Fq "\"name\":\"${db_name}\"" <<<"${list_output}"; then
    run_influx_command "influxdb3 create database --host '${INFLUX_HOST}' --token '${token}' --retention-period '${retention_period}' '${db_name}'" >/dev/null || true
  fi

  write_explorer_config "${token}" "${db_name}"

  docker compose -f "${DEVCONTAINER_COMPOSE_FILE}" up -d --no-deps influxdb-explorer >/dev/null 2>&1 || true

  log "Influx bootstrap complete. Token is stored in .env.local for local dev."
}

main "$@"