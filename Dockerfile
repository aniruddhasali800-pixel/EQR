# syntax=docker/dockerfile:1

# Stage 1 — dependencies from the committed npm lockfile.
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Stage 2 — build. Vite/Nitro compile the SSR bundle plus the browser assets
# into .output/, with the node server preset so the artifact runs on plain Node
# instead of Cloudflare (the repo default).
FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG VITE_SUPABASE_URL=""
ARG VITE_SUPABASE_PUBLISHABLE_KEY=""
ARG VITE_CLERK_PUBLISHABLE_KEY=""
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY \
    VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY \
    NITRO_PRESET=node_server

# Vite only inlines VITE_* into the browser bundle at build time; the values
# above have to land in .env.production.local because an empty process.env
# entry would shadow the repo's .env instead of falling back to it.
RUN : > .env.production.local && \
    for key in VITE_SUPABASE_URL VITE_SUPABASE_PUBLISHABLE_KEY VITE_CLERK_PUBLISHABLE_KEY; do \
      value="$(printenv "$key" || true)"; \
      if [ -n "$value" ]; then printf '%s=%s\n' "$key" "$value" >> .env.production.local; fi; \
    done && \
    npm run build

# Stage 3 — runtime. Only the build artifact ships; node_modules stays behind.
FROM node:24-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    DATA_DIR=/data
WORKDIR /app
COPY --from=build --chown=node:node /app/.output ./.output
# Attendance sessions/records live here (see src/lib/attendance-store.server.ts). A named volume
# is mounted on /data; it inherits this ownership when empty, so the unprivileged node user can
# write it.
RUN mkdir -p /data && chown node:node /data

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -qO- "http://127.0.0.1:${PORT}/" > /dev/null || exit 1

CMD ["node", ".output/server/index.mjs"]

# Stage 4 — the web tier. nginx serves the built client straight from disk.
# Nitro's own static handler answers with a Content-Length baked while bundling
# the server, which truncates files vite-plugin-pwa rewrites afterwards — the
# service worker arrives broken mid-statement and PWA install dies.
FROM nginx:1-alpine AS web
COPY --from=build /app/.output/public /usr/share/nginx/html
COPY deploy/nginx/conf.d/eqr.conf /etc/nginx/conf.d/default.conf
