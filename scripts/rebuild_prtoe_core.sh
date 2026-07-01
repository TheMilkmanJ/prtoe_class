#!/usr/bin/env bash
# Recompile only PRTOE-touched translation units, then relink class.
# Use after CodeRabbit fixes instead of a full-tree rebuild.
#
# Usage: ./scripts/rebuild_prtoe_core.sh
#        ./scripts/rebuild_prtoe_core.sh input   # also rebuild input.c

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

OBJS=(perturbations.opp background.o)
if [[ "${1:-}" == "input" ]]; then
  OBJS+=(input.o)
fi

echo "=== PRTOE incremental rebuild: ${OBJS[*]} + class ==="
make -j8 "${OBJS[@]}" class
echo "=== done: $ROOT/class ==="