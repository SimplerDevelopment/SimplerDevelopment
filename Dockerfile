# ── Stage 1: Install dependencies ─────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app

# Copy only package files first — this layer is cached unless deps change
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps --ignore-scripts

# ── Stage 2: Build the Next.js app ───────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build produces .next/standalone thanks to output: "standalone"
RUN npm run build

# Flatten standalone output — server.js may be nested if monorepo
RUN SERVER_JS=$(find .next/standalone -name "server.js" -not -path "*/node_modules/*" | head -1) && \
    SERVER_DIR=$(dirname "$SERVER_JS") && \
    if [ "$SERVER_DIR" != ".next/standalone" ]; then \
      cp -r "$SERVER_DIR"/* .next/standalone/ && \
      cp -r "$SERVER_DIR"/.next .next/standalone/.next 2>/dev/null || true; \
    fi

# ── Stage 3: Production image ────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Copy only the standalone server + static assets
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000

CMD ["node", "server.js"]
