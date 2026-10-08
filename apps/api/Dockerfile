# Build context is the repo root:  docker build -f apps/api/Dockerfile .
FROM node:22-slim AS app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /repo

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
# Only the API and the shared package: the web app deploys separately.
RUN npm ci --workspace @ott/api --workspace @ott/shared --include-workspace-root=false --ignore-scripts \
 && DATABASE_URL=postgresql://build:build@localhost/build npm run build -w @ott/shared \
 && DATABASE_URL=postgresql://build:build@localhost/build npm run build -w @ott/api

ENV NODE_ENV=production
WORKDIR /repo/apps/api
EXPOSE 4000
# Apply pending migrations, then serve. Safe to run on every deploy.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
