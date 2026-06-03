#!/usr/bin/env bash
set -euo pipefail

if command -v cmd.exe >/dev/null 2>&1; then
  cmd.exe /c npm run verify
else
  npm run verify
fi
