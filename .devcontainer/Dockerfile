FROM node:22-bookworm-slim

WORKDIR /workspaces/vercelab

ENV NEXT_TELEMETRY_DISABLED=1
ENV DEBIAN_FRONTEND=noninteractive
ENV PNPM_VERSION=10.33.0

# Install system tools: git, curl, Docker CLI, Docker Compose plugin
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       ca-certificates \
       curl \
       git \
       gnupg \
       procps \
       sudo \
    && install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc \
    && chmod a+r /etc/apt/keyrings/docker.asc \
    && . /etc/os-release \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian ${VERSION_CODENAME} stable" \
       > /etc/apt/sources.list.d/docker.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
       docker-ce-cli \
       docker-buildx-plugin \
       docker-compose-plugin \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm directly so devcontainers do not trigger a Corepack approval prompt
RUN npm install -g "pnpm@${PNPM_VERSION}"

# Allow node user to access Docker socket
RUN groupadd -f docker && usermod -aG docker node

USER node
