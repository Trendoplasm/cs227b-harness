#!/usr/bin/env bash
# fetch-games.sh — download game manager pages from the Stanford Gamemaster.
# Overwrites existing files in games/. Run bootstrap.sh afterward to
# vendorize JS deps.

set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
GAMES_DIR="$HERE/games/roster"
mkdir -p "$GAMES_DIR"

GAMES_URL="http://gamemaster.stanford.edu/homepage/showgames.php"

echo "[fetch-games] fetching game list from $GAMES_URL"
games_html=$(curl -fsSL --max-time 30 "$GAMES_URL")

names=$(echo "$games_html" \
  | grep -oE "manager\.php\?game=[a-zA-Z0-9_-]+" \
  | sed 's/manager\.php?game=//' \
  | sort -u) || true

if [[ -z "$names" ]]; then
  echo "[fetch-games] WARNING: no game names found" >&2
  exit 1
fi

echo "[fetch-games] found games:"
echo "$names" | sed 's/^/  /'

count=0
fail=0
while IFS= read -r name; do
  [[ -z "$name" ]] && continue
  url="http://gamemaster.stanford.edu/homepage/manager.php?game=${name}"
  out="$GAMES_DIR/${name}.html"
  printf "[fetch-games] %-25s" "$name"
  if curl -fsSL --max-time 30 "$url" -o "$out" 2>/dev/null; then
    size=$(wc -c < "$out" | tr -d ' ')
    echo "ok ($size bytes)"
    count=$((count + 1))
  else
    echo "FAILED (skipping)"
    rm -f "$out"
    fail=$((fail + 1))
  fi
done <<< "$names"

echo "[fetch-games] done. $count downloaded, $fail failed."
echo "[fetch-games] Run ./scripts/bootstrap.sh to vendorize JS deps."
