#!/usr/bin/env bash
# Daytona sandbox setup command (DAYTONA_PREVIEW_SETUP_COMMAND).
#
# The daytona-medium snapshot has no Docker, but it has passwordless sudo + apt, so we
# install real Postgres and Redis natively here (the start command provisions/runs them).
set -euo pipefail

echo "[daytona-setup] installing system services (postgresql, redis-server)"
sudo apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql redis-server

echo "[daytona-setup] installing node dependencies (npm ci)"
npm ci

echo "[daytona-setup] building the Next.js app (npm run build)"
npm run build

echo "[daytona-setup] complete"
