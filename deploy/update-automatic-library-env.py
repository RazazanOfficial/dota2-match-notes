#!/usr/bin/env python3
"""Update only automatic discovery settings in the existing compute environment."""
from pathlib import Path
import os
import re
import tempfile
import sys
if len(sys.argv) != 2:
    raise SystemExit("Usage: python3 update-automatic-library-env.py /path/to/.env.production")
path = Path(sys.argv[1])
settings = {
    "SCHEDULED_SYNC_ENABLED": "on",
    "SCHEDULED_SYNC_LOOKBACK_SECONDS": "172800",
    "SCHEDULED_SYNC_INITIAL_MATCHES": "20",
}
text = path.read_text()
if not re.search(r"^DOTA_NODE_ROLE=(?:compute|\"compute\"|'compute')\s*$", text, re.M):
    raise SystemExit("This update belongs to the Germany compute environment only.")
for key, value in settings.items():
    pattern = re.compile(r"^" + re.escape(key) + r"=.*$", re.M)
    text = pattern.sub(key + "=" + value, text) if pattern.search(text) else text.rstrip("\n") + "\n" + key + "=" + value + "\n"
# Replace atomically, preserving the private file owner. A failed write leaves the old env intact.
path = path.resolve()
owner = path.stat()
fd, temporary = tempfile.mkstemp(prefix=".dota-env-update-", dir=path.parent)
try:
    os.fchmod(fd, 0o600)
    os.fchown(fd, owner.st_uid, owner.st_gid)
    with os.fdopen(fd, "w") as output:
        output.write(text)
        output.flush()
        os.fsync(output.fileno())
    os.replace(temporary, path)
finally:
    Path(temporary).unlink(missing_ok=True)
print("Updated automatic discovery settings; existing credentials were retained.")
