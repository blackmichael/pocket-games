# syntax=docker/dockerfile:1

# Static output is architecture-independent; build with native Node, not QEMU.
FROM --platform=$BUILDPLATFORM node:22.23.4-alpine@sha256:0e1754758c2df4cfa3e68d59e2e1b7374bb7fd9ea6328eaaacf15cc934af8202 AS build
WORKDIR /app

RUN --mount=type=bind,source=package.json,target=/app/package.json \
    --mount=type=bind,source=package-lock.json,target=/app/package-lock.json \
    --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

COPY --link package.json package-lock.json tsconfig.json vite.config.ts ./
COPY --link src ./src
COPY --link static ./static
RUN npm run check && npm test && npm run build

FROM nginxinc/nginx-unprivileged:1.30.6-alpine@sha256:f5116ed4606f3eb015dd4a8e28cb9b351476dc0ad4bc6e9f93b19cec130cdf03 AS runtime
WORKDIR /app
LABEL org.opencontainers.image.source="https://github.com/blackmichael/pocket-games" \
      org.opencontainers.image.url="https://games.michaelblack.xyz"

COPY --link nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build --link /app/build/ ./
USER 101:101
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
