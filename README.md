# Vercelab

Vercelab is a self-hosted homelab deployment control plane built with Next.js 16. It clones a GitHub repository, detects a root `Dockerfile` or `docker-compose.yml`, stores control-plane state in PostgreSQL, stores metrics in InfluxDB 3 Core, encrypts GitHub tokens at rest, and exposes each deployed app behind Traefik with self-signed HTTPS.

## Current scope

- Next.js 16 control plane with server actions
- PostgreSQL persistence with encrypted GitHub personal access tokens
- InfluxDB 3 Core storage for host and container metrics
- Deployment engine for root `Dockerfile` and `docker-compose.yml` repositories
- Traefik routing on a shared Docker network
- Ubuntu installer for the control-plane stack, wildcard self-signed TLS, and host-path validation

## Local development

```bash
pnpm install --frozen-lockfile
pnpm run dev
```

The app runs on `http://localhost:3000` by default. Local development keeps the default project-relative `data/` storage unless you override it with environment variables.

## Ubuntu server install

The production path assumes an Ubuntu host. If you do not provide a custom domain, the installer derives a reachable default base domain from the server's primary LAN IPv4 using `sslip.io`, for example `10-10-0-36.sslip.io`.

```bash
chmod +x install.sh
./install.sh
```

For a fully unattended bootstrap, export the required values inline and run the same script:

```bash
VERCELAB_BASE_DOMAIN=lab.example.com \
VERCELAB_ADMIN_HOST=vercelab.lab.example.com \
VERCELAB_HOST_ROOT=/opt/vercelab \
VERCELAB_ENCRYPTION_SECRET="$(openssl rand -hex 32)" \
./install.sh
```

Any runtime variable listed below can be exported before running `./install.sh`. On later runs, the installer reuses the current `.env` values unless you override them again.

The installer is a full bootstrap script for a plain Ubuntu server. It will:

- install Node.js and pnpm on the host
- install the host packages required by the stack bootstrap scripts
- install and pin Docker Engine `28.x` plus the Compose plugin, because Traefik's Docker provider is not compatible with Docker `29.x` on this stack
- run `pnpm install --frozen-lockfile` and a host-side `pnpm run build` smoke test
- create a shared host root under `/opt/vercelab` by default
- auto-generate a reachable default base domain from the server IP when you do not provide one
- generate a wildcard self-signed certificate for your base domain
- write the complete runtime `.env` file for the control plane, including derived paths and runtime settings
- build and start the root Docker and Traefik stack

If you later edit `.env`, rerun `./install.sh` so the stack and self-signed wildcard certificate stay aligned with the new domain and paths.

## Where Vercelab stores state

Runtime variables for the Ubuntu install are written to `.env` in the repository root. `install.sh` rewrites that file on each successful run and locks it down with `chmod 600`. The current installer writes `VERCELAB_*` variables.

Production storage defaults live under `VERCELAB_HOST_ROOT`, which defaults to `/opt/vercelab`:

- `/opt/vercelab/data/apps`: cloned deployment repositories and generated compose overrides
- `/opt/vercelab/data/logs`: deployment logs
- `/opt/vercelab/data/locks`: deployment lock files
- `/opt/vercelab/data/postgres`: PostgreSQL data directory
- `/opt/vercelab/data/influxdb`: InfluxDB 3 Core data directory
- `/opt/vercelab/traefik/dynamic/tls.yml`: Traefik TLS dynamic config
- `/opt/vercelab/traefik/certs/wildcard.crt`: self-signed wildcard certificate
- `/opt/vercelab/traefik/certs/wildcard.key`: private key for the wildcard certificate

Local development has a different fallback layout when you do not set production paths:

- `./data/apps`
- `./data/logs`
- `./data/locks`
- `./data/postgres`
- `./data/influxdb`

## Default runtime variables

These are the defaults the installer writes into `.env` unless you override them.

