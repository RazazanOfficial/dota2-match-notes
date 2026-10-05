#!/usr/bin/env bash
set -euo pipefail

health_port="${PORT:-3000}"
curl \
  --silent \
  --show-error \
  --fail-with-body \
  --connect-timeout 5 \
  --max-time 15 \
  "http://127.0.0.1:${health_port}/api/health"
