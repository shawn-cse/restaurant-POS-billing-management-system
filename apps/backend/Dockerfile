# Built from the MONOREPO ROOT context (see docker-compose.yml `context: .`)
# because this app depends on the workspace package @nodedr-restaurant/types.
# Do not try to `docker build` this file with apps/backend as context.

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

# --- deps: install with full workspace visible so pnpm can link @nodedr-restaurant/types ---
FROM base AS deps
RUN apk add --no-cache openssl python3 make g++ linux-headers eudev-dev libusb-dev pkgconfig
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/types/package.json packages/types/package.json
RUN pnpm install --frozen-lockfile

# --- builder: compile types package, generate Prisma client, build Nest ---
FROM deps AS builder
COPY packages/types packages/types
COPY apps/backend apps/backend
RUN pnpm --filter @nodedr-restaurant/types build
RUN pnpm --filter @nodedr-restaurant/backend exec prisma generate
RUN pnpm --filter @nodedr-restaurant/backend build

# --- runtime: slim image, only what's needed to run ---
FROM node:22-alpine AS runtime
RUN apk add --no-cache openssl eudev-libs libstdc++ postgresql16-client
WORKDIR /repo
ENV NODE_ENV=production
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION

COPY --from=builder /repo/node_modules ./node_modules
COPY --from=builder /repo/apps/backend/node_modules ./apps/backend/node_modules
COPY --from=builder /repo/apps/backend/dist ./apps/backend/dist
COPY --from=builder /repo/apps/backend/prisma ./apps/backend/prisma
COPY --from=builder /repo/apps/backend/uploads ./apps/backend/uploads
COPY --from=builder /repo/apps/backend/package.json ./apps/backend/package.json
COPY --from=builder /repo/packages/types/dist ./packages/types/dist
COPY --from=builder /repo/packages/types/package.json ./packages/types/package.json
COPY --from=builder /repo/packages/types/node_modules ./packages/types/node_modules

WORKDIR /repo/apps/backend
EXPOSE 4000
CMD ["sh", "-c", "mkdir -p ${UPLOADS_DIR:-/data/uploads} && cp -rn /repo/apps/backend/uploads/* ${UPLOADS_DIR:-/data/uploads}/ 2>/dev/null || true; npx prisma migrate deploy && node dist/src/main.js"]
