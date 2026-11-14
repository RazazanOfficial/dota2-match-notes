#!/usr/bin/env bash
set -euo pipefail

# Reviewed rollout step, never run by an application worker or normal build.
test "${1:-}" = '--apply' || { echo 'usage: retire-legacy-workers.sh --apply' >&2; exit 64; }
test "$(id -u)" -eq 0
units=(dota2notes-replay.timer dota2notes-sync.timer dota2notes-sync-manual.timer
  dota2notes-sync.service dota2notes-stratz.timer dota2notes-stratz.service
  dota2notes-opendota-parse.timer dota2notes-opendota-parse.service)
# Abort before changing anything if a retired unit has a nonstandard installation.
for unit in "${units[@]}"; do
  load=$(systemctl show "$unit" --property=LoadState --value || true)
  [[ "$load" = 'not-found' ]] && continue
  [[ "$load" = 'loaded' || "$load" = 'masked' ]] || { echo "Cannot inspect unit: $unit" >&2; exit 1; }
  fragment=$(systemctl show "$unit" --property=FragmentPath --value)
  if [[ -n "$fragment" && "$fragment" != "/etc/systemd/system/$unit" ]]; then
    echo "Review custom unit before retirement: $unit" >&2
    exit 1
  fi
done
for unit in "${units[@]}"; do
  if [[ "$(systemctl show "$unit" --property=LoadState --value || true)" != 'not-found' ]]; then
    systemctl stop "$unit"
    if systemctl is-enabled --quiet "$unit"; then systemctl disable "$unit"; fi
  fi
  rm -f -- "/etc/systemd/system/$unit"
done
systemctl daemon-reload
# Current replay/sync-daemon/link units and reference timer state are untouched.
