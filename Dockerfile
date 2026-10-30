FROM node:24-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

FROM base AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate

# Cache the two independent dependency trees separately. Their lockfiles are
# committed; neither local databases nor developer environment files are copied.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY lovable-frontend/package.json lovable-frontend/pnpm-lock.yaml ./lovable-frontend/
RUN pnpm --dir lovable-frontend install --ignore-workspace --frozen-lockfile
COPY . .

# Generate a Linux Prisma engine; migrations remain an explicit runtime step.
RUN DATABASE_URL=file:/tmp/watchnext-build.sqlite pnpm exec prisma generate
RUN WATCHNEXT_POSTGRES_URL=postgresql://localhost:5432/build pnpm exec prisma generate --schema prisma/postgresql/schema.prisma
RUN WATCHNEXT_PRIVATE_API=1 WATCHNEXT_CONTAINER_MODE=1 pnpm build
WORKDIR /app/lovable-frontend
RUN NITRO_PRESET=node-server node node_modules/vite/bin/vite.js build

FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    WATCHNEXT_PRIVATE_API=1 \
    WATCHNEXT_CONTAINER_MODE=1 \
    WATCHNEXT_HTTP_REPOSITORY=prisma \
    WATCHNEXT_HTTP_PRISMA_PROVIDER=postgresql \
    WATCHNEXT_DATABASE_PATH=/data/watchnext.sqlite \
    WATCHNEXT_APP_ORIGIN=http://127.0.0.1:3000
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 3000
CMD ["node", "scripts/start-container.mjs"]
