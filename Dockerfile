FROM node:26-bookworm-slim@sha256:cd565714d4da3e84bfd341e31448f81d47c6362198f152345297c9c1154e6341 AS build

WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm ci

COPY apps/api apps/api
COPY packages/contracts packages/contracts
RUN npm run build --workspace @finverse/api
RUN npm prune --omit=dev

FROM node:26-bookworm-slim@sha256:cd565714d4da3e84bfd341e31448f81d47c6362198f152345297c9c1154e6341 AS runtime

ARG GIT_SHA

ENV NODE_ENV=production \
    PORT=3000 \
    MIGRATE_ON_BOOT=false \
    GIT_SHA=${GIT_SHA}
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/migrations ./migrations
COPY --from=build /app/apps/api/public ./public
COPY --from=build /app/apps/api/package.json ./package.json
COPY --from=build /app/packages ./packages

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["node", "dist/main.js"]
