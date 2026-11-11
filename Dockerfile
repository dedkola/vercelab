# =========================
# Dependencies stage
# =========================
ARG NODE_IMAGE=node:24-bookworm-slim
ARG PNPM_VERSION=11.27.1
ARG COREPACK_VERSION=0.36.0

FROM ${NODE_IMAGE} AS deps

ARG PNPM_VERSION
ARG COREPACK_VERSION

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

# Refresh Corepack's signing keys before preparing newer pnpm releases.
RUN npm install -g corepack@${COREPACK_VERSION} \
 && corepack enable \
 && corepack prepare pnpm@${PNPM_VERSION} --activate

# Copy only dependency/config files first (better cache)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# System deps (only in deps stage)
RUN apt-get update \
    && apt-get install -y --no-install-recommends g++ make python3 \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies
RUN pnpm install --frozen-lockfile


# =========================
# Builder stage
# =========================
FROM ${NODE_IMAGE} AS builder

ARG PNPM_VERSION
ARG COREPACK_VERSION

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

# Keep pnpm consistent
RUN npm install -g corepack@${COREPACK_VERSION} \
 && corepack enable \
 && corepack prepare pnpm@${PNPM_VERSION} --activate

# Bring dependencies
COPY --from=deps /app/node_modules ./node_modules

# Copy source
COPY . .

# Build app
RUN pnpm run build

# Optional: reduce node_modules size
RUN pnpm prune --prod


# =========================
# Runner stage
# =========================
FROM ${NODE_IMAGE} AS runner

ARG DOCKER_COMPOSE_PLUGIN_VERSION=5.7.0
ARG DOCKER_BUILDX_PLUGIN_VERSION=0.38.1

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Minimal runtime deps only
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        docker.io \
        git \
        util-linux \
    && rm -rf /var/lib/apt/lists/*

# Debian's docker.io package does not include the Compose or Buildx CLI
# plugins, and the health check (and modern compose files) require both.
RUN set -eux; \
    arch="$(dpkg --print-architecture)"; \
    plugin_base="https://download.docker.com/linux/debian/dists/bookworm/pool/stable/${arch}"; \
    curl -fsSL -o /tmp/docker-compose-plugin.deb \
        "${plugin_base}/docker-compose-plugin_${DOCKER_COMPOSE_PLUGIN_VERSION}-1~debian.12~bookworm_${arch}.deb"; \
    curl -fsSL -o /tmp/docker-buildx-plugin.deb \
        "${plugin_base}/docker-buildx-plugin_${DOCKER_BUILDX_PLUGIN_VERSION}-1~debian.12~bookworm_${arch}.deb"; \
    dpkg -i /tmp/docker-compose-plugin.deb /tmp/docker-buildx-plugin.deb; \
    rm -f /tmp/docker-compose-plugin.deb /tmp/docker-buildx-plugin.deb; \
    docker compose version; \
    docker buildx version

# Copy Next.js standalone output (recommended)
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# If you really need server scripts
COPY --from=builder /app/server ./server

EXPOSE 3000
EXPOSE 3001

# Start app
CMD ["sh", "-c", "node server/terminal-ws.mjs & terminal_pid=$!; trap 'kill $terminal_pid 2>/dev/null || true' EXIT INT TERM; node server.js"]
