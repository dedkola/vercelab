#!/usr/bin/env bash

set -euo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

VERCELAB_INFLUX_CONTAINER="vercelab-influxdb" \
VERCELAB_INFLUX_EXPLORER_CONTAINER="vercelab-influxdb-explorer" \
VERCELAB_INFLUX_EXPLORER_CONFIG_DIR="${REPO_ROOT}/.devcontainer/influxdb-explorer-config" \
VERCELAB_INFLUXDB_EXPLORER_URL="http://localhost:8888" \
VERCELAB_INFLUX_BOOTSTRAP_LABEL="devcontainer-bootstrap" \
  bash "${REPO_ROOT}/scripts/bootstrap-influx-dev.sh"
