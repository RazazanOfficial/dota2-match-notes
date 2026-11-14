#!/usr/bin/env bash
set -euo pipefail

# Run explicitly on each host after publishing the matching API runtime.
# Does not load application secrets or enable any workload timer.
role="${1:-}"
case "$role" in app|compute) ;; *) echo 'usage: install-service-monitor.sh app|compute' >&2; exit 64 ;; esac
test "$(id -u)" -eq 0
cd /var/www/dota2notes
monitor_gid=$(getent group dota2notes | cut -d: -f3)
test -n "$monitor_gid"
install -d -o root -g root -m 755 /usr/local/libexec/dota2notes
install -o root -g root -m 644 apps/api/scripts/service-monitor/collect.mjs /usr/local/libexec/dota2notes/collect.mjs
install -d -o root -g dota2notes -m 750 /var/lib/dota2notes/monitor
install -o root -g root -m 600 /dev/null /etc/dota2notes-monitor.conf
printf 'MONITOR_GROUP_GID=%s\nMONITOR_NODE_ROLE=%s\n' "$monitor_gid" "$role" > /etc/dota2notes-monitor.conf
install -o root -g root -m 644 deploy/systemd/dota2notes-monitor.service deploy/systemd/dota2notes-monitor.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now dota2notes-monitor.timer
systemctl start dota2notes-monitor.service
sudo -u dota2notes test -r /var/lib/dota2notes/monitor/status.json
