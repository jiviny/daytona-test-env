#!/usr/bin/env bash
# Daytona sandbox setup command (DAYTONA_PREVIEW_SETUP_COMMAND).
#
# The daytona-medium snapshot has no Docker, but it has passwordless sudo + apt, so we
# install real Postgres and Redis natively here (the start command provisions/runs them).
set -euo pipefail

echo "[daytona-setup] installing system services (postgresql, redis-server)"
sudo apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql redis-server

# Drop the default apt-created cluster so our trust-auth instance (created by the start
# script under /tmp) owns port 5432 deterministically. daytona-medium (Debian 13) ships
# PostgreSQL 17; the "|| true" keeps this safe if the cluster name ever differs.
sudo pg_dropcluster --stop 17 main 2>/dev/null || true

echo "[daytona-setup] installing node dependencies (npm ci)"
npm ci

echo "[daytona-setup] building the Next.js app (npm run build)"
npm run build

echo "[daytona-setup] complete"
