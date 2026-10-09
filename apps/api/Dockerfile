# syntax=docker/dockerfile:1
# Build from the repository root:  docker build -f apps/api/Dockerfile -t maize-bites-api .
ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-slim AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo

# Manifests first, so dependency installation is cached until one of them changes.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/db/package.json packages/db/
COPY packages/email/package.json packages/email/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

COPY . .
# Compile this app and the workspace packages it depends on, in dependency order.
RUN pnpm --filter "@maize-bites/api..." build
# A self-contained copy with production dependencies only.
RUN pnpm --filter @maize-bites/api deploy --prod --legacy /out

FROM node:${NODE_VERSION}-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
# The port is set with API_PORT; 3001 is the default.
EXPOSE 3001
CMD ["node", "dist/index.js"]
