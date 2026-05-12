# =========================
# Dependencies stage
# =========================
FROM node:22.13-bookworm-slim AS deps

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

# Enable Corepack and pin pnpm explicitly (IMPORTANT FIX)
RUN corepack enable \
 && corepack prepare pnpm@11.1.0 --activate

# Copy only dependency files first (better cache)
COPY package.json pnpm-lock.yaml ./

# System deps (only in deps stage)
RUN apt-get update \
    && apt-get install -y --no-install-recommends g++ make python3 \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies
RUN pnpm install --frozen-lockfile


# =========================
# Builder stage
# =========================
FROM node:22.13-bookworm-slim AS builder

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

# Keep pnpm consistent
RUN corepack enable \
 && corepack prepare pnpm@11.1.0 --activate

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
FROM node:22.13-bookworm-slim AS runner

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
        git \
        util-linux \
    && rm -rf /var/lib/apt/lists/*

# Copy Next.js standalone output (recommended)
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# If you really need server scripts
COPY --from=builder /app/server ./server

EXPOSE 3000
EXPOSE 3001

# Start app
CMD ["sh", "-c", "node server/terminal-ws.mjs & terminal_pid=$!; trap 'kill $terminal_pid 2>/dev/null || true' EXIT INT TERM; node server.js"]