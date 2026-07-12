#!/usr/bin/env bash
# Wraps `podman image prune -f` into a one-line summary instead of dumping
# every removed image hash. Requires an explicit --yes flag: the
# ask-before-deleting gate (see the testing skill's container-cleanup rules)
# stays in force, this script does not skip the confirmation step, it only
# reduces the noise once you've already gotten the go-ahead.
#
# Usage: .claude/skills/release/scripts/podman-cleanup.sh --yes

set -euo pipefail

if [[ "${1:-}" != "--yes" ]]; then
  echo "Refusing to prune without --yes. Confirm with the user before running this." >&2
  echo "Usage: podman-cleanup.sh --yes" >&2
  exit 1
fi

before=$(podman system df --format '{{.Type}}\t{{.Size}}' 2>/dev/null | awk '$1=="Images"{print $2}')
pruned=$(podman image prune -f)
removed_count=$(echo "$pruned" | grep -c '^[a-f0-9]\{12,\}$' || true)
after=$(podman system df --format '{{.Type}}\t{{.Size}}' 2>/dev/null | awk '$1=="Images"{print $2}')

echo "CLEANUP_RESULT removed=${removed_count} before=${before:-unknown} after=${after:-unknown}"
