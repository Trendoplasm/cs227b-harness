#!/usr/bin/env bash
# fetch-players.sh — download player pages from the Stanford Gamemaster roster.
# Overwrites existing files in players/. Run bootstrap.sh afterward to
# vendorize JS deps.

set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
PLAYERS_DIR="$HERE/players"
mkdir -p "$PLAYERS_DIR"

ROSTER_URL="http://gamemaster.stanford.edu/homepage/showplayers.php"

echo "[fetch-players] fetching roster from $ROSTER_URL"
roster_html=$(curl -fsSL --max-time 30 "$ROSTER_URL")

names=$(echo "$roster_html" \
  | grep -oE "href='../roster/[^']+\.html'" \
  | sed -E "s|href='\.\./roster/||; s|\.html'||" \
  | sort -u) || true

if [[ -z "$names" ]]; then
  echo "[fetch-players] WARNING: no player names found on roster page" >&2
  exit 1
fi

echo "[fetch-players] found players:"
echo "$names" | sed 's/^/  /'

count=0
fail=0
while IFS= read -r name; do
  [[ -z "$name" ]] && continue
  url="http://gamemaster.stanford.edu/roster/${name}.html"
  out="$PLAYERS_DIR/${name}.html"
  printf "[fetch-players] %-25s" "$name"
  if curl -fsSL --max-time 20 "$url" -o "$out" 2>/dev/null; then
    size=$(wc -c < "$out" | tr -d ' ')
    echo "ok ($size bytes)"
    count=$((count + 1))
  else
    echo "FAILED (skipping)"
    rm -f "$out"
    fail=$((fail + 1))
  fi
done <<< "$names"

echo "[fetch-players] done. $count downloaded, $fail failed."
echo "[fetch-players] Run ./scripts/bootstrap.sh to vendorize JS deps."
