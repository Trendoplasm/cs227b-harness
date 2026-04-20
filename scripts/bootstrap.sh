#!/usr/bin/env bash
# bootstrap.sh — download every remote/relative <script src="..."> referenced
# by any .html in the repo, store it under vendor/, and rewrite the src
# attribute in place to /vendor/<basename>.
#
# Handles four src patterns:
#   1. src="http://..."               absolute external URLs
#   2. src="../path/file.js"          relative parent paths (Stanford roster)
#   3. src="/path/file.js"            absolute server-root paths
#   4. src="./vendor/file.js"         legacy local (normalize to /vendor/)
#
# Re-runnable and idempotent.

set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
VENDOR="$HERE/vendor"
mkdir -p "$VENDOR"

echo "[bootstrap] scanning HTML files under $HERE"

# 1. Collect all .html files.
HTML_FILES=()
for dir in "$HERE" "$HERE/players" "$HERE/games"; do
  [[ -d "$dir" ]] || continue
  while IFS= read -r -d '' f; do
    HTML_FILES+=("$f")
  done < <(find "$dir" -maxdepth 1 -name '*.html' -print0)
done

if [[ ${#HTML_FILES[@]} -eq 0 ]]; then
  echo "[bootstrap] no HTML files found — nothing to do."
  exit 0
fi

# 2. Extract + resolve + download all JS dependencies.
#    We use Python to do the extraction and URL resolution in one pass,
#    then download in bash.
_urls_tmp=$(mktemp)
python3 - "${HTML_FILES[@]}" > "$_urls_tmp" <<'PY'
import re, sys, os

CANONICAL = {
    'epilog.js':        'http://epilog.stanford.edu/javascript/epilog.js',
    'localstorage.js':  'http://gamemaster.stanford.edu/javascript/localstorage.js',
    'general.js':       'http://gamemaster.stanford.edu/reasoning/general.js',
    'ground.js':        'http://gamemaster.stanford.edu/reasoning/ground.js',
    'hybrid.js':        'http://gamemaster.stanford.edu/reasoning/hybrid.js',
    'symbol.js':        'http://gamemaster.stanford.edu/reasoning/symbol.js',
    'grounder.js':      'http://gamemaster.stanford.edu/metagaming/grounder.js',
    'materializer.js':  'http://gamemaster.stanford.edu/metagaming/materializer.js',
    'optimizer.js':     'http://gamemaster.stanford.edu/metagaming/optimizer.js',
    'pruner.js':        'http://gamemaster.stanford.edu/metagaming/pruner.js',
    'simplifier.js':    'http://gamemaster.stanford.edu/metagaming/simplifier.js',
    'symbolizer.js':    'http://gamemaster.stanford.edu/metagaming/symbolizer.js',
    'greedy.js':        'http://gamemaster.stanford.edu/gameplaying/greedy.js',
    'legal.js':         'http://gamemaster.stanford.edu/gameplaying/legal.js',
    'maximax.js':       'http://gamemaster.stanford.edu/gameplaying/maximax.js',
    'mcs.js':           'http://gamemaster.stanford.edu/gameplaying/mcs.js',
    'mcts.js':          'http://gamemaster.stanford.edu/gameplaying/mcts.js',
    'minimax.js':       'http://gamemaster.stanford.edu/gameplaying/minimax.js',
    'minimaxdepth.js':  'http://gamemaster.stanford.edu/gameplaying/minimaxdepth.js',
    'minimaxid.js':     'http://gamemaster.stanford.edu/gameplaying/minimaxid.js',
    'onestep.js':       'http://gamemaster.stanford.edu/gameplaying/onestep.js',
    'pts.js':           'http://gamemaster.stanford.edu/gameplaying/pts.js',
    'random.js':        'http://gamemaster.stanford.edu/gameplaying/random.js',
    'twostep.js':       'http://gamemaster.stanford.edu/gameplaying/twostep.js',
}

HEURISTIC_ROOTS = {
    'javascript':  'http://gamemaster.stanford.edu/javascript/',
    'metagaming':  'http://gamemaster.stanford.edu/metagaming/',
    'gameplaying': 'http://gamemaster.stanford.edu/gameplaying/',
    'reasoning':   'http://gamemaster.stanford.edu/reasoning/',
    'interpreter': 'http://gamemaster.stanford.edu/interpreter/',
    'epilog':      'http://epilog.stanford.edu/',
}

seen = {}

for path in sys.argv[1:]:
    with open(path) as f:
        text = f.read()

    pat = r"src=(['\"])((?:http://|\.\.?/)[^'\"]+\.js)\1"
    for m in re.finditer(pat, text):
        raw = m.group(2)
        base = raw.rsplit('/', 1)[-1]

        if '/vendor/' in raw:
            continue

        if base in seen:
            continue

        if raw.startswith('http://'):
            seen[base] = raw
        elif base in CANONICAL:
            seen[base] = CANONICAL[base]
        else:
            resolved = None
            for seg, root in HEURISTIC_ROOTS.items():
                if '/' + seg + '/' in raw or raw.startswith('../' + seg + '/'):
                    resolved = root + base
                    break
            if resolved:
                seen[base] = resolved
            else:
                print(f'WARNING:unknown:{base}:{raw}', file=sys.stderr)

for base, url in sorted(seen.items()):
    print(f'{base}\t{url}')
PY
download_urls=$(cat "$_urls_tmp")
rm -f "$_urls_tmp"

if [[ -n "$download_urls" ]]; then
  echo "[bootstrap] resolved JS dependencies:"
  echo "$download_urls" | sed 's/^/  /'

  while IFS=$'\t' read -r base url; do
    [[ -z "$base" ]] && continue
    out="$VENDOR/$base"
    echo "[bootstrap] fetching $url -> $out"
    if ! curl -fsSL --max-time 20 "$url" -o "$out"; then
      echo "[bootstrap] ERROR: failed to download $url" >&2
      exit 1
    fi
    size=$(wc -c < "$out" | tr -d ' ')
    if [[ "$size" -lt 100 ]]; then
      echo "[bootstrap] ERROR: $out is suspiciously small ($size bytes)" >&2
      exit 1
    fi
    echo "[bootstrap]   ok ($size bytes)"
  done <<< "$download_urls"
else
  echo "[bootstrap] no JS deps to download — skipping."
fi

# 3. Rewrite every HTML file's script srcs to /vendor/<basename>.
changed=0
for html in "${HTML_FILES[@]}"; do
  tmp=$(mktemp)
  python3 - "$html" "$tmp" <<'PY'
import re, sys

src, dst = sys.argv[1], sys.argv[2]
with open(src) as f:
    text = f.read()

def absify(m):
    q = m.group(1)
    path = m.group(2)
    base = path.rsplit('/', 1)[-1]
    return 'src=' + q + '/vendor/' + base + q

# Pattern 1: absolute http:// URLs
text = re.sub(r"""src=(['"])(http://[^'"]+\.js)\1""", absify, text)
# Pattern 2: relative ../ paths
text = re.sub(r"""src=(['"])(\.\./[^'"]+\.js)\1""", absify, text)
# Pattern 3: absolute server-root paths (but NOT already /vendor/)
text = re.sub(r"""src=(['"])(/(?!vendor/)[^'"]+\.js)\1""", absify, text)
# Pattern 4: legacy ./vendor/ -> /vendor/
text = re.sub(r"""src=(['"])(\./vendor/[^'"]+\.js)\1""", absify, text)

with open(dst, 'w') as f:
    f.write(text)
PY
  if ! cmp -s "$html" "$tmp"; then
    mv "$tmp" "$html"
    echo "[bootstrap] rewrote $html"
    changed=$((changed + 1))
  else
    rm "$tmp"
  fi
done

if [[ "$changed" -eq 0 ]]; then
  echo "[bootstrap] no rewrites needed — HTMLs already use /vendor/."
fi

echo "[bootstrap] done. vendor/ now contains:"
ls -la "$VENDOR"
