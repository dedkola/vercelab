<div align="center">

<img src="app/icon.svg" alt="Vercelab logo" width="72" height="72" />

# Vercelab

**A self-hosted deployment control plane for homelabs.**

Deploy GitHub projects with Docker, route them through Traefik,<br />
and monitor your host from a single dashboard.

[Quick start](#quick-start) · [Features](#features) · [Installation](#installation) · [Configuration](#configuration) · [Development](#local-development)

[![CI](https://github.com/dedkola/vercelab/actions/workflows/ci.yml/badge.svg)](https://github.com/dedkola/vercelab/actions/workflows/ci.yml)
[![Version](https://img.shields.io/github/package-json/v/dedkola/vercelab?style=flat-square&color=111827)](https://github.com/dedkola/vercelab/releases)
[![Node.js](https://img.shields.io/badge/Node.js-24-5FA04E?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker&logoColor=white)](https://www.docker.com/)

![Vercelab overview dashboard](public/screenshots/vercelab-dashboard-overview.png)

</div>

## About

Vercelab turns an Ubuntu server or a Mac with Docker into a compact deployment workspace for Dockerized GitHub projects. From one interface you can deploy repositories, build a preview for every commit, operate any container on the host, open a shell, and follow live host telemetry.

It is designed for a single trusted host on a home or lab network:

- **One command to install.** The installer sets up Docker, generates a wildcard certificate, and starts the stack.
- **No external services.** State lives in PostgreSQL and metrics in InfluxDB 3 Core, both running next to the control plane.
- **Real URLs for every app.** Each deployment is published behind Traefik on your wildcard domain over HTTPS.
- **Secrets stay encrypted.** GitHub tokens and webhook secrets are encrypted at rest.

## Contents

- [Features](#features)
- [How it works](#how-it-works)
- [Requirements](#requirements)
- [Quick start](#quick-start)
- [Using Vercelab](#using-vercelab)
- [Installation](#installation)
- [Operations](#operations)
- [Configuration](#configuration)
- [Local development](#local-development)
- [Project layout](#project-layout)
- [Security](#security)

## Features

| Area           | What you get                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------- |
| **Overview**   | System Pulse header, compute and throughput charts, a searchable workload table, and per-container history.   |
| **Apps**       | Pick a GitHub repository and branch, deploy a root `Dockerfile` or Compose project, and manage it afterwards. |
| **Dev**        | Build every commit on a monitored branch, plus every open pull request, into its own preview URL.             |
| **Containers** | Inventory of every container on the host with inspect, logs, lifecycle actions, recreation, and creation.     |
| **Terminal**   | Interactive shell on the host in production, or inside the container during development.                      |
| **Routing**    | Apps join a shared Docker network and are exposed through Traefik host rules on your wildcard domain.         |
| **Installers** | One command on Ubuntu or macOS, with a manifest-driven uninstaller that removes only what it created.         |

<table>
  <tr>
    <td width="50%"><img src="public/screenshots/vercelab-git-deployments.png" alt="Apps page with GitHub deployments" /></td>
    <td width="50%"><img src="public/screenshots/vercelab-containers.png" alt="Containers page with the host inventory" /></td>
  </tr>
  <tr>
    <td align="center"><strong>Apps</strong>: deploy and manage GitHub repositories</td>
    <td align="center"><strong>Containers</strong>: operate every container on the host</td>
  </tr>
</table>

## How it works

The control plane is a Next.js application that drives the host Docker daemon through its socket. It clones repositories, builds them with Docker Compose, attaches the resulting containers to a shared proxy network, and lets Traefik publish them on your wildcard domain.

```mermaid
flowchart LR
  user["Operator"] --> ui["Next.js control plane"]
  ui --> pg["PostgreSQL"]
  ui --> influx["InfluxDB 3 Core"]
  ui --> docker["Host Docker daemon"]
  ui --> gh["GitHub API / git clone"]
  docker --> app["Managed app containers"]
  app --> traefik["Traefik"]
  traefik --> lan["LAN / wildcard domain"]
  influx --> explorer["InfluxDB Explorer"]
```

| Layer    | Technology                                                                         |
| -------- | ---------------------------------------------------------------------------------- |
| Web app  | Next.js 16 App Router, React 19, TypeScript                                        |
| UI       | Cloudflare Kumo, Tailwind CSS 4, shadcn-style components, Radix UI, Phosphor icons |
| Charts   | ECharts                                                                            |
| Terminal | xterm.js, node-pty, WebSocket                                                      |
| Data     | PostgreSQL (state), InfluxDB 3 Core and InfluxDB Explorer (metrics)                |
| Runtime  | Docker, Docker Compose, Traefik                                                    |
| Quality  | Zod, ESLint, Prettier, knip, Vitest                                                |

## Requirements

| Target            | You need                                                                                                  |
| ----------------- | --------------------------------------------------------------------------------------------------------- |
| **Ubuntu server** | An Ubuntu host with `sudo` access. The installer adds Node.js, pnpm, and Docker Engine `28.x` for you.    |
| **macOS**         | Xcode Command Line Tools. The installer adds Homebrew, Docker Desktop, Node.js 24, and pnpm when missing. |
| **Development**   | Node.js 24, pnpm 11.27.1, and Docker with the Compose plugin.                                             |
| **GitHub**        | A personal access token that can read the repositories you want to deploy.                                |
| **Domain**        | Optional. Without one, the installer uses `<ip>.sslip.io` on Linux and `localhost` on macOS.              |

## Quick start

### Install on a server

Run this on Ubuntu or macOS:

```bash
curl -fsSL https://raw.githubusercontent.com/dedkola/vercelab/main/install.sh | bash
```

The script clones the repository to `~/vercelab`, runs an interactive setup wizard, and starts the stack. When it finishes it prints the dashboard URL. From there:

1. Open the dashboard URL. Your browser warns about the self-signed certificate until you [trust it](#troubleshooting).
2. Add a GitHub personal access token from the settings popover in the header.
3. Open **Apps**, choose a repository and branch, and deploy.

See [Installation](#installation) for custom domains, install locations, and macOS LAN mode.

### Run locally for development

```bash
pnpm install --frozen-lockfile
pnpm run setup-env
pnpm run dev:infra
pnpm run dev
```

Then open `http://localhost:3000`. See [Local development](#local-development) for details.

## Using Vercelab

Vercelab has five pages, all reachable from the header. Add a GitHub personal access token from the settings popover in the header first: it is encrypted with `VERCELAB_ENCRYPTION_SECRET` and used to list repositories, branches, and commits.

| Page                                 | Route           | Purpose                                         |
| ------------------------------------ | --------------- | ----------------------------------------------- |
| [Overview](#overview-)               | `/`             | Host telemetry and the workload table.          |
| [Apps](#apps-git-app-page)           | `/git-app-page` | Deploy and manage GitHub repositories.          |
| [Dev previews](#dev-previews-dev)    | `/dev`          | Per-commit and per-pull-request preview builds. |
| [Containers](#containers-containers) | `/containers`   | Inventory and lifecycle of every container.     |
| [Terminal](#terminal-terminal)       | `/terminal`     | Interactive shell.                              |

### Overview (`/`)

- **System Pulse**: host state, one-minute load, memory, running workloads, and current traffic.
- **Compute load** (CPU and memory) and **Throughput** (network in/out and disk) charts.
- **Workloads**: every container with runtime type, status, CPU, memory, network, endpoint, and start/stop/restart actions. Select a row for per-container CPU, memory, network, and disk history.
- A shared time range (1 min to 90 days, default 15 min) applies to all InfluxDB history queries.

Missing samples stay visible as gaps; the dashboard never fills them with demo data.

**Workload logos** are resolved per container through `/api/workloads/<id>/logo`, in this order:

1. The repository of the Vercelab deployment or dev preview that owns the container.
2. A bundled mark for well-known images (PostgreSQL, InfluxDB, Traefik, Redis, Grafana, NGINX, Node.js, and more).
3. A logo committed in the Compose project's working directory.
4. The repository in the image's `org.opencontainers.image.source` label.

To give your own app a logo, commit `app/icon.{svg,png,ico}` or `public/{logo,favicon,icon}.*` (also `src/app/`, `static/`, `assets/`, and `src/images/`) at the build-context root. Lookups are cached for five minutes.

### Apps (`/git-app-page`)

1. Choose a repository and branch, then **Review deploy**.
2. Vercelab clones the repository into the managed apps directory.
3. It detects `Dockerfile`, `docker-compose.yml`, `docker-compose.yaml`, `compose.yml`, or `compose.yaml` at the repository root.
4. It writes a Vercelab-managed Compose override with Traefik labels and the shared proxy network.
5. It runs Docker Compose, captures the operation log, and records the deployment in PostgreSQL.

Multi-service Compose projects need a `serviceName`; single-service projects are detected automatically. For Dockerfile projects, the multiline `KEY=VALUE` environment is passed both as runtime variables and as build args.

**Deployment files.** The app manager's **Files** tab uploads supporting files such as `.env` or `k3s.config` (5 MB each). Files are stored under `.vercelab-files/<deploymentId>` in the apps directory and copied into the workspace after every clone or pull, so they survive redeploys.

- **Private** (`0600`) is the default for `.env` and `.env.*`.
- **Container-readable** (`0644`) is the default for everything else.

Redeploy after changing files or permissions to recreate the containers.

### Dev previews (`/dev`)

The Dev workspace builds commits into their own image and container. Previews are fully separate from Apps deployments and never touch them.

1. Select **Connect repository**.
2. Choose the repository, branch, preview prefix, Dockerfile path, build context, container port, environment, and optional build args.
3. Enable automatic previews, and optionally **Auto-deploy open pull requests**.
4. Push a commit. Vercelab picks it up within 60 seconds by polling, or immediately through an optional signed webhook.

Each preview gets its own URL:

```text
<preview-prefix>-<short-sha>.<VERCELAB_BASE_DOMAIN>     e.g. https://blade-a1b2c3d.home.com
```

`VERCELAB_PROXY_ENTRYPOINT=web` produces `http://` URLs (local development); `websecure` produces HTTPS URLs.

Each preview records its commit, author, build status, container status, build log, container log, and URL, and can be opened, stopped, started, restarted, retried, or deleted. Deleting a preview removes its container, image, workspace, and build log.

<details>
<summary>Pull request previews, commit detection, and retention</summary>

**Pull request previews.** With **Auto-deploy open pull requests** enabled, each poll and each **Sync now**:

- builds every open pull request whose head commit has not been built, and rebuilds on new commits;
- restarts a stopped preview while its pull request is still open;
- stops the preview once the pull request closes.

Builds fetch `refs/pull/<number>/head`, so pull requests from forks work as long as the token can read the base repository. Pull request previews show a `PR #<number>` badge linking back to GitHub.

**Commit detection.**

- **Polling** is on by default and works on private or LAN-only hosts.
- **Webhook** is optional. Each project has a payload URL and an encrypted secret. In GitHub, add a webhook for the `push` event with `application/json`; Vercelab verifies `X-Hub-Signature-256`. Polling stays on as a fallback.
- **Manual**: `Sync now`, `Deploy latest`, and `Deploy commit` for recent commits.

**Lifecycle and storage.**

- Images are tagged `vercelab-dev-<prefix>:<full-sha>`; containers are named `vercelab-dev-<prefix>-<short-sha>`, use `unless-stopped`, and publish no host ports.
- Builds run one at a time from a PostgreSQL-backed queue. A restart marks interrupted builds as failed and resumes queued ones.
- Retention is per project: `0` keeps every preview; a positive value removes the oldest settled previews after each successful build. Running pull request previews are exempt.
- Build workspaces are temporary (`VERCELAB_APPS_DIR/dev`); logs live in `VERCELAB_LOGS_DIR/dev`; state lives in the `dev_projects` and `dev_deployments` tables.
- Previews use a root or subdirectory Dockerfile. Compose-only repositories are not supported for previews yet.

</details>

### Containers (`/containers`)

Every container visible to the host Docker daemon, not only Vercelab-managed ones:

- live inventory with status and resource usage;
- inspect panel with full Docker metadata and a live log tail;
- recreate (pull the latest image and restart with the same configuration);
- create from a catalog, with registry tag browsing and `traefik`, `host`, or `none` exposure.

### Terminal (`/terminal`)

An interactive shell with resize, clickable links, copy and paste, and adjustable font size. `pnpm dev` and `pnpm start` launch its WebSocket server next to Next.js.

| `VERCELAB_TERMINAL_TARGET` | Shell                                                                             |
| -------------------------- | --------------------------------------------------------------------------------- |
| `host`                     | Ubuntu host shell through a short-lived privileged Docker helper using `nsenter`. |
| `container`                | Shell inside the container (macOS installs and the devcontainer).                 |
| unset, Next.js on macOS    | Your local shell.                                                                 |

Locally the WebSocket listens on port `3001` (`3101` in the devcontainer); in production Traefik routes `/terminal/ws` through the dashboard hostname.

## Installation

`install.sh` is the single entry point. On Linux it installs directly; on macOS it hands off to `install-macos.sh`. Both ask for one storage folder, write `.env`, generate a wildcard certificate, start the stack, and record what they created in `.vercelab-install-manifest` for `uninstall.sh`.

```bash
# Default: clone to ~/vercelab and run the wizard
curl -fsSL https://raw.githubusercontent.com/dedkola/vercelab/main/install.sh | bash

# Custom domain and secret (the wizard still runs when a terminal is available)
VERCELAB_BASE_DOMAIN=lab.example.com \
VERCELAB_ADMIN_HOST=vercelab.lab.example.com \
VERCELAB_ENCRYPTION_SECRET="$(openssl rand -hex 32)" \
bash <(curl -fsSL https://raw.githubusercontent.com/dedkola/vercelab/main/install.sh)

# Clone somewhere else
VERCELAB_INSTALL_DIR=/srv/vercelab bash <(curl -fsSL https://raw.githubusercontent.com/dedkola/vercelab/main/install.sh)

# Already cloned
./install.sh
```

Any variable from the [installer defaults](#configuration) can be exported before running. On later runs the wizard proposes the current `.env` values.

### Ubuntu

The installer:

- installs Node.js, pnpm, and the host packages the bootstrap scripts need;
- installs and pins Docker Engine `28.x` with the Compose and Buildx plugins;
- runs `pnpm install --frozen-lockfile` and builds in a clean temporary copy, so runtime data is never traced into the build;
- creates the storage root (default `/home/<username>/vercelab`);
- derives a reachable base domain from the primary LAN IPv4 when none is given, such as `10-10-0-36.sslip.io`;
- generates the wildcard certificate and writes `.env`;
- starts the stack, then verifies the PostgreSQL credentials and reconciles them with `.env`.

### macOS

`install.sh` checks for the Xcode Command Line Tools and runs `install-macos.sh`, which:

- installs and starts Docker Desktop from Homebrew if needed, and checks the Compose plugin;
- installs Homebrew (if missing), Node.js 24, pnpm `11.27.1`, and a Homebrew OpenSSL when the system one lacks `-addext`;
- asks once for the storage folder (default `~/vercelab`, which is also the checkout);
- generates the certificate, writes `.env`, installs dependencies, and runs the production build smoke test;
- starts the stack with `docker-compose.yml` plus `docker-compose.macos.yml`, and writes `COMPOSE_FILE` into `.env` so plain `docker compose ps`/`logs`/`up -d` target the same containers.

**Default: loopback only.** Traefik binds `127.0.0.1:80` and `:443` and the base domain is `localhost`, so the dashboard is `https://dash.localhost`, the Explorer is `https://influx.localhost`, and apps are `https://<app>.localhost`. macOS resolves `*.localhost` on its own.

**LAN mode.** Docker Desktop resets connections from other machines on published ports below 1024, so reaching the stack from another device needs high ports:

```bash
./install.sh --lan
# Dashboard   : https://dash.192-168-0-155.sslip.io:8443
# Influx UI   : https://influx.192-168-0-155.sslip.io:8443
# App example : https://myapp.192-168-0-155.sslip.io:8443
```

`--lan` binds `0.0.0.0:8080`/`:8443`, derives an sslip.io domain from the LAN IP, and bakes the port into the build as `NEXT_PUBLIC_VERCELAB_PUBLIC_HTTPS_PORT` so every printed URL includes `:8443`. Both modes finish by probing `/api/health` and warn if the dashboard does not answer.

<details>
<summary>Other macOS differences</summary>

| Topic             | macOS behavior                                                                                                                                                       |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Docker access     | Docker Desktop only: no `sudo`, no `docker` group, socket auto-detected at `~/.docker/run/docker.sock`.                                                              |
| Host metrics      | Docker Desktop hides the host `/proc`, so the control plane reads container `/proc` (`VERCELAB_HOST_PROC_PATH=/proc`).                                               |
| Terminal          | `VERCELAB_TERMINAL_TARGET=container`, because the host PID namespace is not shared.                                                                                  |
| Explorer storage  | The SQLite file cannot be chowned to uid `1500` on a bind mount, so it lives in the `vercelab-influxdb-explorer-data` volume with a one-shot init service.           |
| Compose version   | `docker-compose.macos.yml` uses `!override`, which needs Compose `2.24` or newer.                                                                                    |
| Ports             | Pin with `VERCELAB_PROXY_BIND_ADDRESS`, `VERCELAB_HTTP_PORT`, `VERCELAB_HTTPS_PORT`; `VERCELAB_PUBLIC_HTTPS_PORT` only changes printed URLs.                         |
| Certificate trust | `sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain ~/vercelab/traefik/certs/wildcard.crt` (covers `localhost` and `*.localhost`). |

</details>

### Storage layout

Everything lives under `VERCELAB_HOST_ROOT` (`/home/<username>/vercelab` on Linux, `~/vercelab` on macOS). `.env` is written to the repository root with `chmod 600`.

| Path under the root                | Contents                                               |
| ---------------------------------- | ------------------------------------------------------ |
| `data/apps`                        | Cloned repositories and generated Compose files        |
| `data/apps/dev`                    | Temporary preview build workspaces                     |
| `data/logs`, `data/logs/dev`       | Deployment and preview logs                            |
| `data/locks`                       | Deployment lock files                                  |
| `data/postgres`                    | PostgreSQL data                                        |
| `data/influxdb`                    | InfluxDB 3 Core data                                   |
| `data/influxdb-explorer`           | Explorer SQLite data (Linux; a Docker volume on macOS) |
| `data/influxdb-explorer-config`    | Generated Explorer connection config                   |
| `traefik/dynamic/tls.yml`          | Traefik TLS config                                     |
| `traefik/certs/wildcard.{crt,key}` | Self-signed wildcard certificate and key               |

## Operations

### Core containers

The stack runs `vercelab-ui` (the `control-plane` Compose service), `vercelab-postgres`, `vercelab-influxdb`, `vercelab-influxdb-explorer`, and Traefik.

```bash
docker compose ps
docker compose logs -f control-plane
```

### Update or rebuild

```bash
git pull
./install.sh                                        # recommended: rebuilds and keeps config aligned

docker compose up -d --build --no-deps control-plane       # rebuild only the UI
docker compose up -d --force-recreate --no-deps control-plane  # recreate without rebuilding
```

Rerun `./install.sh` after editing `.env`, changing the domain or storage paths, or pulling a new version. It rebuilds the stack, refreshes `.env`, reconciles the PostgreSQL password, and regenerates the certificate when the domain changes.

### Health

`/api/health` returns `503` when a blocking check fails and `200` otherwise. Blocking checks in production: Docker socket present, daemon reachable, Compose and Buildx installed, managed directories writable, `VERCELAB_HOST_ROOT` covering every managed path, host metrics mount present, PostgreSQL URL configured, and a non-default encryption secret. A placeholder base domain is a warning, and database connectivity is reported separately. The Compose healthcheck probes `/` for liveness.

### Uninstall

`uninstall.sh` reads `.vercelab-install-manifest` and removes only what the installer created. It never removes the git checkout.

| Command                                 | Removes                                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------------------------ |
| `./uninstall.sh`                        | The control plane and managed app containers. Keeps `.env`, data, certificates, volumes.   |
| `./uninstall.sh --purge`                | Also the storage folders, `.env`, and the manifest.                                        |
| `./uninstall.sh --purge --purge-images` | Also Docker images labeled for Vercelab Compose projects.                                  |
| `./uninstall.sh --all`                  | Also host tooling the installer added (Node.js, pnpm, Homebrew formulas, build artifacts). |
| `./uninstall.sh --all --remove-docker`  | Linux only: also Docker Engine.                                                            |

Docker is never removed implicitly, Docker Desktop and Homebrew are always kept on macOS, anything that existed before the install is left alone, and `/`, `$HOME`, or any path containing the checkout is refused. For a clean reinstall run `./uninstall.sh --purge` and then `./install.sh`.

### Troubleshooting

**`password authentication failed for user "vercelab"`.** PostgreSQL only applies its credentials when it initializes an empty data directory, so an existing `data/postgres` keeps its original password. Rerun `./install.sh` to reconcile it, or fix it in place:

```bash
docker compose exec -T postgres psql -U vercelab -d postgres \
  -c "ALTER ROLE vercelab WITH LOGIN PASSWORD '$(grep ^VERCELAB_POSTGRES_PASSWORD= .env | cut -d= -f2-)';"
```

Starting over instead (`docker compose down`, delete `data/postgres`, `./install.sh`) erases all Vercelab state.

**Certificate warnings.** Import `traefik/certs/wildcard.crt` into your browser or system trust store.

**Deployments cannot find their files.** Vercelab drives the host Docker daemon through its socket, so build contexts and bind mounts must exist at the same absolute path on the host and in the control-plane container. The stack mounts `VERCELAB_HOST_ROOT` at the identical path; keep workspaces, logs, locks, and databases under it.

## Configuration

The installer writes `.env`; `.env.example` is the template. The most important variables:

| Variable                              | Purpose                                                                      |
| ------------------------------------- | ---------------------------------------------------------------------------- |
| `VERCELAB_BASE_DOMAIN`                | Wildcard domain for apps, such as `myhomelan.com`.                           |
| `VERCELAB_ADMIN_HOST`                 | Dashboard hostname, such as `dash.myhomelan.com`.                            |
| `VERCELAB_HOST_ROOT`                  | Storage root, mounted into the container at the same path.                   |
| `VERCELAB_ENCRYPTION_SECRET`          | Encrypts stored GitHub tokens.                                               |
| `VERCELAB_GITHUB_TOKEN`               | Optional default GitHub token.                                               |
| `VERCELAB_DOCKER_SOCKET_PATH`         | Docker socket for Traefik and the control plane.                             |
| `VERCELAB_PROXY_NETWORK`              | Shared Docker network for Traefik and apps.                                  |
| `VERCELAB_HOST_LAN_IP`                | LAN IPv4 shown in the dashboard; allowed as a dev origin during development. |
| `VERCELAB_TERMINAL_TARGET`            | `host` or `container`.                                                       |
| `VERCELAB_DEV_POLL_INTERVAL_MS`       | Dev preview polling interval (default `60000`).                              |
| `VERCELAB_DEV_BUILD_TIMEOUT_MS`       | Maximum preview build time (default `1800000`).                              |
| `VERCELAB_METRICS_SAMPLE_INTERVAL_MS` | Host metrics sampling interval (default `10000`, minimum `5000`).            |
| `NEXT_PUBLIC_TERMINAL_WS_URL`         | Optional full terminal WebSocket URL; set before building.                   |

`NEXT_PUBLIC_*` values are baked in at build time, so rebuild after changing them.

<details>
<summary>All installer defaults</summary>

| Variable                                    | Default                                                   | Notes                                                                              |
| ------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `NODE_ENV`                                  | `production`                                              |                                                                                    |
| `HOSTNAME` / `PORT`                         | `0.0.0.0` / `3000`                                        | Bind address and the internal port Traefik forwards to.                            |
| `VERCELAB_BASE_DOMAIN`                      | `localhost` on macOS, `<ip>.sslip.io` on Linux            |                                                                                    |
| `VERCELAB_ADMIN_HOST`                       | `dash.${VERCELAB_BASE_DOMAIN}`                            |                                                                                    |
| `VERCELAB_PROXY_BIND_ADDRESS`               | `127.0.0.1` (`0.0.0.0` with `--lan`)                      | Host interface Traefik publishes on.                                               |
| `VERCELAB_HTTP_PORT`                        | `80` (`8080` with `--lan`)                                |                                                                                    |
| `VERCELAB_HTTPS_PORT`                       | `443` (`8443` with `--lan`)                               |                                                                                    |
| `VERCELAB_PUBLIC_HTTPS_PORT`                | empty, or the HTTPS port when it is not 443               | Built in as `NEXT_PUBLIC_VERCELAB_PUBLIC_HTTPS_PORT`.                              |
| `VERCELAB_HOST_LAN_IP`                      | primary LAN IPv4                                          | Also tags host metrics.                                                            |
| `VERCELAB_PROXY_NETWORK`                    | `vercelab_proxy`                                          |                                                                                    |
| `VERCELAB_PROXY_ENTRYPOINT`                 | `websecure`                                               |                                                                                    |
| `VERCELAB_HOST_ROOT`                        | `/home/<username>/vercelab`                               | `~/vercelab` on macOS.                                                             |
| `VERCELAB_DATA_ROOT`                        | `${VERCELAB_HOST_ROOT}/data`                              |                                                                                    |
| `VERCELAB_TRAEFIK_DYNAMIC_DIR`              | `${VERCELAB_HOST_ROOT}/traefik/dynamic`                   |                                                                                    |
| `VERCELAB_TRAEFIK_CERTS_DIR`                | `${VERCELAB_HOST_ROOT}/traefik/certs`                     |                                                                                    |
| `VERCELAB_APPS_DIR`                         | `${VERCELAB_DATA_ROOT}/apps`                              |                                                                                    |
| `VERCELAB_LOGS_DIR`                         | `${VERCELAB_DATA_ROOT}/logs`                              |                                                                                    |
| `VERCELAB_LOCKS_DIR`                        | `${VERCELAB_DATA_ROOT}/locks`                             |                                                                                    |
| `VERCELAB_POSTGRES_DATA_DIR`                | `${VERCELAB_DATA_ROOT}/postgres`                          |                                                                                    |
| `VERCELAB_INFLUXDB_DATA_DIR`                | `${VERCELAB_DATA_ROOT}/influxdb`                          |                                                                                    |
| `VERCELAB_INFLUXDB_EXPLORER_DATA_DIR`       | `${VERCELAB_DATA_ROOT}/influxdb-explorer`                 |                                                                                    |
| `VERCELAB_INFLUXDB_EXPLORER_CONFIG_DIR`     | `${VERCELAB_DATA_ROOT}/influxdb-explorer-config`          |                                                                                    |
| `VERCELAB_DOCKER_SOCKET_PATH`               | `/var/run/docker.sock`                                    |                                                                                    |
| `VERCELAB_DATABASE_PROVIDER`                | `postgres`                                                | PostgreSQL is required.                                                            |
| `VERCELAB_POSTGRES_URL`                     | `postgres://vercelab:...@vercelab-postgres:5432/vercelab` |                                                                                    |
| `VERCELAB_POSTGRES_USER` / `_DB`            | `vercelab` / `vercelab`                                   |                                                                                    |
| `VERCELAB_POSTGRES_PASSWORD`                | generated                                                 |                                                                                    |
| `VERCELAB_INFLUXDB_URL`                     | `http://influxdb:8181`                                    |                                                                                    |
| `VERCELAB_INFLUXDB_DATABASE`                | `vercelab_metrics`                                        |                                                                                    |
| `VERCELAB_INFLUXDB_TOKEN`                   | generated when empty                                      |                                                                                    |
| `VERCELAB_INFLUXDB_RETENTION_DAYS`          | `90`                                                      |                                                                                    |
| `VERCELAB_INFLUXDB_EXPLORER_HOST`           | `influx.${VERCELAB_BASE_DOMAIN}`                          |                                                                                    |
| `VERCELAB_INFLUXDB_EXPLORER_URL`            | `https://${VERCELAB_INFLUXDB_EXPLORER_HOST}`              | Shown in the UI.                                                                   |
| `VERCELAB_INFLUXDB_EXPLORER_SESSION_SECRET` | generated                                                 |                                                                                    |
| `VERCELAB_ENCRYPTION_SECRET`                | generated 64-character hex secret                         |                                                                                    |
| `VERCELAB_HOST_PROC_PATH`                   | `/host/proc`                                              | Host metrics mount inside the container.                                           |
| `VERCELAB_HOST_TERMINAL_IMAGE`              | the control-plane image                                   | Helper image for host terminal access.                                             |
| `VERCELAB_TERMINAL_WS_PORT`                 | `3001`                                                    | `NEXT_PUBLIC_TERMINAL_WS_PORT` sets the browser side (`3101` in the devcontainer). |

</details>

## Local development

Requirements: Node.js 24, pnpm 11.27.1, Docker with the Compose plugin. Two isolated setups are supported and can run side by side.

### Host (macOS)

Infrastructure runs in Docker; Next.js runs on the host. Data lives in `./data/` inside the repository.

```bash
pnpm install --frozen-lockfile
pnpm run setup-env      # writes .env.local: LAN IP, Docker socket, random secrets
pnpm run dev:infra      # Postgres, InfluxDB, Explorer, Traefik
pnpm run dev            # Next.js and the terminal WebSocket server
pnpm run dev:infra:down # stop the infrastructure
```

`dev:infra` passes `.env.local` to Compose, so Postgres starts with the same credentials the app uses.

### VS Code devcontainer

Open the repository in VS Code and choose **Reopen in Container**. Dependencies install automatically and the post-start script bootstraps InfluxDB and Explorer. Then run `pnpm run dev` and open `http://localhost:3100`. Terminal sessions run inside the container.

| Resource           | Host                      | Devcontainer                |
| ------------------ | ------------------------- | --------------------------- |
| App                | `http://localhost:3000`   | `http://localhost:3100`     |
| Terminal WebSocket | `localhost:3001`          | `localhost:3101`            |
| Postgres           | `localhost:5432`          | not exposed                 |
| InfluxDB API       | `http://localhost:8181`   | not exposed                 |
| InfluxDB Explorer  | `http://influx.localhost` | `http://localhost:8888`     |
| Traefik            | `:80`, dashboard `:8088`  | none                        |
| Docker network     | `vercelab_dev_proxy`      | `vercelab_devcontainer_net` |

### Tips

- **Port 80 is busy.** The local Traefik binds port 80, so stop a production Vercelab stack on the same machine first (`docker compose down` in its install folder).
- **Postgres password mismatch.** Changing the password in `.env.local` does not change an existing `./data/postgres`. Delete that folder to start fresh.
- **Open from another device.** Keep `VERCELAB_HOST_LAN_IP` in `.env.local`; `next.config.ts` adds it to `allowedDevOrigins`.
- **"Module not found" for a route that no longer exists.** Clear the stale Turbopack cache with `rm -rf .next/dev` and restart.

### Commands

| Command                               | Purpose                                                        |
| ------------------------------------- | -------------------------------------------------------------- |
| `pnpm run dev` / `pnpm run start`     | Run Next.js (dev or built) with the terminal WebSocket server. |
| `pnpm run build`                      | Production build, plus the standalone bundle check.            |
| `pnpm run lint`                       | ESLint.                                                        |
| `pnpm run typecheck`                  | TypeScript, including unused locals.                           |
| `pnpm run check:unused`               | knip: unused files, exports, and dependencies.                 |
| `pnpm run test` / `pnpm run test:run` | Vitest in watch mode / once.                                   |
| `pnpm run format` / `format:check`    | Prettier write / check.                                        |

CI (`.github/workflows/ci.yml`) runs lint, typecheck, knip, format check, tests, and build on every pull request and on pushes to `main`. Run the same commands before opening a pull request. Dependabot opens weekly npm and GitHub Actions updates and auto-merges non-major ones, and pushing a `v*` tag that matches `package.json` publishes a GitHub release.

## Project layout

| Path                       | Contents                                                                               |
| -------------------------- | -------------------------------------------------------------------------------------- |
| `app/(workspace)/`         | The five pages. All render inside `WorkspaceChromeShell`.                              |
| `app/api/`                 | Route handlers for metrics, deployments, dev previews, containers, GitHub, and health. |
| `components/*-shell.tsx`   | Page shells (`metrics-dashboard`, `git-app-page`, `dev`, `containers`).                |
| `components/workspace/`    | Page sections, the shared header and footer, and `workspace-chrome-shell.tsx`.         |
| `components/ui/`           | Shared primitives (button, input, popover, charts).                                    |
| `lib/`                     | Server logic: Docker runtime, deployment engine, dev worker, metrics, persistence.     |
| `lib/workspace-types.ts`   | Types shared across pages.                                                             |
| `server/terminal-ws.mjs`   | Terminal WebSocket server.                                                             |
| `scripts/`                 | `setup-env`, local infrastructure, InfluxDB bootstrap, and build verification scripts. |
| `index.html`, `prototype/` | Static promotional page and interactive workspace preview.                             |

`WorkspaceChromeShell` owns the header, live metrics polling, the selected time range, and the GitHub repository list; page shells read that state with `useWorkspaceChrome()`.

| File                             | Role                                                      |
| -------------------------------- | --------------------------------------------------------- |
| `Dockerfile`                     | Standalone Next.js image with git and the Docker CLI.     |
| `docker-compose.yml`             | Production stack.                                         |
| `docker-compose.macos.yml`       | macOS override (mounts, metrics, Explorer volume, ports). |
| `docker-compose.dev.yml`         | Local infrastructure without the control plane.           |
| `.devcontainer/`                 | VS Code devcontainer stack.                               |
| `install.sh`, `install-macos.sh` | Installers.                                               |
| `uninstall.sh`                   | Manifest-driven removal.                                  |
| `.env.example`                   | Production configuration template.                        |

## Security

> [!IMPORTANT]
> Vercelab is built for trusted homelab and LAN networks and has no login of its own. It controls the host Docker daemon, so put it behind your own authentication, VPN, or access controls before exposing it to the internet.

- GitHub tokens and webhook secrets are encrypted at rest with `VERCELAB_ENCRYPTION_SECRET`.
- Keep `.env`, `.env.local`, and `data/` out of version control (they are gitignored).
