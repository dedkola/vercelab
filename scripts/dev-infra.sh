#!/usr/bin/env bash

set -euo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
readonly ENV_LOCAL_FILE="${REPO_ROOT}/.env.local"
readonly COMPOSE_FILE="${REPO_ROOT}/docker-compose.dev.yml"

cd "$REPO_ROOT"

compose_args=(--file "$COMPOSE_FILE")

# scripts/setup-env.sh writes local credentials to .env.local, so compose has to
# read that file; otherwise Postgres initializes with the compose defaults while
# the app connects with the generated password.
if [[ -f "$ENV_LOCAL_FILE" ]]; then
  compose_args=(--env-file "$ENV_LOCAL_FILE" "${compose_args[@]}")
fi

docker compose "${compose_args[@]}" up -d --wait

VERCELAB_INFLUXDB_EXPLORER_URL=http://influx.localhost \
  VERCELAB_INFLUX_BOOTSTRAP_REQUIRED=true \
  bash "$SCRIPT_DIR/bootstrap-influx-dev.sh"
