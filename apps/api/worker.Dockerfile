# The film worker: same build as the API (Dockerfile) plus ffmpeg. Converts videos uploaded
# from the staff screens (src/film-worker.ts). Build context is the repo root:
#   docker build -f apps/api/worker.Dockerfile .
FROM node:22-slim
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /repo

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm ci --workspace @ott/api --workspace @ott/shared --include-workspace-root=false --ignore-scripts \
 && DATABASE_URL=postgresql://build:build@localhost/build npm run build -w @ott/shared \
 && DATABASE_URL=postgresql://build:build@localhost/build npm run build -w @ott/api

ENV NODE_ENV=production FFMPEG_PATH=ffmpeg
WORKDIR /repo/apps/api
# The API applies migrations on deploy; the worker only waits for uploads.
CMD ["node", "dist/film-worker.js"]
