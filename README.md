# Vercelab

<div align="center">

**A self-hosted deployment control plane for homelabs, built on Next.js, Docker, Traefik, PostgreSQL, and InfluxDB.**

[![GitHub package version](https://img.shields.io/github/package-json/v/dedkola/vercelab?style=for-the-badge&color=111827)](https://github.com/dedkola/vercelab)
[![Next.js](https://img.shields.io/badge/Next.js-16.2.4-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.2.5-149ECA?style=for-the-badge&logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![pnpm](https://img.shields.io/badge/pnpm-10.33-F69220?style=for-the-badge&logo=pnpm&logoColor=white)](https://pnpm.io/)

[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-state-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![InfluxDB](https://img.shields.io/badge/InfluxDB-metrics-22ADF6?style=for-the-badge&logo=influxdb&logoColor=white)](https://www.influxdata.com/)
[![Traefik](https://img.shields.io/badge/Traefik-edge-24A1C1?style=for-the-badge&logo=traefikproxy&logoColor=white)](https://traefik.io/traefik/)
[![Vitest](https://img.shields.io/badge/Vitest-tested-6E9F18?style=for-the-badge&logo=vitest&logoColor=white)](https://vitest.dev/)

[![Last commit](https://img.shields.io/github/last-commit/dedkola/vercelab?style=flat-square&color=0f766e)](https://github.com/dedkola/vercelab/commits/main)
[![Repo size](https://img.shields.io/github/repo-size/dedkola/vercelab?style=flat-square&color=334155)](https://github.com/dedkola/vercelab)
[![Issues](https://img.shields.io/github/issues/dedkola/vercelab?style=flat-square&color=7c3aed)](https://github.com/dedkola/vercelab/issues)
[![Pull requests](https://img.shields.io/github/issues-pr/dedkola/vercelab?style=flat-square&color=2563eb)](https://github.com/dedkola/vercelab/pulls)
[![Dependabot](https://img.shields.io/badge/Dependabot-enabled-025E8C?style=flat-square&logo=dependabot&logoColor=white)](https://github.com/dedkola/vercelab/blob/main/.github/dependabot.yml)

</div>

Vercelab turns an Ubuntu box or local Docker host into a deployment cockpit for Dockerized GitHub projects. It clones repositories, detects a root `Dockerfile` or compose file, stores control-plane state in PostgreSQL, writes metrics to InfluxDB 3 Core, encrypts GitHub tokens at rest, and publishes apps behind Traefik with wildcard self-signed HTTPS.

## Contents

- [Highlights](#highlights)
- [Architecture](#architecture)
- [Stack](#stack)
- [Screenshots](#screenshots)
- [Quick Start](#quick-start)
- [Local Development](#local-development)
- [Deployment Flow](#deployment-flow)
- [Metrics Dashboard](#metrics-dashboard)
- [Containers Workspace](#containers-workspace)
- [Ubuntu Server Install](#ubuntu-server-install)
- [State and Storage](#state-and-storage)
- [Configuration](#configuration)
- [Operational Notes](#operational-notes)

## Highlights

| Capability | What it does |
| --- | --- |
| GitHub deployments | Browse repositories, select branches, clone source, and deploy root `Dockerfile` or compose projects. |
| Self-hosted routing | Places managed apps on a shared Docker network and exposes them through Traefik host rules. |
| Metrics dashboard | Tracks live host load, per-container CPU/memory/disk/network panels, and InfluxDB time-series history. |
| Containers workspace | Full container inventory with inspect, logs, recreation, and catalog-based creation for all host containers. |
| Safe runtime state | Stores repositories, deployments, and operations in PostgreSQL with encrypted GitHub tokens. |
| Ubuntu bootstrap | Installs host prerequisites, pins Docker Engine 28.x, creates TLS assets, and starts the stack. |

## Architecture

```mermaid
flowchart LR
  user["Operator"] --> ui["Next.js control plane"]
  ui --> pg["PostgreSQL"]
  ui --> influx["InfluxDB 3 Core"]
  ui --> docker["Host Docker daemon"]
  ui --> gh["GitHub API / Git clone"]
  docker --> app["Managed app containers"]
  app --> traefik["Traefik"]
  traefik --> lan["LAN / wildcard domain"]
  influx --> explorer["InfluxDB Explorer"]
```

## Stack

| Layer | Technology |
| --- | --- |
| Web app | Next.js 16 App Router, React 19, TypeScript |
| UI | Tailwind CSS 4, shadcn-style components, Radix UI, Lucide icons |
| Charts | ECharts via the local dashboard components |
| Persistence | PostgreSQL for control-plane state |
| Metrics | InfluxDB 3 Core plus InfluxDB Explorer |
| Runtime | Docker, Docker Compose, Traefik |
| Validation | Zod, TypeScript, ESLint, Vitest |
| Package manager | pnpm 10 |

## Screenshots

Captured from a live Vercelab deployment.

### Metrics dashboard

![Vercelab metrics dashboard](public/screenshots/vercelab-dashboard-overview.png)

### Container runtime

![Vercelab container runtime view](public/screenshots/vercelab-containers.png)

### Git deployments

![Vercelab Git deployment view](public/screenshots/vercelab-git-deployments.png)

## Quick Start

For local development on macOS, run infrastructure in Docker and the Next.js app on the host:

```bash
pnpm install --frozen-lockfile
pnpm run setup-env
pnpm run dev:infra
pnpm run dev
```

Open `http://localhost:3000`.

For an Ubuntu server install:

```bash
chmod +x install.sh
./install.sh
```

The installer can derive an `sslip.io` base domain from the server's LAN IP when you do not provide one.

## Local Development

Two development modes are supported. They are isolated and can run at the same time without port or network conflicts.

### Option A: Host macOS

Infrastructure runs in Docker. The Next.js app runs directly through `pnpm dev`. No system paths are touched because local data lives under `./data/` in the repository root.

Generate `.env.local`:

```bash
pnpm run setup-env
```

The setup script auto-detects your Mac's LAN IP and Docker socket path, generates a random encryption secret, and backs up any existing `.env.local` before writing a new file.

Start infrastructure:

```bash
pnpm run dev:infra
```

| Service | URL |
| --- | --- |
| App | `http://localhost:3000` |
| Postgres | `localhost:5432` |
| InfluxDB API | `http://localhost:8181` |
| InfluxDB Explorer | `http://influx.localhost` |
| Traefik dashboard | `http://localhost:8088` |

Stop local infrastructure:

```bash
pnpm run dev:infra:down
```

### Option B: VS Code Devcontainer

The devcontainer runs Postgres, InfluxDB, Explorer, and the Node environment inside Docker. Open the repository in VS Code and choose **Reopen in Container**, or run **Dev Containers: Reopen in Container** from the command palette.

| Resource | Host macOS stack | Devcontainer |
| --- | --- | --- |
| Docker network | `vercelab_dev_proxy` | `vercelab_devcontainer_net` |
| Postgres host port | `localhost:5432` | not exposed |
| InfluxDB host port | `localhost:8181` | not exposed |
| InfluxDB Explorer | `http://influx.localhost` | `http://localhost:8888` |
| Traefik | `:80`, dashboard `:8088` | none |

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm run setup-env` | Generate a local `.env.local` file. |
| `pnpm run dev:infra` | Start local Postgres, InfluxDB, Explorer, and Traefik. |
| `pnpm run dev:infra:down` | Stop the local infrastructure stack. |
| `pnpm run dev` | Start the Next.js dev server. |
| `pnpm run build` | Build the production app. |
| `pnpm run start` | Start the built app. |
| `pnpm run lint` | Run ESLint. |
| `pnpm run test` | Run Vitest in watch mode. |
| `pnpm run test:run` | Run Vitest once. |

## Deployment Flow

1. Store or provide a GitHub personal access token.
2. Select a repository and branch from the Git workspace.
3. Vercelab clones the repository into the managed app directory.
4. It detects one of `Dockerfile`, `docker-compose.yml`, `docker-compose.yaml`, `compose.yml`, or `compose.yaml` at the repository root.
5. It generates Vercelab-managed compose overrides, injects Traefik labels, and joins the shared proxy network.
6. It runs Docker Compose, captures operation logs, and updates deployment state in PostgreSQL.

Compose repositories with multiple services must provide `serviceName`. Single-service compose projects are auto-detected. Dockerfile deployments receive both runtime environment variables and Docker build args from the multiline `KEY=VALUE` payload.

## Metrics Dashboard

The metrics dashboard is the home route (`/`). It displays:

- per-container CPU, memory, network, and disk metric panels powered by live Docker telemetry
- host trend charts (CPU, memory, network I/O, disk read/write throughput) backed by InfluxDB 3 Core history
- a deployments list with the latest operation status for each managed app
- a time-range selector (1 h, 6 h, 24 h, 7 d) that applies to all InfluxDB history queries

The shell polls `/api/metrics` on a live interval and merges server-side snapshots with historical series.

## Containers Workspace

The containers workspace (`/containers`) shows all containers visible to the host Docker daemon, not just Vercelab-managed apps. Features:

- live container inventory with status indicators and resource usage
- per-container inspect panel with full Docker metadata
- per-container log tail with live streaming
- container recreation (pull latest image and restart with the same config)
- catalog-based container creation with registry tag browsing and port exposure mode selection (`traefik`, `host`, `none`)

## Ubuntu Server Install

The production path assumes an Ubuntu host. If you do not provide a custom domain, the installer derives a reachable default base domain from the server's primary LAN IPv4 using `sslip.io`, for example `10-10-0-36.sslip.io`.

```bash
chmod +x install.sh
./install.sh
```

For a fully unattended bootstrap:

```bash
VERCELAB_BASE_DOMAIN=lab.example.com \
VERCELAB_ADMIN_HOST=vercelab.lab.example.com \
VERCELAB_HOST_ROOT=/opt/vercelab \
VERCELAB_ENCRYPTION_SECRET="$(openssl rand -hex 32)" \
./install.sh
```

Any runtime variable listed in the configuration section can be exported before running `./install.sh`. On later runs, the installer reuses current `.env` values unless you override them again.

The installer:

- installs Node.js and pnpm on the host
- installs host packages required by the bootstrap scripts
- installs and pins Docker Engine `28.x` plus the Compose plugin because this stack documents Docker `29.x` as incompatible with Traefik's Docker provider
- runs `pnpm install --frozen-lockfile` and `pnpm run build` as a host-side smoke test
- creates a shared host root under `/opt/vercelab` by default
- auto-generates a reachable default base domain when one is not provided
- generates a wildcard self-signed certificate for the base domain
- writes the runtime `.env` file, including derived paths and runtime settings
- builds and starts the root Docker and Traefik stack

If you later edit `.env`, rerun `./install.sh` so the stack and wildcard certificate stay aligned with the new domain and paths.

## State and Storage

Runtime variables for Ubuntu installs are written to `.env` in the repository root. `install.sh` rewrites that file on each successful run and locks it down with `chmod 600`.

Production storage defaults live under `VERCELAB_HOST_ROOT`, which defaults to `/opt/vercelab`:

| Path | Purpose |
| --- | --- |
| `/opt/vercelab/data/apps` | Cloned deployment repositories and generated compose files. |
| `/opt/vercelab/data/logs` | Deployment logs. |
| `/opt/vercelab/data/locks` | Deployment lock files. |
| `/opt/vercelab/data/postgres` | PostgreSQL data directory. |
| `/opt/vercelab/data/influxdb` | InfluxDB 3 Core data directory. |
| `/opt/vercelab/data/influxdb-explorer` | InfluxDB Explorer SQLite data. |
| `/opt/vercelab/data/influxdb-explorer-config` | Generated Explorer connection config. |
| `/opt/vercelab/traefik/dynamic/tls.yml` | Traefik TLS dynamic config. |
| `/opt/vercelab/traefik/certs/wildcard.crt` | Self-signed wildcard certificate. |
| `/opt/vercelab/traefik/certs/wildcard.key` | Wildcard certificate private key. |

Local macOS development stores runtime state under `./data/`:

- `./data/postgres`
- `./data/influxdb`
- `./data/influxdb-explorer`
- `./data/traefik/dynamic`
- `./data/traefik/certs`
- `./data/apps`
- `./data/logs`
- `./data/locks`

The devcontainer uses named Docker volumes instead of host-bind mounts.

## Configuration

Important runtime variables:

| Variable | Purpose |
| --- | --- |
| `VERCELAB_BASE_DOMAIN` | Wildcard domain for deployed apps, such as `myhomelan.com`. |
| `VERCELAB_ADMIN_HOST` | Full hostname for the control plane, such as `vercelab.myhomelan.com`. |
| `VERCELAB_HOST_ROOT` | Shared absolute host path mounted into the app container at the same path. |
| `VERCELAB_APPS_DIR` | Managed clone and generated compose directory. |
| `VERCELAB_LOGS_DIR` | Deployment log directory. |
| `VERCELAB_LOCKS_DIR` | Deployment lock directory. |
| `VERCELAB_POSTGRES_DATA_DIR` | PostgreSQL data directory. |
| `VERCELAB_INFLUXDB_DATA_DIR` | InfluxDB data directory. |
| `VERCELAB_DOCKER_SOCKET_PATH` | Docker socket passed through to Traefik and the control plane. |
| `VERCELAB_PROXY_NETWORK` | Shared Docker network used by Traefik and deployed apps. |
| `VERCELAB_ENCRYPTION_SECRET` | Secret used to encrypt stored GitHub tokens. |
| `VERCELAB_GITHUB_TOKEN` | Optional workspace GitHub token for repository browsing. |

<details>
<summary>Default runtime variables written by the installer</summary>

| Variable | Default | Notes |
| --- | --- | --- |
| `NODE_ENV` | `production` | Runtime mode for the control plane container. |
| `HOSTNAME` | `0.0.0.0` | Bind address inside the container. |
| `PORT` | `3000` | Internal port Traefik forwards to. |
| `VERCELAB_BASE_DOMAIN` | auto-derived from host IPv4 as `<ip>.sslip.io`, fallback `myhomelan.com` | Base wildcard domain for deployed apps. |
| `VERCELAB_ADMIN_HOST` | `vercelab.${VERCELAB_BASE_DOMAIN}` | Control plane hostname. |
| `VERCELAB_HOST_LAN_IP` | auto-derived from host primary LAN IPv4 | Host LAN IPv4 shown in the dashboard and used to tag host metrics. |
| `VERCELAB_PROXY_NETWORK` | `vercelab_proxy` | Shared Docker network for Traefik and managed apps. |
| `VERCELAB_PROXY_ENTRYPOINT` | `websecure` | Traefik HTTPS entrypoint. |
| `VERCELAB_HOST_ROOT` | `/opt/vercelab` | Shared host path mounted into the control-plane container at the same absolute path. |
| `VERCELAB_DATA_ROOT` | `${VERCELAB_HOST_ROOT}/data` | Parent directory for apps, logs, locks, and databases. |
| `VERCELAB_TRAEFIK_DYNAMIC_DIR` | `${VERCELAB_HOST_ROOT}/traefik/dynamic` | Generated Traefik dynamic config location. |
| `VERCELAB_TRAEFIK_CERTS_DIR` | `${VERCELAB_HOST_ROOT}/traefik/certs` | Wildcard certificate and key. |
| `VERCELAB_APPS_DIR` | `${VERCELAB_DATA_ROOT}/apps` | Cloned app repositories. |
| `VERCELAB_LOGS_DIR` | `${VERCELAB_DATA_ROOT}/logs` | Deployment logs. |
| `VERCELAB_LOCKS_DIR` | `${VERCELAB_DATA_ROOT}/locks` | Deployment lock files. |
| `VERCELAB_POSTGRES_DATA_DIR` | `${VERCELAB_DATA_ROOT}/postgres` | PostgreSQL data directory. |
| `VERCELAB_INFLUXDB_DATA_DIR` | `${VERCELAB_DATA_ROOT}/influxdb` | InfluxDB 3 Core data directory. |
| `VERCELAB_INFLUXDB_EXPLORER_DATA_DIR` | `${VERCELAB_DATA_ROOT}/influxdb-explorer` | InfluxDB Explorer SQLite data directory. |
| `VERCELAB_INFLUXDB_EXPLORER_CONFIG_DIR` | `${VERCELAB_DATA_ROOT}/influxdb-explorer-config` | Generated Explorer connection config directory. |
| `VERCELAB_DOCKER_SOCKET_PATH` | `/var/run/docker.sock` | Host Docker socket passed into Traefik and the control plane. |
| `VERCELAB_DATABASE_PROVIDER` | `postgres` | PostgreSQL is required in this stack. |
| `VERCELAB_POSTGRES_URL` | `postgres://vercelab:...@postgres:5432/vercelab` | Control-plane relational database connection URL. |
| `VERCELAB_POSTGRES_USER` | `vercelab` | Postgres container username. |
| `VERCELAB_POSTGRES_PASSWORD` | generated by installer | Postgres container password. |
| `VERCELAB_POSTGRES_DB` | `vercelab` | Postgres database name. |
| `VERCELAB_INFLUXDB_URL` | `http://influxdb:8181` | InfluxDB 3 Core write endpoint. |
| `VERCELAB_INFLUXDB_DATABASE` | `vercelab_metrics` | InfluxDB database for metrics. |
| `VERCELAB_INFLUXDB_EXPLORER_HOST` | `influx.${VERCELAB_BASE_DOMAIN}` | Public Explorer hostname routed through Traefik. |
| `VERCELAB_INFLUXDB_EXPLORER_URL` | `https://${VERCELAB_INFLUXDB_EXPLORER_HOST}` | Canonical Explorer URL surfaced in the UI. |
| `VERCELAB_INFLUXDB_EXPLORER_SESSION_SECRET` | generated by installer | Explorer session key for persistent sessions. |
| `VERCELAB_INFLUXDB_TOKEN` | generated by installer when empty | InfluxDB API token used for authenticated write/query access. |
| `VERCELAB_INFLUXDB_RETENTION_DAYS` | `90` | Desired metrics retention period. |
| `VERCELAB_ENCRYPTION_SECRET` | generated 64-hex-character secret when unset | Used to encrypt stored GitHub tokens. |

</details>

## Runtime Files

| File | Role |
| --- | --- |
| `.env.example` | Template for the production stack. |
| `.env.local` | Local macOS dev environment generated by `pnpm run setup-env`; gitignored. |
| `.env` | Generated production runtime configuration written by `install.sh`; gitignored. |
| `docker-compose.yml` | Production stack: Traefik, Postgres, InfluxDB, Explorer, and control plane. |
| `docker-compose.dev.yml` | Local macOS infrastructure stack without the control-plane container. |
| `.devcontainer/docker-compose.yml` | Fully isolated VS Code devcontainer stack. |
| `scripts/setup-env.sh` | Interactive `.env.local` generator. |
| `Dockerfile` | Standalone Next.js production image with Git and Docker CLI tooling. |
| `install.sh` | Ubuntu bootstrapper for Docker, TLS assets, and the control-plane stack. |
| `uninstall.sh` | Removal script with `--purge`, `--purge-images`, and `--all` cleanup modes. |

## Health and Readiness

`/api/health` reports full platform readiness. In production it verifies:

- the Docker socket exists
- the Docker daemon is reachable
- the Docker Compose plugin is installed
- managed directories are writable
- `VERCELAB_HOST_ROOT` aligns with all managed paths
- the base domain and encryption secret are not placeholders

The route returns HTTP `503` until the platform is ready.

## Recreate the UI Container

The Vercelab UI runs as the `control-plane` service in `docker-compose.yml`, with container name `vercelab-ui`.

Core stack container names:

- `vercelab-ui`
- `vercelab-influxdb`
- `vercelab-influxdb-explorer`
- `vercelab-postgres`

Rebuild and recreate only the UI container:

```bash
docker compose up -d --build --no-deps control-plane
```

Force a recreate without rebuilding:

```bash
docker compose up -d --force-recreate --no-deps control-plane
```

Useful checks:

```bash
docker compose ps
docker compose logs -f control-plane
docker logs -f vercelab-ui
```

If you changed `.env`, domains, certificates, or host paths, rerun `./install.sh` instead so generated runtime config and TLS assets stay aligned.

## Reinstall

For an in-place reinstall, keep current data and rerun:

```bash
./install.sh
```

Use that path after editing `.env`, changing the domain, changing storage paths, or pulling a newer version of Vercelab. The installer rebuilds the stack, refreshes the generated `.env`, and regenerates the wildcard certificate when the base domain changes.

For a clean reinstall:

```bash
./uninstall.sh --purge
./install.sh
```

## Uninstall

Stop and remove the Vercelab control plane plus all managed deployment containers while keeping generated `.env`, certificates, databases, cloned apps, and Docker volumes:

```bash
chmod +x uninstall.sh
./uninstall.sh
```

Remove generated `.env`, everything under `VERCELAB_HOST_ROOT`, and Docker volumes that belong to Vercelab compose projects:

```bash
./uninstall.sh --purge
```

Also remove Docker images labeled for Vercelab compose projects:

```bash
./uninstall.sh --purge --purge-images
```

Remove everything above plus host tooling installed by `install.sh` and local repo build artifacts:

```bash
./uninstall.sh --all
```

`uninstall.sh` intentionally leaves Docker Engine, the Docker Compose plugin, Node.js, and pnpm installed unless you explicitly pass `--all`.

## Operational Notes

### Shared Host Root

Vercelab talks to the host Docker daemon through the Docker socket. Docker build contexts and bind mounts referenced by deployment compose files must therefore exist at the same absolute path on both the host and inside the control-plane container.

The root stack handles this by mounting `VERCELAB_HOST_ROOT` into the container at the exact same absolute path. Keep deployment workspaces, logs, locks, PostgreSQL data, and InfluxDB data under that root.

### Certificates

The installer writes the wildcard certificate to `VERCELAB_TRAEFIK_CERTS_DIR/wildcard.crt`. Import that certificate into your workstation or browser trust store if you want to remove self-signed certificate warnings on your LAN.

### Security

- GitHub tokens stored in the control plane are encrypted at rest with `VERCELAB_ENCRYPTION_SECRET`.
- `.env`, `.env.local`, and runtime data directories should stay out of version control.
- The project is intended for trusted homelab or LAN environments. Put it behind your own authentication, VPN, or access controls before exposing it to the public internet.

## Development Notes

This repository includes project instructions for GitHub Copilot and Next.js/Tailwind contributors under `.github/`. Dependabot is configured for weekly npm dependency updates.

Before opening a pull request, run:

```bash
pnpm run lint
pnpm run test:run
pnpm run build
```
