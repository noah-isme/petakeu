FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

RUN corepack enable pnpm

COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml ./
COPY turbo.json ./
COPY apps/server/package.json ./apps/server/
COPY apps/web/package.json ./apps/web/

RUN pnpm install --frozen-lockfile --prod=false

# Build the application
FROM base AS builder
WORKDIR /app

RUN corepack enable pnpm

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules

COPY . .

RUN pnpm build --filter @petakeu/server

# Produce a standalone production dependency tree. Copying the workspace
# symlinks from a pnpm install into a different image layout leaves modules
# unreachable at runtime; deploy materializes the server package correctly.
RUN pnpm deploy --filter @petakeu/server --prod /app/server-runtime

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodejs

# Install Chromium and dependencies for Puppeteer
RUN apk add --no-cache \
      chromium \
      nss \
      freetype \
      freetype-dev \
      harfbuzz \
      ca-certificates \
      ttf-freefont

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Copy the standalone production package, built application, and migrations.
COPY --from=builder --chown=nodejs:nodejs /app/server-runtime/package.json ./package.json
COPY --from=builder --chown=nodejs:nodejs /app/server-runtime/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/apps/server/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/apps/server/migrations ./migrations

HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:4000/healthz').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

USER nodejs

EXPOSE 4000

CMD ["node", "dist/index.js"]
