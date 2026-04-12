# Verclab

Verclab is a self-hosted homelab deployment control plane built with Next.js 16. It clones a GitHub repository, detects a root `Dockerfile` or `docker-compose.yml`, stores deployment state in SQLite, encrypts GitHub tokens at rest, and exposes each deployed app behind Traefik with self-signed HTTPS.

## Current scope

- Next.js 16 control plane with server actions
- SQLite persistence with encrypted GitHub personal access tokens
- Deployment engine for root `Dockerfile` and `docker-compose.yml` repositories
- Traefik routing on a shared Docker network
- Ubuntu installer for the control-plane stack, wildcard self-signed TLS, and host-path validation

## Local development

```bash
npm ci
npm run dev
```

The app runs on `http://localhost:3000` by default. Local development keeps the default project-relative `data/` storage unless you override it with environment variables.

## Ubuntu server install

The production path assumes an Ubuntu host with wildcard LAN DNS pointing `*.your-domain` and `verclab.your-domain` at the server.

```bash
chmod +x install.sh
./install.sh
```

For a fully unattended bootstrap, export the required values inline and run the same script:

```bash
VERCLAB_BASE_DOMAIN=lab.example.com \
VERCLAB_ADMIN_HOST=verclab.lab.example.com \
VERCLAB_HOST_ROOT=/opt/verclab \
VERCLAB_ENCRYPTION_SECRET="$(openssl rand -hex 32)" \
./install.sh
```

The installer is now a full bootstrap script for a plain Ubuntu server. It will:

- install Node.js and npm on the host
- install the native toolchain needed by packages such as `better-sqlite3`
- install and pin Docker Engine `28.x` plus the Compose plugin, because Traefik's Docker provider is not compatible with Docker `29.x` on this stack
- run `npm ci` and a host-side `npm run build` smoke test
- create a shared host root under `/opt/verclab` by default
- generate a wildcard self-signed certificate for your base domain
- write the runtime `.env` file for the control plane
- build and start the root Docker and Traefik stack

`myhomelan.com` is only an example domain. If you keep it, you must point `verclab.myhomelan.com` at this server in your LAN DNS or local hosts file, otherwise your browser will hit whatever public DNS already serves that name.

## Why the shared host root matters

Verclab talks to the host Docker daemon through the host Docker socket. That means Docker build contexts and bind mounts referenced by deployment compose files must exist at the same absolute path on both the host and inside the control-plane container.

The root stack handles this by mounting `VERCLAB_HOST_ROOT` into the container at the exact same absolute path. Keep deployment workspaces, logs, locks, and the SQLite database under that root.

## Runtime files

- `.env.example`: template for the production stack
- `docker-compose.yml`: Traefik plus the Verclab control plane
- `Dockerfile`: standalone Next.js production image with Git and Docker CLI tooling
- `install.sh`: Ubuntu bootstrapper for Docker, TLS assets, and the control-plane stack

## Important environment variables

- `VERCLAB_BASE_DOMAIN`: wildcard domain for deployed apps such as `myhomelan.com`
- `VERCLAB_ADMIN_HOST`: full host name for the control plane such as `verclab.myhomelan.com`
- `VERCLAB_HOST_ROOT`: shared absolute host path mounted into the app container at the same path
- `VERCLAB_DOCKER_SOCKET_PATH`: Docker socket passed through to the control plane and Traefik
- `VERCLAB_PROXY_NETWORK`: shared Docker network Traefik and deployed apps use
- `VERCLAB_ENCRYPTION_SECRET`: secret used to encrypt stored GitHub tokens

## Health and readiness

`/api/health` now checks more than SQLite. In production it also verifies:

- the Docker socket exists
- the Docker daemon is reachable
- the Docker Compose plugin is installed
- managed directories are writable
- `VERCLAB_HOST_ROOT` aligns with all managed paths
- the base domain and encryption secret are not still placeholders

The route returns HTTP `503` until the platform is ready.

## Certificates

The installer writes the wildcard certificate to `VERCLAB_HOST_ROOT/traefik/certs/wildcard.crt`. Import that certificate into your workstation or browser trust store if you want to remove self-signed certificate warnings on your LAN.
