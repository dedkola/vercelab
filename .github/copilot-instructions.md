# Copilot Instructions

## Build, test, and lint commands

- Install dependencies with `pnpm install --frozen-lockfile`.
- Start local development with `pnpm run dev`.
- Run the full lint pass with `pnpm run lint`.
- Lint a single file with `pnpm exec eslint components/workspace-shell.tsx`.
- Run a production build with `pnpm run build`.
- Run tests in watch mode with `pnpm run test`.
- Run the full test suite once with `pnpm run test:run`.
- Run a single test file with `pnpm exec vitest run components/workspace-shell.test.tsx`.
- Rebuild only the shipped UI/control-plane container with `docker compose up -d --build --no-deps control-plane`.

## High-level architecture

- This is a Next.js 16 App Router control plane for self-hosted Docker deployments. The root `docker-compose.yml` runs PostgreSQL, InfluxDB 3 Core, Traefik, and the `control-plane` service; deployed apps join the shared Traefik network instead of being reverse-proxied through Next.js.
- `app/page.tsx`, `app/dashboard/page.tsx`, and `app/git-app-page/page.tsx` are thin server routes that all call `loadWorkspaceShellData()` and render the same client shell, `components/workspace-shell.tsx`.
- `lib/workspace-shell-data.ts` is the server-side aggregator for that shell. It combines `listWorkspaceData()` from Postgres, a live metrics snapshot from `lib/system-metrics.ts`, recent history from `lib/influx-metrics.ts`, and the configured base domain.
- `components/workspace-shell.tsx` owns most client orchestration. It switches between the dashboard and Git app views, polls `/api/metrics?mode=current`, lazily loads GitHub repositories from `/api/github/repos`, creates deployments through `POST /api/deployments`, calls server actions in `app/actions.ts` for update/redeploy/stop/remove flows, and coordinates the log sidebar. The `components/workspace/*` files are mostly presentational slices of that shell state.
- `lib/persistence.ts` owns the Postgres schema and dashboard queries. The core tables are `repositories`, `deployments`, and `operations`; workspace cards, activity feeds, latest-operation summaries, and deployment status all come from those records.
- `lib/deployment-engine.ts` is the lifecycle orchestrator. It validates input, clones repos into `VERCELAB_APPS_DIR/<deploymentId>`, detects a root compose file or root `Dockerfile`, generates Vercelab-managed compose files, runs `docker compose`, captures build and container logs, and updates Postgres operation history.
- `lib/system-metrics.ts` samples live host and container telemetry using the mounted host `/proc` and Docker, and `lib/influx-metrics.ts` reads historical series back from InfluxDB's v1-compatible `/query` endpoint. `/api/metrics` returns both the current snapshot and the time-series history; `/api/health` combines platform probes with database health.
- GitHub browsing and cloning are intentionally separated. `/api/github/token`, `/api/github/repos`, and `/api/github/repos/[owner]/[name]/branches` use the workspace token stored in `.env`, while deployment-specific clone tokens are encrypted in Postgres and only decrypted inside `lib/deployment-engine.ts`.

## Key conventions

- Treat this as Next.js 16, not older App Router guidance. The repo already carries a warning to consult the docs under `node_modules/next/dist/docs/` before changing framework behavior.
- Read runtime configuration through `getAppConfig()` in `lib/app-config.ts`. It validates env vars with Zod, derives managed paths, creates missing directories, and caches the result; avoid adding new ad hoc `process.env` reads.
- Keep deployment lifecycle changes inside `lib/deployment-engine.ts` and keep them paired with `operations` updates in `lib/persistence.ts`. The UI depends on `deployments.status`, `deployments.last_output`, and the latest `operations` row staying in sync.
- Only one deployment lifecycle action may run at a time. `lib/deployment-engine.ts` enforces this with `<locksDir>/deployment-engine.lock`.
- Deployment domain input is normalized before validation. Users may enter either a bare subdomain or a full hostname under the configured base domain, but persistence stores only the subdomain label.
- `envVariables` is a multiline `KEY=VALUE` payload, not JSON. Blank lines and `#` comments are ignored, keys must be shell-style env names, and the same values are passed both as runtime environment variables and as Docker build args when an image is built.
- Only root-level runtime files are supported: `Dockerfile`, `docker-compose.yml`, `docker-compose.yaml`, `compose.yml`, or `compose.yaml`. Compose repos with multiple services must provide `serviceName`; single-service repos are auto-detected.
- Compose deployments get `.vercelab.override.compose.yml` plus a cleaned `.vercelab.base.compose.yml`; Dockerfile deployments get `.vercelab.generated.compose.yml`. These generated files inject Traefik labels, attach the shared proxy network, and strip conflicting host `ports` bindings from compose repos.
- Stored deployment output is intentionally truncated to the last 12,000 characters in both `lib/persistence.ts` and `lib/deployment-engine.ts`. Keep that bound aligned with the UI unless you update the downstream expectations too.
- Managed app, log, and lock paths are expected to live under `VERCELAB_HOST_ROOT` so Docker build contexts resolve at the same absolute path on the host and inside the control-plane container.
- `install.sh` is part of the supported product flow. It provisions the host stack and pins Docker Engine 28.x because this project documents Docker 29.x as incompatible.
