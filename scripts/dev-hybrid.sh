#!/usr/bin/env bash
# Hybrid dev — docker for infrastructure (db, mailpit, realtime), app on the HOST.
#
# `bun dev` inside the app container pays macOS bind-mount (VirtioFS) latency on
# every source read — brutal in a repo this size. Running the app natively keeps
# HMR/compiles at native FS speed while the stack stays dockerized. The
# setup-written .env.local already points DATABASE_URL at localhost:55432 (the
# published db port — moved off 5432 in JUL9-013 to avoid colliding with a
# locally-installed Postgres), so no env changes are needed.
#
# Back to full-docker: docker compose up -d app agents
set -euo pipefail
cd "$(dirname "$0")/.."

docker compose up -d db mailpit realtime minio
# agents talks to the app via the compose network (http://app:3000), which a
# host-run app isn't on — stop both. Restart them when going back to full-docker.
docker compose stop app agents >/dev/null 2>&1 || true

echo "→ infra up: db :55432 · mailpit :8025 · realtime :3030 · minio :9000 (console :9001) (app + agents containers stopped)"
echo "→ starting the app on the host…"

# host-run app can't resolve the compose-internal minio hostname
if grep -q 'S3_ENDPOINT=http://minio:9000' .env.local 2>/dev/null; then
  export S3_ENDPOINT="http://localhost:9000"
fi

exec bun dev