| Variable                           | Default                                                                      | Notes                                                                               |
| ---------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `NODE_ENV`                         | `production`                                                                 | Runtime mode for the control plane container                                        |
| `HOSTNAME`                         | `0.0.0.0`                                                                    | Bind address inside the container                                                   |
| `PORT`                             | `3000`                                                                       | Internal port Traefik forwards to                                                   |
| `VERCELAB_BASE_DOMAIN`             | auto-derived from the host IPv4 as `<ip>.sslip.io`, fallback `myhomelan.com` | Base wildcard domain for deployed apps                                              |
| `VERCELAB_ADMIN_HOST`              | `vercelab.${VERCELAB_BASE_DOMAIN}`                                           | Control plane hostname                                                              |
| `VERCELAB_HOST_LAN_IP`             | auto-derived from the host primary LAN IPv4                                  | Host LAN IPv4 shown in the dashboard and used to tag host metrics                   |
| `VERCELAB_PROXY_NETWORK`           | `vercelab_proxy`                                                             | Shared Docker network for Traefik and managed apps                                  |
| `VERCELAB_PROXY_ENTRYPOINT`        | `websecure`                                                                  | Traefik HTTPS entrypoint                                                            |
| `VERCELAB_HOST_ROOT`               | `/opt/vercelab`                                                              | Shared host path mounted into the control-plane container at the same absolute path |
| `VERCELAB_DATA_ROOT`               | `${VERCELAB_HOST_ROOT}/data`                                                 | Parent directory for apps, logs, locks, and the database                            |
| `VERCELAB_TRAEFIK_DYNAMIC_DIR`     | `${VERCELAB_HOST_ROOT}/traefik/dynamic`                                      | Generated Traefik dynamic config location                                           |
| `VERCELAB_TRAEFIK_CERTS_DIR`       | `${VERCELAB_HOST_ROOT}/traefik/certs`                                        | Wildcard certificate and key                                                        |
| `VERCELAB_APPS_DIR`                | `${VERCELAB_DATA_ROOT}/apps`                                                 | Cloned app repositories                                                             |
| `VERCELAB_LOGS_DIR`                | `${VERCELAB_DATA_ROOT}/logs`                                                 | Deployment logs                                                                     |
| `VERCELAB_LOCKS_DIR`               | `${VERCELAB_DATA_ROOT}/locks`                                                | Deployment lock files                                                               |
| `VERCELAB_POSTGRES_DATA_DIR`       | `${VERCELAB_DATA_ROOT}/postgres`                                             | PostgreSQL data directory                                                           |
| `VERCELAB_INFLUXDB_DATA_DIR`       | `${VERCELAB_DATA_ROOT}/influxdb`                                             | InfluxDB 3 Core data directory                                                      |
| `VERCELAB_DOCKER_SOCKET_PATH`      | `/var/run/docker.sock`                                                       | Host Docker socket passed into Traefik and the control plane                        |
| `VERCELAB_DATABASE_PROVIDER`       | `postgres`                                                                   | PostgreSQL is required in this stack                                                |
| `VERCELAB_POSTGRES_URL`            | `postgres://vercelab:...@postgres:5432/vercelab`                             | Control-plane relational database connection URL                                    |
| `VERCELAB_POSTGRES_USER`           | `vercelab`                                                                   | Postgres container username                                                         |
| `VERCELAB_POSTGRES_PASSWORD`       | generated by installer                                                       | Postgres container password                                                         |
| `VERCELAB_POSTGRES_DB`             | `vercelab`                                                                   | Postgres database name                                                              |
| `VERCELAB_INFLUXDB_URL`            | `http://influxdb:8181`                                                       | InfluxDB 3 Core write endpoint                                                      |
| `VERCELAB_INFLUXDB_DATABASE`       | `vercelab_metrics`                                                           | InfluxDB database for metrics                                                       |
| `VERCELAB_INFLUXDB_TOKEN`          | auto-generated by `install.sh` when empty                                   | InfluxDB API token used for authenticated write/query access; installer also recovers/regenerates on reinstall when possible |
| `VERCELAB_INFLUXDB_RETENTION_DAYS` | `90`                                                                         | Desired metrics retention period                                                    |
| `VERCELAB_ENCRYPTION_SECRET`       | auto-generated 64-hex-character secret when unset                            | Used to encrypt stored GitHub tokens                                                |

## Reinstall

For an in-place reinstall, keep your current data and rerun the installer:

```bash
./install.sh
```

Use that path after editing `.env`, changing the domain, changing storage paths, or pulling a newer version of Vercelab. The installer will rebuild the stack, refresh the generated `.env`, and regenerate the wildcard certificate if the base domain changed.

For a clean reinstall, remove the current runtime state first and then run the installer again:

