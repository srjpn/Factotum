# Build from the repository root: docker build -f apps/dashboard/Dockerfile .
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY schemas schemas
COPY packages/contracts packages/contracts
COPY apps/dashboard apps/dashboard
RUN pnpm install --frozen-lockfile --filter @facto/dashboard...
RUN pnpm --filter @facto/dashboard... build

FROM node:22-alpine
ENV NODE_ENV=production PORT=3001 HOSTNAME=0.0.0.0
WORKDIR /app
# Next standalone output keeps the monorepo layout, so the server is at apps/dashboard/server.js.
COPY --from=build /repo/apps/dashboard/.next/standalone ./
COPY --from=build /repo/apps/dashboard/.next/static ./apps/dashboard/.next/static
USER node
EXPOSE 3001
CMD ["node", "apps/dashboard/server.js"]
