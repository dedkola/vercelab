#!/usr/bin/env bash

set -euo pipefail

readonly REPO_ROOT="${1:-$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)}"
readonly BUILD_PARENT="${VERCELAB_BUILD_TMPDIR:-$(dirname -- "$REPO_ROOT")}"
BUILD_ROOT="$(mktemp -d "${BUILD_PARENT%/}/vercelab-build.XXXXXX")"
readonly BUILD_ROOT

cleanup() {
  case "$BUILD_ROOT" in
    "${BUILD_PARENT%/}"/vercelab-build.*)
      rm -rf -- "$BUILD_ROOT"
      ;;
  esac
}

trap cleanup EXIT

(
  cd "$REPO_ROOT"
  tar \
    --exclude='./.git' \
    --exclude='./.next' \
    --exclude='./node_modules' \
    --exclude='./.pnpm-store' \
    --exclude='./data' \
    --exclude='./traefik' \
    --exclude='./.env' \
    --exclude='./.env.*' \
    -cf - .
) | tar -xf - -C "$BUILD_ROOT"

cp -al "$REPO_ROOT/node_modules" "$BUILD_ROOT/node_modules"

(
  cd "$BUILD_ROOT"
  node_modules/.bin/next build
  node scripts/verify-standalone-build.mjs
)
