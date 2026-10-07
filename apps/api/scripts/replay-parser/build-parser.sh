#!/usr/bin/env bash
set -euo pipefail

if (( $# != 1 )); then
  echo "usage: bash scripts/replay-parser/build-parser.sh /absolute/path/to/parser.jar" >&2
  exit 64
fi

# An audited, reproducible OpenDota parser revision. It compiles and was
# exercised against replay 9008411473 on Java 17; no binary is checked in.
parser_commit="e17d09ef40e63c387512057cef7250eebc96be96"
parser_destination="$1"
build_dir="$(mktemp -d)"
trap 'rm -rf "$build_dir"' EXIT

git clone --quiet https://github.com/odota/parser.git "$build_dir/parser"
git -C "$build_dir/parser" checkout --quiet --detach "$parser_commit"
if [[ "$(git -C "$build_dir/parser" rev-parse HEAD)" != "$parser_commit" ]]; then
  echo "Parser source revision mismatch" >&2
  exit 1
fi

# This revision declares Java 21 in its POM but its checked source and
# dependencies also compiled and ran with the project's available Java 17.
# Prefer Maven Central over the optional JitPack repository for these
# published dependencies.
python3 - "$build_dir/parser/pom.xml" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1]); content = p.read_text()
for before, after in (("<source>21</source>", "<source>17</source>"),
                      ("<target>21</target>", "<target>17</target>")):
    if content.count(before) != 1: raise SystemExit("Unexpected parser POM version")
    content = content.replace(before, after)
start = content.index("    <repositories>")
end = content.index("    </repositories>", start) + len("    </repositories>")
p.write_text(content[:start] + content[end:])
PY

(cd "$build_dir/parser" && mvn -B -DskipTests package)
install -d -m 700 "$(dirname "$parser_destination")"
install -m 600 "$build_dir/parser/target/stats-0.1.0.jar" "$parser_destination"
install -m 600 "$build_dir/parser/LICENSE" "$parser_destination.LICENSE"
echo "Parser installed: $parser_destination"