```bash
./uninstall.sh --purge
./install.sh
```

## Recreate the UI container

The Vercelab UI runs inside the `control-plane` service in the root `docker-compose.yml`.
If you change control-plane or UI code and want to refresh only that container, run this from the repository root:

```bash
docker compose up -d --build --no-deps control-plane
```

That rebuilds the control-plane image from the current checkout and recreates only the UI container. Traefik and managed app containers stay up.

If you already built the image and only want to replace the container, force a recreate without rebuilding:

```bash
docker compose up -d --force-recreate --no-deps control-plane
```

Useful follow-up checks:

```bash
docker compose ps
docker compose logs -f control-plane
```

If you changed `.env`, domains, certificates, or host paths, rerun `./install.sh` instead so the generated runtime config and TLS assets stay aligned.

## Uninstall

Vercelab now includes an uninstall script.

Stop and remove the Vercelab control plane plus all managed deployment containers, while keeping the generated `.env`, certificates, database, cloned apps, and Docker volumes:

```bash
chmod +x uninstall.sh
./uninstall.sh
```

Remove the generated `.env`, everything under `VERCELAB_HOST_ROOT`, and Docker volumes that belong to Vercelab compose projects:

```bash
./uninstall.sh --purge
```

Also remove Docker images labeled for Vercelab compose projects:

```bash
./uninstall.sh --purge --purge-images
```

Remove everything above and also remove host tooling installed by `install.sh` (Docker Engine and Compose plugins, Node.js, pnpm) plus local repo build artifacts (`node_modules`, `.next`):

```bash
./uninstall.sh --all
```

`uninstall.sh` intentionally leaves Docker Engine, the Docker Compose plugin, Node.js, and pnpm installed on the host unless you explicitly pass `--all`.

## Why the shared host root matters

Vercelab talks to the host Docker daemon through the host Docker socket. That means Docker build contexts and bind mounts referenced by deployment compose files must exist at the same absolute path on both the host and inside the control-plane container.

The root stack handles this by mounting `VERCELAB_HOST_ROOT` into the container at the exact same absolute path. Keep deployment workspaces, logs, locks, PostgreSQL data, and InfluxDB data under that root.

## Runtime files

- `.env.example`: template for the production stack
- `.env`: full generated runtime configuration written by `install.sh`
- `docker-compose.yml`: Traefik plus the Vercelab control plane
- `Dockerfile`: standalone Next.js production image with Git and Docker CLI tooling
- `install.sh`: Ubuntu bootstrapper for Docker, TLS assets, and the control-plane stack
- `uninstall.sh`: removes the control plane and managed deployments, supports `--purge`, and supports destructive `--all` cleanup that also removes host tooling installed by `install.sh`

## Important environment variables

- `VERCELAB_BASE_DOMAIN`: wildcard domain for deployed apps such as `myhomelan.com`
- `VERCELAB_ADMIN_HOST`: full host name for the control plane such as `vercelab.myhomelan.com`
- `VERCELAB_HOST_ROOT`: shared absolute host path mounted into the app container at the same path
- `VERCELAB_APPS_DIR`, `VERCELAB_LOGS_DIR`, `VERCELAB_LOCKS_DIR`, `VERCELAB_POSTGRES_DATA_DIR`, `VERCELAB_INFLUXDB_DATA_DIR`: explicit managed paths written into `.env` on install
- `VERCELAB_DOCKER_SOCKET_PATH`: Docker socket passed through to the control plane and Traefik
- `VERCELAB_PROXY_NETWORK`: shared Docker network Traefik and deployed apps use
- `VERCELAB_ENCRYPTION_SECRET`: secret used to encrypt stored GitHub tokens

## Health and readiness

`/api/health` now checks full platform readiness. In production it verifies:

- the Docker socket exists
- the Docker daemon is reachable
- the Docker Compose plugin is installed
- managed directories are writable
- `VERCELAB_HOST_ROOT` aligns with all managed paths
- the base domain and encryption secret are not still placeholders

The route returns HTTP `503` until the platform is ready.

## Certificates

The installer writes the wildcard certificate to `VERCELAB_TRAEFIK_CERTS_DIR/wildcard.crt`. Import that certificate into your workstation or browser trust store if you want to remove self-signed certificate warnings on your LAN.
