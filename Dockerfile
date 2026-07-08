# syntax=docker/dockerfile:1

FROM node:22-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY web/package.json web/package.json
RUN npm ci

COPY tsconfig.base.json ./
COPY server server
COPY web web
RUN npm run build

RUN npm prune --omit=dev --workspace server


FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV DATA_DIR=/data

RUN groupadd --system localscore && useradd --system --gid localscore --home /app localscore \
    && mkdir -p /data \
    && chown -R localscore:localscore /app /data

COPY --from=build --chown=localscore:localscore /app/server/dist ./server/dist
COPY --from=build --chown=localscore:localscore /app/server/node_modules ./server/node_modules
COPY --from=build --chown=localscore:localscore /app/server/package.json ./server/package.json
COPY --from=build --chown=localscore:localscore /app/web/dist ./web/dist

USER localscore
VOLUME ["/data"]
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://localhost:'+ (process.env.PORT||8080) +'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/dist/index.js"]
