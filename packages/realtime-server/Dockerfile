# syntax=docker/dockerfile:1

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev=false --no-audit --no-fund

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
ENV REALTIME_PORT=3030
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY tsconfig.json ./
COPY src ./src

EXPOSE 3030
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3030/health || exit 1

# Run the TypeScript entry directly via tsx — fast cold start, no build step.
CMD ["node", "--enable-source-maps", "node_modules/.bin/tsx", "src/server.ts"]
