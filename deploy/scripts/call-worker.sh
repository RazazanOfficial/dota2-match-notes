#!/usr/bin/env bash
set -euo pipefail

case "${1:-}" in
  sync)
    endpoint="/api/internal/sync/tick"
    ;;
  images)
    endpoint="/api/internal/images/tick"
    ;;
  *)
    echo "usage: call-worker.sh sync|images" >&2
    exit 64
    ;;
esac

: "${SYNC_WORKER_SECRET:?SYNC_WORKER_SECRET is required}"
worker_port="${PORT:-3000}"
if [[ ! "$worker_port" =~ ^[0-9]{1,5}$ ]] || (( worker_port < 1 || worker_port > 65535 )); then
  echo "PORT is invalid" >&2
  exit 64
fi

# Passing curl configuration over stdin keeps the Bearer secret out of the
# process argument list. Both endpoints are bound to localhost by systemd.
curl --config - <<CURL_CONFIG
silent
show-error
fail-with-body
request = "POST"
url = "http://127.0.0.1:${worker_port}${endpoint}"
header = "Authorization: Bearer ${SYNC_WORKER_SECRET}"
connect-timeout = 5
max-time = 300
CURL_CONFIG
